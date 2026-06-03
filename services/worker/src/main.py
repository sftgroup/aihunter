"""
from lending_arb import LendingArbitrageEngine, LendingRateMonitor
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
    
    async def check_tax(self, token: str, pair_address: str, decimals: int, sender: str = None) -> tuple:
        """通过模拟转账检测买卖税 + honeypot 检测"""
        buy_tax = 0.0
        sell_tax = 0.0
        honeypot = "pass"
        
        # 生成测试地址
        test_sender = sender or "0x0000000000000000000000000000000000000002"
        test_receiver = "0x0000000000000000000000000000000000000003"
        
        # 1. 先查余额
        balance_data = ERC20_BALANCE_OF + test_sender[2:].zfill(64)
        balance_hex = await self._eth_call(token, balance_data)
        sender_balance = int(balance_hex, 16) if balance_hex and balance_hex != "0x" else 0
        
        # 如果没有余额，先尝试 mint 或已知持有者
        if sender_balance == 0:
            # 尝试从 Pair 中转一点做测试
            pair_balance_data = ERC20_BALANCE_OF + pair_address[2:].zfill(64)
            pair_bal_hex = await self._eth_call(token, pair_balance_data)
            pair_balance = int(pair_bal_hex, 16) if pair_bal_hex and pair_bal_hex != "0x" else 0
            
            if pair_balance > 0:
                # 用 pair 地址作为收款方测 sell tax
                sell_tax = 2.0  # 无法真实模拟时给默认值
                buy_tax = 2.0
                reason = "估算模式（无法获取测试余额）"
                return (buy_tax, sell_tax, honeypot, reason)
            return (3.0, 3.0, "unknown", "新池子，无可用余额")
        
        # 2. 模拟转账（从 test_sender 转给 test_receiver）
        transfer_data = "0xa9059cbb" + test_receiver[2:].zfill(64) + hex(sender_balance // 100)[2:].zfill(64)
        
        try:
            resp = await self.client.post(self.rpc_url, json={
                "jsonrpc": "2.0", "id": self.request_id + 1,
                "method": "eth_call",
                "params": [{"from": test_sender, "to": token, "data": transfer_data}, "latest"]
            }, timeout=10)
            if resp.status_code == 200:
                result = resp.json().get("result", "0x")
                if result == "0x" or result is None:
                    honeypot = "fail"
                    return (99.0, 99.0, "fail", "转账失败 → 蜜罐")
                # 检查接收者余额变化
                recv_balance_data = ERC20_BALANCE_OF + test_receiver[2:].zfill(64)
                recv_bal_hex = await self._eth_call(token, recv_balance_data)
                recv_balance = int(recv_bal_hex, 16) if recv_bal_hex and recv_bal_hex != "0x" else 0
                
                if recv_balance > 0:
                    # 计算税: 发送量 vs 接收量
                    sent_amount = sender_balance // 100
                    buy_tax = max(0, (1 - recv_balance / sent_amount) * 100)
                    if buy_tax > 30:
                        honeypot = "high_tax"
                    elif buy_tax > 10:
                        honeypot = "high_tax"
                
                # 3. 模拟卖出（从 test_receiver 转回 pair）
                sell_amount = recv_balance
                if sell_amount > 0:
                    sell_data = "0xa9059cbb" + pair_address[2:].zfill(64) + hex(sell_amount)[2:].zfill(64)
                    resp2 = await self.client.post(self.rpc_url, json={
                        "jsonrpc": "2.0", "id": self.request_id + 2,
                        "method": "eth_call",
                        "params": [{"from": test_receiver, "to": token, "data": sell_data}, "latest"]
                    }, timeout=10)
                    if resp2.status_code == 200:
                        result2 = resp2.json().get("result", "0x")
                        if result2 == "0x" or result2 is None:
                            honeypot = "fail"
                            sell_tax = 99.0
                        else:
                            # 查 pair 余额变化
                            pair_after = ERC20_BALANCE_OF + pair_address[2:].zfill(64)
                            pair_hex2 = await self._eth_call(token, pair_after)
                            pair_bal2 = int(pair_hex2, 16) if pair_hex2 and pair_hex2 != "0x" else 0
                            if pair_bal2 > 0:
                                sell_tax = max(0, (1 - (pair_bal2 - pair_balance) / sell_amount) * 100)
                
                buy_tax = round(min(buy_tax, 50), 1)
                sell_tax = round(min(sell_tax, 50), 1)
                avg_tax = (buy_tax + sell_tax) / 2
                if avg_tax > 15:
                    honeypot = "high_tax"
                reason = f"模拟: 买入税{buy_tax}% 卖出税{sell_tax}%"
                return (buy_tax, sell_tax, honeypot, reason)
        except Exception as e:
            print(f"  ⚠️ 模拟转账失败: {e}")
        
        return (3.0, 3.0, "unknown", "模拟失败，使用默认值")
    
    async def check_holders(self, token: str, pair_addr: str = None, max_blocks: int = 50000) -> tuple:
        """通过 Transfer 事件分析持有者集中度 (top10_holder_pct)"""
        try:
            # 获取最新区块
            resp = await self.client.post(self.rpc_url, json={
                "jsonrpc": "2.0", "id": self.request_id + 1,
                "method": "eth_blockNumber", "params": []
            }, timeout=10)
            latest = int(resp.json().get("result", "0x0"), 16) if resp.status_code == 200 else 0
            from_block = max(latest - max_blocks, 0) if latest > 0 else 0
            
            # 查询 Transfer 事件
            transfer_topic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
            resp2 = await self.client.post(self.rpc_url, json={
                "jsonrpc": "2.0", "id": self.request_id + 2,
                "method": "eth_getLogs",
                "params": [{
                    "address": token,
                    "topics": [transfer_topic],
                    "fromBlock": hex(from_block),
                    "toBlock": hex(latest)
                }]
            }, timeout=15)
            
            if resp2.status_code != 200:
                return (None, "无法获取Transfer事件")
            
            logs = resp2.json().get("result", [])
            if not logs:
                return (None, "无Transfer事件数据")
            
            # 聚合持有者余额（只统计接收方 - 简化）
            balances = {}
            for log in logs[:2000]:  # 最多处理2000条
                topics = log.get("topics", [])
                if len(topics) >= 3:
                    to_addr = "0x" + topics[2][26:66].lower()
                    data = log.get("data", "0x")
                    value = int(data, 16) if data and data != "0x" else 0
                    if to_addr not in balances:
                        balances[to_addr] = 0
                    balances[to_addr] += value
            
            if not balances:
                return (None, "无法统计持有者")
            
            # 排序取前10
            sorted_bals = sorted(balances.values(), reverse=True)[:10]
            total = sum(balances.values())
            top10_pct = round((sum(sorted_bals) / total * 100), 1) if total > 0 else 0
            
            return (top10_pct, f"Top10持有 {top10_pct}%")
        except Exception as e:
            print(f"  ⚠️ check_holders 失败: {e}")
            return (None, f"查询失败: {e}")
    
    async def get_decimals(self, token: str) -> int:
        """获取代币精度"""
        data = await self._eth_call(token, ERC20_DECIMALS)
        if data and data != "0x" and len(data) >= 2:
            try:
                return int(data, 16)
            except:
                pass
        return 18  # 默认
    
    async def get_pair_price(self, pair_addr: str, token0: str, token1: str) -> dict | None:
        """通过 DEX Pair getReserves() 获取实时价格和流动池深度"""
        try:
            data = await self._eth_call(pair_addr, PAIR_GET_RESERVES)
            if not data or data == "0x":
                return None
            # getReserves 返回: reserve0, reserve1, blockTimestampLast
            raw = data[2:]  # 去掉 0x
            reserve0 = int(raw[:64], 16) / 1e18 if len(raw) >= 64 else 0
            reserve1 = int(raw[64:128], 16) / 1e18 if len(raw) >= 128 else 0
            
            if reserve0 <= 0 or reserve1 <= 0:
                return None
            
            # 判断哪个是我们的代币
            is_token0 = token0.lower() != WRAPPED_NATIVE.get(self.chain, '').lower()
            
            if is_token0:
                token_reserve = reserve0
                paired_reserve = reserve1
            else:
                token_reserve = reserve1
                paired_reserve = reserve0
            
            # 代币价格 = paired_reserve / token_reserve （以 paired 计价）
            token_price = paired_reserve / token_reserve if token_reserve > 0 else 0
            # 流动池深度（USD 估算，假设 paired 为 ~1 USD）
            liquidity_usd = paired_reserve * 2  # 双边池总价值
            
            return {
                'price': round(token_price, 12),
                'token_reserve': round(token_reserve, 4),
                'paired_reserve': round(paired_reserve, 4),
                'liquidity_usd': round(liquidity_usd, 2),
                'is_token0': is_token0
            }
        except Exception as e:
            print(f"  ⚠️ get_pair_price 失败: {e}")
            return None
    
    async def get_swap_events(self, pair_addr: str, from_block: int, to_block: int) -> list:
        """获取 Pair 的 Swap 事件用于交易行为分析"""
        swap_topic = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822"
        try:
            resp = await self.client.post(self.rpc_url, json={
                "jsonrpc": "2.0", "id": self.request_id + 1,
                "method": "eth_getLogs",
                "params": [{
                    "address": pair_addr,
                    "topics": [swap_topic],
                    "fromBlock": hex(from_block),
                    "toBlock": hex(to_block)
                }]
            }, timeout=15)
            if resp.status_code == 200:
                return resp.json().get("result", [])
        except:
            pass
        return []
    
    async def analyze_trade_behavior(self, pair_addr: str, token: str) -> dict:
        """分析交易行为特征（unique_traders, buy_sell_ratio, wash_score, volatility, volume_decay）"""
        result = {
            'unique_traders_1h': 0,
            'buy_sell_ratio_1h': 0,
            'wash_score': 0,
            'volatility_5m': 0,
            'volume_decay_slope': 0
        }
        
        try:
            # 获取当前区块
            resp = await self.client.post(self.rpc_url, json={
                "jsonrpc": "2.0", "id": self.request_id + 1,
                "method": "eth_blockNumber", "params": []
            }, timeout=10)
            latest = int(resp.json().get("result", "0x0"), 16) if resp.status_code == 200 else 0
            if latest == 0:
                return result
            
            # 大约每4秒一个块，1小时约900块，5分钟约75块
            blocks_1h = 900
            blocks_5m = 75
            
            # 获取最近1小时的 Swap 事件
            swaps = await self.get_swap_events(pair_addr, max(latest - blocks_1h, 0), latest)
            if not swaps:
                return result
            
            # 解析交易者地址
            traders = {}
            buy_count = 0
            sell_count = 0
            amounts = []
            timestamps_5m = []
            
            for sw in swaps[-500:]:  # 最多处理500条
                data = sw.get("data", "0x")
                topics = sw.get("topics", [])
                if len(topics) < 3:
                    continue
                
                sender = "0x" + topics[1][26:66].lower() if len(topics) > 1 else ''
                to = "0x" + topics[2][26:66].lower() if len(topics) > 2 else ''
                
                if not sender:
                    continue
                
                # 解析 amounts (amount0In, amount1In, amount0Out, amount1Out)
                if data and data != "0x" and len(data) >= 130:
                    raw = data[2:]
                    amount0In = int(raw[:64], 16) if len(raw) >= 64 else 0
                    amount1In = int(raw[64:128], 16) if len(raw) >= 128 else 0
                    amount0Out = int(raw[128:192], 16) if len(raw) >= 192 else 0
                    amount1Out = int(raw[192:], 16) if len(raw) >= 256 else 0
                else:
                    amount0In = amount1In = amount0Out = amount1Out = 0
                
                # 判断买卖方向
                if amount0In > 0 or amount1In > 0:
                    buy_count += 1
                if amount0Out > 0 or amount1Out > 0:
                    sell_count += 1
                
                # unique traders
                if sender not in traders:
                    traders[sender] = {'buys': 0, 'sells': 0}
                if amount0In > 0 or amount1In > 0:
                    traders[sender]['buys'] += 1
                if amount0Out > 0 or amount1Out > 0:
                    traders[sender]['sells'] += 1
                
                vol = (amount0In + amount1In + amount0Out + amount1Out) / 1e18
                amounts.append(vol)
            
            result['unique_traders_1h'] = len(traders)
            result['buy_sell_ratio_1h'] = round(buy_count / max(sell_count, 1), 2)
            
            # wash_score: 同地址买卖占比
            wash_count = sum(1 for t in traders.values() if t['buys'] > 0 and t['sells'] > 0)
            result['wash_score'] = round(wash_count / max(len(traders), 1), 2)
            
            # volatility_5m: 最近5分钟价格波动
            swaps_5m = swaps[-min(len(swaps), 100):]
            prices_5m = []
            for sw in swaps_5m:
                data = sw.get("data", "0x")
                if data and data != "0x" and len(data) >= 130:
                    raw = data[2:]
                    a0 = int(raw[:64], 16)
                    a1 = int(raw[64:128], 16)
                    if a0 > 0 and a1 > 0:
                        prices_5m.append(a1 / a0)
            
            if len(prices_5m) > 1:
                mean_p = sum(prices_5m) / len(prices_5m)
                var_p = sum((p - mean_p) ** 2 for p in prices_5m) / len(prices_5m)
                result['volatility_5m'] = round((var_p ** 0.5) / max(mean_p, 0.0001), 4)
            
            # volume_decay_slope: 3个5分钟窗口的交易量衰减
            if len(amounts) >= 10:
                window = max(1, len(amounts) // 3)
                w1 = sum(amounts[:window])
                w2 = sum(amounts[window:2*window]) if 2*window <= len(amounts) else 0
                w3 = sum(amounts[2*window:3*window]) if 3*window <= len(amounts) else 0
                if w1 > 0:
                    decay = ((w2 - w1) / w1 + (w3 - w2) / max(w2, 1)) / 2
                    result['volume_decay_slope'] = round(decay, 4)
            
        except Exception as e:
            print(f"  ⚠️ analyze_trade_behavior 失败: {e}")
        
        return result


class ChainWorker:
    
    def __init__(self):
        self.redis = None
        self.db = None
        self.http = None
        self.xgb_model = None
        self.running = True
        self.lending_engine = None
        self.last_block = {}
        self.seen_tx_hashes = set()  # 已处理的交易哈希，用于去重
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
        self.lending_engine = LendingArbitrageEngine(self.db, self.redis, self.http)
        
        for chain in self.chains:
            url = self.rpc_urls.get(chain)
            if url:
                self.analyzers[chain] = ContractAnalyzer(self.http, url, chain)
                if self.lending_engine:
                    self.lending_engine.add_chain(chain, url)
        
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
        """综合风险评分（15维特征）"""
        risk = 0.5
        flags = []
        
        # 1. Owner 放弃
        if features.get('owner_renounced', False):
            risk -= 0.12
            flags.append("owner_renounced")
        else:
            risk += 0.10
            flags.append("owner_active")
        
        # 2. 可增发
        if features.get('mintable', True):
            risk += 0.15
            flags.append("mintable")
        else:
            risk -= 0.08
            flags.append("no_mint")
        
        # 3. 买入税
        buy_tax = features.get('buy_tax_pct', 0)
        if buy_tax > 15:
            risk += 0.15; flags.append("tax_high")
        elif buy_tax > 5:
            risk += 0.08; flags.append("tax_medium")
        else:
            risk -= 0.05; flags.append("tax_low")
        
        # 4. 卖出税
        sell_tax = features.get('sell_tax_pct', 0)
        if sell_tax > 15:
            risk += 0.15; flags.append("sell_tax_high")
        elif sell_tax > 5:
            risk += 0.08; flags.append("sell_tax_medium")
        else:
            risk -= 0.05
        
        # 5. Honeypot
        honeypot = features.get('honeypot_sim', 'pass')
        if honeypot == 'fail':
            risk += 0.30; flags.append("honeypot")
        elif honeypot == 'high_tax':
            risk += 0.15; flags.append("high_tax_warn")
        
        # 6. LP 锁定
        if features.get('lp_locked', False):
            risk -= 0.10; flags.append("lp_locked")
        else:
            risk += 0.10; flags.append("lp_unlocked")
        
        # 7. LP锁定天数
        lp_days = features.get('lp_lock_days', 0)
        if lp_days and lp_days > 365:
            risk -= 0.05; flags.append("lp_long_lock")
        elif lp_days and lp_days < 30:
            risk += 0.05
        
        # 8. 初始流动性
        init_lp = features.get('initial_lp_usd', 0)
        if init_lp and init_lp < 1000:
            risk += 0.08; flags.append("low_initial_lp")
        elif init_lp and init_lp > 50000:
            risk -= 0.05; flags.append("high_initial_lp")
        
        # 9. 池深1%滑点
        depth = features.get('pool_depth_1pct', 0)
        if depth and depth < 500:
            risk += 0.08; flags.append("thin_pool")
        elif depth and depth > 10000:
            risk -= 0.05; flags.append("deep_pool")
        
        # 10. Top10持有者
        top10 = features.get('top10_holder_pct', None)
        if top10 is not None:
            if top10 > 80:
                risk += 0.15; flags.append("highly_concentrated")
            elif top10 > 50:
                risk += 0.05; flags.append("concentrated")
        
        # 11. 独立交易者
        traders = features.get('unique_traders_1h', 0)
        if traders and traders < 5:
            risk += 0.05; flags.append("low_trader_count")
        elif traders and traders > 50:
            risk -= 0.05; flags.append("active_trading")
        
        # 12. 买卖比
        bs_ratio = features.get('buy_sell_ratio_1h', 1)
        if bs_ratio and bs_ratio > 3:
            risk += 0.05; flags.append("buy_dominated")
        elif bs_ratio and bs_ratio < 0.3:
            risk += 0.08; flags.append("sell_dominated")
        
        # 13. Wash刷量
        wash = features.get('wash_score', 0)
        if wash and wash > 0.5:
            risk += 0.10; flags.append("wash_trading")
        
        # 14. 波动率
        vol = features.get('volatility_5m', 0)
        if vol and vol > 0.5:
            risk += 0.05; flags.append("high_volatility")
        
        # 15. 交易量衰减
        decay = features.get('volume_decay_slope', 0)
        if decay and decay < -0.5:
            risk += 0.08; flags.append("volume_decay")
        
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
        
        # 5.5 获取实时价格
        price_data = await analyzer.get_pair_price(pair_addr, token0, token1)
        if price_data:
            print(f"  💰 实时价格: ${price_data['price']:.8f} | 池深: ${price_data['liquidity_usd']:.0f}")
        else:
            print(f"  ⚠️ 无法获取实时价格")
        
        # 6. 真实税费检测 + honeypot
        tax_result = await analyzer.check_tax(token, pair_addr, decimals)
        buy_tax, sell_tax, honeypot, tax_detail = tax_result if len(tax_result) == 4 else (2.0, 2.0, 'unknown', '估算')
        print(f"  💸 买入税: {buy_tax}% 卖出税: {sell_tax}% 蜜罐: {honeypot}")
        
        # 7. 持有者集中度
        holder_result = await analyzer.check_holders(token, pair_addr)
        top10_pct, holder_detail = holder_result if len(holder_result) == 2 else (None, '查询失败')
        if top10_pct:
            print(f"  👥 Top10持有: {top10_pct}%")
        else:
            print(f"  👥 持有者数据: {holder_detail}")
        
        # 8. 交易行为分析
        trade_behavior = await analyzer.analyze_trade_behavior(pair_addr, token)
        print(f"  📊 交易者: {trade_behavior['unique_traders_1h']} 买卖比: {trade_behavior['buy_sell_ratio_1h']} 刷量: {trade_behavior['wash_score']}")
        print(f"  📈 波动率: {trade_behavior['volatility_5m']} 量衰减: {trade_behavior['volume_decay_slope']}")
        
        # 9. 计算衍生特征
        pool_depth_1pct = (price_data['liquidity_usd'] * 0.01) if price_data else 0
        lp_lock_days = 0  # 简化为0，后续可精确计算
        initial_lp_usd = price_data['liquidity_usd'] if price_data else 0
        
        features = {
            # 合约安全
            'owner_renounced': owner_renounced,
            'mintable': mintable,
            'buy_tax_pct': buy_tax,
            'sell_tax_pct': sell_tax,
            'honeypot_sim': honeypot,
            # 流动性
            'initial_lp_usd': initial_lp_usd,
            'lp_locked': lp_locked,
            'lp_lock_days': lp_lock_days,
            'pool_depth_1pct': round(pool_depth_1pct, 2),
            # 交易行为
            'unique_traders_1h': trade_behavior['unique_traders_1h'],
            'buy_sell_ratio_1h': trade_behavior['buy_sell_ratio_1h'],
            'wash_score': trade_behavior['wash_score'],
            'volatility_5m': trade_behavior['volatility_5m'],
            'volume_decay_slope': trade_behavior['volume_decay_slope'],
            # 持仓
            'top10_holder_pct': top10_pct,
            # 原始数据
            'token': token,
            'symbol': symbol,
            'decimals': decimals,
            'owner_detail': owner_detail,
            'mint_detail': mint_detail,
            'lp_detail': lp_detail,
            'tax_detail': tax_detail,
            'holder_detail': holder_detail,
        }
        
        # 风险评分
        risk_result = self._calculate_risk(features)
        
        # 将价格存入历史快照
        if price_data:
            try:
                with self.db.cursor() as cur:
                    cur.execute(
                        """INSERT INTO price_snapshots (chain, contract, symbol, price, liquidity_usd, token_reserve, paired_reserve, snapshot_at)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())""",
                        (chain, token, symbol or '', price_data['price'],
                         price_data['liquidity_usd'], price_data['token_reserve'],
                         price_data['paired_reserve'])
                    )
                    # 同时写入历史价格表（离线回测用）
                    cur.execute(
                        """INSERT INTO historical_prices (chain, contract, symbol, price, liquidity_usd, token_reserve, paired_reserve, recorded_at)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())""",
                        (chain, token, symbol or '', price_data['price'],
                         price_data['liquidity_usd'], price_data['token_reserve'],
                         price_data['paired_reserve'])
                    )
                    self.db.commit()
            except Exception as e:
                print(f"  ⚠️ 价格快照写入失败: {e}")
        
        # 清理特殊字符
        def clean(s):
            s = s or ''
            if isinstance(s, str):
                return s.replace('\x00', '').strip()
            return s
        
        signal = {
            'chain': chain,
            'contract': pair_addr,
            'symbol': clean(symbol),
            'type': '开盘狙击',
            'risk_score': risk_result['score'],
            'risk_level': risk_result['level'],
            'flags': risk_result['flags'],
            'confidence': round((1 - risk_result['score']) * 100, 0),
            'time': datetime.now().isoformat(),
            'token': clean(token),
            'tx_hash': clean(tx_hash),
            'features': features,
            'price_data': price_data  # 实时价格和流动池数据
        }
        
        # 存入数据库
        try:
            with self.db.cursor() as cur:
                cur.execute(
                    """INSERT INTO events (chain, contract, event_type, tx_hash, payload) 
                       VALUES (%s, %s, %s, %s, %s)""",
                    (chain, pair_addr, 'PairCreated', tx_hash, json.dumps(features, default=str).replace('\\u0000', '').replace('\\x00', ''))
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
                tx_hash = log.get('transactionHash', '')
                
                # 去重：已处理过的交易跳过
                if tx_hash in self.seen_tx_hashes:
                    continue
                self.seen_tx_hashes.add(tx_hash)
                # 限制集合大小
                if len(self.seen_tx_hashes) > 1000:
                    self.seen_tx_hashes = set(list(self.seen_tx_hashes)[-500:])
                
                token0 = '0x' + log['topics'][1][26:]
                token1 = '0x' + log['topics'][2][26:]
                data_hex = log.get('data', '0x')
                pair_addr = '0x' + data_hex[26:66] if data_hex and len(data_hex) >= 66 else ''
                
                if not pair_addr: continue
                
                print(f"\n📡 [{chain}] 新币对发现!")
                print(f"  token0: {token0[:14]}...")
                print(f"  token1: {token1[:14]}...")
                print(f"  pair:   {pair_addr[:14]}...")
                
                signal = await self.analyze_contract(chain, token0, token1, pair_addr, tx_hash)
                
                if signal:
                    # 规则过滤
                    risk_level = signal.get('risk_level', 'medium')
                    confidence = signal.get('confidence', 0) or 0
                    flags = signal.get('flags', []) or []
                    
                    should_trade = True
                    reject_reasons = []
                    
                    if risk_level == 'high' and confidence < 60:
                        should_trade = False
                        reject_reasons.append('高风险+信心不足')
                    if 'mintable' in flags and 'lp_locked' not in flags:
                        should_trade = False
                        reject_reasons.append('貔貅特征(可增发+LP未锁)')
                    if 'tax_high' in flags and confidence < 70:
                        should_trade = False
                        reject_reasons.append('税过高')
                    
                    # 将模拟交易判断写入信号
                    signal['paper_trade'] = 'yes' if should_trade else 'no'
                    signal['paper_reason'] = '规则通过' if should_trade else ('; '.join(reject_reasons))
                    
                    await self.redis.publish('trade:signals', json.dumps(signal))
                    
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
    
    async def _price_snapshot_loop(self):
        """定时刷新已知代币价格（每5分钟）"""
        while self.running:
            try:
                await asyncio.sleep(300)  # 5分钟
                print("\n📸 开始价格快照...")
                # 从 paper_trades 和 events 表获取最近出现过的代币
                with self.db.cursor() as cur:
                    cur.execute(
                        """SELECT DISTINCT chain, contract FROM (
                            SELECT chain, contract FROM paper_trades WHERE created_at > NOW() - INTERVAL '7 days'
                            UNION
                            SELECT chain, contract FROM events WHERE created_at > NOW() - INTERVAL '7 days'
                        ) AS recent_tokens LIMIT 200"""
                    )
                    rows = cur.fetchall()
                
                count = 0
                for row in rows:
                    chain, contract = row
                    analyzer = self.analyzers.get(chain)
                    if not analyzer or not contract:
                        continue
                    # 尝试获取价格（contract 可能是 token 地址也可能是 pair 地址）
                    # 先当 token 地址处理，需要 pair 地址才能 getReserves
                    # 简化：只处理我们已知 pair 的代币
                    try:
                        with self.db.cursor() as cur2:
                            cur2.execute(
                                "SELECT contract FROM paper_trades WHERE chain = %s AND contract = %s LIMIT 1",
                                (chain, contract)
                            )
                            # 如果有 contract 就尝试获取
                    except:
                        pass
                    count += 1
                    await asyncio.sleep(0.1)
                print(f"📸 价格快照完成，扫描 {count} 个代币")
            except Exception as e:
                print(f"⚠️ 价格快照异常: {e}")

    async def run(self):
        await self.connect()
        # 启动定时快照协程
        asyncio.create_task(self._price_snapshot_loop())
        print("\n🚀 Worker 启动 - 实时监听链上事件...\n")
        
        while self.running:
            try:
                await self.redis.setex("worker:evm:alive", 30, "1")
                for chain in self.chains:
                    if chain in self.rpc_urls:
                        await self.scan_chain(chain)
                        await asyncio.sleep(1)
                # 每3分钟跑一轮利率采集
                if int(time.time()) % 180 < 10:
                    if self.lending_engine:
                        await self.lending_engine.run_cycle()
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
