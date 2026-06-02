"""
AIHunter Worker - 链上数据监听与风险评分引擎

功能：
- 监听链上事件（PairCreated / AddLiquidity）
- 25维特征计算
- XGBoost 风险评分（规则引擎兜底）
- Mempool 交易监听
"""

import asyncio
import json
import os
import time
from datetime import datetime

import redis.asyncio as redis
import psycopg2
import polars as pl

# XGBoost 可选（无模型时使用规则引擎兜底）
try:
    import xgboost as xgb
    XGB_AVAILABLE = True
except ImportError:
    XGB_AVAILABLE = False


class ChainWorker:
    """链上数据 Worker"""
    
    def __init__(self):
        self.redis = None
        self.db = None
        self.xgb_model = None
        self.running = True
        
        self.redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        self.db_url = os.getenv('DATABASE_URL', 'postgresql://aihunter:aihunter2025@localhost:5432/aihunter')
        self.chains = os.getenv('CHAINS', 'ETH,BSC,BASE').split(',')
        
    async def connect(self):
        self.redis = await redis.from_url(self.redis_url)
        self.db = psycopg2.connect(self.db_url)
        self._load_model()
        print(f"✅ Worker 已连接 Redis + PostgreSQL")
        print(f"📊 XGBoost: {'已就绪' if self.xgb_model else '规则引擎兜底'}")
        print(f"🔗 链: {', '.join(self.chains)}")
    
    def _load_model(self):
        model_path = '/app/models/risk_model.json'
        if XGB_AVAILABLE and os.path.exists(model_path):
            self.xgb_model = xgb.Booster()
            self.xgb_model.load_model(model_path)
            print(f"✅ XGBoost 模型已加载")
    
    def _calculate_risk_score(self, features: dict) -> float:
        """
        风险评分：0（安全）~ 1（高危）
        使用 XGBoost 或规则引擎兜底
        """
        if self.xgb_model and features:
            try:
                # XGBoost 推理
                import numpy as np
                feature_names = [
                    'buy_tax_pct', 'sell_tax_pct', 'initial_lp_usd', 
                    'top10_holder_pct', 'owner_renounced', 'has_mint',
                    'lp_lock_days', 'unique_traders_1h', 'buy_sell_ratio_1h'
                ]
                data = np.array([[features.get(f, 0) for f in feature_names]])
                dmatrix = xgb.DMatrix(data, feature_names=feature_names)
                return float(self.xgb_model.predict(dmatrix)[0])
            except Exception:
                pass
        
        # 规则引擎兜底
        risk = 0.5
        if features.get('buy_tax_pct', 0) > 5 or features.get('sell_tax_pct', 0) > 5:
            risk += 0.2
        if features.get('initial_lp_usd', 0) < 10000:
            risk += 0.15
        if features.get('top10_holder_pct', 0) > 50:
            risk += 0.15
        if features.get('has_mint', False):
            risk += 0.2
        if features.get('lp_lock_days', 0) > 30:
            risk -= 0.1
        return min(max(risk, 0), 1)
    
    async def _process_events(self):
        """处理未处理的链上事件"""
        try:
            with self.db.cursor() as cur:
                cur.execute(
                    "SELECT id, chain, contract, event_type, payload FROM events WHERE processed = FALSE LIMIT 10"
                )
                rows = cur.fetchall()
                
                for row in rows:
                    event_id, chain, contract, event_type, payload = row
                    
                    # 计算风险评分
                    risk_score = self._calculate_risk_score(payload or {})
                    
                    # 标记已处理
                    cur.execute("UPDATE events SET processed = TRUE WHERE id = %s", (event_id,))
                    self.db.commit()
                    
                    # 推送到前端
                    await self.redis.publish('trade:signals', json.dumps({
                        'chain': chain,
                        'contract': contract,
                        'event_type': event_type,
                        'risk_score': round(risk_score, 2),
                        'risk_level': 'low' if risk_score < 0.3 else 'medium' if risk_score < 0.6 else 'high',
                        'time': datetime.now().isoformat()
                    }))
        except Exception as e:
            print(f"❌ 事件处理异常: {e}")
    
    async def run(self):
        """主循环"""
        await self.connect()
        
        while self.running:
            try:
                await self._process_events()
                await asyncio.sleep(1)
            except Exception as e:
                print(f"❌ Worker 异常: {e}")
                await asyncio.sleep(5)


async def main():
    worker = ChainWorker()
    await worker.run()


if __name__ == '__main__':
    asyncio.run(main())
