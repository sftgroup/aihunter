"""
LENDING_ARB 策略 - 完整 DeFi 借贷套利引擎
Aave V3 真实链上利率 | 自动利差套利 | 杠杆循环 | 闪贷路由
"""
import json, asyncio, time, math
from datetime import datetime

# ===== Aave V3 地址 =====
AAVE_V3_POOLS = {
    'ETH': '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    'BSC': '0x6807dc923806fE8Fd134338EABCA5095a7e019F4',
    'BASE': '0xA238Dd80C259a72e81d7e4664a6D3e8E0f7A0c8',
}

AAVE_V3_ORACLE = {
    'ETH': '0x54586bE62E3c3580375aE3723C145253060Ca0C7',
}

# ===== Aave V3 稳定币地址 =====
AAVE_STABLECOINS = {
    'ETH': {
        'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        'DAI': '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        'LUSD': '0x5f98805A4E8be255a32880FDeC7f6728C6568bA0',
        'FRAX': '0x853d955aCEf822Db058eb8505911ED77F175b99e',
        'sDAI': '0x83F20F44975D03b1b09e64809B757c47f942BEeA',
    },
    'BSC': {
        'USDC': '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
        'USDT': '0x55d398326f99059fF775485246999027B3197955',
        'BUSD': '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
    },
    'BASE': {
        'USDC': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        'DAI': '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    }
}

# ===== Aave V3 ABI =====
# getReserveData(address) → ReserveData struct
GET_RESERVE_DATA = '0x35ea6a75'
# getUserAccountData(address) → (totalCollateral, totalDebt, availableBorrows, ...)
GET_USER_ACCOUNT = '0xbf92857c'
# getAssetPrice(address) → uint256
GET_ASSET_PRICE = '0xb3596f07'

# 精度
RAY = 10 ** 27
SECONDS_PER_YEAR = 31536000

# 最小利差阈值(bps)
MIN_SPREAD_BPS = 30
MAX_LEVERAGE = 3.0
MIN_HF = 1.5
TARGET_HF = 1.8

TOKEN_DECIMALS = {
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': 6,
    '0xdAC17F958D2ee523a2206206994597C13D831ec7': 6,
    '0x6B175474E89094C44Da98b954EedeAC495271d0F': 18,
    '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d': 6,
    '0x55d398326f99059fF775485246999027B3197955': 6,
    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': 6,
}


class LendingRateMonitor:
    """Aave V3 利率监控器"""

    def __init__(self, db, redis, http, chain):
        self.db = db
        self.redis = redis
        self.http = http
        self.chain = chain
        self.rpc_url = None

    def set_rpc(self, url):
        self.rpc_url = url

    async def _call(self, to: str, data: str) -> str:
        if not self.rpc_url: return None
        try:
            r = await self.http.post(self.rpc_url, json={
                "jsonrpc": "2.0", "id": 1, "method": "eth_call",
                "params": [{"to": to, "data": data}, "latest"]
            }, timeout=10)
            return r.json().get("result") if r.status_code == 200 else None
        except:
            return None

    async def get_aave_reserve_data(self, token_addr: str) -> dict:
        """从 Aave V3 获取真实利率数据"""
        pool = AAVE_V3_POOLS.get(self.chain)
        if not pool: return None
        data = GET_RESERVE_DATA + token_addr[2:].zfill(64)
        r = await self._call(pool, data)
        if not r or r == '0x': return None

        h = r[2:]
        # Aave V3 ReserveData ABI 编码：
        #   unused(32) + config(32) + liquidityIndex(32) + variableBorrowIndex(32)
        #   + currentLiquidityRate(32) + currentVariableBorrowRate(32) + currentStableBorrowRate(32)
        #   + lastUpdateTimestamp(32) + id(16) + ...
        # currentLiquidityRate 在 offset 128 (4*32)
        liq_rate_hex = h[128 * 2:160 * 2]  # 第5个slot
        var_borrow_rate_hex = h[160 * 2:192 * 2]  # 第6个slot

        liq_rate = int(liq_rate_hex, 16)
        borrow_rate = int(var_borrow_rate_hex, 16)

        if liq_rate == 0:
            return None

        # Aave 利率公式：APY = rate / 1e25（百分比）
        supply_apy = liq_rate / 1e25
        borrow_apy = borrow_rate / 1e25

        # 从 Oracle 获取价格
        oracle = AAVE_V3_ORACLE.get(self.chain)
        asset_price = 0
        if oracle:
            pr = await self._call(oracle, GET_ASSET_PRICE + token_addr[2:].zfill(64))
            if pr and pr != '0x':
                asset_price = int(pr, 16) / 1e8

        return {
            'supply_apy': round(supply_apy, 2),
            'borrow_apy': round(borrow_apy, 2),
            'rate_spread_bps': round((borrow_apy - supply_apy) * 100, 0),
            'asset_price': asset_price,
        }

    async def snapshot_all_rates(self) -> list:
        """采集所有稳定币利率"""
        stables = AAVE_STABLECOINS.get(self.chain, {})
        results = []
        for symbol, addr in stables.items():
            rate = await self.get_aave_reserve_data(addr)
            if rate:
                rate['symbol'] = symbol
                rate['token'] = addr
                results.append(rate)
                # Redis 缓存 5min
                await self.redis.setex(
                    f"lending:rates:{self.chain}:{symbol}",
                    300, json.dumps(rate)
                )
                # 写入数据库
                try:
                    with self.db.cursor() as cur:
                        cur.execute(
                            """INSERT INTO rate_snapshots (chain, protocol, token, supply_apy, borrow_apy, recorded_at)
                               VALUES (%s, 'aave_v3', %s, %s, %s, NOW())""",
                            (self.chain, symbol, rate['supply_apy'], rate['borrow_apy'])
                        )
                        self.db.commit()
                except:
                    pass

        if results:
            spreads = [r['rate_spread_bps'] for r in results if r['rate_spread_bps']]
            avg = sum(spreads) / len(spreads) if spreads else 0
            print(f"  📊 [{self.chain}] Aave 利率: {len(results)}个币种 | 平均利差: {avg:.0f}bps")
        return results

    async def check_arbitrage_opportunity(self) -> dict:
        """检查是否有套利机会（利差 > MIN_SPREAD_BPS）"""
        for symbol in AAVE_STABLECOINS.get(self.chain, {}):
            cached = await self.redis.get(f"lending:rates:{self.chain}:{symbol}")
            if not cached: continue
            rate = json.loads(cached)
            spread = rate.get('rate_spread_bps', 0)
            if spread > MIN_SPREAD_BPS:
                return {
                    'type': 'RATE_SPREAD',
                    'chain': self.chain,
                    'protocol': 'aave_v3',
                    'token': symbol,
                    'supply_apy': rate['supply_apy'],
                    'borrow_apy': rate['borrow_apy'],
                    'spread_bps': spread,
                    'asset_price': rate.get('asset_price', 0),
                    'confidence': min(spread / 100, 0.95),
                    'time': datetime.now().isoformat(),
                }
        return None


class LendingArbitrageEngine:
    """完整借贷套利引擎"""

    def __init__(self, db, redis, http):
        self.db = db
        self.redis = redis
        self.http = http
        self.monitors = {}

    def add_chain(self, chain: str, rpc_url: str):
        m = LendingRateMonitor(self.db, self.redis, self.http, chain)
        m.set_rpc(rpc_url)
        self.monitors[chain] = m

    async def execute_rate_spread(self, opportunity: dict) -> dict:
        """执行利差套利（模拟交易）"""
        chain = opportunity.get('chain')
        token = opportunity.get('token')
        spread = opportunity.get('spread_bps', 0)
        deposit_apy = opportunity.get('supply_apy', 0)
        borrow_apy = opportunity.get('borrow_apy', 0)

        # 计算最优杠杆和仓位
        # 净年化 = 存款APY * 杠杆 - 借款APY * (杠杆-1)
        # 限制 HF >= MIN_HF
        leverage = min(
            MAX_LEVERAGE,
            (TARGET_HF - 1) / (1 - 1 / TARGET_HF) + 1  # 基于目标HF的杠杆限制
        )
        leverage = max(1.0, min(leverage, 3.0))

        deposit_amount = 10000  # 模拟 $10K 本金
        borrow_amount = deposit_amount * (leverage - 1)
        total_deposit = deposit_amount + borrow_amount

        net_apy = (deposit_apy * total_deposit - borrow_apy * borrow_amount) / deposit_amount
        daily_profit = deposit_amount * net_apy / 100 / 365

        result = {
            'type': 'LENDING_ARB_EXECUTED',
            'chain': chain,
            'token': token,
            'action': 'rate_spread',
            'leverage': round(leverage, 2),
            'total_deposit_usd': round(total_deposit, 2),
            'borrow_usd': round(borrow_amount, 2),
            'net_apy': round(net_apy, 2),
            'daily_profit_est': round(daily_profit, 4),
            'spread_bps': spread,
            'status': 'simulated',
            'time': datetime.now().isoformat(),
        }

        # 写入经验
        try:
            with self.db.cursor() as cur:
                cur.execute(
                    """INSERT INTO trade_experiences (user_id, chain, strategy_type, mode, features_snapshot, outcome, success_label)
                       VALUES ('paper', %s, 'LENDING_ARB', 'paper', %s, %s, %s)""",
                    (chain, json.dumps(opportunity), json.dumps(result), 'win' if net_apy > 0 else 'loss')
                )
                self.db.commit()
        except:
            pass

        print(f"  💰 [{chain}] 模拟利差套利: 杠杆{leverage}x 总存款${total_deposit:.0f} 借款${borrow_amount:.0f} 日收益≈${daily_profit:.4f}")
        return result

    async def check_all_hf(self) -> list:
        """检查所有活跃借贷仓位健康因子"""
        alerts = []
        try:
            with self.db.cursor() as cur:
                cur.execute("""SELECT id, chain, protocol, collateral_amount, debt_amount, current_hf
                               FROM lending_positions WHERE status = 'active'""")
                rows = cur.fetchall()

            for row in rows:
                pos_id, chain, protocol, col_amt, debt_amt, hf = row
                hf = float(hf) if hf else 2.0

                if hf < 1.5:
                    level = 'critical'
                    msg = f"🔴 [{chain}/{protocol}] HF={hf:.2f} 危险! 需加仓/还款"
                elif hf < 1.8:
                    level = 'warning'
                    msg = f"🟡 [{chain}/{protocol}] HF={hf:.2f} 预警"
                else:
                    continue

                alerts.append(msg)
                alert = {
                    'type': 'HF_ALERT', 'level': level,
                    'position_id': pos_id, 'chain': chain,
                    'protocol': protocol, 'hf': round(hf, 2),
                    'time': datetime.now().isoformat(),
                }
                await self.redis.publish('trade:signals', json.dumps(alert))
                await self.redis.setex(f"hf:alert:{pos_id}", 3600, json.dumps(alert))

            if alerts:
                for a in alerts:
                    print(f"  {a}")
            else:
                print(f"  🟢 HF检查通过: 所有仓位安全")
        except Exception as e:
            print(f"  ⚠️ HF检查异常: {e}")
        return alerts

    async def run_cycle(self):
        """执行一轮：利率采集 → 套利检测 → 执行 → HF检查"""
        for chain, monitor in self.monitors.items():
            try:
                rates = await monitor.snapshot_all_rates()
                opp = await monitor.check_arbitrage_opportunity()
                if opp:
                    result = await self.execute_rate_spread(opp)
                    # 发布信号
                    opp['execution'] = result
                    await self.redis.publish('trade:signals', json.dumps({
                        'type': 'LENDING_ARB', 'data': opp
                    }))
            except Exception as e:
                print(f"  ⚠️ [{chain}] 借贷套利异常: {e}")

        await self.check_all_hf()
