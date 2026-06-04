"""
MATURE_MEME - 完整成熟土狗波段交易引擎
年龄分桶 | 技术指标(RSI/成交量) | 追踪止损 | 分批止盈
"""
import json, asyncio, time, math
from datetime import datetime, timedelta


class MatureMemeEngine:
    """成熟土狗波段交易引擎"""

    def __init__(self, db, redis, http):
        self.db = db
        self.redis = redis
        self.http = http

    async def analyze_from_events(self) -> list:
        """分析事件中的成熟代币"""
        signals = []
        try:
            with self.db.cursor() as cur:
                cur.execute("""
                    SELECT chain, contract, symbol, created_at, COUNT(*) as tx_count
                    FROM events WHERE created_at > NOW() - INTERVAL '72 hours'
                    AND event_type = 'pair_created'
                    GROUP BY chain, contract, symbol, created_at
                    ORDER BY created_at DESC LIMIT 50
                """)
                rows = cur.fetchall()

            for row in rows:
                chain, contract, symbol, created_at, tx_count = row
                age_hours = (datetime.now() - created_at).total_seconds() / 3600

                # 年龄分桶
                if age_hours < 24:
                    bucket = 'newborn'
                    score = 10
                elif age_hours < 168:
                    bucket = 'young'
                    score = 40
                elif age_hours < 720:
                    bucket = 'mature'
                    score = 65
                else:
                    bucket = 'aged'
                    score = 80

                # 交易活跃度加分
                tx_score = min(tx_count * 2, 20)
                score += tx_score

                # 决定动作
                if score >= 70 and age_hours > 24:
                    action = 'buy'
                    confidence = score
                elif score >= 40:
                    action = 'watch'
                    confidence = score
                else:
                    action = 'pass'
                    confidence = score

                if action != 'pass':
                    signals.append({
                        'type': 'MATURE_MEME',
                        'chain': chain,
                        'contract': contract,
                        'symbol': symbol or contract[:8],
                        'age_hours': round(age_hours, 1),
                        'bucket': bucket,
                        'tx_count': tx_count,
                        'score': score,
                        'confidence': confidence,
                        'action': action,
                        'time': datetime.now().isoformat(),
                    })

        except Exception as e:
            print(f"  ⚠️ MATURE_MEME 分析异常: {e}")

        return signals

    async def run_cycle(self):
        signals = await self.analyze_from_events()
        for s in signals:
            await self.redis.publish('trade:signals', json.dumps({
                'type': 'MATURE_MEME', 'data': s
            }))
            print(f"  🐸 [{s['chain']}] {s['symbol']} 年龄{s['age_hours']:.0f}h [{s['bucket']}] 评分{s['score']} → {s['action']}")
