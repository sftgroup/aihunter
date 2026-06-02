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
        self.last_params = None
        self.last_rules = None
        self.last_score = None
        self.last_strategy = None
        self.redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        self.db_url = os.getenv('DATABASE_URL', 'postgresql://aihunter:aihunter2025@localhost:5432/aihunter')
        
    async def connect(self):
        self.redis = await redis.from_url(self.redis_url)
        self.db = psycopg2.connect(self.db_url)
        print("✅ Learning Worker 已连接")
        
    async def _should_learn(self, strategy: str) -> bool:
        """检查增量经验是否达到30条"""
        with self.db.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM trade_experiences WHERE strategy_type = %s",
                (strategy,)
            )
            total = cur.fetchone()[0] or 0
        
        # 获取上次学习时的经验数
        last_key = f"learning:last_count:{strategy}"
        last_count = await self.redis.get(last_key)
        if last_count is None:
            last_count = 0
        else:
            last_count = int(last_count)
        
        # 增量达到30条才学习
        return (total - last_count) >= 30
    
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
                take_profit = trial.suggest_float('take_profit_pct', 0.05, 0.50)  # 5% ~ 50%
                stop_loss = trial.suggest_float('stop_loss_pct', 0.05, 0.30)      # 5% ~ 30%
                trade_ratio = trial.suggest_float('trade_ratio', 0.02, 0.20)      # 每笔占余额 2% ~ 20%
                
                # 模拟每笔交易：用止盈止损约束后计算期望收益
                score = 0
                for r in rows:
                    outcome = r[0] if isinstance(r[0], dict) and 'pnl' in r[0] else {}
                    pnl_pct = float(outcome.get('pnl_pct', 0) or 0) / 100  # 转为小数
                    
                    # 应用止盈止损约束
                    if pnl_pct > take_profit:
                        pnl_pct = take_profit  # 触发止盈
                    elif pnl_pct < -stop_loss:
                        pnl_pct = -stop_loss   # 触发止损
                    
                    # 按交易比例计算实际盈亏
                    actual_pnl = pnl_pct * trade_ratio
                    if actual_pnl > 0:
                        score += 1
                return score / max(len(rows), 1)
            
            study = optuna.create_study(direction='maximize', sampler=TPESampler())
            await asyncio.to_thread(lambda: study.optimize(objective, n_trials=50))
            
            print(f"🎯 Optuna 最优参数: {study.best_params}")
            print(f"📊 最优评分: {study.best_value:.4f}")
            
            # 保存到类变量和 Redis
            self.last_params = study.best_params
            self.last_score = study.best_value
            self.last_strategy = strategy
            await self.redis.set(f"params:{strategy}", json.dumps(study.best_params))
            
        except ImportError:
            print("⚠️ optuna 未安装，跳过调优")
        except Exception as e:
            print(f"⚠️ Optuna 异常: {e}")
    
    async def _get_deepseek_key(self):
        """从环境变量或数据库读取 DeepSeek API Key"""
        key = os.getenv('DEEPSEEK_API_KEY')
        if key:
            return key
        try:
            with self.db.cursor() as cur:
                cur.execute("SELECT value FROM sys_config WHERE key = 'ai.api_key'")
                row = cur.fetchone()
                if row and row[0]:
                    return row[0]
        except Exception as e:
            print(f"⚠️ 读取数据库 API Key 失败: {e}")
        return None

    async def _call_deepseek_for_rules(self, strategy: str):
        """调用 DeepSeek 生成策略规则"""
        api_key = await self._get_deepseek_key()
        if not api_key:
            print("⚠️ DeepSeek 未配置，跳过规则生成")
            return
        
        try:
            from openai import OpenAI
            import httpx
            http_client = httpx.Client(timeout=30)
            client = OpenAI(api_key=api_key, base_url='https://api.deepseek.com/v1', http_client=http_client)
            
            # 获取最近的交易经验
            with self.db.cursor() as cur:
                cur.execute(
                    "SELECT features_snapshot, outcome, success_label FROM trade_experiences WHERE strategy_type = %s ORDER BY executed_at DESC LIMIT 20",
                    (strategy,)
                )
                rows = cur.fetchall()
            
            wins = [r for r in rows if r[2] == 'win'][:5]
            losses = [r for r in rows if r[2] == 'loss'][:5]
            
            # 确保是 dict 再序列化
            win_features = [r[0] if isinstance(r[0], dict) else {} for r in wins]
            loss_features = [r[0] if isinstance(r[0], dict) else {} for r in losses]
            
            prompt = f"""从以下交易经验中提取可读的策略规则（IF-THEN格式），输出JSON数组：

策略: {strategy}

盈利交易特征:
{json.dumps(win_features, indent=2, default=str)}

亏损交易特征:
{json.dumps(loss_features, indent=2, default=str)}

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
        
        # 无论 DeepSeek 成功与否，记录这次规则结果
        self.last_rules = rules if 'rules' in dir() and rules else None
    
    async def _save_learning_history(self, strategy: str):
        """将本次学习结果写入历史表，并触发模拟交易重置"""
        if not self.last_params:
            return
        try:
            # 获取当前经验数
            with self.db.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) FROM trade_experiences WHERE strategy_type = %s",
                    (strategy,)
                )
                exp_count = cur.fetchone()[0] if cur.rowcount > 0 else 0
            
            # 读取当前规则
            rules_json = None
            if self.last_rules:
                rules_json = json.dumps(self.last_rules)
            else:
                r = await self.redis.get(f"rules:{strategy}")
                if r:
                    rules_json = r
            
            # 写入历史
            with self.db.cursor() as cur:
                cur.execute(
                    """INSERT INTO learning_history (strategy, params, rules, score, experience_count, created_at)
                       VALUES (%s, %s, %s::jsonb, %s, %s, NOW())""",
                    (strategy, json.dumps(self.last_params), rules_json,
                     self.last_score, exp_count)
                )
                self.db.commit()
            
            # 更新学习计数（下次按增量30触发）
            await self.redis.set(f"learning:last_count:{strategy}", exp_count)
            
            print(f"📝 学习历史已记录: 经验={exp_count} 评分={self.last_score:.4f}")
            
            # 将止盈止损等参数同步到 paper_config
            try:
                p = self.last_params
                tp = round(p.get('take_profit_pct', 0.30) * 100, 1)   # 转成百分比
                sl = round(p.get('stop_loss_pct', 0.20) * 100, 1)     # 转成百分比
                tr = round(p.get('trade_ratio', 0.10) * 100, 1)       # 交易比例转成%备用
                with self.db.cursor() as cur:
                    cur.execute(
                        """UPDATE paper_config SET 
                           take_profit_pct = %s, stop_loss_pct = %s, updated_at = NOW()
                           WHERE user_id = 'paper'""",
                        (tp, sl)
                    )
                    self.db.commit()
                print(f"📋 止盈止损已更新: 止盈={tp}% 止损={sl}%")
            except Exception as e:
                print(f"⚠️ 更新 paper_config 失败: {e}")
            
            # 触发模拟交易重置（用新参数重新跑）
            try:
                import httpx
                async with httpx.AsyncClient(timeout=10) as client:
                    resp = await client.post(
                        'http://gateway:3100/api/trade/paper/reset',
                        json={'userId': 'paper'}
                    )
                    if resp.status_code == 200:
                        print(f"🔄 模拟交易已重置（使用新参数重新跑）")
            except Exception as e:
                print(f"⚠️ 重置模拟交易失败: {e}")
                
        except Exception as e:
            print(f"⚠️ 保存学习历史失败: {e}")
    
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
                    # 保存历史 + 重置模拟交易
                    await self._save_learning_history(strategy)
                else:
                    print(f"⏸️ 经验不足，跳过学习")
                    
            except Exception as e:
                print(f"❌ 学习异常: {e}")


async def main():
    scheduler = LearningScheduler()
    await scheduler.run()


if __name__ == '__main__':
    asyncio.run(main())
