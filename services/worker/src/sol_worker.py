"""
AIHunter SOL Worker - Solana 链上新代币监听

监听方式：
1. getProgramAccounts 扫描 Pump.fun 新代币创建
2. getSignaturesForAddress 监控 Raydium 流动性添加
3. 通过 getTokenSupply + getAccountInfo 验证代币信息
"""

import asyncio
import json
import os
import time
from datetime import datetime

import httpx
import redis.asyncio as redis


# Solana 程序地址
PUMP_FUN_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
RAYDIUM_AMM_PROGRAM = "675kPX9MHTjS2zt1qfr1NYyze4uCdbXEo8NJtMfDbPz"
TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
SYSTEM_PROGRAM = "11111111111111111111111111111111"


class SolanaWorker:
    
    def __init__(self):
        self.redis = None
        self.http = None
        self.running = True
        self.last_signatures = {}
        
        self.redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        self.rpc_url = os.getenv('RPC_URL_SOL', 'https://api.mainnet-beta.solana.com')
        
    async def connect(self):
        self.redis = await redis.from_url(self.redis_url)
        self.http = httpx.AsyncClient(timeout=15)
        print(f"✅ SOL Worker 已连接 Redis")
        print(f"🔗 SOL: {self.rpc_url[:45]}...")
    
    async def _rpc_call(self, method: str, params: list = None) -> dict:
        """通用 RPC 调用"""
        try:
            resp = await self.http.post(self.rpc_url, json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": method,
                "params": params or []
            }, timeout=15)
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            print(f"  ⚠️ SOL RPC 失败 [{method}]: {e}")
        return {}
    
    async def get_recent_transactions(self, program_id: str, limit: int = 50) -> list:
        """获取程序的最新交易签名"""
        data = await self._rpc_call("getSignaturesForAddress", [
            program_id, {"limit": limit}
        ])
        return data.get("result", [])
    
    async def get_transaction(self, signature: str) -> dict:
        """获取交易详情"""
        data = await self._rpc_call("getTransaction", [
            signature, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}
        ])
        return data.get("result", {})
    
    async def get_token_mint_info(self, mint_address: str) -> dict:
        """获取代币铸造信息"""
        # 获取供应量
        supply_data = await self._rpc_call("getTokenSupply", [mint_address])
        supply = supply_data.get("result", {}).get("value", {})
        
        # 获取元数据
        account_data = await self._rpc_call("getAccountInfo", [
            mint_address, {"encoding": "jsonParsed"}
        ])
        account = account_data.get("result", {})
        
        info = {}
        if supply:
            info['supply'] = supply.get('amount', '0')
            info['decimals'] = supply.get('decimals', 0)
        
        if account:
            parsed = account.get('data', {}).get('parsed', {})
            info_data = parsed.get('info', {})
            info['mint_authority'] = info_data.get('mintAuthority')
            info['freeze_authority'] = info_data.get('freezeAuthority')
            info['has_mint_authority'] = info_data.get('mintAuthority') is not None
            info['has_freeze_authority'] = info_data.get('freezeAuthority') is not None
        
        return info
    
    async def detect_new_tokens_pumpfun(self):
        """检测 Pump.fun 上的新代币"""
        sigs = await self.get_recent_transactions(PUMP_FUN_PROGRAM, 30)
        
        new_tokens = []
        for sig in sigs[:10]:  # 每次处理前10个
            sig_str = sig.get('signature', '')
            
            # 去重
            if sig_str in self.last_signatures.get('pumpfun', set()):
                continue
            
            tx = await self.get_transaction(sig_str)
            if not tx:
                continue
            
            # 解析交易中的代币账户创建
            meta = tx.get('meta', {})
            pre_balances = meta.get('preTokenBalances', [])
            post_balances = meta.get('postTokenBalances', [])
            
            # 检查是否有新的代币铸造
            for bal in post_balances:
                mint = bal.get('mint', '')
                owner = bal.get('owner', '')
                
                # 跳过已知的常用代币和系统账户
                if mint and owner and mint not in self.last_signatures.get('known_mints', set()):
                    # 验证是否是新的代币铸造
                    mint_info = await self.get_token_mint_info(mint)
                    
                    # 检查是否有铸币权限（有 mint authority 说明可增发）
                    has_mint = mint_info.get('has_mint_authority', True)
                    decimals = mint_info.get('decimals', 0)
                    
                    token_info = {
                        'mint': mint,
                        'owner': owner,
                        'has_mint_authority': has_mint,
                        'decimals': decimals,
                        'signature': sig_str,
                        'detected_at': datetime.now().isoformat()
                    }
                    new_tokens.append(token_info)
                    
                    # 记录已发现的代币
                    if 'known_mints' not in self.last_signatures:
                        self.last_signatures['known_mints'] = set()
                    self.last_signatures['known_mints'].add(mint)
            
            # 记录已处理签名
            if 'pumpfun' not in self.last_signatures:
                self.last_signatures['pumpfun'] = set()
            self.last_signatures['pumpfun'].add(sig_str)
            # 限制大小
            if len(self.last_signatures['pumpfun']) > 1000:
                self.last_signatures['pumpfun'] = set(list(self.last_signatures['pumpfun'])[-500:])
        
        return new_tokens
    
    def _simple_risk_check(self, token_info: dict) -> dict:
        """SOL 代币的简单风险检查"""
        risk = 0.5
        flags = []
        
        has_mint = token_info.get('has_mint_authority', True)
        decimals = token_info.get('decimals', 0)
        
        if has_mint:
            risk += 0.3
            flags.append("mintable")
        else:
            risk -= 0.15
            flags.append("no_mint")
        
        if decimals and decimals > 18:
            risk += 0.1
            flags.append("high_decimals")
        
        risk = min(max(risk, 0), 1)
        
        if risk < 0.3:
            level = 'low'
        elif risk < 0.6:
            level = 'medium'
        else:
            level = 'high'
        
        return {'score': round(risk, 2), 'level': level, 'flags': flags}
    
    async def scan(self):
        """扫描 SOL 链上新代币"""
        try:
            new_tokens = await self.detect_new_tokens_pumpfun()
            
            for token in new_tokens:
                mint = token['mint']
                risk = self._simple_risk_check(token)
                
                print(f"📡 [SOL] 新代币: {mint[:14]}... | 风险: {risk['level']} | 标记: {risk['flags']}")
                
                signal = {
                    'chain': 'SOL',
                    'contract': mint[:10] + '...' + mint[-4:],
                    'symbol': mint[:10] + '...',
                    'type': '开盘狙击',
                    'risk_score': risk['score'],
                    'risk_level': risk['level'],
                    'flags': risk['flags'],
                    'confidence': round((1 - risk['score']) * 100, 0),
                    'time': datetime.now().isoformat(),
                    'token': mint[:10] + '...' + mint[-4:],
                }
                
                await self.redis.publish('trade:signals', json.dumps(signal))
            
            if new_tokens:
                print(f"📊 本轮发现 {len(new_tokens)} 个新代币")
            
        except Exception as e:
            print(f"⚠️ SOL 扫描异常: {e}")
    
    async def run(self):
        await self.connect()
        print("\n🚀 SOL Worker 启动 - 监听 Pump.fun 新代币...\n")
        
        while self.running:
            await self.scan()
            await asyncio.sleep(8)  # 每 8 秒扫一次（SOL 出块快）
    
    async def cleanup(self):
        self.running = False
        await self.http.aclose()


async def main():
    worker = SolanaWorker()
    try:
        await worker.run()
    finally:
        await worker.cleanup()


if __name__ == '__main__':
    asyncio.run(main())
