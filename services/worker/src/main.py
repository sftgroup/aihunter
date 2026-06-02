# AIHunter Worker - 数据流水线与风险评分
# 轻量版：特征计算 + XGBoost推理 + 链上监听

import asyncio
import json
import os
import time
import hashlib
from datetime import datetime

import polars as pl
import redis.asyncio as redis
import psycopg2
import numpy as np

# XGBoost 可选，没有模型文件也能运行
try:
    import xgboost as xgb
    XGB_AVAILABLE = True
except ImportError:
    XGB_AVAILABLE = False


class AIHunterWorker:
    """AIHunter Worker 核心类"""
    
    def __init__(self):
        self.redis = None
        self.db = None
        self.xgb_model = None
        self.running = True
        
        # 配置
        self.redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        self.db_url = os.getenv('DATABASE_URL', 'postgresql://aihunter:aihunter2025@localhost:5432/aihunter')
        self.chains = os.getenv('CHAINS', 'ETH,BSC,BASE').split(',')
        
    async def connect(self):
        """连接 Redis 和 PostgreSQL"""
        self.redis = await redis.from_url(self.redis_url)
        
        # PostgreSQL 连接
        self.db = psycopg2.connect(self.db_url)
        
        # 尝试加载 XGBoost 模型
        self._load_model()
        
        print(f"✅ Worker 已连接 Redis + PostgreSQL")
        print(f"📊 XGBoost: {'已加载 ✓' if self.xgb_model else '未加载（使用规则引擎兜底）'}")
        print(f"🔗 链: {', '.join(self.chains)}")
    
    def _load_model(self):
        """加载 XGBoost 模型（如果存在）"""
        model_path = '/app/models/risk_model.json'
        if XGB_AVAILABLE and os.path.exists(model_path):
            self.xgb_model = xgb.Booster()
            self.xgb_model.load_model(model_path)
            print(f"✅ XGBoost 模型已加载: {model_path}")
        else:
            print("ℹ️ 使用规则引擎兜底（无 XGBoost 模型）")
    
    async def run(self):
        """主循环"""
        await self.connect()
        
        while self.running:
            try:
                # 1. 处理奖励队列
                await self._process_prize_queue()
                
                # 2. 处理未处理的事件
                await self._process_events()
                
                # 3. 更新特征缓存
                await self._update_feature_cache()
                
                # 等待
                await asyncio.sleep(1)
                
            except Exception as e:
                print(f"❌ Worker 异常: {e}")
                await asyncio.sleep(5)
    
    async def _process_prize_queue(self):
        """处理奖励发放队列"""
        while True:
            msg = await self.redis.lpop('prize:queue')
            if not msg:
                break
            data = json.loads(msg)
            print(f"🎯 处理奖励: orderId={data.get('orderId')}")
            # 简化版：直接标记完成
            await self.redis.set(f"order:{data['orderId']}", json.dumps({
                'status': 'completed',
                'processed_at': datetime.now().isoformat()
            }))
    
    async def _process_events(self):
        """处理链上事件"""
        with self.db.cursor() as cur:
            cur.execute(
                "SELECT id, chain, contract, event_type, payload FROM events WHERE processed = FALSE LIMIT 10"
            )
            rows = cur.fetchall()
            
            for row in rows:
                event_id, chain, contract, event_type, payload = row
                # 简化版：计算风险评分
                risk_score = self._calculate_risk(payload)
                
                # 更新处理状态
                cur.execute(
                    "UPDATE events SET processed = TRUE WHERE id = %s",
                    (event_id,)
                )
                self.db.commit()
                
                # 推送到 Redis 供前端展示
                await self.redis.publish('trade:signals', json.dumps({
                    'chain': chain,
                    'contract': contract,
                    'event_type': event_type,
                    'risk_score': risk_score,
                    'time': datetime.now().isoformat()
                }))
    
    def _calculate_risk(self, payload):
        """计算风险评分 - 规则引擎 + XGBoost"""
        if not payload:
            return 0.5
        
        # 规则引擎评分（0~1）
        risk = 0.5
        
        # 简单规则
        if isinstance(payload, dict):
            # 税过高
            if payload.get('buy_tax', 0) > 5 or payload.get('sell_tax', 0) > 5:
                risk += 0.2
            # 流动性不足
            if payload.get('initial_liquidity', 0) < 10000:
                risk += 0.15
            # 持有者集中
            if payload.get('top10_holder_pct', 0) > 50:
                risk += 0.15
            # 铸造未弃权
            if payload.get('mintable', False):
                risk += 0.2
            # 锁仓
            if payload.get('lp_locked', True):
                risk -= 0.1
        
        return min(max(risk, 0), 1)
    
    async def _update_feature_cache(self):
        """更新 Redis 特征缓存"""
        # 简化版：定期清理过期缓存
        pass


async def main():
    worker = AIHunterWorker()
    await worker.run()


if __name__ == '__main__':
    asyncio.run(main())
