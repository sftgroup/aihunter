# AIHunter Learning Worker - 自动学习调度器
# 轻量版：定时从 Redis 接收学习信号，执行 Optuna 调优

import asyncio
import json
import os
import redis.asyncio as redis
import psycopg2


class LearningScheduler:
    """学习调度器 - 监听 learning:trigger 频道"""
    
    def __init__(self):
        self.redis = None
        self.db = None
        self.running = True
        
        self.redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        self.db_url = os.getenv('DATABASE_URL', 'postgresql://aihunter:aihunter2025@localhost:5432/aihunter')
        
    async def connect(self):
        self.redis = await redis.from_url(self.redis_url)
        self.db = psycopg2.connect(self.db_url)
        print("✅ Learning Worker 已连接")
        
    async def run(self):
        await self.connect()
        
        # 订阅学习触发频道
        pubsub = self.redis.pubsub()
        await pubsub.subscribe('learning:trigger')
        
        print("📡 等待学习触发信号...")
        
        async for message in pubsub.listen():
            if message['type'] != 'message':
                continue
            
            try:
                data = json.loads(message['data'])
                strategy = data.get('strategy')
                print(f"🧠 收到学习触发: strategy={strategy}")
                
                # 检查是否满足学习条件
                if await self._should_learn(strategy):
                    await self._run_learning_cycle(strategy)
                    
            except Exception as e:
                print(f"❌ 学习异常: {e}")
    
    async def _should_learn(self, strategy):
        """检查是否需要触发学习"""
        # 简化版：检查是否有足够的交易经验
        with self.db.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM trade_experiences WHERE strategy_type = %s AND executed_at > NOW() - INTERVAL '24 hours'",
                (strategy,)
            )
            count = cur.fetchone()[0]
            # 每 24h 至少 10 笔才值得学习
            return count >= 10
    
    async def _run_learning_cycle(self, strategy):
        """执行学习循环"""
        print(f"📊 开始学习: {strategy}")
        
        # 1. 获取交易经验
        with self.db.cursor() as cur:
            cur.execute(
                "SELECT * FROM trade_experiences WHERE strategy_type = %s ORDER BY executed_at DESC LIMIT 200",
                (strategy,)
            )
            rows = cur.fetchall()
            print(f"📈 获取到 {len(rows)} 条经验记录")
        
        # 2. 调用 DeepSeek 生成规则建议（如果有 API Key）
        deepseek_key = os.getenv('DEEPSEEK_API_KEY')
        if deepseek_key:
            await self._call_deepseek_for_rules(strategy, rows)
        
        # 3. Optuna 调优（如果有足够的经验）
        if len(rows) >= 50:
            await self._run_optuna(strategy, rows)
        
        print(f"✅ 学习完成: {strategy}")
    
    async def _call_deepseek_for_rules(self, strategy, experiences):
        """调用 DeepSeek 生成规则建议"""
        try:
            from openai import OpenAI
            client = OpenAI(api_key=os.getenv('DEEPSEEK_API_KEY'), base_url='https://api.deepseek.com/v1')
            
            # 构建样本
            wins = [e for e in experiences[:10] if e[10] == 'win']
            losses = [e for e in experiences[:10] if e[10] == 'loss']
            
            prompt = f"""从以下交易经验中提取策略规则（IF-THEN格式），输出JSON数组：

策略: {strategy}

盈利交易特征:
{json.dumps([e[5] for e in wins] if wins else [], indent=2, default=str)}

亏损交易特征:
{json.dumps([e[5] for e in losses] if losses else [], indent=2, default=str)}

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
            print(f"🤖 DeepSeek 生成规则: {json.dumps(rules, indent=2)}")
            
            # 保存规则
            await self.redis.set(f"rules:{strategy}", json.dumps(rules))
            
        except Exception as e:
            print(f"⚠️ DeepSeek 调用失败: {e}")
    
    async def _run_optuna(self, strategy, experiences):
        """执行 Optuna 参数调优"""
        try:
            import optuna
            from optuna.samplers import TPESampler
            
            def objective(trial):
                # 简化版：优化滑点和仓位参数
                slippage = trial.suggest_float('max_slippage', 0.01, 0.05)
                position = trial.suggest_float('position_pct', 0.1, 0.5)
                confidence = trial.suggest_float('min_confidence', 0.3, 0.9)
                
                # 模拟评分（简化版）
                score = 0
                for exp in experiences:
                    # 这里应该有实际的特征计算逻辑
                    score += 1 if exp[10] == 'win' else -1
                
                return score / max(len(experiences), 1)
            
            study = optuna.create_study(direction='maximize', sampler=TPESampler())
            await asyncio.to_thread(lambda: study.optimize(objective, n_trials=50))
            
            print(f"🎯 Optuna 最优参数: {study.best_params}")
            print(f"📊 最优评分: {study.best_value:.4f}")
            
            # 保存最优参数
            await self.redis.set(f"params:{strategy}", json.dumps(study.best_params))
            
        except Exception as e:
            print(f"⚠️ Optuna 调优失败: {e}")


async def main():
    scheduler = LearningScheduler()
    await scheduler.run()


if __name__ == '__main__':
    asyncio.run(main())
