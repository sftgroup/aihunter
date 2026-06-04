"""
MATURE_MEME - 成熟土狗「震荡→突破」捕捉引擎
核心逻辑：识别横盘震荡结束 + 放量突破上涨
"""
import json, asyncio, time, math
from datetime import datetime, timedelta


class MatureMemeEngine:
    """成熟土狗捕捉引擎"""

    def __init__(self, db, redis, http):
        self.db = db
        self.redis = redis
        self.http = http

    async def get_token_chart(self, chain: str, contract: str) -> dict:
        """获取代币的K线形态数据"""
        result = {
            'age_hours': 0,
            'prices_1h': [],        # 1小时价格序列
            'prices_5m': [],        # 5分钟价格序列（用于震荡检测）
            'volumes_1h': [],       # 1小时成交量序列
            'pool_liquidity_usd': 0,
            'net_inflow_1h': 0,
            'buy_volume_1h': 0,
            'sell_volume_1h': 0,
            'unique_traders': 0,
        }

        try:
            with self.db.cursor() as cur:
                # 年龄
                cur.execute("SELECT EXTRACT(EPOCH FROM (NOW()-MIN(time)))/3600 FROM events WHERE contract=%s AND chain=%s", (contract, chain))
                row = cur.fetchone()
                if row and row[0]: result['age_hours'] = round(row[0], 1)

                # 1h价格序列（用于计算震荡区间）
                cur.execute("""
                    SELECT price, liquidity_usd, snapshot_at FROM price_snapshots
                    WHERE contract=%s AND chain=%s AND snapshot_at > NOW()-INTERVAL '1 hour'
                    ORDER BY snapshot_at ASC
                """, (contract, chain))
                rows = cur.fetchall()
                for r in rows:
                    result['prices_1h'].append(float(r[0]))
                    if r[1] and float(r[1]) > result['pool_liquidity_usd']:
                        result['pool_liquidity_usd'] = float(r[1])

                # 5m价格序列（从更细粒度取）
                cur.execute("""
                    SELECT price, snapshot_at FROM price_snapshots
                    WHERE contract=%s AND chain=%s AND snapshot_at > NOW()-INTERVAL '30 minutes'
                    ORDER BY snapshot_at ASC
                """, (contract, chain))
                rows = cur.fetchall()
                for r in rows:
                    result['prices_5m'].append(float(r[0]))

                # 买卖数据
                cur.execute("""
                    SELECT COALESCE(SUM(amount_usd) FILTER (WHERE side='buy'),0) as bv,
                           COALESCE(SUM(amount_usd) FILTER (WHERE side='sell'),0) as sv,
                           COUNT(DISTINCT user_id) as tr
                    FROM paper_trades WHERE contract=%s AND chain=%s AND created_at > NOW()-INTERVAL '1 hour'
                """, (contract, chain))
                row = cur.fetchone()
                if row:
                    result['buy_volume_1h'] = float(row[0])
                    result['sell_volume_1h'] = float(row[1])
                    result['net_inflow_1h'] = round(float(row[0]) - float(row[1]), 2)
                    result['unique_traders'] = row[2] or 0

                # 成交量序列（每个窗口）
                cur.execute("""
                    SELECT COALESCE(SUM(amount_usd),0) FROM paper_trades
                    WHERE contract=%s AND chain=%s AND created_at > NOW()-INTERVAL '1 hour'
                    GROUP BY date_trunc('hour', created_at)
                    ORDER BY date_trunc('hour', created_at) ASC
                """, (contract, chain))
                vol_rows = cur.fetchall()
                for r in vol_rows:
                    result['volumes_1h'].append(float(r[0]))

        except Exception as e:
            print(f"  ⚠️ 获取K线异常: {e}")

        return result

    def analyze_breakout(self, chart: dict) -> dict:
        """
        核心：震荡→突破检测
        返回：{is_breakout, score, signals, action, confidence}
        """
        prices_5m = chart['prices_5m']
        prices_1h = chart['prices_1h']
        vol_1h = chart['buy_volume_1h'] + chart['sell_volume_1h']
        age = chart['age_hours']

        score = 0
        signals = []
        
        # ===== 1️⃣ 必须有足够的价格数据 =====
        if len(prices_5m) < 3 and len(prices_1h) < 3:
            return {'score': 0, 'action': 'pass', 'signals': ['数据不足'], 'confidence': 0}

        # 使用最好的数据源
        prices = prices_5m if len(prices_5m) >= 5 else prices_1h

        # ===== 2️⃣ 震荡检测（核心） =====
        high = max(prices)
        low = min(prices)
        mid = (high + low) / 2 if high + low > 0 else 0
        range_pct = ((high - low) / mid * 100) if mid > 0 else 0

        current_price = prices[-1]

        if range_pct < 10 and range_pct > 1:
            # 震荡区间：振幅 1%~10%
            score += 30
            signals.append(f'震荡{range_pct:.1f}%')
            
            # 当前价格在区间上沿？
            if current_price > high * 0.95:
                score += 20
                signals.append('近上沿')
        elif range_pct < 1:
            # 横成一条线，可能是死币
            score -= 10
            signals.append('极度横盘')
        else:
            # 波动太大，不是震荡形态
            signals.append(f'波动{range_pct:.1f}%')

        # ===== 3️⃣ 突破检测 =====
        if len(prices) >= 5:
            # 前半段 vs 后半段
            half = len(prices) // 2
            first_half_avg = sum(prices[:half]) / half
            second_half_avg = sum(prices[half:]) / (len(prices) - half)
            
            if first_half_avg > 0:
                break_pct = (second_half_avg - first_half_avg) / first_half_avg * 100
                
                # 后半段比前半段上涨了（向上突破）
                if break_pct > 5 and break_pct < 50:
                    score += 35
                    signals.append(f'突破+{break_pct:.1f}%')
                elif break_pct > 50:
                    # 涨太多可能已经到头了
                    score += 10
                    signals.append(f'急涨{break_pct:.1f}%(慎追)')
                elif break_pct > 0:
                    score += 10
                    signals.append(f'微涨{break_pct:.1f}%')

                # 最新价格突破前高？
                if current_price > high * 1.02:  # 突破前高2%
                    score += 20
                    signals.append('破前高')

        # ===== 4️⃣ 成交量确认 =====
        if vol_1h > 10000:
            score += 15
            signals.append(f'量${vol_1h:.0f}')
        elif vol_1h > 1000:
            score += 8
            signals.append(f'量${vol_1h:.0f}')

        # 净流入
        net = chart['net_inflow_1h']
        if net > 0 and vol_1h > 0:
            net_pct = net / vol_1h * 100
            if net_pct > 30:
                score += 10
                signals.append(f'净入+{net_pct:.0f}%')
            elif net_pct > 0:
                score += 5

        # ===== 5️⃣ 流动池安全 =====
        liq = chart['pool_liquidity_usd']
        if liq > 50000:
            score += 10
        elif liq > 5000:
            score += 5
        elif liq > 0:
            score += 2

        # ===== 6️⃣ 年龄过滤 =====
        if age < 1:
            score *= 0.3  # 太新，降权
            signals.append('新币(<1h)')
        elif age < 6:
            score *= 0.7
            signals.append('较新(<6h)')
        elif age < 24:
            pass  # 正常
        elif age > 720:
            score -= 10  # 太老了
            signals.append('老龄(>30d)')

        # ===== 7️⃣ 交易者验证 =====
        traders = chart['unique_traders']
        if traders < 3:
            score *= 0.5  # 交易者太少，可疑
            signals.append('交易者少')
        elif traders > 20:
            score += 5

        score = max(0, min(100, round(score)))

        if score >= 60:
            action = 'buy'
        elif score >= 35:
            action = 'watch'
        else:
            action = 'pass'

        return {
            'score': score,
            'action': action,
            'signals': signals[:4],
            'confidence': score,
            'current_price': current_price,
            'range_pct': round(range_pct, 2),
            'high_24h': high,
            'low_24h': low,
        }

    async def analyze_token(self, chain: str, contract: str, symbol: str = '') -> dict:
        chart = await self.get_token_chart(chain, contract)
        analysis = self.analyze_breakout(chart)

        return {
            'type': 'MATURE_MEME',
            'chain': chain,
            'contract': contract,
            'symbol': symbol or contract[:8],
            'age_hours': chart['age_hours'],
            'current_price': analysis.get('current_price', 0),
            'high_24h': analysis.get('high_24h', 0),
            'low_24h': analysis.get('low_24h', 0),
            'range_pct': analysis.get('range_pct', 0),
            'pool_liquidity_usd': chart['pool_liquidity_usd'],
            'net_inflow_1h': chart['net_inflow_1h'],
            'volume_1h': chart['buy_volume_1h'] + chart['sell_volume_1h'],
            'buy_sell_ratio': round(chart['buy_volume_1h'] / (chart['sell_volume_1h'] or 1), 2),
            'unique_traders': chart['unique_traders'],
            'score': analysis['score'],
            'confidence': analysis['confidence'],
            'signals': analysis['signals'],
            'action': analysis['action'],
            'time': datetime.now().isoformat(),
        }

    async def run_cycle(self):
        """扫描有足够价格数据的代币"""
        signals = []
        try:
            with self.db.cursor() as cur:
                # 找最近有价格快照的代币
                cur.execute("""
                    SELECT DISTINCT ON (chain, contract) chain, contract 
                    FROM price_snapshots 
                    WHERE snapshot_at > NOW() - INTERVAL '2 hours'
                    ORDER BY chain, contract, snapshot_at DESC
                    LIMIT 50
                """)
                rows = cur.fetchall()

            for row in rows:
                result = await self.analyze_token(row[0], row[1])
                if result['action'] != 'pass':
                    signals.append(result)
                    print(f"  🐸 [{result['chain']}] {result['symbol']} "
                          f"震荡{result['range_pct']}% "
                          f"当前{result['current_price']:.8f} "
                          f"净流${result['net_inflow_1h']:+.0f} "
                          f"→ {result['action']}({result['score']}) "
                          f"{' '.join(result['signals'])}")

        except Exception as e:
            print(f"  ⚠️ MATURE_MEME 异常: {e}")

        for s in signals:
            await self.redis.publish('trade:signals', json.dumps({'type': 'MATURE_MEME', 'data': s}))
