"""
MATURE_MEME 策略 - 成熟土狗波段交易引擎
轻量版：基于年龄分桶 + 价格行为信号
"""
import json, asyncio, time, math
from datetime import datetime, timedelta


class MatureMemeEngine:
    """成熟土狗波段交易引擎"""
    
    def __init__(self, db, redis, http):
        self.db = db
        self.redis = redis
        self.http = http
        
    async def analyze_token(self, chain: str, contract: str, age_hours: float, price_data: dict) -> dict:
        """分析代币是否适合波段交易"""
        # 年龄分桶
        if age_hours < 24:
            bucket = 'newborn'
            score_base = 0
        elif age_hours < 168:  # 7天
            bucket = 'young'
            score_base = 30
        elif age_hours < 720:  # 30天
            bucket = 'mature'
            score_base = 60
        else:
            bucket = 'aged'
            score_base = 80
            
        # 模拟综合评分
        confidence = min(score_base + 20, 95)
        
        signal = {
            'type': 'MATURE_MEME',
            'chain': chain,
            'contract': contract,
            'age_hours': round(age_hours, 1),
            'bucket': bucket,
            'confidence': confidence,
            'action': 'hold' if confidence < 50 else ('buy' if confidence > 70 else 'watch'),
            'time': datetime.now().isoformat(),
        }
        
        return signal
    
    async def run_cycle(self):
        """执行一轮分析（模拟）"""
        # 简化：从 events 表获取近期代币做分析
        try:
            with self.db.cursor() as cur:
                cur.execute(
                    """SELECT chain, contract, created_at FROM events 
                       WHERE created_at > NOW() - INTERVAL '72 hours'
                       ORDER BY created_at DESC LIMIT 20"""
                )
                rows = cur.fetchall()
                
            for row in rows:
                chain, contract, created_at = row
                age = (datetime.now() - created_at).total_seconds() / 3600
                signal = await self.analyze_token(chain, contract, age, {})
                if signal['action'] != 'hold':
                    await self.redis.publish('trade:signals', json.dumps({
                        'type': 'MATURE_MEME',
                        'data': signal
                    }))
                    print(f"  🐸 [{chain}] 成熟土狗信号: {contract[:10]}... 年龄{age:.0f}h 信心{signal['confidence']}% 动作:{signal['action']}")
        except Exception as e:
            print(f"  ⚠️ MATURE_MEME 分析异常: {e}")
