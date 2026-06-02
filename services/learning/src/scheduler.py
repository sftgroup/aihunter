"""
AIHunter Learning Worker - 自动学习调度器

功能：
- 监听 learning:trigger 信号
- 触发 Optuna 参数调优
- 调用 DeepSeek 生成策略规则
- 规则版本管理与热加载
"""

import asyncio
import json
import os
import redis.asyncio as redis
import psycopg2


class LearningScheduler:
    
    def __init__(self):
        self.redis = None
        self.db = None
        self.redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        self.db_url = os.getenv('DATABASE_URL', 'postgresql://aihunter:aihunter2025@localhost:5432/aihunter')
        
    async def connect(self):
        self.redis = await redis.from_url(self.redis_url)
        self.db = psycopg2.connect(self.db_url)
        print("✅ Learning Worker 已连接")
        
    async def _should_learn(self, strategy: str) -> bool:
        """检查是否有足够的新经验触发学习"""
        with self.db.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM trade_experiences WHERE strategy_type = %s AND executed_at > NOW() - INTERVAL '24 hours'",
                (strategy,)
            )
            return cur.fetchone()[0] >= 10
    
    async def _run_optuna(self, strategy: str):
        """执行 Optuna 参数调优"""
        try:
            import optuna
            from optuna.samplers import TPESampler
            
            # 获取经验数据
            with self.db.cursor() as cur:
                cur.execute(
                    "SELECT outcome FROM trade_experiences WHERE strategy_type = %s ORDER BY executed_at DESC LIMIT 200",
                    (strategy,)
                )
                rows = cur.fetchall()
            
            if len(rows) < 20:
                print(f"⏸️ 经验不足（{len(rows)}条），跳过 Optuna")
                return
            
            def objective(trial):
                slippage = trial.suggest_float('max_slippage', 0.01, 0.05)
                position = trial.suggest_float('position_pct', 0.1, 0.5)
                confidence = trial.suggest_float('min_confidence', 0.3, 0.9)
                
                score = sum(1 for r in rows if r[0] and json.loads(r[0]).get('pnl', 0) > 0)
                return score / max(len(rows), 1)
            
            study = optuna.create_study(direction='maximize', sampler=TPESampler())
            await asyncio.to_thread(lambda: study.optimize(objective, n_trials=50))
            
            print(f"🎯 Optuna 最优参数: {study.best_params}")
            print(f"📊 最优评分: {study.best_value:.4f}")
            
            # 保存参数
            await self.redis.set(f"params:{strategy}", json.dumps(study.best_params))
            
        except ImportError:
            print("⚠️ optuna 未安装，跳过调优")
        except Exception as e:
            print(f"⚠️ Optuna 异常: {e}")
    
    async def _call_deepseek_for_rules(self, strategy: str):
        """调用 DeepSeek 生成策略规则"""
        api_key = os.getenv('DEEPSEEK_API_KEY')
        if not api_key:
            print("⚠️ DeepSeek 未配置，跳过规则生成")
            return
        
        try:
            from openai import OpenAI
            client = OpenAI(api_key=api_key, base_url='https://api.deepseek.com/v1')
            
            # 获取最近的交易经验
            with self.db.cursor() as cur:
                cur.execute(
                    "SELECT features_snapshot, outcome, success_label FROM trade_experiences WHERE strategy_type = %s ORDER BY executed_at DESC LIMIT 20",
                    (strategy,)
                )
                rows = cur.fetchall()
            
            wins = [r for r in rows if r[2] == 'win'][:5]
            losses = [r for r in rows if r[2] == 'loss'][:5]
            
            prompt = f"""从以下交易经验中提取可读的策略规则（IF-THEN格式），输出JSON数组：

策略: {strategy}

盈利交易特征:
{json.dumps([r[0] for r in wins] if wins else [], indent=2, default=str)}

亏损交易特征:
{json.dumps([r[0] for r in losses] if losses else [], indent=2, default=str)}

输出格式:
[{{"condition": "tax < 3% AND lp > 10k", "action": "BUY", "expected_win_rate": 0.7}}]
"""
            resp = await asyncio.to_thread(
                lambda: client.chat.completions.create(
                    model='deepseek-chat',
                    messages=[{'role': 'user', 'content': prompt}],
                    temperature=0.1,
                    response_format={'type': 'json_object'}
                )
            )
            
            rules = json.loads(resp.choices[0].message.content)
            print(f"🤖 DeepSeek 生成规则: {json.dumps(rules, indent=2)[:200]}")
            
            # 保存规则并热加载
            await self.redis.set(f"rules:{strategy}", json.dumps(rules))
            await self.redis.publish('rule_updates', json.dumps({
                'strategy': strategy, 'newRule': rules, 'status': 'promoted'
            }))
            
        except Exception as e:
            print(f"⚠️ DeepSeek 调用失败: {e}")
    
    async def run(self):
        await self.connect()
        
        pubsub = self.redis.pubsub()
        await pubsub.subscribe('learning:trigger')
        print("📡 等待学习触发信号...")
        
        async for message in pubsub.listen():
            if message['type'] != 'message':
                continue
            
            try:
                data = json.loads(message['data'])
                strategy = data.get('strategy', 'default')
                print(f"🧠 收到学习信号: {strategy}")
                
                if await self._should_learn(strategy):
                    # 并行执行 Optuna 和 DeepSeek 规则生成
                    await asyncio.gather(
                        self._run_optuna(strategy),
                        self._call_deepseek_for_rules(strategy)
                    )
                    print(f"✅ 学习完成: {strategy}")
                else:
                    print(f"⏸️ 经验不足，跳过学习")
                    
            except Exception as e:
                print(f"❌ 学习异常: {e}")


async def main():
    scheduler = LearningScheduler()
    await scheduler.run()


if __name__ == '__main__':
    asyncio.run(main())
