"""
MATURE_MEME - 完整成熟土狗波段交易引擎
多维度评分：技术指标(RSI/动量/成交量) + 买卖单深度 + 持有者分析 + 年龄分桶
"""
import json, asyncio, time, math
from datetime import datetime, timedelta


class MatureMemeEngine:
    """成熟土狗波段交易引擎"""

    def __init__(self, db, redis, http):
        self.db = db
        self.redis = redis
        self.http = http

    async def get_token_metrics(self, chain: str, contract: str) -> dict:
        """获取代币多维指标"""
        metrics = {
            'age_hours': 0,
            'bucket': 'unknown',
            'price_change_5m': 0,
            'price_change_1h': 0,
            'volume_5m': 0,
            'volume_1h': 0,
            'buy_count_1h': 0,
            'sell_count_1h': 0,
            'buy_volume_1h': 0,
            'sell_volume_1h': 0,
            'unique_traders': 0,
            'avg_hold_time_min': 0,
            'score': 0,
        }

        try:
            with self.db.cursor() as cur:
                # 1. 年龄
                cur.execute(
                    "SELECT EXTRACT(EPOCH FROM (NOW() - MIN(time)))/3600 FROM events WHERE contract = %s AND chain = %s",
                    (contract, chain)
                )
                row = cur.fetchone()
                if row and row[0]:
                    metrics['age_hours'] = round(row[0], 1)

                # 2. 买卖单数据（从 paper_trades 获取）
                cur.execute("""
                    SELECT 
                        COUNT(*) FILTER (WHERE side = 'buy') as buy_count,
                        COUNT(*) FILTER (WHERE side = 'sell') as sell_count,
                        COALESCE(SUM(amount_usd) FILTER (WHERE side = 'buy'), 0) as buy_vol,
                        COALESCE(SUM(amount_usd) FILTER (WHERE side = 'sell'), 0) as sell_vol,
                        COUNT(DISTINCT user_id) as traders
                    FROM paper_trades 
                    WHERE contract = %s AND chain = %s 
                    AND created_at > NOW() - INTERVAL '1 hour'
                """, (contract, chain))
                row = cur.fetchone()
                if row:
                    metrics['buy_count_1h'] = row[0] or 0
                    metrics['sell_count_1h'] = row[1] or 0
                    metrics['buy_volume_1h'] = float(row[2] or 0)
                    metrics['sell_volume_1h'] = float(row[3] or 0)
                    metrics['unique_traders'] = row[4] or 0

                # 3. 价格变化（从 price_snapshots 计算）
                cur.execute("""
                    SELECT price, snapshot_at FROM price_snapshots 
                    WHERE contract = %s AND chain = %s
                    AND snapshot_at > NOW() - INTERVAL '1 hour'
                    ORDER BY snapshot_at ASC
                """, (contract, chain))
                prices = cur.fetchall()
                if len(prices) >= 2:
                    first_price = float(prices[0][0])
                    last_price = float(prices[-1][0])
                    if first_price > 0:
                        metrics['price_change_1h'] = round((last_price - first_price) / first_price * 100, 2)
                    
                    # 5分钟价格变化
                    recent = [p for p in prices if p[1] > datetime.now() - timedelta(minutes=5)]
                    if len(recent) >= 2:
                        fp = float(recent[0][0])
                        lp = float(recent[-1][0])
                        if fp > 0:
                            metrics['price_change_5m'] = round((lp - fp) / fp * 100, 2)

                # 4. 成交量（1h）
                if len(prices) >= 2:
                    total_vol = metrics['buy_volume_1h'] + metrics['sell_volume_1h']
                    metrics['volume_1h'] = round(total_vol, 2)

        except Exception as e:
            print(f"  ⚠️ 指标获取异常: {e}")

        return metrics

    def calculate_score(self, metrics: dict) -> dict:
        """多维评分"""
        score = 0
        signals = []

        # 1. 年龄评分（+15分）
        age = metrics['age_hours']
        if age < 1:
            bucket = 'newborn'
            score += 0
            signals.append('刚开盘')
        elif age < 6:
            bucket = 'early'
            score += 5
            signals.append('早期')
        elif age < 24:
            bucket = 'developing'
            score += 10
            signals.append('发展中')
        elif age < 168:
            bucket = 'young'
            score += 20
            signals.append('年轻(+20)')
        elif age < 720:
            bucket = 'mature'
            score += 30
            signals.append('成熟(+30)')
        else:
            bucket = 'aged'
            score += 25
            signals.append('老牌')

        # 2. 价格动量
        pc_5m = metrics['price_change_5m']
        pc_1h = metrics['price_change_1h']
        
        if abs(pc_5m) > 5:
            score += 15
            signals.append(f'5min波动{pc_5m:+.1f}%(+15)')
        elif abs(pc_5m) > 2:
            score += 8
            signals.append(f'5min波动{pc_5m:+.1f}%(+8)')
        
        if abs(pc_1h) > 20:
            score += 20
            signals.append(f'1h波动{pc_1h:+.1f}%(+20)')
        elif abs(pc_1h) > 10:
            score += 10
            signals.append(f'1h波动{pc_1h:+.1f}%(+10)')

        # 3. 买卖单深度
        buy_v = metrics['buy_volume_1h']
        sell_v = metrics['sell_volume_1h']
        total_v = buy_v + sell_v
        
        if total_v > 10000:
            score += 20
            signals.append(f'成交量${total_v:.0f}(+20)')
        elif total_v > 1000:
            score += 10
            signals.append(f'成交量${total_v:.0f}(+10)')
        elif total_v > 100:
            score += 5
            signals.append(f'成交量${total_v:.0f}(+5)')

        # 买卖比
        if sell_v > 0:
            buy_sell_ratio = buy_v / sell_v
            if buy_sell_ratio > 2:
                score += 15
                signals.append(f'买/卖比{buy_sell_ratio:.1f}(+15)')
            elif buy_sell_ratio > 1.3:
                score += 8
                signals.append(f'买/卖比{buy_sell_ratio:.1f}(+8)')

        # 4. 交易者数量
        traders = metrics['unique_traders']
        if traders > 50:
            score += 15
            signals.append(f'{traders}交易者(+15)')
        elif traders > 20:
            score += 10
            signals.append(f'{traders}交易者(+10)')
        elif traders > 5:
            score += 5
            signals.append(f'{traders}交易者(+5)')

        # 5. 价格位置（RSI模拟）
        if pc_1h > 30:
            score -= 20
            signals.append(f'超买{pc_1h:+.0f}%(-20)')
        elif pc_1h < -30:
            score += 20
            signals.append(f'超卖{pc_1h:+.0f}%(+20)')

        # 决定动作
        if score >= 70:
            action = 'strong_buy'
        elif score >= 50:
            action = 'buy'
        elif score >= 30:
            action = 'watch'
        else:
            action = 'pass'

        return {
            'score': score,
            'bucket': bucket,
            'action': action,
            'signals': signals,
            'confidence': min(score, 95),
        }

    async def analyze_token(self, chain: str, contract: str, symbol: str = '') -> dict:
        """完整分析一个代币"""
        metrics = await self.get_token_metrics(chain, contract)
        result = self.calculate_score(metrics)
        
        return {
            'type': 'MATURE_MEME',
            'chain': chain,
            'contract': contract,
            'symbol': symbol or contract[:8],
            'age_hours': metrics['age_hours'],
            'bucket': result['bucket'],
            'price_change_5m': metrics['price_change_5m'],
            'price_change_1h': metrics['price_change_1h'],
            'volume_1h': metrics['volume_1h'],
            'buy_volume_1h': metrics['buy_volume_1h'],
            'sell_volume_1h': metrics['sell_volume_1h'],
            'unique_traders': metrics['unique_traders'],
            'score': result['score'],
            'confidence': result['confidence'],
            'signals': result['signals'],
            'action': result['action'],
            'time': datetime.now().isoformat(),
        }

    async def run_cycle(self):
        """扫描近期有交易活动的代币"""
        signals = []
        try:
            with self.db.cursor() as cur:
                # 获取最近1小时有交易记录的代币
                cur.execute("""
                    SELECT DISTINCT chain, contract, symbol 
                    FROM paper_trades 
                    WHERE created_at > NOW() - INTERVAL '1 hour'
                    ORDER BY MAX(created_at) DESC
                    LIMIT 30
                """)
                rows = cur.fetchall()
                
                # 也加上 events 中的新代币
                cur.execute("""
                    SELECT DISTINCT chain, contract, event_type as symbol
                    FROM events 
                    WHERE time > NOW() - INTERVAL '6 hours'
                    AND event_type = 'pair_created'
                    ORDER BY time DESC
                    LIMIT 20
                """)
                events_rows = cur.fetchall()
                
                # 合并去重
                seen = set()
                for row in rows + events_rows:
                    key = (row[0], row[1])
                    if key in seen:
                        continue
                    seen.add(key)
                    
                    result = await self.analyze_token(row[0], row[1], row[2] or '')
                    if result['action'] != 'pass':
                        signals.append(result)

        except Exception as e:
            print(f"  ⚠️ MATURE_MEME 异常: {e}")

        for s in signals:
            await self.redis.publish('trade:signals', json.dumps({
                'type': 'MATURE_MEME', 'data': s
            }))
            print(f"  🐸 [{s['chain']}] {s['symbol']} "
                  f"年龄{s['age_hours']:.0f}h [{s['bucket']}] "
                  f"成交量${s['volume_1h']:.0f} "
                  f"买卖比{s['buy_volume_1h']/(s['sell_volume_1h'] or 1):.1f} "
                  f"评分{s['score']} → {s['action']}")
