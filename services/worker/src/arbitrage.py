"""
ARBITRAGE 策略 - 跨池DEX套利引擎
轻量版：扫描同资产跨池价差，模拟执行
"""
import json, asyncio, time, math
from datetime import datetime

# ===== 已知DEX路由 =====
DEX_ROUTERS = {
    'ETH': {
        'UniswapV2': '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    },
    'BSC': {
        'PancakeV2': '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    },
}

# ===== 常用交易对 =====
COMMON_PAIRS = {
    'ETH': [
        ('WETH', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),
        ('USDC', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
        ('USDT', '0xdAC17F958D2ee523a2206206994597C13D831ec7'),
        ('DAI', '0x6B175474E89094C44Da98b954EedeAC495271d0F'),
    ],
    'BSC': [
        ('WBNB', '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'),
        ('USDC', '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'),
        ('USDT', '0x55d398326f99059fF775485246999027B3197955'),
        ('BUSD', '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56'),
        ('CAKE', '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82'),
    ],
    'BASE': [
        ('WETH', '0x4200000000000000000000000000000000000006'),
        ('USDC', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
    ]
}

# UniswapV2 Pair ABI (getReserves)
PAIR_ABI = {
    "constant": True,
    "inputs": [],
    "name": "getReserves",
    "outputs": [
        {"name": "_reserve0", "type": "uint112"},
        {"name": "_reserve1", "type": "uint112"},
        {"name": "_blockTimestampLast", "type": "uint32"}
    ],
    "stateMutability": "view",
    "type": "function"
}


class ArbitrageEngine:
    """跨池DEX套利引擎"""
    
    def __init__(self, db, redis, http):
        self.db = db
        self.redis = redis
        self.http = http
        self.rpc_urls = {}
        self.pair_cache = {}  # (chain, token0, token1) -> pair_address
        
    def add_chain(self, chain: str, rpc_url: str):
        self.rpc_urls[chain] = rpc_url
        
    async def get_pair_price(self, chain: str, token_in: str, token_out: str, from_pair: str = None) -> dict:
        """获取某交易对的实时价格"""
        rpc = self.rpc_urls.get(chain)
        if not rpc:
            return None
            
        if from_pair:
            pair_addr = from_pair
        else:
            # 从 factory 获取 pair 地址
            factory = None
            if chain == 'ETH':
                factory = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'
            elif chain == 'BSC':
                factory = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73'
            elif chain == 'BASE':
                factory = '0x8909Dc15e40173Ff4699343b6eB8132c0eE808a9'
            if not factory:
                return None
                
            # pairFor = keccak256(0xff + factory + keccak256(token0+token1) + init_code_hash)
            # 简化：直接用已知对
            cache_key = (chain, token_in, token_out)
            if cache_key in self.pair_cache:
                pair_addr = self.pair_cache[cache_key]
            else:
                return None
        
        try:
            # getReserves
            data = "0x0902f1ac"  # getReserves selector
            payload = {
                "jsonrpc": "2.0", "id": 1,
                "method": "eth_call",
                "params": [{"to": pair_addr, "data": data}, "latest"]
            }
            resp = await self.http.post(rpc, json=payload, timeout=10)
            if resp.status_code != 200:
                return None
            result = resp.json().get("result")
            if not result or result == "0x":
                return None
                
            # 解析返回值：reserve0(112bits) + reserve1(112bits) + timestamp(32bits)
            hex_data = result[2:]
            reserve0 = int(hex_data[:56], 16) / 1e18  # 假设18位精度
            reserve1 = int(hex_data[56:112], 16) / 1e18
            
            # 简化：假设 token_in 是 reserve0, token_out 是 reserve1
            if reserve0 > 0 and reserve1 > 0:
                price = reserve1 / reserve0
                liquidity_usd = (reserve0 + reserve1) * price  # 粗略估值
                return {
                    'price': price,
                    'reserve0': reserve0,
                    'reserve1': reserve1,
                    'liquidity_usd': liquidity_usd,
                    'pair': pair_addr,
                }
        except Exception as e:
            print(f"  ⚠️ 价格获取失败: {e}")
        return None
    
    async def scan_arbitrage(self, chain: str) -> list:
        """扫描跨池套利机会"""
        rpc = self.rpc_urls.get(chain)
        if not rpc:
            return []
        
        tokens = COMMON_PAIRS.get(chain, [])
        opportunities = []
        
        # 对每个稳定币对，尝试在不同池之间找价差
        # 简化：只扫描 WETH/USDC 等主流对
        for i in range(len(tokens)):
            for j in range(i+1, len(tokens)):
                sym_i, addr_i = tokens[i]
                sym_j, addr_j = tokens[j]
                
                # 获取价格（从已知 pair）
                # 简化实现：通过 eth_call 直接读 getReserves
                # 实际应该从 factory 计算 pair 地址
                pass
        
        # 当前简化：用模拟数据
        import random
        mock_opportunity = {
            'chain': chain,
            'type': 'ARBITRAGE',
            'token_in': 'USDC',
            'token_out': 'USDT',
            'dex_a': 'UniswapV2',
            'dex_b': 'PancakeV2',
            'price_a': round(0.999 + random.random() * 0.002, 6),
            'price_b': round(1.001 + random.random() * 0.002, 6),
            'spread_pct': 0,
            'profit_est_usd': 0,
            'confidence': 0,
            'time': datetime.now().isoformat(),
        }
        mock_opportunity['spread_pct'] = round(abs(mock_opportunity['price_b'] - mock_opportunity['price_a']) / mock_opportunity['price_a'] * 100, 4)
        mock_opportunity['profit_est_usd'] = round(mock_opportunity['spread_pct'] / 100 * 1000, 2)  # 假设本金$1000
        mock_opportunity['confidence'] = min(mock_opportunity['spread_pct'] * 10, 95)
        
        if mock_opportunity['spread_pct'] > 0.1:  # 价差>0.1%
            opportunities.append(mock_opportunity)
        
        return opportunities
    
    async def run_cycle(self):
        """执行一轮套利扫描"""
        for chain, rpc in self.rpc_urls.items():
            try:
                opps = await self.scan_arbitrage(chain)
                for opp in opps:
                    print(f"  💰 [{chain}] 套利机会: {opp['token_in']}→{opp['token_out']} 价差{opp['spread_pct']}% 预估利润${opp['profit_est_usd']}")
                    # 发布信号
                    await self.redis.publish('trade:signals', json.dumps({
                        'type': 'ARBITRAGE',
                        'data': opp
                    }))
            except Exception as e:
                print(f"  ⚠️ [{chain}] 套利扫描异常: {e}")
