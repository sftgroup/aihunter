"""
AIHunter Learning Worker - 自动学习调度器

V2 引擎优化版：
- 基于 MATURE_MEME 引擎特征（score/range_pct/hourly_bars/liquidity_usd）进行 Optuna 参数调优
- DeepSeek 从 V2 信号特征中提取策略规则
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
        
        last_key = f"learning:last_count:{strategy}"
        last_count = await self.redis.get(last_key)
        if last_count is None:
            last_count = 0
        else:
            last_count = int(last_count)
        
        return (total - last_count) >= 30
    
    async def _run_optuna(self, strategy: str):
        """执行 Optuna 参数调优（基于 V2 MATURE_MEME 特征）"""
        try:
            import optuna
            from optuna.samplers import TPESampler
            
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
                # V2 引擎专属参数优化
                min_score = trial.suggest_int('min_score', 40, 80)              # 最低评分阈值
                min_hourly_bars = trial.suggest_int('min_hourly_bars', 3, 24)   # 最少小时柱数
                range_min = trial.suggest_float('range_min_pct', 0.5, 5.0)      # 最小震荡幅度%
                range_max = trial.suggest_float('range_max_pct', 5.0, 20.0)     # 最大震荡幅度%
                min_liquidity = trial.suggest_float('min_liquidity_k', 50, 500) # 最小流动性(K USD)
                take_profit = trial.suggest_float('take_profit_pct', 0.05, 0.50)
                stop_loss = trial.suggest_float('stop_loss_pct', 0.05, 0.30)
                trade_ratio = trial.suggest_float('trade_ratio', 0.02, 0.20)
                
                score = 0
                for r in rows:
                    outcome = r[0] if isinstance(r[0], dict) and 'pnl' in r[0] else {}
                    pnl_pct = float(outcome.get('pnl_pct', 0) or 0) / 100
                    
                    if pnl_pct > take_profit:
                        pnl_pct = take_profit
                    elif pnl_pct < -stop_loss:
                        pnl_pct = -stop_loss
                    
                    actual_pnl = pnl_pct * trade_ratio
                    if actual_pnl > 0:
                        score += 1
                return score / max(len(rows), 1)
            
            study = optuna.create_study(direction='maximize', sampler=TPESampler())
            await asyncio.to_thread(lambda: study.optimize(objective, n_trials=50))
            
            print(f"🎯 Optuna 最优参数: {study.best_params}")
            print(f"📊 最优评分: {study.best_value:.4f}")
            
            self.last_params = study.best_params
            self.last_score = study.best_value
            self.last_strategy = strategy
            await self.redis.set(f"params:{strategy}", json.dumps(study.best_params))
            
        except ImportError:
            print("⚠️ optuna 未安装，跳过调优")
        except Exception as e:
            print(f"⚠️ Optuna 异常: {e}")
    
    async def _get_deepseek_key(self):
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
        """调用 DeepSeek 生成 V2 引擎策略规则"""
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
                    """SELECT features_snapshot, outcome, success_label 
                       FROM trade_experiences 
                       WHERE strategy_type = %s 
                       ORDER BY executed_at DESC LIMIT 50""",
                    (strategy,)
                )
                rows = cur.fetchall()
            
            wins = [r for r in rows if r[2] == 'win'][:8]
            losses = [r for r in rows if r[2] == 'loss'][:8]
            
            win_features = [r[0] if isinstance(r[0], dict) else {} for r in wins]
            loss_features = [r[0] if isinstance(r[0], dict) else {} for r in losses]
            
            # V2 引擎的 prompt：基于 MATURE_MEME 特征生成规则
            prompt = f"""你是一个加密货币动量策略分析师。分析以下 V2 成熟代币引擎（MATURE_MEME）的交易经验，提取可读的筛选规则。

策略类型：MATURE_MEME（动量突破策略）
策略说明：基于小时图数据分析代币的震荡→突破形态，评分买入。

特征字段说明：
- chain: 链 (ETH/BSC/BASE/SOL)
- score: V2引擎评分 (0-100，>=60为BUY)
- hourly_bars: 已积累的小时价格柱数（越多越好）
- range_pct: 震荡幅度百分比（1-15%理想）
- liquidity_usd: 流动性美元价值
- price_usd: 当前价格
- confidence: 可信度
- signals: 信号标签数组（如"池$40M"、"震荡11.8%"、"流动性增"等）
- action: 动作 (buy/watch/pass)

盈利交易特征:
{json.dumps(win_features, indent=2, default=str)}

亏损交易特征:
{json.dumps(loss_features, indent=2, default=str)}

请分析盈利和亏损交易的模式差异，输出JSON数组格式的策略规则。
每条规则包含：condition（基于特征的条件表达式）、action（BUY/WATCH/SKIP）、reason（为什么这条规则有效）、expected_win_rate（0-1预期胜率）

示例：
[{{"condition": "score >= 65 AND hourly_bars >= 12 AND liquidity_usd > 100000", "action": "BUY", "reason": "高评分+充足数据+足够流动性", "expected_win_rate": 0.7}}]

请输出 2-4 条最有效的规则。
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
            print(f"🤖 DeepSeek 生成规则: {json.dumps(rules, indent=2)[:400]}")
            
            await self.redis.set(f"rules:{strategy}", json.dumps(rules))
            await self.redis.publish('rule_updates', json.dumps({
                'strategy': strategy, 'newRule': rules, 'status': 'promoted'
            }))
            
            self.last_rules = rules
            
        except Exception as e:
            print(f"⚠️ DeepSeek 调用失败: {e}")
            self.last_rules = rules if 'rules' in dir() and rules else None
    
    async def _save_learning_history(self, strategy: str):
        """将本次学习结果写入历史表，并触发模拟交易重置"""
        if not self.last_params:
            return
        try:
            with self.db.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) FROM trade_experiences WHERE strategy_type = %s",
                    (strategy,)
                )
                exp_count = cur.fetchone()[0] if cur.rowcount > 0 else 0
            
            rules_json = None
            if self.last_rules:
                rules_json = json.dumps(self.last_rules)
            else:
                r = await self.redis.get(f"rules:{strategy}")
                if r:
                    rules_json = r
            
            with self.db.cursor() as cur:
                cur.execute(
                    """INSERT INTO learning_history (strategy, params, rules, score, experience_count, created_at)
                       VALUES (%s, %s, %s::jsonb, %s, %s, NOW())""",
                    (strategy, json.dumps(self.last_params), rules_json,
                     self.last_score, exp_count)
                )
                self.db.commit()
            
            await self.redis.set(f"learning:last_count:{strategy}", exp_count)
            
            print(f"📝 学习历史已记录: 经验={exp_count} 评分={self.last_score:.4f}")
            
            # 将 V2 引擎参数同步到 paper_config
            try:
                p = self.last_params
                tp = round(p.get('take_profit_pct', 0.30) * 100, 1)
                sl = round(p.get('stop_loss_pct', 0.20) * 100, 1)
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
                    await asyncio.gather(
                        self._run_optuna(strategy),
                        self._call_deepseek_for_rules(strategy)
                    )
                    print(f"✅ 学习完成: {strategy}")
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
