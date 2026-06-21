from src.okx_client import configure as okx_configure, get_hot_tokens, get_price_info, get_candles, get_advanced_info, get_cluster_overview, get_top_liquidity, score_token_full
"""
MATURE_MEME - 成熟土狗「震荡→突破」捕捉引擎
核心逻辑：识别横盘震荡结束 + 放量突破上涨
"""
import json, asyncio, time, math
from datetime import datetime, timedelta
import httpx


def try_float(v, default=0.0):
    if v is None or v == "":
        return default
    try:
        return float(v)
    except (ValueError, TypeError):
        return default

import os
_OKX_KEY = os.environ.get("OKX_API_KEY", "e8f5e44c-32c5-47b9-8d37-b0629f8e4a13")
_OKX_SECRET = os.environ.get("OKX_SECRET_KEY", "981FF8556E1EAE438F289F147BE60342")
_OKX_PASSPHRASE = os.environ.get("OKX_PASSPHRASE", "Pb!4!92r")
if _OKX_KEY and _OKX_SECRET and _OKX_PASSPHRASE:
    okx_configure(_OKX_KEY, _OKX_SECRET, _OKX_PASSPHRASE)
    print("  ✅ OKX API 已配置")

class MatureMemeEngine:
    """成熟土狗捕捉引擎"""

    def _load_params(self) -> dict:
        """从 Redis 加载学习参数，失败则返回默认值"""
        defaults = {
            'min_score': 60, 'min_hourly_bars': 6,
            'range_min_pct': 1, 'range_max_pct': 15,
            'min_liquidity_k': 50,
            'take_profit_pct': 0.3, 'stop_loss_pct': 0.2, 'trade_ratio': 0.1,
        }
        try:
            import asyncio
            loop = asyncio.get_event_loop()
            if loop.is_running():
                future = asyncio.ensure_future(self._load_params_async())
                return loop.run_until_complete(future)
        except:
            pass
        return defaults

    async def _load_params_async(self) -> dict:
        """异步加载参数"""
        defaults = {
            'min_score': 60, 'min_hourly_bars': 6,
            'range_min_pct': 1, 'range_max_pct': 15,
            'min_liquidity_k': 50,
            'take_profit_pct': 0.3, 'stop_loss_pct': 0.2, 'trade_ratio': 0.1,
        }
        try:
            raw = await self.redis.get('params:signal_follow')
            if raw:
                loaded = json.loads(raw)
                defaults.update(loaded)
                print(f"  📋 加载学习参数: score>={defaults['min_score']} liq>={defaults['min_liquidity_k']}K")
        except:
            pass
        return defaults

    def __init__(self, db, redis, http):
        self.db = db
        self.redis = redis
        self.http = http
        # 分批索引：0~7，每批200个，每15分钟一批，2小时一轮完整扫描
        self._batch_idx = 0
        # DexScreener search 支持的链
        self._chain_map = {'ETH': True, 'BSC': True, 'BASE': True, 'SOL': True}
        # 动态参数（从 Redis learning params 获取）
        self._learning_params = self._load_params()
        self._search_queries = [
            'USDC', 'USDT', 'WETH', 'WBTC', 'PEPE', 'SHIB', 'FLOKI', 'BONK', 'WIF',
            'AAVE', 'UNI', 'LINK', 'CRV', 'MKR', 'COMP', 'SUSHI', 'CAKE', 'BAKE', 'XVS',
            'SOL', 'JUP', 'RAY', 'ORCA', 'PYTH', 'JTO', 'WEN', 'MYRO', 'POPCAT', 'MEW',
            'DEGEN', 'BRETT', 'TOSHI', 'AERO',
        ]

    def _filter_token(self, info: dict) -> bool:
        """
        代币预筛选条件：只保留符合动量策略条件的代币
        - 流动性 >= $100K
        - 池龄 > 7天（成熟代币）
        - 24h交易量 >= $10K
        """
        if info['liquidity_usd'] < 100_000:
            return False
        if info['pool_age_hours'] < 168:  # 7天 = 168小时
            return False
        if info['volume_h24'] < 10_000:
            return False
        return True

    async def _token_boosts_search(self, max_tokens: int = 100) -> list:
        """从DexScreener token-boosts API获取热门/趋势代币"""
        results = []
        seen = set()
        try:
            async with httpx.AsyncClient(timeout=15) as http:
                resp = await http.get('')
                if resp.status_code == 200:
                    boosts = resp.json()
                    for item in boosts:
                        chain = item.get('chainId', '').upper()
                        if chain == 'SOLANA':
                            chain = 'SOL'
                        if chain not in self._chain_map:
                            continue
                        addr = item.get('tokenAddress', '')
                        if not addr:
                            continue
                        key = (chain, addr)
                        if key in seen:
                            continue
                        seen.add(key)
                        results.append({'chain': chain, 'contract': addr, 'source': 'boost'})
                        if len(results) >= max_tokens:
                            break

            # 对 boost 代币获取详细信息
            if results:
                async with httpx.AsyncClient(timeout=30) as http:
                    for i in range(0, len(results), 20):
                        batch = results[i:i+20]
                        addresses = ','.join([t['contract'] for t in batch])
                        try:
                            resp = await http.get(f'{addresses}')
                            if resp.status_code == 200:
                                data = resp.json()
                                pairs = data.get('pairs', [])
                                for p in pairs:
                                    chain = p.get('chainId', '').upper()
                                    if chain == 'SOLANA':
                                        chain = 'SOL'
                                    if chain not in self._chain_map:
                                        continue
                                    base = p.get('baseToken', {})
                                    addr = base.get('address', '')
                                    if not addr:
                                        continue
                                    liq = try_float(p.get('liquidity', {}).get('usd', ''))
                                    vol_h24 = try_float(p.get('volume', {}).get('h24', ''))
                                    fdv = try_float(p.get('fdv', ''))
                                    price = try_float(p.get('priceUsd', ''))
                                    created_at = try_float(p.get('pairCreatedAt', ''))
                                    pool_age_h = (time.time() * 1000 - created_at) / 3600000 if created_at > 0 else 0
                                    symbol = base.get('symbol', addr[:8])
                                    dex = p.get('dexId', '')
                                    info = {
                                        'chain': chain, 'contract': addr, 'symbol': symbol,
                                        'price_usd': price, 'liquidity_usd': liq,
                                        'volume_h24': vol_h24, 'fdv': fdv,
                                        'pool_age_hours': round(pool_age_h, 1),
                                        'dex': dex, 'source': 'boost',
                                    }
                                    if self._filter_token(info):
                                        results.append(info)
                        except Exception:
                            continue
                        await asyncio.sleep(0.3)
        except Exception as e:
            print(f'  ⚠️ token-boosts API异常: {e}')
        return results

    async def _dex_search_by_chain(self, max_pairs: int = 300) -> list:
        """通过DexScreener search API搜索热门代币，返回代币信息列表"""
        results = []
        seen = set()
        try:
            async with httpx.AsyncClient(timeout=30) as http:
                for q in self._search_queries:
                    try:
                        resp = await http.get(f'{q}')
                        if resp.status_code != 200:
                            continue
                        data = resp.json()
                        pairs = data.get('pairs', [])
                        for p in pairs:
                            chain = p.get('chainId', '').upper()
                            if chain == 'SOLANA':
                                chain = 'SOL'
                            if chain not in self._chain_map:
                                continue
                            base = p.get('baseToken', {})
                            addr = base.get('address', '')
                            if not addr:
                                continue
                            key = (chain, addr)
                            if key in seen:
                                continue
                            seen.add(key)
                            symbol = base.get('symbol', addr[:8])
                            liq = try_float(p.get('liquidity', {}).get('usd', ''))
                            vol_h24 = try_float(p.get('volume', {}).get('h24', ''))
                            fdv = try_float(p.get('fdv', ''))
                            price = try_float(p.get('priceUsd', ''))
                            created_at = try_float(p.get('pairCreatedAt', ''))
                            pool_age_h = (time.time() * 1000 - created_at) / 3600000 if created_at > 0 else 0
                            info = {
                                'chain': chain, 'contract': addr, 'symbol': symbol,
                                'price_usd': price, 'liquidity_usd': liq,
                                'volume_h24': vol_h24, 'fdv': fdv,
                                'pool_age_hours': round(pool_age_h, 1),
                                'dex': p.get('dexId', ''),
                            }
                            if self._filter_token(info):
                                results.append(info)
                            if len(results) >= max_pairs:
                                break
                        if len(results) >= max_pairs:
                            break
                    except Exception:
                        continue
        except Exception as e:
            print(f'  ⚠️ DexScreener search异常: {e}')
        return results

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

        # ① 流动池深度 ≥ $100,000
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
        if self._learning_params.get('range_min_pct', 1) < range_pct < self._learning_params.get('range_max_pct', 15):
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

        if score >= self._learning_params.get('min_score', 60) and not reasons:
            action = 'buy'
        elif score >= max(self._learning_params.get('min_score', 60) - 25, 10) and not reasons:
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
        # 每次先抓DEX Screener最新代币
        await self.fetch_dex_screener_profiles()
        """
        分批扫描所有历史池子，按小时图保存价格数据
        每批200个，8批轮转（共~1600个），每15分钟一批，2小时一轮
        """
        try:
            total_batches = 8
            batch_size = 200

            with self.db.cursor() as cur:
                # 从events表找出所有曾经发现的池子（兜底）
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

            print(f"    ✅ 保存了 {saved}/{len(batch)} 个池子价格 (流动性>=$1000)")

        except Exception as e:
            print(f"  ⚠️ MATURE_MEME 扫描保存异常: {e}")

    async def _fetch_sol_price(self, contract: str) -> dict:
        """从链上获取SOL代币价格"""
        try:
            async with httpx.AsyncClient(timeout=10) as http:
                resp = await http.get(
                    f"{contract}"
                )
                if resp.status_code == 200:
                    data = resp.json()
                    pairs = data.get("pairs", [])
                    if pairs:
                        p = pairs[0]
                        return {
                            'price': try_float(p.get("priceUsd", "")),
                            'liquidity_usd': try_float(p.get("liquidity", {}).get("usd", "")),
                        }
        except:
            pass
        return None

    async def _fetch_evm_price(self, chain: str, contract: str) -> dict:
        """从链上获取EVM代币价格"""
        try:
            async with httpx.AsyncClient(timeout=10) as http:
                resp = await http.get(
                    f"{contract}"
                )
                if resp.status_code == 200:
                    data = resp.json()
                    pairs = data.get("pairs", [])
                    if pairs:
                        p = pairs[0]
                        return {
                            'price': try_float(p.get("priceUsd", "")),
                            'liquidity_usd': try_float(p.get("liquidity", {}).get("usd", "")),
                        }
        except:
            pass
        return None

    async def fetch_dex_screener_profiles(self):
        """从DEX Screener抓取最新代币Profiles（扩展到ETH/BSC/BASE/SOL四条链 + token-boosts）"""
        # 清理可能残留的中止事务
        try:
            self.db.rollback()
        except:
            pass
        try:
            # 1) 先从 token-profiles API 获取SOL pump币
            new_count = 0
            try:
                async with httpx.AsyncClient(timeout=10) as http:
                    resp = await http.get("")
                    if resp.status_code == 200:
                        data = resp.json()
                        for token in data:
                            chain_id = token.get("chainId", "")
                            addr = token.get("tokenAddress", "")
                            if chain_id != "solana" or not addr.endswith("pump"):
                                continue
                            with self.db.cursor() as cur:
                                cur.execute("SELECT 1 FROM events WHERE contract = %s AND chain = 'SOL' LIMIT 1", (addr,))
                                if cur.fetchone():
                                    continue
                                try:
                                    async with httpx.AsyncClient(timeout=10) as http2:
                                        r2 = await http2.get(f"{addr}")
                                        if r2.status_code != 200:
                                            continue
                                        pdata = r2.json()
                                    pairs = pdata.get("pairs", [])
                                    if not pairs:
                                        continue
                                    p = pairs[0]
                                    price_usd = try_float(p.get("priceUsd", ""))
                                    liq_usd = try_float(p.get("liquidity", {}).get("usd", ""))
                                    created_at = try_float(p.get("pairCreatedAt", ""))
                                    pool_age_h = (time.time() * 1000 - created_at) / 3600000 if created_at > 0 else 0
                                    vol_h24 = try_float(p.get("volume", {}).get("h24", ""))
                                    fdv = try_float(p.get("fdv", ""))
                                    symbol = p.get("baseToken", {}).get("symbol", addr[:8])

                                    # 应用筛选条件
                                    if liq_usd < 100_000 or pool_age_h < 168 or vol_h24 < 10_000:
                                        continue

                                    features = {"price_usd": price_usd, "liquidity_usd": liq_usd, "volume_h24": vol_h24,
                                                "fdv": fdv, "pool_age_hours": round(pool_age_h, 1),
                                                "dex": "pumpfun", "source": "dexscreener"}
                                    cur.execute("""INSERT INTO events (chain, contract, event_type, tx_hash, payload, time)
                                               VALUES ('SOL', %s, 'DexScreenerNew', '', %s, NOW())""",
                                               (addr, json.dumps(features)))
                                    if price_usd > 0:
                                        cur.execute("""INSERT INTO price_snapshots (chain, contract, symbol, price, liquidity_usd, snapshot_at)
                                                   VALUES ('SOL', %s, %s, %s, %s, NOW())""",
                                                   (addr, symbol, price_usd, liq_usd))
                                        cur.execute("""INSERT INTO historical_prices (chain, contract, symbol, price, liquidity_usd, recorded_at)
                                                   VALUES ('SOL', %s, %s, %s, %s, NOW())""",
                                                   (addr, symbol, price_usd, liq_usd))
                                    self.db.commit()
                                    new_count += 1
                                    desc = (token.get("description") or "")[:30]
                                    print(f"  DEX Screener: 新发现 {symbol} 池 {desc}")
                                except Exception as e:
                                    self.db.rollback()
                                    continue
            except Exception as e:
                print(f"  ⚠️ token-profiles API异常: {e}")

            if new_count > 0:
                print(f"    DEX Screener Profiles: 新增 {new_count} 个SOL代币（已过滤）")

            # 2) 通过search API搜索ETH/BSC/BASE/SOL热门代币（已过滤）
            hot_tokens = await self._dex_search_by_chain(max_pairs=300)
            searched_new = 0
            for info in hot_tokens:
                chain, addr = info['chain'], info['contract']
                with self.db.cursor() as cur:
                    cur.execute('SELECT 1 FROM events WHERE contract = %s AND chain = %s LIMIT 1', (addr, chain))
                    if cur.fetchone():
                        continue
                    try:
                        symbol = info['symbol']
                        price_usd = info['price_usd']
                        liq_usd = info['liquidity_usd']
                        features = {'price_usd': price_usd, 'liquidity_usd': liq_usd,
                                    'volume_h24': info['volume_h24'], 'fdv': info['fdv'],
                                    'dex': info['dex'], 'pool_age_hours': info['pool_age_hours'],
                                    'source': 'dexscreener_search'}
                        cur.execute('INSERT INTO events (chain, contract, event_type, tx_hash, payload, time)'
                                   ' VALUES (%s, %s, \'DexScreenerSearch\', \'\', %s, NOW())',
                                   (chain, addr, json.dumps(features)))
                        if price_usd > 0:
                            cur.execute('INSERT INTO price_snapshots (chain, contract, symbol, price, liquidity_usd, snapshot_at)'
                                       ' VALUES (%s, %s, %s, %s, %s, NOW())',
                                       (chain, addr, symbol, price_usd, liq_usd))
                            cur.execute('INSERT INTO historical_prices (chain, contract, symbol, price, liquidity_usd, recorded_at)'
                                       ' VALUES (%s, %s, %s, %s, %s, NOW())',
                                       (chain, addr, symbol, price_usd, liq_usd))
                        self.db.commit()
                        searched_new += 1
                        print(f'  DEX Search: 新发现 {symbol} ({chain}) 池${liq_usd:.0f}')
                    except Exception as e:
                        self.db.rollback()
                        continue
            if searched_new > 0:
                print(f'    DEX Screener Search: 新增 {searched_new} 个代币（已过滤）')

            # 3) 通过token-boosts API搜索热门代币（已过滤）
            boost_tokens = await self._token_boosts_search(max_tokens=100)
            boost_new = 0
            for info in boost_tokens:
                if info.get('source') != 'boost':
                    continue
                chain, addr = info['chain'], info['contract']
                with self.db.cursor() as cur:
                    cur.execute('SELECT 1 FROM events WHERE contract = %s AND chain = %s LIMIT 1', (addr, chain))
                    if cur.fetchone():
                        continue
                    try:
                        symbol = info['symbol']
                        price_usd = info['price_usd']
                        liq_usd = info['liquidity_usd']
                        features = {'price_usd': price_usd, 'liquidity_usd': liq_usd,
                                    'volume_h24': info['volume_h24'], 'fdv': info['fdv'],
                                    'dex': info['dex'], 'pool_age_hours': info['pool_age_hours'],
                                    'source': 'token_boost'}
                        cur.execute('INSERT INTO events (chain, contract, event_type, tx_hash, payload, time)'
                                   ' VALUES (%s, %s, \'TokenBoost\', \'\', %s, NOW())',
                                   (chain, addr, json.dumps(features)))
                        if price_usd > 0:
                            cur.execute('INSERT INTO price_snapshots (chain, contract, symbol, price, liquidity_usd, snapshot_at)'
                                       ' VALUES (%s, %s, %s, %s, %s, NOW())',
                                       (chain, addr, symbol, price_usd, liq_usd))
                            cur.execute('INSERT INTO historical_prices (chain, contract, symbol, price, liquidity_usd, recorded_at)'
                                       ' VALUES (%s, %s, %s, %s, %s, NOW())',
                                       (chain, addr, symbol, price_usd, liq_usd))
                        self.db.commit()
                        boost_new += 1
                        print(f'  DEX Boost: 新发现 {symbol} ({chain}) 池${liq_usd:.0f}')
                    except Exception as e:
                        self.db.rollback()
                        continue
            if boost_new > 0:
                print(f'    DEX Token-Boosts: 新增 {boost_new} 个热门代币（已过滤）')

        except Exception as e:
            print(f'  DEX Screener 抓取异常: {e}')

    async def run_cycle(self):
        print("\n[V2 SCAN] start...")
        # 刷新学习参数
        try:
            self._learning_params = await self._load_params_async()
        except:
            pass
        await self.scan_and_save_prices()

        # 每轮开始前清空旧信号
        try:
            await self.redis.delete("signals:recent")
        except:
            pass

        min_liq = int(self._learning_params.get('min_liquidity_k', 50) * 1000)
        buy_signals = []
        all_candidates = []
        try:
            with self.db.cursor() as cur:
                # 每个合约取最新的一条价格记录
                cur.execute("""
                    SELECT DISTINCT ON (chain, contract)
                           chain, contract, symbol,
                           price, liquidity_usd, recorded_at
                    FROM historical_prices
                    WHERE recorded_at > NOW() - INTERVAL '14 days'
                      AND liquidity_usd >= %s
                    ORDER BY chain, contract, recorded_at DESC
                    LIMIT 200
                """, (min_liq,))
                rows = cur.fetchall()
                print(f"  candidates: {len(rows)}")

            for row in rows:
                chain, contract, symbol = row[0], row[1], row[2]
                latest_price = float(row[3]) if row[3] else 0
                latest_liq = float(row[4]) if row[4] else 0

                result = await self.analyze_token(chain, contract)

                # 补齐最新价格
                if result:
                    result['current_price'] = latest_price
                    result['pool_liquidity_usd'] = latest_liq

                # 构建统一的候选代币数据（无论什么状态，全部写入）
                # 字段名与前端期望的格式对齐（price_usd, liquidity_usd, flags）
                score_val = result.get("score", 0) if result else 0
                conf_val = result.get("confidence", 0) if result else 0
                
                # 根据评分生成 flags（前端展示用）
                flags = []
                if result and result.get('action') == 'buy':
                    flags.append('v2_buy')
                elif result and result.get('action') == 'watch':
                    flags.append('v2_watch')
                if result and result.get('hourly_bars', 0) >= 24:
                    flags.append('data_rich')
                elif result and result.get('hourly_bars', 0) >= 6:
                    flags.append('data_ok')
                else:
                    flags.append('data_low')
                if result and result.get('range_pct', 0) > 0:
                    range_v = result.get('range_pct', 0)
                    if 1 < range_v < 15:
                        flags.append('ranging')
                    elif range_v >= 15:
                        flags.append('volatile')
                
                candidate = {
                    "chain": chain,
                    "contract": contract,
                    "symbol": symbol if symbol and len(symbol) > 3 and not symbol.startswith('0x') else (symbol or contract[:8]),
                    "score": score_val,
                    "confidence": conf_val,
                    "price_usd": latest_price,
                    "liquidity_usd": latest_liq,
                    "signals": (result.get("signals", []) or [])[:3] if result else [],
                    "flags": flags,
                    "action": result.get("action", "pass") if result else "pass",
                    "time": datetime.now().isoformat(),
                    "hourly_bars": result.get("hourly_bars", 0) if result else 0,
                    "range_pct": result.get("range_pct", 0) if result else 0,
                    "risk_level": "low" if score_val >= 60 else "medium" if score_val >= 35 else "high",
                    "id": abs(hash(chain + contract)) % 10000000,
                }
                all_candidates.append(candidate)

                # 只对 BUY 信号触发模拟交易
                if result and result.get('action') == 'buy':
                    buy_signals.append(result)

                    # 发布到 trade:signals channel
                    try:
                        await self.redis.publish("trade:signals", json.dumps({"type": "MATURE_MEME", "data": result}))
                    except Exception:
                        pass

                    # 触发模拟交易（自动买入）
                    try:
                        ck = 'buy_cooldown:' + result['chain'] + ':' + result['contract']
                        if not await self.redis.exists(ck):
                            async with httpx.AsyncClient(timeout=5) as cc:
                                await cc.post('http://gateway:3100/api/trade/paper/auto', json=result)
                            await self.redis.setex(ck, 86400, '1')
                    except Exception:
                        pass

                    print(f"  BUY [{result['chain']}] {result['symbol']} score={result['score']} price=${latest_price:.6f}")

        except Exception as e:
            print(f"  error: {e}")
        
        # 写入所有候选代币到 signals:recent（前端优先展示靠前的数据）
        # 排序规则：BUY 优先，其次 WATCH，再 PASS；各链轮换，确保链多样性
        try:
            await self.redis.delete("signals:recent")
            
            # 按 action 分组
            buy_list = [c for c in all_candidates if c['action'] == 'buy']
            watch_list = [c for c in all_candidates if c['action'] == 'watch']
            pass_list = [c for c in all_candidates if c['action'] == 'pass']
            
            # 各组内按链轮换排序（BSC/BASE/SOL/ETH 均匀分布）
            def chain_round_robin(items):
                """把同一组的代币按链轮换排序，确保前端展示多样链"""
                groups = {}
                for item in items:
                    ch = item['chain']
                    if ch not in groups:
                        groups[ch] = []
                    groups[ch].append(item)
                result = []
                chains_order = ['BSC', 'SOL', 'BASE', 'ETH']
                # 取各组最大长度
                max_len = max((len(groups.get(c, [])) for c in chains_order), default=0)
                for i in range(max_len):
                    for c in chains_order:
                        items_c = groups.get(c, [])
                        if i < len(items_c):
                            result.append(items_c[i])
                return result
            
            sorted_candidates = chain_round_robin(buy_list) + chain_round_robin(watch_list) + chain_round_robin(pass_list)
            
            # 正常轮换写入（前端通过筛选参数过滤）
            
            buy_count = 0
            for c in sorted_candidates:
                await self.redis.lpush("signals:recent", json.dumps(c))
                if c['action'] == 'buy':
                    buy_count += 1
            await self.redis.ltrim("signals:recent", 0, 199)
            print(f"  total: {len(all_candidates)} candidates (BUY: {buy_count}, WATCH/PASS: {len(all_candidates) - buy_count})")
        except Exception as e:
            print(f"  signals: {len(buy_signals)} BUY")
