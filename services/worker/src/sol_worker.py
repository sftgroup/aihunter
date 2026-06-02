"""
AIHunter SOL Worker - Solana 链上新代币监听
"""

import asyncio
import json
import os
import time
from datetime import datetime

import httpx
import redis.asyncio as redis


PUMP_FUN_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"


class SolanaWorker:
    
    def __init__(self):
        self.redis = None
        self.http = None
        self.running = True
        self.seen_tx = set()
        
        self.redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        self.rpc_url = os.getenv('RPC_URL_SOL', 'https://api.mainnet-beta.solana.com')
        
    async def connect(self):
        self.redis = await redis.from_url(self.redis_url)
        self.http = httpx.AsyncClient(timeout=15)
        await self.redis.setex("worker:sol:alive", 30, "1")
        print(f"✅ SOL Worker 已连接")
        print(f"🔗 SOL: {self.rpc_url[:45]}...")
    
    async def _rpc(self, method: str, params=None) -> dict:
        try:
            resp = await self.http.post(self.rpc_url, json={
                "jsonrpc": "2.0", "id": 1, "method": method, "params": params or []
            }, timeout=15)
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            print(f"  ⚠️ SOL RPC失败 [{method}]: {e}")
        return {}
    
    async def scan(self):
        """扫描 Pump.fun 新代币"""
        try:
            data = await self._rpc("getSignaturesForAddress", [
                PUMP_FUN_PROGRAM, {"limit": 20}
            ])
            sigs = data.get("result", [])
            
            for sig in sigs[:8]:
                sig_str = sig.get('signature', '')
                if sig_str in self.seen_tx:
                    continue
                self.seen_tx.add(sig_str)
                if len(self.seen_tx) > 500:
                    self.seen_tx = set(list(self.seen_tx)[-250:])
                
                tx = await self._rpc("getTransaction", [
                    sig_str, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}
                ])
                tx_data = tx.get("result", {})
                if not tx_data:
                    continue
                
                meta = tx_data.get('meta', {})
                post = meta.get('postTokenBalances', [])
                
                for bal in post:
                    mint = bal.get('mint', '')
                    owner = bal.get('owner', '')
                    if not mint or not owner:
                        continue
                    
                    # 获取代币信息
                    supply_data = await self._rpc("getTokenSupply", [mint])
                    supply = supply_data.get("result", {}).get("value", {})
                    
                    account_data = await self._rpc("getAccountInfo", [
                        mint, {"encoding": "jsonParsed"}
                    ])
                    account = account_data.get("result", {})
                    
                    has_mint = True
                    decimals = supply.get('decimals', 0)
                    
                    if account:
                        parsed = account.get('data', {}).get('parsed', {})
                        info = parsed.get('info', {})
                        has_mint = info.get('mintAuthority') is not None
                    
                    # 风控
                    risk = 0.5
                    flags = []
                    if has_mint:
                        risk += 0.3
                        flags.append("mintable")
                    else:
                        risk -= 0.15
                        flags.append("no_mint")
                    
                    risk = max(0, min(1, risk))
                    level = 'low' if risk < 0.3 else 'medium' if risk < 0.6 else 'high'
                    confidence = round((1 - risk) * 100, 0)
                    
                    signal = {
                        'chain': 'SOL',
                        'contract': mint[:10] + '...' + mint[-4:],
                        'symbol': mint[:10] + '...',
                        'type': '开盘狙击',
                        'risk_score': round(risk, 2),
                        'risk_level': level,
                        'flags': flags,
                        'confidence': confidence,
                        'time': datetime.now().isoformat(),
                        'token': mint
                    }
                    
                    await self.redis.publish('trade:signals', json.dumps(signal))
                    
                    # 规则过滤 + 自动交易
                    should_trade = True
                    reject_reasons = []
                    
                    if level == 'high' and confidence < 60:
                        should_trade = False
                        reject_reasons.append('高风险+信心不足')
                    if 'mintable' in flags:
                        should_trade = False
                        reject_reasons.append('可增发')
                    
                    # 保存交易判断到信号中
                    signal['paper_trade'] = 'yes' if should_trade else 'no'
                    signal['paper_reason'] = '规则通过' if should_trade else '; '.join(reject_reasons)
                    
                    if should_trade:
                        try:
                            async with httpx.AsyncClient(timeout=5) as cl:
                                await cl.post('http://gateway:3100/api/trade/paper/auto', json=signal)
                        except:
                            pass
                    
                    status = '✅ 买入' if should_trade else f'⛔ 跳过({", ".join(reject_reasons)})'
                    print(f"📡 [SOL] {mint[:14]}... | {confidence}% | {status}")
                    break  # 一次只处理一个
                    
        except Exception as e:
            print(f"⚠️ SOL 扫描异常: {e}")
    
    async def run(self):
        await self.connect()
        print("🚀 SOL Worker 启动")
        
        while self.running:
            await self.redis.setex("worker:sol:alive", 30, "1")
            await self.scan()
            await asyncio.sleep(8)
    
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
