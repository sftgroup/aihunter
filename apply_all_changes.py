#!/usr/bin/env python3
import os

path = "/home/ubuntu/aihunter/services/worker/src/mature_meme.py"

with open(path) as f:
    c = f.read()

# 1. Add DexScreener candidate expansion
old_candidates = """        candidates = []
        try:
            with self.db.cursor() as cur:
                cur.execute("""
                    SELECT DISTINCT ON (chain, contract) chain, contract, symbol
                    FROM historical_prices
                    WHERE recorded_at > NOW() - INTERVAL '14 days'
                    ORDER BY chain, contract, recorded_at DESC
                    LIMIT 500
                """)
                for r in cur.fetchall():
                    candidates.append({'chain': r[0], 'contract': r[1], 'symbol': r[2] or r[1][:8]})
        except:
            pass"""

new_candidates = """        candidates = []
        chain_map = {'solana': 'SOL', 'bsc': 'BSC', 'ethereum': 'ETH', 'base': 'BASE'}
        # 从 DexScreener token-boosts 获取热门代币
        try:
            async with httpx.AsyncClient(timeout=8) as cl2:
                resp = await cl2.get('https://api.dexscreener.com/token-boosts/top/v1')
                if resp.status_code == 200:
                    boosts = resp.json()
                    if isinstance(boosts, list):
                        for b in boosts:
                            cid = b.get('chainId', '')
                            addr = b.get('tokenAddress', '')
                            if cid and addr:
                                candidates.append({'chain': chain_map.get(cid, cid.upper()), 'contract': addr, 'symbol': addr[:8]})
        except:
            pass

        try:
            with self.db.cursor() as cur:
                cur.execute("""
                    SELECT DISTINCT ON (chain, contract) chain, contract, symbol
                    FROM historical_prices
                    WHERE recorded_at > NOW() - INTERVAL '14 days'
                    ORDER BY chain, contract, recorded_at DESC
                    LIMIT 500
                """)
                for r in cur.fetchall():
                    candidates.append({'chain': r[0], 'contract': r[1], 'symbol': r[2] or r[1][:8]})
        except:
            pass
        
        # 去重
        seen = set()
        unique = []
        for c in candidates:
            key = (c['chain'], c['contract'])
            if key not in seen:
                seen.add(key)
                unique.append(c)
        candidates = unique"""

c = c.replace(old_candidates, new_candidates)

# 2. Add buy cooldown
old_trade = """                    # 触发模拟交易
                    try:
                        async with httpx.AsyncClient(timeout=5) as cl:
                            await cl.post('http://gateway:3100/api/trade/paper/auto', json=result)
                    except:
                        pass"""

new_trade = """                    # 触发模拟交易（带24h冷却）
                    cooldown_key = 'buy_cooldown:' + result['chain'] + ':' + result['contract']
                    if not await self.redis.exists(cooldown_key):
                        try:
                            async with httpx.AsyncClient(timeout=5) as cl2:
                                await cl2.post('http://gateway:3100/api/trade/paper/auto', json=result)
                            await self.redis.setex(cooldown_key, 86400, '1')
                        except:
                            pass"""

c = c.replace(old_trade, new_trade)

with open(path, 'w') as f:
    f.write(c)

# Verify
with open(path) as f:
    content = f.read()
    print("buy_cooldown:", content.count("buy_cooldown"))
    print("token-boosts:", content.count("token-boosts"))
