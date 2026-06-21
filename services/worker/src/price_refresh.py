"""
AIHunter - OKX V6 价格刷新引擎
从 OKX OnchainOS V6 API 获取代币价格和K线，写入数据库
"""
import json, asyncio, time
from datetime import datetime
from src.okx_client import (
    configure as okx_configure, get_price_info, get_hot_tokens,
    get_candles, get_advanced_info, get_cluster_overview, get_top_liquidity
)


class PriceRefreshEngine:

    def __init__(self, db, redis, http):
        self.db = db
        self.redis = redis
        self.http = http
        self._running = False

    async def refresh_all_prices(self):
        """遍历已知代币，通过 OKX price-info 批量获取最新价格"""
        try:
            with self.db.cursor() as cur:
                cur.execute("""
                    SELECT DISTINCT chain, contract, symbol
                    FROM historical_prices
                    WHERE recorded_at > NOW() - INTERVAL '7 days'
                    ORDER BY chain, contract
                """)
                known = cur.fetchall()
        except Exception as e:
            print(f'  ⚠️ 读取已知代币失败: {e}')
            return

        if not known:
            print('  ⚠️ 无已知代币，跳过')
            return

        # 按链分组批量查询
        by_chain = {}
        for row in known:
            chain, contract, symbol = row
            by_chain.setdefault(chain, []).append((contract, symbol))

        updated = 0
        for chain, items in by_chain.items():
            contracts = [c for c, _ in items]
            sym_map = {c: s for c, s in items}
            # 每批最多100个
            for i in range(0, len(contracts), 100):
                batch = contracts[i:i+100]
                try:
                    infos = await get_price_info(chain, batch)
                    with self.db.cursor() as cur:
                        for info in infos:
                            addr = info.get('tokenContractAddress', '')
                            price = float(info.get('price', 0) or 0)
                            liq = float(info.get('liquidity', 0) or 0)
                            vol = float(info.get('volume24H', 0) or 0)
                            holders = int(info.get('holders', 0) or 0)
                            if price > 0:
                                cur.execute(
                                    """INSERT INTO historical_prices (chain, contract, symbol, price, liquidity_usd, recorded_at)
                                       VALUES (%s, %s, %s, %s, %s, NOW())""",
                                    (chain, addr, sym_map.get(addr, addr[:8]), price, liq)
                                )
                                updated += 1
                    self.db.commit()
                except Exception as e:
                    print(f'  ⚠️ 价格刷新异常 ({chain}): {e}')
                await asyncio.sleep(0.3)

        print(f'  📊 价格刷新完成: 更新了 {updated} 个代币')

    async def refresh_kline_batch(self):
        """从 OKX 获取已知代币的K线数据"""
        try:
            with self.db.cursor() as cur:
                cur.execute("""
                    SELECT DISTINCT chain, contract, symbol
                    FROM historical_prices
                    WHERE recorded_at > NOW() - INTERVAL '3 days'
                    ORDER BY chain, contract
                """)
                known = cur.fetchall()
        except Exception as e:
            print(f'  ⚠️ 读取已知代币失败: {e}')
            return

        if not known:
            return

        total = 0
        for row in known:
            chain, contract, symbol = row
            try:
                candles = await get_candles(chain, contract, '1H', 72)
                if candles:
                    with self.db.cursor() as cur:
                        for c in candles:
                            ts = datetime.fromtimestamp(c['ts'] / 1000) if c['ts'] > 1e12 else datetime.fromtimestamp(c['ts'])
                            cur.execute(
                                """INSERT INTO historical_prices (chain, contract, symbol, price, liquidity_usd, recorded_at)
                                   VALUES (%s, %s, %s, %s, %s, %s)
                                   ON CONFLICT DO NOTHING""",
                                (chain, contract, symbol or contract[:8], c['close'], 0, ts)
                            )
                        self.db.commit()
                    total += len(candles)
            except Exception:
                pass
            await asyncio.sleep(0.2)

        print(f'  ✅ K线缓存完成: {total} 条 ({len(known)} 个代币)')

    async def scan_hot_tokens(self):
        """从 OKX 热门代币API获取新代币并存入events表"""
        try:
            tokens = await get_hot_tokens(limit=50)
            if not tokens:
                return

            with self.db.cursor() as cur:
                for t in tokens:
                    try:
                        cur.execute(
                            """INSERT INTO events (chain, contract, symbol, event_type, score, data, created_at)
                               VALUES (%s, %s, %s, 'HOT_TOKEN', %s, %s, NOW())
                               ON CONFLICT DO NOTHING""",
                            (t['chain'], t['contract'], t.get('symbol', ''),
                             t.get('score', 50), json.dumps(t))
                        )
                    except Exception:
                        pass
                self.db.commit()
            print(f'  🔥 热门代币: 入库 {len(tokens)} 个')
        except Exception as e:
            print(f'  ⚠️ scan_hot_tokens 异常: {e}')

    async def run_cycle(self):
        if self._running:
            return
        self._running = True
        try:
            print('💰 开始价格刷新...')
            await self.refresh_all_prices()
        finally:
            self._running = False
