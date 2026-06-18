"""
AIHunter - 价格刷新定时任务
每小时遍历已知代币，从 DexScreener 获取最新价格，写入 historical_prices 表
"""
import json, asyncio, time, math
from datetime import datetime
import httpx


class PriceRefreshEngine:
    """价格刷新引擎 - 每小时更新一次所有已知代币价格"""

    def __init__(self, db, redis, http):
        self.db = db
        self.redis = redis
        self.http = http
        self._running = False
        # 链名映射（DexScreener chainId -> 内部链名）
        self._chain_mapping = {
            'ethereum': 'ETH', 'eth': 'ETH',
            'bsc': 'BSC', 'bnb': 'BSC', 'bnbchain': 'BSC',
            'base': 'BASE',
            'solana': 'SOL', 'sol': 'SOL',
        }

    async def refresh_all_prices(self):
        """
        遍历所有已知代币，从 DexScreener API 获取最新价格并保存
        每次最多处理 500 个代币（按最近14天有记录排序）
        """
        try:
            # 获取所有已知代币列表
            tokens = []
            with self.db.cursor() as cur:
                cur.execute("""
                    SELECT chain, contract, symbol,
                           MAX(recorded_at) as last_update
                    FROM historical_prices
                    WHERE recorded_at > NOW() - INTERVAL '30 days'
                    GROUP BY chain, contract, symbol
                    ORDER BY MAX(recorded_at) ASC
                    LIMIT 500
                """)
                tokens = cur.fetchall()

            if not tokens:
                print("  📭 没有代币需要刷新价格")
                return 0

            # 按链分组，批量查询
            chain_groups = {}
            for row in tokens:
                chain, contract, symbol = row[0], row[1], row[2] or row[1][:8]
                if chain not in chain_groups:
                    chain_groups[chain] = []
                chain_groups[chain].append((contract, symbol))

            total_updated = 0
            async with httpx.AsyncClient(timeout=15) as http:
                for chain, token_list in chain_groups.items():
                    # 每批最多查50个地址（DexScreener API 支持逗号分隔的批量查询）
                    batch_size = 50
                    for i in range(0, len(token_list), batch_size):
                        batch = token_list[i:i + batch_size]
                        addresses = [t[0] for t in batch]
                        symbols_map = {t[0]: t[1] for t in batch}

                        try:
                            # 用 DexScreener token 查询 API（支持批量逗号分隔）
                            addr_param = ','.join(addresses)
                            resp = await http.get(
                                f"https://api.dexscreener.com/latest/dex/tokens/{addr_param}",
                                timeout=15
                            )
                            if resp.status_code != 200:
                                continue

                            data = resp.json()
                            pairs = data.get("pairs", [])

                            # 按合约地址聚合最新的价格数据
                            token_prices = {}
                            for p in pairs:
                                chain_id = p.get("chainId", "").lower()
                                mapped_chain = self._chain_mapping.get(chain_id, chain_id.upper())
                                if mapped_chain != chain:
                                    continue
                                base = p.get("baseToken", {})
                                addr = base.get("address", "")
                                if not addr:
                                    continue

                                price = float(p.get("priceUsd", 0) or 0)
                                liq = float(p.get("liquidity", {}).get("usd", 0) or 0)
                                vol_h24 = float(p.get("volume", {}).get("h24", 0) or 0)
                                fdv = float(p.get("fdv", 0) or 0)
                                txns_h24 = p.get("txns", {}).get("h24", {})
                                buys = int(txns_h24.get("buys", 0))
                                sells = int(txns_h24.get("sells", 0))
                                price_change_h1 = float(p.get("priceChange", {}).get("h1", 0) or 0)
                                price_change_h24 = float(p.get("priceChange", {}).get("h24", 0) or 0)

                                # 每个代币只保留池子流动性最大的记录
                                if addr not in token_prices or liq > token_prices[addr].get('liquidity_usd', 0):
                                    token_prices[addr] = {
                                        'price': price,
                                        'liquidity_usd': liq,
                                        'volume_h24': vol_h24,
                                        'fdv': fdv,
                                        'buys_h24': buys,
                                        'sells_h24': sells,
                                        'price_change_h1_pct': price_change_h1,
                                        'price_change_h24_pct': price_change_h24,
                                    }

                            # 保存到数据库
                            for addr in addresses:
                                if addr in token_prices:
                                    info = token_prices[addr]
                                    price = info['price']
                                    liq = info['liquidity_usd']
                                    symbol = symbols_map.get(addr, addr[:8])

                                    if price > 0 and liq >= 1000:
                                        with self.db.cursor() as cur:
                                            cur.execute(
                                                """INSERT INTO historical_prices
                                                   (chain, contract, symbol, price, liquidity_usd, recorded_at)
                                                   VALUES (%s, %s, %s, %s, %s, NOW())""",
                                                (chain, addr, symbol, price, liq)
                                            )
                                            self.db.commit()
                                            total_updated += 1

                                # 如果 DexScreener 没返回数据，从链上获取价格
                                elif chain != 'SOL':
                                    try:
                                        price_data = await self._fetch_evm_price_onchain(chain, addr, http)
                                        if price_data and price_data.get('price', 0) > 0:
                                            liq = price_data.get('liquidity_usd', 0)
                                            if liq >= 1000:
                                                with self.db.cursor() as cur:
                                                    cur.execute(
                                                        """INSERT INTO historical_prices
                                                           (chain, contract, symbol, price, liquidity_usd, recorded_at)
                                                           VALUES (%s, %s, %s, %s, %s, NOW())""",
                                                        (chain, addr, symbols_map.get(addr, addr[:8]),
                                                         price_data['price'], liq)
                                                    )
                                                    self.db.commit()
                                                    total_updated += 1
                                    except Exception:
                                        pass

                        except Exception as e:
                            print(f"  ⚠️ 批量查询异常 ({chain}): {e}")
                            continue

                    # 每批之间短暂等待，避免 API 限频
                    await asyncio.sleep(0.5)

            print(f"  📊 价格刷新完成: 更新了 {total_updated} 个代币")
            return total_updated

        except Exception as e:
            print(f"  ❌ 价格刷新异常: {e}")
            return 0

    async def _fetch_evm_price_onchain(self, chain: str, token_addr: str, http: httpx.AsyncClient) -> dict:
        """从链上获取 EVM 代币价格（通过已存 pair 地址）"""
        try:
            # 尝试从 price_snapshots 表找对应的 pair 地址
            with self.db.cursor() as cur:
                cur.execute(
                    "SELECT contract FROM price_snapshots WHERE chain = %s AND contract LIKE %s LIMIT 1",
                    (chain, f'%{token_addr[:10]}%')
                )
                row = cur.fetchone()
                if row:
                    pair_addr = row[0]
                    # 用 RPC 获取 reserves
                    rpc_url = None
                    with self.db.cursor() as cur2:
                        cur2.execute("SELECT value FROM sys_config WHERE key = %s", (f'rpc_url_{chain}',))
                        r = cur2.fetchone()
                        if r:
                            rpc_url = r[0]

                    if rpc_url:
                        call_data = "0x0902f1ac"  # getReserves
                        resp = await http.post(rpc_url, json={
                            "jsonrpc": "2.0", "id": 1,
                            "method": "eth_call",
                            "params": [{"to": pair_addr, "data": call_data}, "latest"]
                        }, timeout=10)
                        if resp.status_code == 200:
                            result = resp.json().get("result", "0x")
                            if result and len(result) >= 66:
                                reserve0 = int(result[2:66], 16)
                                reserve1 = int(result[66:130], 16)
                                if reserve0 > 0 and reserve1 > 0:
                                    return {
                                        'price': reserve1 / reserve0 * 1e-12,
                                        'liquidity_usd': (reserve0 + reserve1) * 1e-12
                                    }
        except Exception:
            pass
        return None

    async def run_cycle(self):
        """单次执行：刷新价格"""
        try:
            updated = await self.refresh_all_prices()
            return updated
        except Exception as e:
            print(f"  ❌ PriceRefresh 运行异常: {e}")
            return 0

    @staticmethod
    def get_initial_schedule() -> dict:
        """
        返回初始阶段的刷新计划
        启动后前6小时每15分钟一次，之后每小时一次
        """
        return {
            'fast_interval': 900,       # 15分钟（快速积累阶段）
            'fast_duration': 21600,     # 6小时
            'normal_interval': 3600,    # 1小时（正常阶段）
        }
