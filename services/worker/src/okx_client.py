"""
OKX OnchainOS V6 API Python 客户端
HMAC-SHA256 签名 + 代币行情/流动性/集中度/K线/高级信息
"""
import hmac, hashlib, base64, json, sys, time, os
import datetime
from typing import Optional

import httpx

OKX_REST_HOST = "https://www.okx.com"

OKX_CHAIN_MAP = {
    "1": "ETH", "56": "BSC", "8453": "BASE",
    "137": "POLYGON", "42161": "ARBITRUM", "10": "OPTIMISM", "501": "SOL",
}
AIHUNTER_TO_OKX = {v: k for k, v in OKX_CHAIN_MAP.items()}

# 从环境变量读取 OKX 凭证（支持 .env 文件）
_OKX_KEY = os.environ.get("OKX_API_KEY", "")
_OKX_SECRET = os.environ.get("OKX_SECRET_KEY", "")
_OKX_PASSPHRASE = os.environ.get("OKX_PASSPHRASE", "")

if not _OKX_KEY or not _OKX_SECRET or not _OKX_PASSPHRASE:
    sys.stderr.write(
        "[OKX] FATAL: API 凭证未配置。请设置环境变量 OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE，"
        "或通过 configure() / configure_from_redis() 动态配置。\n"
    )
    sys.exit(1)

def configure(api_key: str = "", secret_key: str = "", passphrase: str = "", redis=None):
    """配置 OKX API 凭证；空参数时自动从环境变量读取"""
    global _OKX_KEY, _OKX_SECRET, _OKX_PASSPHRASE
    _OKX_KEY = api_key or os.environ.get("OKX_API_KEY", "")
    _OKX_SECRET = secret_key or os.environ.get("OKX_SECRET_KEY", "")
    _OKX_PASSPHRASE = passphrase or os.environ.get("OKX_PASSPHRASE", "")

def try_float(v, default=None):
    if v is None or v == "--" or v == "":
        return default
    try:
        return float(v)
    except (ValueError, TypeError):
        return default


def _sign(timestamp: str, method: str, path: str, body: str = "") -> str:
    msg = timestamp + method.upper() + path + body
    mac = hmac.new(_OKX_SECRET.encode(), msg.encode(), hashlib.sha256)
    return base64.b64encode(mac.digest()).decode()

async def _get(path: str, params: dict = None) -> dict:
    if not _OKX_KEY or not _OKX_SECRET or not _OKX_PASSPHRASE:
        raise ValueError("OKX API 未配置")
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    qs = "?" + "&".join(f"{k}={v}" for k, v in (params or {}).items()) if params else ""
    sign = _sign(ts, "GET", path + qs)
    headers = {
        "OK-ACCESS-KEY": _OKX_KEY,
        "OK-ACCESS-SIGN": sign,
        "OK-ACCESS-TIMESTAMP": ts,
        "OK-ACCESS-PASSPHRASE": _OKX_PASSPHRASE,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
        "Accept": "application/json",
        "Origin": "https://web3.okx.com",
    }
    async with httpx.AsyncClient(timeout=15) as c:
        resp = await c.get(OKX_REST_HOST + path + qs, headers=headers)
    data = resp.json()
    if data.get("code") not in ("0", 0):
        raise ValueError(f"OKX API 错误 [{data.get('code')}]: {data.get('msg', str(data))}")
    return data.get("data") or data

async def _post(path: str, body: list) -> dict:
    if not _OKX_KEY or not _OKX_SECRET or not _OKX_PASSPHRASE:
        raise ValueError("OKX API 未配置")
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    body_str = json.dumps(body)
    sign = _sign(ts, "POST", path, body_str)
    headers = {
        "OK-ACCESS-KEY": _OKX_KEY,
        "OK-ACCESS-SIGN": sign,
        "OK-ACCESS-TIMESTAMP": ts,
        "OK-ACCESS-PASSPHRASE": _OKX_PASSPHRASE,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
        "Accept": "application/json",
        "Origin": "https://web3.okx.com",
    }
    async with httpx.AsyncClient(timeout=15) as c:
        resp = await c.post(OKX_REST_HOST + path, headers=headers, content=body_str)
    data = resp.json()
    if data.get("code") not in ("0", 0):
        raise ValueError(f"OKX API 错误 [{data.get('code')}]: {data.get('msg', str(data))}")
    return data.get("data") or data

# ===========================================================================
# 1. 代币交易信息（价格/交易量/持有人/流动性）
# POST /api/v6/dex/market/price-info
# ===========================================================================
async def get_price_info(chain: str, contracts: list) -> list:
    """批量获取代币交易信息，支持最多100个"""
    chain_id = AIHUNTER_TO_OKX.get(chain)
    if not chain_id:
        return []
    body = [{"chainIndex": chain_id, "tokenContractAddress": c} for c in contracts]
    try:
        data = await _post("/api/v6/dex/market/price-info", body)
        return data if isinstance(data, list) else [data]
    except Exception as e:
        print(f"  ⚠️ price-info 异常 ({chain}): {e}")
        return []

# ===========================================================================
# 2. 热门代币 + 代币安全/集中度/买卖数据
# GET /api/v6/dex/market/token/hot-token
# ===========================================================================
async def get_hot_tokens(
    chain: str = "", limit: int = 50, stable_filter: bool = True,
    risk_filter: bool = True, liquidity_min: str = "100000",
    holders_min: str = "100",
) -> list:
    """获取热门代币，含安全/集中度/买卖数据"""
    params = {"rankingType": "4", "limit": str(limit)}
    if chain:
        cid = AIHUNTER_TO_OKX.get(chain)
        if cid:
            params["chainIndex"] = cid
    params["stableTokenFilter"] = str(stable_filter).lower()
    params["riskFilter"] = str(risk_filter).lower()
    if liquidity_min:
        params["liquidityMin"] = liquidity_min
    if holders_min:
        params["holdersMin"] = holders_min
    try:
        data = await _get("/api/v6/dex/market/token/hot-token", params)
        results = []
        for t in (data if isinstance(data, list) else (data.get("data", []) if isinstance(data, dict) else [])):
            chain_id = str(t.get("chainIndex", ""))
            results.append({
                "chain": OKX_CHAIN_MAP.get(chain_id, chain_id),
                "contract": t.get("tokenContractAddress", ""),
                "symbol": t.get("tokenSymbol", ""),
                "price": float(t.get("price", 0) or 0),
                "liquidity": float(t.get("liquidity", 0) or 0),
                "volume": float(t.get("volume", 0) or 0),
                "market_cap": float(t.get("marketCap", 0) or 0),
                "holders": int(t.get("holders", 0) or 0),
                "change_pct": float(t.get("change", 0) or 0),
                "txs": int(t.get("txs", 0) or 0),
                "txs_buy": int(t.get("txsBuy", 0) or 0),
                "txs_sell": int(t.get("txsSell", 0) or 0),
                "unique_traders": int(t.get("uniqueTraders", 0) or 0),
                "inflow_usd": float(t.get("inflowUsd", 0) or 0),
                "risk_level": t.get("riskLevelControl", ""),
                "dev_hold_pct": float(t.get("devHoldPercent", 0) or 0) if t.get("devHoldPercent") else None,
                "top10_hold_pct": float(t.get("top10HoldPercent", 0) or 0) if t.get("top10HoldPercent") else None,
                "bundle_hold_pct": float(t.get("bundleHoldPercent", 0) or 0) if t.get("bundleHoldPercent") else None,
                "vibe_score": float(t.get("vibeScore", 0) or 0) if t.get("vibeScore") else None,
                "first_trade_time": t.get("firstTradeTime", ""),
                "cursor": t.get("cursor", ""),
            })
        return results
    except Exception as e:
        print(f"  ⚠️ hot-token 异常: {e}")
        return []

# ===========================================================================
# 3. 代币高级信息（安全检测/创建者/RugPull/风控等级）
# GET /api/v6/dex/market/token/advanced-info
# ===========================================================================
async def get_advanced_info(chain: str, contract: str) -> dict:
    """获取代币高级安全信息"""
    chain_id = AIHUNTER_TO_OKX.get(chain)
    if not chain_id:
        return {}
    try:
        data = await _get("/api/v6/dex/market/token/advanced-info", {
            "chainIndex": chain_id,
            "tokenContractAddress": contract,
        })
        item = data[0] if isinstance(data, list) else data
        return {
            "risk_level": item.get("riskControlLevel", ""),
            "top10_hold_pct": float(item.get("top10HoldPercent", 0) or 0) if item.get("top10HoldPercent") else None,
            "dev_hold_pct": float(item.get("devHoldingPercent", 0) or 0) if item.get("devHoldingPercent") else None,
            "bundle_hold_pct": float(item.get("bundleHoldingPercent", 0) or 0) if item.get("bundleHoldingPercent") else None,
            "suspicious_hold_pct": float(item.get("suspiciousHoldingPercent", 0) or 0) if item.get("suspiciousHoldingPercent") else None,
            "sniper_hold_pct": float(item.get("sniperHoldingPercent", 0) or 0) if item.get("sniperHoldingPercent") else None,
            "lp_burned_pct": float(item.get("lpBurnedPercent", 0) or 0) if item.get("lpBurnedPercent") else None,
            "creator": item.get("creatorAddress", ""),
            "dev_rugpull_count": int(item.get("devRugPullTokenCount", 0) or 0),
            "dev_token_count": int(item.get("devCreateTokenCount", 0) or 0),
            "create_time": item.get("createTime", ""),
            "is_internal": item.get("isInternal", False),
            "protocol_id": item.get("protocolId", ""),
            "token_tags": item.get("tokenTags", []),
        }
    except Exception as e:
        print(f"  ⚠️ advanced-info 异常 ({chain}/{contract[:10]}): {e}")
        return {}

# ===========================================================================
# 4. 代币持仓集中度
# GET /api/v6/dex/market/token/cluster/overview
# ===========================================================================
async def get_cluster_overview(chain: str, contract: str) -> dict:
    """获取代币持仓集中度"""
    chain_id = AIHUNTER_TO_OKX.get(chain)
    if not chain_id:
        return {}
    try:
        data = await _get("/api/v6/dex/market/token/cluster/overview", {
            "chainIndex": chain_id,
            "tokenContractAddress": contract,
        })
        item = data if isinstance(data, dict) else (data[0] if isinstance(data, list) and data else {})
        return {
            "concentration": item.get("clusterConcentration", ""),
            "top100_pct": float(item.get("top100HoldingsPercent", 0) or 0) if item.get("top100HoldingsPercent") else None,
            "rugpull_pct": float(item.get("rugPullPercent", 0) or 0) if item.get("rugPullPercent") else None,
            "new_address_pct": float(item.get("holderNewAddressPercent", 0) or 0) if item.get("holderNewAddressPercent") else None,
            "same_fund_pct": float(item.get("holderSameFundSourcePercent", 0) or 0) if item.get("holderSameFundSourcePercent") else None,
        }
    except Exception as e:
        print(f"  ⚠️ cluster 异常 ({chain}/{contract[:10]}): {e}")
        return {}

# ===========================================================================
# 5. 历史 K 线
# GET /api/v6/dex/market/historical-candles
# ===========================================================================
async def get_candles(chain: str, contract: str, bar: str = "1H", limit: int = 100) -> list:
    """获取历史K线数据"""
    chain_id = AIHUNTER_TO_OKX.get(chain)
    if not chain_id:
        return []
    try:
        data = await _get("/api/v6/dex/market/historical-candles", {
            "chainIndex": chain_id,
            "tokenContractAddress": contract,
            "bar": bar,
            "limit": str(limit),
        })
        candles = []
        for c in (data if isinstance(data, list) else []):
            if len(c) >= 7:
                candles.append({
                    "ts": int(c[0]) if c[0] else 0,
                    "open": float(c[1]) if c[1] else 0,
                    "high": float(c[2]) if c[2] else 0,
                    "low": float(c[3]) if c[3] else 0,
                    "close": float(c[4]) if c[4] else 0,
                    "vol": float(c[5]) if c[5] else 0,
                    "vol_usd": float(c[6]) if len(c) > 6 and c[6] else 0,
                })
        return candles
    except Exception as e:
        print(f"  ⚠️ candles 异常 ({chain}/{contract[:10]}): {e}")
        return []

# ===========================================================================
# 6. 代币流动性池信息
# GET /api/v6/dex/market/token/top-liquidity
# ===========================================================================
async def get_top_liquidity(chain: str, contract: str) -> list:
    """获取代币流动性池信息（前5个池子）"""
    chain_id = AIHUNTER_TO_OKX.get(chain)
    if not chain_id:
        return []
    try:
        data = await _get("/api/v6/dex/market/token/top-liquidity", {
            "chainIndex": chain_id,
            "tokenContractAddress": contract,
        })
        pools = []
        for p in (data if isinstance(data, list) else []):
            pools.append({
                "pool": p.get("pool", ""),
                "protocol": p.get("protocolName", ""),
                "liquidity_usd": float(p.get("liquidityUsd", 0) or 0),
                "fee_pct": p.get("liquidityProviderFeePercent", ""),
                "pool_address": p.get("poolAddress", ""),
                "creator": p.get("poolCreator", ""),
            })
        return pools
    except Exception as e:
        print(f"  ⚠️ top-liquidity 异常 ({chain}/{contract[:10]}): {e}")
        return []

# ===========================================================================
# 7. 从 Redis 动态读取 OKX 配置（Gateway 同步存入 Redis）
# ===========================================================================
async def configure_from_redis(redis):
    """从 Redis 读取 OKX 配置（Gateway 同步下来的），覆盖环境变量"""
    try:
        api_key = await redis.get("okx:api_key")
        secret = await redis.get("okx:secret_key")
        passphrase = await redis.get("okx:passphrase")
        if api_key and secret and passphrase:
            if isinstance(api_key, bytes): api_key = api_key.decode()
            if isinstance(secret, bytes): secret = secret.decode()
            if isinstance(passphrase, bytes): passphrase = passphrase.decode()
            configure(api_key, secret, passphrase)
            return True
    except Exception as e:
        print(f"  [OKX] Redis 读取配置失败: {e}")
    return False

# ===========================================================================
# 一站式代币评分（整合以上所有数据）
# ===========================================================================
async def score_token_full(chain: str, contract: str, symbol: str = "") -> dict:
    """综合评分（价格+集中度+高级信息+K线+流动性）"""
    result = {
        "chain": chain, "contract": contract, "symbol": symbol,
        "score": 50, "price": 0, "liquidity": 0, "volume_24h": 0,
        "holders": 0, "txs_24h": 0, "txs_buy": 0, "txs_sell": 0,
        "change_24h": 0, "inflow_usd": 0,
        "risk_level": "", "dev_hold_pct": None, "top10_hold_pct": None,
        "bundle_hold_pct": None, "lp_burned_pct": None,
        "concentration": "", "rugpull_pct": None,
        "hourly_bars": 0, "range_pct": 0, "candles": [],
        "token_tags": [], "pools": [],
        "flags": [],
    }

    # 并行获取所有数据
    try:
        info_list = await get_price_info(chain, [contract])
        info = info_list[0] if info_list else {}
        result.update({
            "price": float(info.get("price", 0) or 0),
            "liquidity": float(info.get("liquidity", 0) or 0),
            "volume_24h": float(info.get("volume24H", 0) or 0),
            "holders": int(info.get("holders", 0) or 0),
            "change_24h": float(info.get("priceChange24H", 0) or 0),
            "txs_24h": int(info.get("txs24H", 0) or 0),
            "market_cap": float(info.get("marketCap", 0) or 0),
            "circ_supply": float(info.get("circSupply", 0) or 0) if info.get("circSupply") else None,
        })
    except:
        pass

    # 高级信息 + 集中度 + K线 + 流动性池（并行）
    import asyncio
    adv_task = asyncio.create_task(get_advanced_info(chain, contract))
    cluster_task = asyncio.create_task(get_cluster_overview(chain, contract))
    candles_task = asyncio.create_task(get_candles(chain, contract, "1H", 72))
    liq_task = asyncio.create_task(get_top_liquidity(chain, contract))

    adv = await adv_task
    cluster = await cluster_task
    candles = await candles_task
    pools = await liq_task

    if adv:
        result.update({
            "risk_level": adv.get("risk_level", ""),
            "dev_hold_pct": adv.get("dev_hold_pct"),
            "top10_hold_pct": adv.get("top10_hold_pct"),
            "bundle_hold_pct": adv.get("bundle_hold_pct"),
            "suspicious_hold_pct": adv.get("suspicious_hold_pct"),
            "sniper_hold_pct": adv.get("sniper_hold_pct"),
            "lp_burned_pct": adv.get("lp_burned_pct"),
            "creator": adv.get("creator", ""),
            "dev_rugpull_count": adv.get("dev_rugpull_count", 0),
            "dev_token_count": adv.get("dev_token_count", 0),
            "token_tags": adv.get("token_tags", []),
            "is_internal": adv.get("is_internal", False),
        })
    if cluster:
        result.update({
            "concentration": cluster.get("concentration", ""),
            "rugpull_pct": cluster.get("rugpull_pct"),
        })
    if candles:
        closes = [c["close"] for c in candles if c["close"] > 0]
        highs = [c["high"] for c in candles if c["high"] > 0]
        lows = [c["low"] for c in candles if c["low"] > 0]
        result["hourly_bars"] = len(candles)
        result["candles"] = candles
        if closes:
            l24 = min(lows[-24:]) if len(lows) >= 24 else min(lows) if lows else 0
            h24 = max(highs[-24:]) if len(highs) >= 24 else max(highs) if highs else 0
            result["range_pct"] = ((h24 - l24) / l24 * 100) if l24 > 0 else 0
    if pools:
        result["pools"] = pools

    # 评分计算
    score = 50
    liq = result["liquidity"]
    if liq >= 1000000: score += 15
    elif liq >= 500000: score += 10
    elif liq >= 100000: score += 5
    if result["hourly_bars"] >= 48: score += 10
    elif result["hourly_bars"] >= 24: score += 5
    rp = result["range_pct"]
    if 1 <= rp <= 15: score += 15
    elif 0.5 <= rp <= 20: score += 8
    if result["change_24h"] > 10: score += 10
    if result["volume_24h"] > 100000: score += 5
    if result["holders"] and result["holders"] > 500: score += 5
    rl = result["risk_level"]
    if rl in ("4", "5"): score -= 20
    elif rl in ("2", "3"): score -= 10
    if result.get("is_internal"): score -= 15
    if result.get("dev_rugpull_count", 0) > 5: score -= 10
    result["score"] = max(min(score, 100), 0)

    flags = []
    if rl in ("4", "5"): flags.append("high_risk")
    if result.get("is_internal"): flags.append("internal")
    if result.get("concentration") == "High": flags.append("concentrated")
    if result.get("dev_rugpull_count", 0) > 10: flags.append("rugpull_dev")
    result["flags"] = flags

    return result
