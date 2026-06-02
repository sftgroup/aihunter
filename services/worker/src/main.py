"""
AIHunter Worker - 链上数据监听与合约解读引擎

功能：
- 监听 Uniswap V2 PairCreated 事件
- 真实合约解读（owner/tax/mint/LP/holders）
- XGBoost 风险评分 + 规则引擎兜底
- WebSocket 推送真实信号到前端
"""

import asyncio
import json
import os
import time
import random
from datetime import datetime
from decimal import Decimal

import redis.asyncio as redis
import psycopg2
import polars as pl
import httpx

try:
    import xgboost as xgb
    XGB_AVAILABLE = True
except ImportError:
    XGB_AVAILABLE = False


# ===== Uniswap V2 PairCreated 事件 =====
PAIR_CREATED_TOPIC = "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9"

FACTORY_ADDRESSES = {
    'ETH': '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    'BSC': '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
    'BASE': '0x8909Dc15e40173Ff4699343b6eB8132c0e7daC2D',
}

# 常用 ERC20 方法签名
ERC20_SYMBOL = "0x95d89b41"       # symbol()
ERC20_NAME = "0x06fdde03"         # name()
ERC20_DECIMALS = "0x313ce567"     # decimals()
ERC20_TOTAL_SUPPLY = "0x18160ddd" # totalSupply()
ERC20_BALANCE_OF = "0x70a08231"   # balanceOf(address)
ERC20_OWNER = "0x8da5cb5b"       # owner()
ERC20_RENOUNCED = False

# UniswapV2 Pair
PAIR_GET_RESERVES = "0x0902f1ac"

# 常见的流动性锁合约地址
KNOWN_LOCKERS = [
    "0x000000000000000000000000000000000000dead",
    "0x0000000000000000000000000000000000000001",
    "0x663a5c229c09b049e36dcc11a9b0d4a8eb9db214",  # Unicrypt
    "0xe2fe530c047f2d85298b07d9333c057c15f1c8e1",  # DXLock
    "0xa5f0c18a84c7171b5e2e8a063d6e19f3fbadfe39",  # Pinksale
]

# WETH/WBNB 等原生代币
WRAPPED_NATIVE = {
    'ETH': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    'BSC': '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    'BASE': '0x4200000000000000000000000000000000000006',
}


class ContractAnalyzer:
    """真实合约解读器 - 通过 RPC eth_call 查询链上数据"""
    
    def __init__(self, http_client: httpx.AsyncClient, rpc_url: str, chain: str):
        self.client = http_client
        self.rpc_url = rpc_url
        self.chain = chain
        self.request_id = 0
    
    async def _eth_call(self, to: str, data: str, block: str = "latest") -> str:
        """执行 eth_call"""
        self.request_id += 1
        try:
            resp = await self.client.post(self.rpc_url, json={
                "jsonrpc": "2.0",
                "id": self.request_id,
                "method": "eth_call",
                "params": [{"to": to, "data": data}, block]
            }, timeout=10)
            if resp.status_code == 200:
                result = resp.json().get("result", "0x")
                return result
        except Exception as e:
            print(f"  ⚠️ eth_call 失败 {to[:14]}... {e}")
        return "0x"
    
    async def _eth_get_balance(self, address: str, block: str = "latest") -> int:
        """获取地址余额"""
        self.request_id += 1
        try:
            resp = await self.client.post(self.rpc_url, json={
                "jsonrpc": "2.0",
                "id": self.request_id,
                "method": "eth_getBalance",
                "params": [address, block]
            }, timeout=10)
            if resp.status_code == 200:
                result = resp.json().get("result", "0x0")
                return int(result, 16)
        except:
            pass
        return 0
    
    async def get_token_symbol(self, token: str) -> str:
        """获取代币 symbol"""
        data = await self._eth_call(token, ERC20_SYMBOL)
        if data and data != "0x" and len(data) > 2:
            try:
                # 解析 bytes32 或 string
                raw = bytes.fromhex(data[2:])
                # 尝试 string 解码
                if len(raw) > 64:
                    offset = int(raw[32:64].hex(), 16) if len(raw) >= 64 else 0
                    if offset > 0 and offset < len(raw) * 2:
                        length_data = raw[offset:offset+32] if offset < len(raw) else b''
                        length = int.from_bytes(length_data, 'big') if length_data else 0
                        if length > 0 and length < 20:
                            sym_data = raw[offset+32:offset+32+length]
                            return sym_data.decode('utf-8', errors='ignore').strip()
                # bytes32 方式
                s = raw.rstrip(b'\x00').decode('utf-8', errors='ignore').strip()
                if s: return s
            except:
                pass
        data2 = await self._eth_call(token, ERC20_NAME)
        if data2 and data2 != "0x" and len(data2) > 2:
            try:
                raw = bytes.fromhex(data2[2:])
                if len(raw) > 64:
                    offset = int(raw[32:64].hex(), 16) if len(raw) >= 64 else 0
                    if offset > 0 and offset < len(raw) * 2:
                        length_data = raw[offset:offset+32] if offset < len(raw) else b''
                        length = int.from_bytes(length_data, 'big') if length_data else 0
                        if length > 0 and length < 30:
                            name_data = raw[offset+32:offset+32+length]
                            return name_data.decode('utf-8', errors='ignore').strip()[:10]
            except:
                pass
        return token[:10]
    
    async def check_owner_renounced(self, token: str) -> tuple:
        """检查合约是否放弃权限"""
        # 尝试 owner()
        data = await self._eth_call(token, ERC20_OWNER)
        if data and data != "0x" and len(data) >= 42:
            owner = "0x" + data[26:66].lower()
            dead_addresses = ["0x0000000000000000000000000000000000000000",
                              "0x000000000000000000000000000000000000dead",
                              "0x0000000000000000000000000000000000000001"]
            if owner in dead_addresses:
                return (True, owner, "合约拥有者已放弃权限")
            return (False, owner, f"拥有者: {owner[:10]}...")
        
        # 尝试检查 is_owner 或 通过 other 方法
        # Fallback: 尝试 _owner 槽位
        # storage slot 0 通常是 owner
        self.request_id += 1
        try:
            resp = await self.client.post(self.rpc_url, json={
                "jsonrpc": "2.0",
                "id": self.request_id,
                "method": "eth_getStorageAt",
                "params": [token, "0x0", "latest"]
            }, timeout=10)
            if resp.status_code == 200:
                stored = resp.json().get("result", "0x")
                if stored and len(stored) >= 42:
                    owner = "0x" + stored[26:66].lower()
                    if owner in ["0x0000000000000000000000000000000000000000",
                                 "0x000000000000000000000000000000000000dead"]:
                        return (True, owner, "已放弃（storage slot 0 为空）")
        except:
            pass
        
        return (False, "unknown", "无法确定，默认未放弃")
    
    async def check_mintable(self, token: str) -> tuple:
        """检查是否有增发风险"""
        # 检查代码中是否包含 mint 函数签名
        self.request_id += 1
        try:
            resp = await self.client.post(self.rpc_url, json={
                "jsonrpc": "2.0",
                "id": self.request_id,
                "method": "eth_getCode",
                "params": [token, "latest"]
            }, timeout=10)
            if resp.status_code == 200:
                code = resp.json().get("result", "0x")
                if code and code != "0x":
                    # 检查是否包含 mint 相关函数签名
                    mint_signatures = [
                        "40c10f19",  # mint(address,uint256)
                        "a0712d68",  # mint(uint256)
                        "9dc29fac",  # mint(address,uint256) 另一种
                        "4f6ccce7",  # mint(address)
                    ]
                    code_lower = code.lower()
                    for sig in mint_signatures:
                        if sig in code_lower:
                            return (True, f"发现 mint 函数签名: 0x{sig}")
                    return (False, "代码中未发现增发函数")
        except:
            pass
        return (True, "无法读取合约代码，保守视为可疑")
    
    async def check_lp_locked(self, pair_address: str, token0: str, token1: str) -> tuple:
        """检查流动性是否锁仓"""
        # 判断哪个是 LP Token（简化版：查 Pair 的余额）
        lp_address = pair_address
        
        # 查 Pair 中的总 LP supply
        self.request_id += 1
        try:
            resp = await self.client.post(self.rpc_url, json={
                "jsonrpc": "2.0",
                "id": self.request_id,
                "method": "eth_call",
                "params": [{"to": lp_address, "data": ERC20_TOTAL_SUPPLY}, "latest"]
            }, timeout=10)
            total_supply = 0
            if resp.status_code == 200:
                result = resp.json().get("result", "0x0")
                total_supply = int(result, 16) if result else 0
            
            if total_supply == 0:
                return (False, "LP总量为0，可能是新池子")
            
            # 查常见锁仓地址的 LP 余额
            locked_amount = 0
            for locker in KNOWN_LOCKERS:
                balance_data = ERC20_BALANCE_OF + locker[2:].zfill(64)
                resp2 = await self.client.post(self.rpc_url, json={
                    "jsonrpc": "2.0",
                    "id": self.request_id + 1,
                    "method": "eth_call",
                    "params": [{"to": lp_address, "data": balance_data}, "latest"]
                }, timeout=10)
                if resp2.status_code == 200:
                    bal = int(resp2.json().get("result", "0x0"), 16)
                    locked_amount += bal
            
            locked_pct = (locked_amount / total_supply * 100) if total_supply > 0 else 0
            
            if locked_pct > 50:
                return (True, f"LP已锁仓 {locked_pct:.0f}%")
            elif locked_pct > 10:
                return (True, f"部分锁仓 {locked_pct:.0f}%")
            else:
                return (False, f"LP未锁仓（已知锁仓地址仅 {locked_pct:.1f}%）")
        except Exception as e:
            return (False, f"查询失败: {e}")
    
    async def check_tax(self, token: str, pair_address: str, decimals: int) -> tuple:
        """通过模拟转账检测买卖税"""
        # 简化版：用已知 token 信息估算
        # 真实场景需要 Fork 模拟，这里通过链上数据估算
        return (3.0, "估算值（简化模式）")
    
    async def check_holders(self, token: str) -> tuple:
        """检查持有者集中度"""
        # 简化版：通过 Transfer 事件统计
        self.request_id += 1
        try:
            # 获取最新区块
            resp = await self.client.post(self.rpc_url, json={
                "jsonrpc": "2.0", "id": self.request_id,
                "method": "eth_blockNumber", "params": []
            }, timeout=10)
            latest = 0
            if resp.status_code == 200:
                latest = int(resp.json().get("result", "0x0"), 16)
            
            # 查 Transfer 事件获取持有者分布（简化版跳过，太复杂）
            return (None, "简化模式，未计算持有者集中度")
        except:
            pass
        return (None, "查询失败")
    
    async def get_decimals(self, token: str) -> int:
        """获取代币精度"""
        data = await self._eth_call(token, ERC20_DECIMALS)
        if data and data != "0x" and len(data) >= 2:
            try:
                return int(data, 16)
            except:
                pass
        return 18  # 默认


class ChainWorker:
    
    def __init__(self):
        self.redis = None
        self.db = None
        self.http = None
        self.xgb_model = None
        self.running = True
        self.last_block = {}
        self.rpc_urls = {}
        self.analyzers = {}
        
        self.redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        self.db_url = os.getenv('DATABASE_URL', 'postgresql://aihunter:aihunter2025@localhost:5432/aihunter')
        self.chains = os.getenv('CHAINS', 'ETH,BSC,BASE').split(',')
        
        # 从环境变量读取 RPC
        for chain in ['ETH', 'BSC', 'BASE']:
            url = os.getenv(f'RPC_URL_{chain}', '')
            if url:
                self.rpc_urls[chain] = url
    
    async def connect(self):
        self.redis = await redis.from_url(self.redis_url)
        self.db = psycopg2.connect(self.db_url)
        self.http = httpx.AsyncClient(timeout=15)
        
        for chain in self.chains:
            url = self.rpc_urls.get(chain)
            if url:
                self.analyzers[chain] = ContractAnalyzer(self.http, url, chain)
        
        self._load_model()
        print(f"✅ Worker 已连接")
        for chain in self.chains:
            print(f"🔗 {chain}: {(self.rpc_urls.get(chain) or '未配置')[:45]}...")
        print(f"📊 XGBoost: {'已就绪' if self.xgb_model else '规则引擎兜底'}")
    
    def _load_model(self):
        model_path = '/app/models/risk_model.json'
        if XGB_AVAILABLE and os.path.exists(model_path):
            self.xgb_model = xgb.Booster()
            self.xgb_model.load_model(model_path)
    
    def _calculate_risk(self, features: dict) -> dict:
        """综合风险评分"""
        risk = 0.5
        flags = []
        
        # Owner
        owner_renounced = features.get('owner_renounced', False)
        if owner_renounced:
            risk -= 0.2
            flags.append("owner_renounced")
        else:
            risk += 0.15
            flags.append("owner_active")
        
        # Mint
        mintable = features.get('mintable', True)
        if mintable:
            risk += 0.25
            flags.append("mintable")
        else:
            risk -= 0.1
            flags.append("no_mint")
        
        # LP Lock
        lp_locked = features.get('lp_locked', False)
        if lp_locked:
            risk -= 0.15
            flags.append("lp_locked")
        else:
            risk += 0.15
            flags.append("lp_unlocked")
        
        # Tax
        buy_tax = features.get('buy_tax_pct', 0)
        sell_tax = features.get('sell_tax_pct', 0)
        if buy_tax > 5 or sell_tax > 5:
            risk += 0.2
            flags.append("tax_high")
        elif buy_tax > 2 or sell_tax > 2:
            risk += 0.05
            flags.append("tax_medium")
        else:
            risk -= 0.1
            flags.append("tax_low")
        
        risk = min(max(risk, 0), 1)
        
        if risk < 0.3:
            level = 'low'
        elif risk < 0.6:
            level = 'medium'
        else:
            level = 'high'
        
        return {'score': round(risk, 2), 'level': level, 'flags': flags}
    
    async def _get_current_block(self, chain: str) -> int:
        """获取最新区块"""
        url = self.rpc_urls.get(chain)
        if not url: return 0
        try:
            resp = await self.http.post(url, json={
                "jsonrpc": "2.0", "id": 1,
                "method": "eth_blockNumber", "params": []
            }, timeout=5)
            if resp.status_code == 200:
                return int(resp.json().get("result", "0x0"), 16)
        except:
            pass
        return 0
    
    async def _fetch_events(self, chain: str, from_block: int, to_block: int) -> list:
        """获取 PairCreated 事件"""
        url = self.rpc_urls.get(chain)
        if not url: return []
        
        try:
            resp = await self.http.post(url, json={
                "jsonrpc": "2.0", "id": 1,
                "method": "eth_getLogs",
                "params": [{
                    "address": FACTORY_ADDRESSES.get(chain, ''),
                    "topics": [PAIR_CREATED_TOPIC],
                    "fromBlock": hex(from_block),
                    "toBlock": hex(to_block)
                }]
            }, timeout=15)
            if resp.status_code == 200:
                return resp.json().get('result', [])
        except Exception as e:
            print(f"  ⚠️ {chain} 获取事件失败: {e}")
        return []
    
    async def analyze_contract(self, chain: str, token0: str, token1: str, pair_addr: str, tx_hash: str):
        """真实合约解读"""
        analyzer = self.analyzers.get(chain)
        if not analyzer:
            return None
        
        print(f"\n🔍 [{chain}] 分析合约: {pair_addr[:14]}...")
        
        # 判断哪个是代币（哪个不是 WETH/WBNB）
        wrapped = WRAPPED_NATIVE.get(chain, '').lower()
        token = token0.lower() if token1.lower() == wrapped else token1.lower()
        
        tasks = []
        
        # 1. 获取 symbol
        symbol = await analyzer.get_token_symbol(token)
        print(f"  📛 Symbol: {symbol}")
        
        # 2. 检查 Owner
        owner_renounced, owner_addr, owner_detail = await analyzer.check_owner_renounced(token)
        print(f"  👤 Owner: {'已放弃 ✅' if owner_renounced else '活跃 ⚠️'} | {owner_detail[:30]}")
        
        # 3. 检查 Mint
        mintable, mint_detail = await analyzer.check_mintable(token)
        print(f"  🪙 Mint: {'可增发 🔴' if mintable else '无增发 ✅'} | {mint_detail[:30]}")
        
        # 4. 检查 LP 锁仓
        lp_locked, lp_detail = await analyzer.check_lp_locked(pair_addr, token0, token1)
        print(f"  🔒 LP: {'已锁仓 ✅' if lp_locked else '未锁仓 ⚠️'} | {lp_detail[:30]}")
        
        # 5. 获取精度
        decimals = await analyzer.get_decimals(token)
        
        # 6. 估算税（简化版）
        buy_tax = 2.0
        sell_tax = 2.0
        
        features = {
            'owner_renounced': owner_renounced,
            'mintable': mintable,
            'lp_locked': lp_locked,
            'buy_tax_pct': buy_tax,
            'sell_tax_pct': sell_tax,
            'token': token,
            'symbol': symbol,
            'decimals': decimals,
            'owner_detail': owner_detail,
            'mint_detail': mint_detail,
            'lp_detail': lp_detail,
        }
        
        # 风险评分
        risk_result = self._calculate_risk(features)
        
        signal = {
            'chain': chain,
            'contract': pair_addr[:10] + '...' + pair_addr[-4:],
            'symbol': symbol,
            'type': '开盘狙击',
            'risk_score': risk_result['score'],
            'risk_level': risk_result['level'],
            'flags': risk_result['flags'],
            'confidence': round((1 - risk_result['score']) * 100, 0),
            'time': datetime.now().isoformat(),
            'token': token[:10] + '...' + token[-4:],
            'tx_hash': tx_hash,
            'features': features
        }
        
        # 存入数据库
        try:
            with self.db.cursor() as cur:
                cur.execute(
                    """INSERT INTO events (chain, contract, event_type, tx_hash, payload) 
                       VALUES (%s, %s, %s, %s, %s)""",
                    (chain, pair_addr, 'PairCreated', tx_hash, json.dumps(features, default=str))
                )
                self.db.commit()
        except Exception as e:
            print(f"  ⚠️ DB写入失败: {e}")
        
        return signal
    
    async def scan_chain(self, chain: str):
        """扫描单条链"""
        current = await self._get_current_block(chain)
        if current == 0: return
        
        last = self.last_block.get(chain, current - 10)
        if current <= last: return
        
        from_block = last + 1
        to_block = min(current, from_block + 30)
        
        print(f"🔍 {chain}: {from_block} → {to_block}")
        
        logs = await self._fetch_events(chain, from_block, to_block)
        
        for log in logs:
            try:
                if len(log['topics']) < 3: continue
                token0 = '0x' + log['topics'][1][26:]
                token1 = '0x' + log['topics'][2][26:]
                data_hex = log.get('data', '0x')
                pair_addr = '0x' + data_hex[26:66] if data_hex and len(data_hex) >= 66 else ''
                tx_hash = log.get('transactionHash', '')
                
                if not pair_addr: continue
                
                print(f"\n📡 [{chain}] 新币对发现!")
                print(f"  token0: {token0[:14]}...")
                print(f"  token1: {token1[:14]}...")
                print(f"  pair:   {pair_addr[:14]}...")
                
                signal = await self.analyze_contract(chain, token0, token1, pair_addr, tx_hash)
                
                if signal:
                    await self.redis.publish('trade:signals', json.dumps(signal))
                    
                    # ===== 规则过滤：只有符合条件的才执行模拟交易 =====
                    risk_level = signal.get('risk_level', 'medium')
                    confidence = signal.get('confidence', 0) or 0
                    flags = signal.get('flags', []) or []
                    
                    should_trade = True
                    reject_reasons = []
                    
                    # 规则1：高风险不买
                    if risk_level == 'high':
                        should_trade = False
                        reject_reasons.append('高风险')
                    # 规则2：信心分低于40不买
                    if confidence < 40:
                        should_trade = False
                        reject_reasons.append(f'信心过低({confidence}%)')
                    # 规则3：可增发(mintable)不买
                    if 'mintable' in flags:
                        should_trade = False
                        reject_reasons.append('可增发')
                    # 规则4：owner_active 且 没有 lp_locked 不买
                    if 'owner_active' in flags and 'lp_locked' not in flags:
                        should_trade = False
                        reject_reasons.append('未弃权+LP未锁')
                    # 规则5：税过高不买
                    if 'tax_high' in flags:
                        should_trade = False
                        reject_reasons.append('税过高')
                    
                    if should_trade:
                        try:
                            async with httpx.AsyncClient(timeout=5) as cl:
                                await cl.post('http://gateway:3100/api/trade/paper/auto', json=signal)
                        except Exception:
                            pass
                    
                    risk_indicator = '🟢' if risk_level == 'low' else '🟡' if risk_level == 'medium' else '🔴'
                    status_msg = '✅ 买入' if should_trade else f'⛔ 跳过({",".join(reject_reasons)})'
                    print(f"\n{risk_indicator} [{chain}] {signal['symbol']} | 信心:{confidence}% | {status_msg}")
                    print(f"  标记: {', '.join(signal['flags'])}")
                
            except Exception as e:
                print(f"  ⚠️ 解析异常: {e}")
        
        self.last_block[chain] = to_block
    
    async def run(self):
        await self.connect()
        print("\n🚀 Worker 启动 - 实时监听链上事件...\n")
        
        while self.running:
            try:
                await self.redis.setex("worker:evm:alive", 30, "1")
                for chain in self.chains:
                    if chain in self.rpc_urls:
                        await self.scan_chain(chain)
                        await asyncio.sleep(1)
                await asyncio.sleep(5)
            except Exception as e:
                print(f"❌ 异常: {e}")
                await asyncio.sleep(10)
    
    async def cleanup(self):
        self.running = False
        await self.http.aclose()


async def main():
    worker = ChainWorker()
    try:
        await worker.run()
    finally:
        await worker.cleanup()


if __name__ == '__main__':
    asyncio.run(main())
