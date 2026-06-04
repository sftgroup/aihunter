"""
MATURE_MEME - 成熟土狗波段交易引擎
7大维度评分：年龄/流动池深度/净流入/成交量趋势/买卖单/价格动量/交易者
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
            'pool_liquidity_usd': 0,      # 流动池深度
            'net_inflow_1h': 0,            # 1h净流入
            'volume_1h': 0,                # 1h成交量
            'volume_1h_ago': 0,            # 上一小时成交量（对比）
            'volume_change_pct': 0,        # 成交量变化率
            'buy_volume_1h': 0,
            'sell_volume_1h': 0,
            'buy_sell_ratio': 1.0,
            'price_change_5m': 0,
            'price_change_1h': 0,
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

                # 2. 买卖单数据 & 净流入
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
                    buy_vol = float(row[2] or 0)
                    sell_vol = float(row[3] or 0)
                    metrics['buy_volume_1h'] = buy_vol
                    metrics['sell_volume_1h'] = sell_vol
                    metrics['volume_1h'] = buy_vol + sell_vol
                    metrics['net_inflow_1h'] = round(buy_vol - sell_vol, 2)
                    metrics['buy_sell_ratio'] = round(buy_vol / (sell_vol or 1), 2)
                    metrics['unique_traders'] = row[4] or 0

                # 3. 上一小时成交量（对比用）
                cur.execute("""
                    SELECT COALESCE(SUM(amount_usd), 0)
                    FROM paper_trades 
                    WHERE contract = %s AND chain = %s 
                    AND created_at BETWEEN NOW() - INTERVAL '2 hours' AND NOW() - INTERVAL '1 hour'
                """, (contract, chain))
                row = cur.fetchone()
                prev_vol = float(row[0] or 0) if row else 0
                metrics['volume_1h_ago'] = prev_vol
                if prev_vol > 0:
                    metrics['volume_change_pct'] = round((metrics['volume_1h'] - prev_vol) / prev_vol * 100, 1)

                # 4. 流动池深度（从 price_snapshots 取最新 liquidity_usd）
                cur.execute("""
                    SELECT liquidity_usd FROM price_snapshots 
                    WHERE contract = %s AND chain = %s
                    AND liquidity_usd IS NOT NULL
                    ORDER BY snapshot_at DESC LIMIT 1
                """, (contract, chain))
                row = cur.fetchone()
                if row and row[0]:
                    metrics['pool_liquidity_usd'] = float(row[0])

                # 5. 价格变化（从 price_snapshots 计算）
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

                    recent = [p for p in prices if p[1] > datetime.now() - timedelta(minutes=5)]
                    if len(recent) >= 2:
                        fp = float(recent[0][0])
                        lp = float(recent[-1][0])
                        if fp > 0:
                            metrics['price_change_5m'] = round((lp - fp) / fp * 100, 2)

        except Exception as e:
            print(f"  ⚠️ 指标获取异常: {e}")

        return metrics

    def calculate_score(self, metrics: dict) -> dict:
        """7维评分"""
        score = 0
        signals = []
        reasons = []

        # 1️⃣ 流动池深度（+20分）
        liq = metrics['pool_liquidity_usd']
        if liq > 50000:
            score += 20
            reasons.append(f'池深${liq:.0f}')
        elif liq > 10000:
            score += 15
            reasons.append(f'池深${liq:.0f}')
        elif liq > 1000:
            score += 10
            reasons.append(f'池深${liq:.0f}')
        elif liq > 0:
            score += 5
            reasons.append(f'池深${liq:.0f}')
        else:
            reasons.append('池深未知')

        # 2️⃣ 净流入（+25分）
        net = metrics['net_inflow_1h']
        vol = metrics['volume_1h']
        if vol > 0:
            net_ratio = net / vol * 100
            if net_ratio > 50:
                score += 25
                reasons.append(f'净流入+{net_ratio:.0f}%')
            elif net_ratio > 20:
                score += 15
                reasons.append(f'净流入+{net_ratio:.0f}%')
            elif net_ratio > 0:
                score += 5
                reasons.append(f'净流入+{net_ratio:.0f}%')
            elif net_ratio < -50:
                score -= 20
                reasons.append(f'净流出{net_ratio:.0f}%')
            else:
                reasons.append(f'净流{net_ratio:+.0f}%')

        # 3️⃣ 成交量变化趋势（+15分）
        vc = metrics['volume_change_pct']
        if vc > 100:
            score += 15
            reasons.append(f'量增{vc:.0f}%')
        elif vc > 30:
            score += 10
            reasons.append(f'量增{vc:.0f}%')
        elif vc > 0:
            score += 5
            reasons.append(f'量增{vc:.0f}%')
        elif vc < -50:
            score -= 10
            reasons.append(f'量缩{vc:.0f}%')
        else:
            reasons.append(f'量{vc:+.0f}%')

        # 4️⃣ 成交量绝对值（+10分）
        if vol > 50000:
            score += 10
        elif vol > 10000:
            score += 7
        elif vol > 1000:
            score += 5
        elif vol > 100:
            score += 3

        # 5️⃣ 买卖单深度（+10分）
        bs = metrics['buy_sell_ratio']
        if bs > 2:
            score += 10
            reasons.append(f'买/卖{bs:.1f}')
        elif bs > 1.3:
            score += 5
            reasons.append(f'买/卖{bs:.1f}')

        # 6️⃣ 价格动量（+15分）
        pc_5m = metrics['price_change_5m']
        pc_1h = metrics['price_change_1h']
        if abs(pc_5m) > 5:
            score += 8
        elif abs(pc_5m) > 2:
            score += 4
        if abs(pc_1h) > 20:
            score += 7
        elif abs(pc_1h) > 10:
            score += 4

        # 超买超卖修正
        if pc_1h > 50:
            score -= 15
        elif pc_1h < -40:
            score += 10

        # 7️⃣ 交易者活跃度（+5分）
        traders = metrics['unique_traders']
        if traders > 30:
            score += 5
        elif traders > 10:
            score += 3

        # 年龄过滤
        age = metrics['age_hours']
        if age < 1:
            bucket = 'newborn'
            score *= 0.3  # 新币降权
        elif age < 6:
            bucket = 'early'
        elif age < 24:
            bucket = 'developing'
        elif age < 168:
            bucket = 'young'
        elif age < 720:
            bucket = 'mature'
        else:
            bucket = 'aged'

        score = max(0, min(100, round(score)))
        signals = reasons[:4]  # 取前4个特征作为信号

        if score >= 65:
            action = 'strong_buy'
        elif score >= 45:
            action = 'buy'
        elif score >= 25:
            action = 'watch'
        else:
            action = 'pass'

        return {
            'score': score,
            'bucket': bucket,
            'action': action,
            'signals': signals,
            'confidence': score,
        }

    async def analyze_token(self, chain: str, contract: str, symbol: str = '') -> dict:
        metrics = await self.get_token_metrics(chain, contract)
        result = self.calculate_score(metrics)
        return {
            'type': 'MATURE_MEME',
            'chain': chain,
            'contract': contract,
            'symbol': symbol or contract[:8],
            'age_hours': metrics['age_hours'],
            'bucket': result['bucket'],
            'pool_liquidity_usd': metrics['pool_liquidity_usd'],
            'net_inflow_1h': metrics['net_inflow_1h'],
            'volume_1h': metrics['volume_1h'],
            'volume_change_pct': metrics['volume_change_pct'],
            'buy_sell_ratio': metrics['buy_sell_ratio'],
            'price_change_5m': metrics['price_change_5m'],
            'price_change_1h': metrics['price_change_1h'],
            'unique_traders': metrics['unique_traders'],
            'score': result['score'],
            'confidence': result['confidence'],
            'signals': result['signals'],
            'action': result['action'],
            'time': datetime.now().isoformat(),
        }

    async def run_cycle(self):
        signals = []
        try:
            with self.db.cursor() as cur:
                cur.execute("""
                    SELECT DISTINCT ON (chain, contract) chain, contract, symbol
                    FROM paper_trades 
                    WHERE created_at > NOW() - INTERVAL '2 hours'
                    ORDER BY chain, contract, created_at DESC
                    LIMIT 30
                """)
                rows = cur.fetchall()

            for row in rows:
                result = await self.analyze_token(row[0], row[1], row[2] or '')
                if result['action'] != 'pass':
                    signals.append(result)
                    print(f"  🐸 [{result['chain']}] {result['symbol']} "
                          f"池${result['pool_liquidity_usd']:.0f} "
                          f"净流${result['net_inflow_1h']:+.0f} "
                          f"量{result['volume_change_pct']:+.0f}% "
                          f"买/卖{result['buy_sell_ratio']:.1f} "
                          f"→ {result['action']}({result['score']})")

        except Exception as e:
            print(f"  ⚠️ MATURE_MEME 异常: {e}")

        for s in signals:
            await self.redis.publish('trade:signals', json.dumps({
                'type': 'MATURE_MEME', 'data': s
            }))
