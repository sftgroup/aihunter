#!/usr/bin/env python3
"""Update run_cycle to include candidate expansion + price persistence + sim trading"""
import os

path = "/home/ubuntu/aihunter/services/worker/src/mature_meme.py"
with open(path) as f:
    c = f.read()

old_run = """    async def run_cycle(self):
        """扫描有足量小时图数据的代币，产生动量突破信号"""
        signals = []
        try:
            with self.db.cursor() as cur:
                # 找有至少6个小时柱（即6个不同的hour bucket）的代币
                cur.execute("""
                    SELECT chain, contract, symbol,
                           COUNT(DISTINCT date_trunc('hour', recorded_at)) as hour_bars,
                           AVG(liquidity_usd) as avg_liq,
                           MAX(liquidity_usd) as max_liq,
                           MAX(recorded_at) as last_seen
                    FROM historical_prices
                    WHERE recorded_at > NOW() - INTERVAL '72 hours'
                    GROUP BY chain, contract, symbol
                    HAVING COUNT(DISTINCT date_trunc('hour', recorded_at)) >= 6
                       AND MAX(liquidity_usd) >= 1000000  -- 池子金额≥$1,000,000
                    ORDER BY max_liq DESC
                    LIMIT 30
                """)
                rows = cur.fetchall()
                print(f"  \U0001f420 MATURE_MEME: {len(rows)}个代币通过筛选 "
                      f"(\u22656h数据, 流动池\u2265$1M)")

            for row in rows:
                chain, contract, symbol, hour_bars, avg_liq, max_liq = \
                    row[0], row[1], row[2], row[3], float(row[4] or 0), float(row[5] or 0)

                result = await self.analyze_token(chain, contract)
                result['hourly_bars'] = hour_bars
                result['avg_liquidity_usd'] = avg_liq
                result['max_liquidity_usd'] = max_liq

                if result['action'] != 'pass':
                    signals.append(result)
                    print(f"  \U0001f420 [{result['chain']}] {result['symbol']} "
                          f"{hour_bars}h柱 池${max_liq/1e6:.1f}M "
                          f"震荡{result['range_pct']}% "
                          f"当前${result['current_price']:.8f} "
                          f"\u2192 {result['action']}({result['score']}) "
                          f"{' '.join(result['signals'])}")
                else:
                    print(f"  \u23ed\ufe0f [{chain}] {symbol} {hour_bars}h柱 \u2192 跳过 "
                          f"(分{result['score']} {' '.join(result['signals'])})")

        except Exception as e:
            print(f"  \u26a0\ufe0f MATURE_MEME 异常: {e}")
            import traceback
            traceback.print_exc()

        for s in signals:
            await self.redis.publish("trade:signals", json.dumps({"type": "MATURE_MEME", "data": s}, default=str))"""

new_run = """    async def run_cycle(self):
        \"\"\"扫描候选代币 \u2192 保存价格 \u2192 动量突破分析 \u2192 信号发布 \u2192 模拟交易\"\"\"
        print("\\n[V2 SCAN] start...")

        # Step 1: 从 DexScreener 获取热门代币并持久化价格
        print("  采集价格数据...")
        await self.scan_and_save_prices()
        print("  价格采集完成")

        # Step 2: 从 historical_prices 找出有足够数据的候选代币
        signals = []
        try:
            with self.db.cursor() as cur:
                cur.execute("""
                    SELECT chain, contract, symbol,
                           COUNT(DISTINCT date_trunc('hour', recorded_at)) as hour_bars,
                           AVG(liquidity_usd) as avg_liq,
                           MAX(liquidity_usd) as max_liq
                    FROM historical_prices
                    WHERE recorded_at > NOW() - INTERVAL '14 days'
                    GROUP BY chain, contract, symbol
                    HAVING COUNT(DISTINCT date_trunc('hour', recorded_at)) >= 6
                       AND MAX(liquidity_usd) >= 100000
                    ORDER BY max_liq DESC
                    LIMIT 50
                """)
                rows = cur.fetchall()
                print(f"  candidates: {len(rows)} (>\u22656h + \u2265$100K)")

            for row in rows:
                chain, contract, symbol, hour_bars, avg_liq, max_liq = \
                    row[0], row[1], row[2], row[3], float(row[4] or 0), float(row[5] or 0)

                result = await self.analyze_token(chain, contract)
                if not result:
                    continue

                if result['action'] == 'buy':
                    # 发布信号到 Redis
                    signals.append(result)
                    await self.redis.publish("trade:signals", json.dumps({"type": "MATURE_MEME", "data": result}))
                    
                    # 写入 signals:recent 供前端查询
                    try:
                        sig = {
                            "chain": result["chain"], "contract": result["contract"],
                            "symbol": result["symbol"], "score": result["score"],
                            "confidence": result["confidence"],
                            "price_usd": result.get("current_price", 0),
                            "liquidity_usd": result.get("pool_liquidity_usd", 0),
                            "signals": result.get("signals", [])[:3],
                            "action": result["action"],
                            "time": result.get("time", ""),
                            "id": hash(result["contract"] + str(time.time())) % 1000000,
                        }
                        await self.redis.lpush("signals:recent", json.dumps(sig))
                        await self.redis.ltrim("signals:recent", 0, 99)
                    except:
                        pass

                    # 触发模拟交易（带24h冷却）
                    try:
                        ck = 'buy_cooldown:' + result['chain'] + ':' + result['contract']
                        if not await self.redis.exists(ck):
                            async with httpx.AsyncClient(timeout=5) as cc:
                                await cc.post('http://gateway:3100/api/trade/paper/auto', json=result)
                            await self.redis.setex(ck, 86400, '1')
                    except:
                        pass

                    print(f"  BUY [{result['chain']}] {result['symbol']} score={result['score']}")

        except Exception as e:
            print(f"  error: {e}")

        print(f"  signals: {len(signals)} BUY")"""

c = c.replace(old_run, new_run)

with open(path, 'w') as f:
    f.write(c)
print("run_cycle updated with candidate expansion + persistence + sim trading")
