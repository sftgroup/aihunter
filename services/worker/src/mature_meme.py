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
        # 分批索引：0~7，每批200个，每15分钟一批，2小时一轮完整扫描
        self._batch_idx = 0

    async def get_token_chart(self, chain: str, contract: str) -> dict:
        """获取代币的K线形态数据（修改为从historical_prices读取小时图）"""
        result = {
            'age_hours': 0,
            'hourly_prices': [],    # 小时级价格序列（来自historical_prices）
            'prices_1h': [],        # 最近1小时5m粒度（来自price_snapshots）
            'volumes_1h': [],
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

                # ★ 小时图价格序列（从historical_prices按小时聚合）
                cur.execute("""
                    SELECT 
                        date_trunc('hour', recorded_at) as hour_bucket,
                        AVG(price) as avg_price,
                        MAX(price) as high_price,
                        MIN(price) as low_price,
                        AVG(liquidity_usd) as avg_liquidity,
                        COUNT(*) as snapshots
                    FROM historical_prices
                    WHERE contract=%s AND chain=%s
                      AND recorded_at > NOW() - INTERVAL '72 hours'
                    GROUP BY date_trunc('hour', recorded_at)
                    ORDER BY hour_bucket ASC
                """, (contract, chain))
                h_rows = cur.fetchall()
                for r in h_rows:
                    result['hourly_prices'].append({
                        'hour': r[0].isoformat() if r[0] else '',
                        'avg': float(r[1]) if r[1] else 0,
                        'high': float(r[2]) if r[2] else 0,
                        'low': float(r[3]) if r[3] else 0,
                        'liquidity': float(r[4]) if r[4] else 0,
                        'snapshots': r[5] or 0,
                    })
                    if r[4] and float(r[4]) > result['pool_liquidity_usd']:
                        result['pool_liquidity_usd'] = float(r[4])

                # 1h精细价格序列（可选补充）
                cur.execute("""
                    SELECT price, liquidity_usd, snapshot_at FROM price_snapshots
                    WHERE contract=%s AND chain=%s AND snapshot_at > NOW()-INTERVAL '1 hour'
                    ORDER BY snapshot_at ASC
                """, (contract, chain))
                for r in cur.fetchall():
                    result['prices_1h'].append(float(r[0]))
                    if r[1] and float(r[1]) > result['pool_liquidity_usd']:
                        result['pool_liquidity_usd'] = float(r[1])

        except Exception as e:
            print(f"  ⚠️ 获取K线异常: {e}")

        return result

    def analyze_breakout(self, chart: dict) -> dict:
        """
        基于小时图的震荡→突破检测
        """
        hp = chart['hourly_prices']  # 小时图数据
        prices_1h = chart['prices_1h']
        age = chart['age_hours']

        score = 0
        signals = []

        # 优先使用小时图，否则用1h精细数据
        if len(hp) >= 3:
            prices = [p['avg'] for p in hp if p['avg'] > 0]
            volumes = [p['liquidity'] for p in hp if p['liquidity'] > 0]
            latest_liquidity = hp[-1]['liquidity'] if hp else 0
        elif len(prices_1h) >= 3:
            prices = prices_1h
            volumes = []
            latest_liquidity = chart['pool_liquidity_usd']
        else:
            return {'score': 0, 'action': 'pass', 'signals': ['数据不足'], 'confidence': 0,
                    'current_price': 0, 'range_pct': 0, 'high_24h': 0, 'low_24h': 0}

        current_price = prices[-1]
        high = max(prices)
        low = min(prices)
        mid = (high + low) / 2 if high + low > 0 else 0
        range_pct = ((high - low) / mid * 100) if mid > 0 else 0

        # ==== 筛选条件 ====
        reasons = []

        # ① 流动池深度 ≥ $1,000,000
        if latest_liquidity >= 1_000_000:
            score += 20
            signals.append(f'池${latest_liquidity/1e6:.1f}M')
        elif latest_liquidity >= 100_000:
            score += 10
            signals.append(f'池${latest_liquidity/1e3:.0f}K')
        else:
            reasons.append(f'池小(${latest_liquidity:.0f})')

        # ② 数据点足够（至少6个小时柱）
        if len(hp) < 6:
            reasons.append(f'数据不足({len(hp)}h)')
            score *= 0.3
        else:
            score += 10

        # ③ 震荡检测
        if 1 < range_pct < 15:
            score += 30
            signals.append(f'震荡{range_pct:.1f}%')
            if current_price > high * 0.95:
                score += 20
                signals.append('近上沿')
        elif range_pct <= 1:
            score -= 10
            signals.append('极度横盘')
        else:
            signals.append(f'波动{range_pct:.1f}%')

        # ④ 突破检测（小时图）
        if len(hp) >= 6:
            recent = hp[-3:]  # 最近3小时
            earlier = hp[:-3]  # 之前的
            if earlier and all(p['avg'] > 0 for p in recent if p['avg'] > 0):
                recent_avg = sum(p['avg'] for p in recent if p['avg'] > 0) / max(sum(1 for p in recent if p['avg'] > 0), 1)
                earlier_avg = sum(p['avg'] for p in earlier if p['avg'] > 0) / max(sum(1 for p in earlier if p['avg'] > 0), 1)
                if earlier_avg > 0:
                    break_pct = (recent_avg - earlier_avg) / earlier_avg * 100
                    if 3 < break_pct < 40:
                        score += 35
                        signals.append(f'突破+{break_pct:.1f}%')
                    elif break_pct >= 40:
                        score += 10
                        signals.append(f'急涨{break_pct:.1f}%(慎追)')

            # 破前高
            if current_price > high * 1.02:
                score += 20
                signals.append('破前高')

        # ⑤ 成交量（这里用流动性变化近似）
        if len(hp) >= 4:
            recent_liq = sum(p['liquidity'] for p in hp[-2:] if p['liquidity'] > 0)
            prev_liq = sum(p['liquidity'] for p in hp[-4:-2] if p['liquidity'] > 0)
            if prev_liq > 0 and recent_liq > prev_liq * 1.2:
                score += 15
                signals.append('流动性增')

        # ⑥ 年龄
        if age < 1:
            score *= 0.3
            signals.append('新币(<1h)')
        elif age < 6:
            score *= 0.7
            signals.append('较新(<6h)')
        elif age > 720:
            score -= 10
            signals.append('老龄(>30d)')

        score = max(0, min(100, round(score)))

        if score >= 60 and not reasons:
            action = 'buy'
        elif score >= 35 and not reasons:
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

        # 补齐数据用于前端展示
        hp = chart['hourly_prices']
        latest = hp[-1] if hp else {}

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
            'pool_liquidity_usd': latest.get('liquidity', chart['pool_liquidity_usd']),
            'net_inflow_1h': chart['net_inflow_1h'],
            'volume_1h': chart['buy_volume_1h'] + chart['sell_volume_1h'],
            'buy_sell_ratio': round(chart['buy_volume_1h'] / (chart['sell_volume_1h'] or 1), 2),
            'unique_traders': chart['unique_traders'],
            'hourly_bars': len(hp),  # 小时图柱数
            'score': analysis['score'],
            'confidence': analysis['confidence'],
            'signals': analysis['signals'],
            'action': analysis['action'],
            'time': datetime.now().isoformat(),
        }

    async def scan_and_save_prices(self):
        """
        分批扫描所有历史池子，按小时图保存价格数据
        每批200个，8批轮转（共~1600个），每15分钟一批，2小时一轮
        """
        try:
            total_batches = 8
            batch_size = 200

            with self.db.cursor() as cur:
                # 从events表找出所有曾经发现的池子（兜底）
                # 同时也从 historical_prices 找最近有记录的
                cur.execute("""
                    SELECT DISTINCT ON (chain, contract) chain, contract, '' as symbol
                    FROM events
                    WHERE time > NOW() - INTERVAL '30 days'
                    ORDER BY chain, contract, time DESC
                """)
                events_set = set((r[0], r[1]) for r in cur.fetchall())

                cur.execute("""
                    SELECT DISTINCT ON (chain, contract) chain, contract, symbol
                    FROM historical_prices
                    WHERE recorded_at > NOW() - INTERVAL '30 days'
                    ORDER BY chain, contract, recorded_at DESC
                    LIMIT 500
                """)
                hp_set = {}
                for r in cur.fetchall():
                    hp_set[(r[0], r[1])] = r[2] or r[1][:8]

            # 合并去重
            all_pools = {}
            for k in events_set:
                all_pools[k] = k[1][:8]
            for k, sym in hp_set.items():
                all_pools[k] = sym

            pool_list = list(all_pools.items())
            total = len(pool_list)

            # 分批取
            start = self._batch_idx * batch_size
            batch = pool_list[start:start + batch_size]
            self._batch_idx = (self._batch_idx + 1) % total_batches

            print(f"  📊 MATURE_MEME 数据采集: 第{self._batch_idx}/{total_batches}批 "
                  f"({len(batch)}个, 共{total}个池子)")

            saved = 0
            for (chain, contract), symbol in batch:
                try:
                    if chain == 'SOL':
                        price_data = await self._fetch_sol_price(contract)
                    else:
                        price_data = await self._fetch_evm_price(chain, contract)

                    if price_data and price_data.get('price', 0) > 0:
                        liq = price_data.get('liquidity_usd', 0)
                        # 筛选条件：流动性 >= $1000 才保存
                        if liq >= 1000:
                            with self.db.cursor() as cur2:
                                cur2.execute(
                                    """INSERT INTO historical_prices 
                                       (chain, contract, symbol, price, liquidity_usd, recorded_at)
                                       VALUES (%s, %s, %s, %s, %s, NOW())""",
                                    (chain, contract, symbol, price_data['price'], liq)
                                )
                                self.db.commit()
                                saved += 1
                except Exception:
                    pass

            print(f"    ✅ 保存了 {saved}/{len(batch)} 个池子价格"
                  f" (流动性>=$1000)")
        except Exception as e:
            print(f"  ⚠️ MATURE_MEME 扫描保存异常: {e}")

    async def _fetch_evm_price(self, chain: str, pair_addr: str) -> dict:
        rpc_map = {
            'ETH': 'https://mainnet.infura.io/v3/a0379fc49a754710b7bb4e189ce54b9a',
            'BSC': 'https://bsc-rpc.publicnode.com',
            'BASE': 'https://base-rpc.publicnode.com',
        }
        rpc = rpc_map.get(chain)
        if not rpc: return None
        try:
            reserves_call = {
                'jsonrpc': '2.0', 'id': 1, 'method': 'eth_call',
                'params': [
                    {'to': pair_addr, 'data': '0x0902f1ac'},
                    'latest'
                ]
            }
            async with httpx.AsyncClient(timeout=5) as cl:
                resp = await cl.post(rpc, json=reserves_call)
                if resp.status_code == 200:
                    data = resp.json()
                    if 'result' in data and data['result'] != '0x':
                        raw = data['result'][2:]
                        reserve0 = int(raw[:64], 16) / 1e18
                        reserve1 = int(raw[64:128], 16) / 1e18
                        price = reserve1 / reserve0 if reserve0 > 0 else 0
                        liquidity = (reserve0 + reserve1) * price
                        return {'price': price, 'liquidity_usd': liquidity}
        except:
            pass
        return None

    async def _fetch_sol_price(self, pair_addr: str) -> dict:
        # SOL暂无实时价格调用
        return None

    async def run_cycle(self):
        """扫描有足量小时图数据的代币，产生动量突破信号"""
        signals = []
        try:
            with self.db.cursor() as cur:
                # 找有至少6个小时柱（即6个不同的hour bucket）的代币
                cur.execute("""
                    SELECT chain, contract, symbol,
                           COUNT(DISTINCT date_trunc('hour', recorded_at)) as hour_bars,
                           AVG(liquidity_usd) as avg_liq,
                           MAX(liquidity_usd) as max_liq,
                           MAX(recorded_at) as last_seen
                    FROM historical_prices
                    WHERE recorded_at > NOW() - INTERVAL '72 hours'
                    GROUP BY chain, contract, symbol
                    HAVING COUNT(DISTINCT date_trunc('hour', recorded_at)) >= 6
                       AND MAX(liquidity_usd) >= 1000000  -- 池子金额≥$1,000,000
                    ORDER BY max_liq DESC
                    LIMIT 30
                """)
                rows = cur.fetchall()
                print(f"  🐸 MATURE_MEME: {len(rows)}个代币通过筛选 "
                      f"(≥6h数据, 流动池≥$1M)")

            for row in rows:
                chain, contract, symbol, hour_bars, avg_liq, max_liq = \
                    row[0], row[1], row[2], row[3], float(row[4] or 0), float(row[5] or 0)

                result = await self.analyze_token(chain, contract)
                result['hourly_bars'] = hour_bars
                result['avg_liquidity_usd'] = avg_liq
                result['max_liquidity_usd'] = max_liq

                if result['action'] != 'pass':
                    signals.append(result)
                    print(f"  🐸 [{result['chain']}] {result['symbol']} "
                          f"{hour_bars}h柱 池${max_liq/1e6:.1f}M "
                          f"震荡{result['range_pct']}% "
                          f"当前${result['current_price']:.8f} "
                          f"→ {result['action']}({result['score']}) "
                          f"{' '.join(result['signals'])}")
                else:
                    print(f"  ⏭️ [{chain}] {symbol} {hour_bars}h柱 → 跳过 "
                          f"(分{result['score']} {' '.join(result['signals'])})")

        except Exception as e:
            print(f"  ⚠️ MATURE_MEME 异常: {e}")
            import traceback
            traceback.print_exc()

        for s in signals:
            await self.redis.publish("trade:signals", json.dumps({"type": "MATURE_MEME", "data": s}, default=str))
