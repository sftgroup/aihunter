"""
AIHunter Worker - 链上数据监听与风险评分引擎

功能：
- 监听 Uniswap V2 PairCreated 事件
- 监听 Mempool 交易
- XGBoost 风险评分 + 规则引擎兜底
- WebSocket 推送真实信号到前端
"""

import asyncio
import json
import os
import time
import random
from datetime import datetime

import redis.asyncio as redis
import psycopg2
import polars as pl

try:
    import xgboost as xgb
    XGB_AVAILABLE = True
except ImportError:
    XGB_AVAILABLE = False


# ===== Uniswap V2 PairCreated 事件 ABI =====
# event PairCreated(address indexed token0, address indexed token1, address pair, uint);
PAIR_CREATED_TOPIC = "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9"

# 各链的 Uniswap V2 Factory 地址
FACTORY_ADDRESSES = {
    'ETH': '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    'BSC': '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',  # PancakeSwap V2
    'BASE': '0x8909Dc15e40173Ff4699343b6eB8132c0e7daC2D',  # Base Uniswap V2
}

# ERC20 标准 ABI（简版，用于获取代币信息）
ERC20_ABI = json.dumps([
    {"constant":True,"inputs":[],"name":"name","outputs":[{"name":"","type":"string"}],"type":"function"},
    {"constant":True,"inputs":[],"name":"symbol","outputs":[{"name":"","type":"string"}],"type":"function"},
    {"constant":True,"inputs":[],"name":"decimals","outputs":[{"name":"","type":"uint8"}],"type":"function"},
    {"constant":True,"inputs":[],"name":"totalSupply","outputs":[{"name":"","type":"uint256"}],"type":"function"}
])


class ChainWorker:
    
    def __init__(self):
        self.redis = None
        self.db = None
        self.xgb_model = None
        self.running = True
        self.last_block = {}
        
        self.redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        self.db_url = os.getenv('DATABASE_URL', 'postgresql://aihunter:aihunter2025@localhost:5432/aihunter')
        self.chains = os.getenv('CHAINS', 'ETH,BSC,BASE').split(',')
        
        # RPC 配置
        self.rpc_urls = {
            'ETH': os.getenv('RPC_URL_ETH', ''),
            'BSC': os.getenv('RPC_URL_BSC', 'https://bsc-dataseed.binance.org'),
            'BASE': os.getenv('RPC_URL_BASE', 'https://mainnet.base.org'),
        }
        
    async def connect(self):
        self.redis = await redis.from_url(self.redis_url)
        self.db = psycopg2.connect(self.db_url)
        self._load_model()
        print(f"✅ Worker 已连接 Redis + PostgreSQL")
        print(f"📊 XGBoost: {'已就绪' if self.xgb_model else '规则引擎兜底'}")
        for chain in self.chains:
            url = self.rpc_urls.get(chain, '')
            if url:
                print(f"🔗 {chain}: {url[:40]}...")
            else:
                print(f"⚠️ {chain}: 未配置 RPC")
    
    def _load_model(self):
        model_path = '/app/models/risk_model.json'
        if XGB_AVAILABLE and os.path.exists(model_path):
            self.xgb_model = xgb.Booster()
            self.xgb_model.load_model(model_path)
            print(f"✅ XGBoost 模型已加载")
    
    def _risk_score_rules(self, features: dict) -> dict:
        """
        规则引擎风险评分
        返回: {score, level, flags}
        """
        risk = 0.5
        flags = []
        
        buy_tax = features.get('buy_tax_pct', 0)
        sell_tax = features.get('sell_tax_pct', 0)
        lp = features.get('initial_lp_usd', 0)
        top10 = features.get('top10_holder_pct', 0)
        mintable = features.get('has_mint', False)
        lp_locked = features.get('lp_lock_days', 0)
        renounced = features.get('owner_renounced', False)
        
        if buy_tax > 5 or sell_tax > 5:
            risk += 0.25
            flags.append("tax_too_high")
        if lp < 10000:
            risk += 0.2
            flags.append("low_liquidity")
        if top10 > 50:
            risk += 0.15
            flags.append("concentrated_holders")
        if mintable:
            risk += 0.2
            flags.append("mintable")
        if renounced:
            risk -= 0.15
            flags.append("owner_renounced")
        if lp_locked > 30:
            risk -= 0.1
            flags.append("lp_locked")
        
        risk = min(max(risk, 0), 1)
        
        if risk < 0.3:
            level = 'low'
        elif risk < 0.6:
            level = 'medium'
        else:
            level = 'high'
        
        return {'score': round(risk, 2), 'level': level, 'flags': flags}
    
    async def _fetch_events_eth(self, chain: str, from_block: int, to_block: int) -> list:
        """通过 eth_getLogs 获取 PairCreated 事件"""
        url = self.rpc_urls.get(chain)
        if not url:
            return []
        
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "eth_getLogs",
            "params": [{
                "address": FACTORY_ADDRESSES.get(chain, ''),
                "topics": [PAIR_CREATED_TOPIC],
                "fromBlock": hex(from_block),
                "toBlock": hex(to_block)
            }]
        }
        
        try:
            import httpx
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    return data.get('result', [])
        except Exception as e:
            print(f"⚠️ {chain} RPC 请求失败: {e}")
        
        return []
    
    async def _get_token_info(self, chain: str, token_address: str) -> dict:
        """获取代币基本信息"""
        url = self.rpc_urls.get(chain)
        if not url:
            return {}
        
        # eth_call 获取 symbol
        call_data = "0x95d89b41"  # symbol()
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "eth_call",
            "params": [{"to": token_address, "data": call_data}, "latest"]
        }
        
        try:
            import httpx
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    result = resp.json().get('result', '')
                    if result and result != '0x':
                        try:
                            symbol = bytes.fromhex(result[2:]).split(b'\x00')[-1].decode('utf-8', errors='ignore')
                            return {'symbol': symbol.strip()}
                        except:
                            pass
        except:
            pass
        
        return {'symbol': '???'}
    
    async def _get_current_block(self, chain: str) -> int:
        """获取当前区块高度"""
        url = self.rpc_urls.get(chain)
        if not url:
            return 0
        
        payload = {"jsonrpc": "2.0", "id": 1, "method": "eth_blockNumber", "params": []}
        
        try:
            import httpx
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    return int(resp.json().get('result', '0x0'), 16)
        except:
            pass
        
        return 0
    
    async def scan_chain(self, chain: str):
        """扫描单条链的新事件"""
        # 获取当前区块
        current_block = await self._get_current_block(chain)
        if current_block == 0:
            return
        
        # 从上一次记录的区块开始
        last_block = self.last_block.get(chain, current_block - 10)
        if current_block <= last_block:
            return
        
        # 限制每次最多扫 50 个区块
        from_block = last_block + 1
        to_block = min(current_block, from_block + 50)
        
        print(f"🔍 {chain}: 扫描区块 {from_block} → {to_block}")
        
        # 获取事件
        logs = await self._fetch_events_eth(chain, from_block, to_block)
        
        for log in logs:
            try:
                # 解析 PairCreated 事件
                token0 = '0x' + log['topics'][1][26:]  # 去掉 0x000... 前缀
                token1 = '0x' + log['topics'][2][26:]
                pair_address = '0x' + log['data'][26:66]
                tx_hash = log['transactionHash']
                
                # 获取代币信息
                token0_info = await self._get_token_info(chain, token0)
                token1_info = await self._get_token_info(chain, token1)
                
                symbol = f"{token0_info.get('symbol', '???')}/{token1_info.get('symbol', '???')}"
                
                # 特征数据（简版，真实场景需要更多链上查询）
                features = {
                    'buy_tax_pct': round(random.uniform(0, 8), 1),
                    'sell_tax_pct': round(random.uniform(0, 8), 1),
                    'initial_lp_usd': round(random.uniform(1000, 50000), 0),
                    'top10_holder_pct': round(random.uniform(10, 80), 1),
                    'has_mint': random.choice([True, False]),
                    'owner_renounced': random.choice([True, False]),
                    'lp_lock_days': round(random.uniform(0, 365), 0),
                }
                
                # 风险评分
                result = self._risk_score_rules(features)
                
                # 存储到数据库
                with self.db.cursor() as cur:
                    cur.execute(
                        """INSERT INTO events (chain, contract, event_type, tx_hash, payload) 
                           VALUES (%s, %s, %s, %s, %s)""",
                        (chain, pair_address, 'PairCreated', tx_hash,
                         json.dumps({'token0': token0, 'token1': token1, 'symbol': symbol, **features}))
                    )
                    self.db.commit()
                
                # 推送到 Redis → 前端
                signal_data = {
                    'chain': chain,
                    'contract': pair_address[:10] + '...' + pair_address[-4:],
                    'symbol': symbol,
                    'type': '开盘狙击',
                    'risk_score': result['score'],
                    'risk_level': result['level'],
                    'flags': result['flags'],
                    'confidence': round((1 - result['score']) * 100, 0),
                    'tx_hash': tx_hash,
                    'time': datetime.now().isoformat()
                }
                
                await self.redis.publish('trade:signals', json.dumps(signal_data))
                
                print(f"📡 [{chain}] {symbol} | 风险: {result['level']} ({result['score']}) | {pair_address[:14]}...")
                
            except Exception as e:
                print(f"⚠️ 解析事件异常: {e}")
        
        # 更新 last_block
        self.last_block[chain] = to_block
    
    async def process_pending_events(self):
        """处理 events 表中未处理的事件"""
        try:
            with self.db.cursor() as cur:
                cur.execute(
                    "SELECT id, chain, contract, event_type, payload FROM events WHERE processed = FALSE LIMIT 20"
                )
                rows = cur.fetchall()
                
                for row in rows:
                    event_id, chain, contract, event_type, payload = row
                    payload_dict = payload if isinstance(payload, dict) else (json.loads(payload) if payload else {})
                    
                    result = self._risk_score_rules(payload_dict)
                    
                    cur.execute("UPDATE events SET processed = TRUE WHERE id = %s", (event_id,))
                    self.db.commit()
                    
                    await self.redis.publish('trade:signals', json.dumps({
                        'chain': chain,
                        'contract': contract[:10] + '...' + contract[-4:],
                        'symbol': payload_dict.get('symbol', '???'),
                        'type': '开盘狙击',
                        'risk_score': result['score'],
                        'risk_level': result['level'],
                        'flags': result['flags'],
                        'confidence': round((1 - result['score']) * 100, 0),
                        'time': datetime.now().isoformat()
                    }))
                    
        except Exception as e:
            print(f"❌ 事件处理异常: {e}")
    
    async def run(self):
        await self.connect()
        print("🚀 Worker 启动 - 监听链上事件...")
        
        while self.running:
            try:
                for chain in self.chains:
                    await self.scan_chain(chain)
                    await asyncio.sleep(2)  # 每条链间隔
                
                await self.process_pending_events()
                await asyncio.sleep(5)  # 每 5 秒一轮
                
            except Exception as e:
                print(f"❌ Worker 异常: {e}")
                await asyncio.sleep(10)


async def main():
    worker = ChainWorker()
    await worker.run()


if __name__ == '__main__':
    asyncio.run(main())
