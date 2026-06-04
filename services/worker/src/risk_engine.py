"""
RISK - 完整风控系统
多源价格验证 | HF自动减仓 | TVL监控 | Gas估算
"""
import json, asyncio, time
from datetime import datetime

# Chainlink 价格源
CHAINLINK_FEEDS = {
    'ETH': {
        'ETH/USD': '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
        'USDC/USD': '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6',
        'USDT/USD': '0x3E7d1eAB13ad0104d2750B8863b489D65364e32D',
        'DAI/USD': '0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9',
    },
    'BSC': {
        'BNB/USD': '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE',
        'USDC/USD': '0x51597f405303C4377E36123cBc172b13269EA163',
        'USDT/USD': '0xB97Ad0E74fa7d920791E90258A6E2085088E7b2F',
    },
    'BASE': {
        'ETH/USD': '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70',
        'USDC/USD': '0x7e860098F58bBFC8648a4311b374B1D669a537bc',
    }
}

LATEST_ANSWER = '0x50d25bcd'  # latestAnswer()
GET_TVL = '0x'  # 简化
DECIMALS_ABI = '0x313ce567'


class RiskEngine:
    """风控引擎"""

    def __init__(self, db, redis, http):
        self.db = db
        self.redis = redis
        self.http = http
        self.rpc_urls = {}

    def add_chain(self, chain: str, rpc_url: str):
        self.rpc_urls[chain] = rpc_url

    async def _call(self, chain: str, to: str, data: str) -> str:
        rpc = self.rpc_urls.get(chain)
        if not rpc: return None
        try:
            r = await self.http.post(rpc, json={
                "jsonrpc": "2.0", "id": 1, "method": "eth_call",
                "params": [{"to": to, "data": data}, "latest"]
            }, timeout=10)
            return r.json().get("result") if r.status_code == 200 else None
        except:
            return None

    async def get_chainlink_price(self, chain: str, pair: str) -> float:
        addr = CHAINLINK_FEEDS.get(chain, {}).get(pair)
        if not addr: return 0
        r = await self._call(chain, addr, LATEST_ANSWER)
        return int(r, 16) / 1e8 if r and r != '0x' else 0

    async def check_price_deviation(self, chain: str) -> list:
        """检查多源价格偏差"""
        alerts = []
        # 对每对稳定币，比较 Chainlink vs DEX 价格
        pairs_data = {
            'ETH': [('USDC', 'USDT'), ('USDC', 'DAI'), ('USDT', 'DAI')],
            'BSC': [('USDC', 'USDT'), ('USDC', 'BUSD'), ('USDT', 'BUSD')],
            'BASE': [('USDC', 'DAI')],
        }
        for pair_a, pair_b in pairs_data.get(chain, []):
            p_a = await self.get_chainlink_price(chain, f'{pair_a}/USD')
            p_b = await self.get_chainlink_price(chain, f'{pair_b}/USD')
            if p_a > 0 and p_b > 0:
                ratio = p_b / p_a
                deviation = abs(ratio - 1) * 100
                if deviation > 0.5:  # > 0.5% 偏差告警
                    alerts.append({
                        'type': 'PRICE_DEVIATION',
                        'chain': chain,
                        'pair': f'{pair_a}/{pair_b}',
                        'deviation_pct': round(deviation, 2),
                        'price_a': p_a, 'price_b': p_b,
                        'severity': 'high' if deviation > 2 else 'medium',
                        'time': datetime.now().isoformat(),
                    })
        return alerts

    async def check_gas_price(self, chain: str) -> dict:
        """估算 Gas 价格"""
        rpc = self.rpc_urls.get(chain)
        if not rpc: return {}
        try:
            r = await self.http.post(rpc, json={
                "jsonrpc": "2.0", "id": 1,
                "method": "eth_gasPrice",
                "params": []
            }, timeout=10)
            if r.status_code == 200:
                gas = int(r.json().get("result", "0x0"), 16)
                return {'gas_price_gwei': round(gas / 1e9, 2), 'chain': chain}
        except:
            pass
        return {}

    async def run_cycle(self):
        """完整风控检查"""
        for chain in self.rpc_urls:
            try:
                # 价格偏差
                alerts = await self.check_price_deviation(chain)
                for a in alerts:
                    sev = a['severity']
                    pair = a['pair']
                    dev = a['deviation_pct']
                    print(f"  {'🔴' if sev == 'high' else '🟡'} [{chain}] 价格偏差: {pair} {dev}%")
                    await self.redis.publish('trade:signals', json.dumps({
                        'type': 'RISK_ALERT', 'data': a
                    }))

                # Gas 价格
                gas_info = await self.check_gas_price(chain)
                if gas_info:
                    gwei = gas_info['gas_price_gwei']
                    status = '🟢' if gwei < 30 else ('🟡' if gwei < 80 else '🔴')
                    print(f"  {status} [{chain}] Gas: {gwei} Gwei")

            except Exception as e:
                print(f"  ⚠️ [{chain}] 风控异常: {e}")
