// OKX 实盘交易模块 — 供 index.js require
import crypto from 'crypto';

const OKX_REST_HOST = 'https://www.okx.com';

const CHAIN_TO_OKX_ID = { ETH: 1, BSC: 56, BASE: 8453, POLYGON: 137, ARBITRUM: 42161, OPTIMISM: 10 };
const OKX_CHAIN_NAMES = { 1: 'ETH', 56: 'BSC', 8453: 'BASE' };

// 直接从环境变量 / sys_config 读取 OKX 配置
let _okxConfig = { apiKey: '', apiSecret: '', passphrase: '', projectId: '' };

export function setOkxConfig(cfg) {
  _okxConfig = { ..._okxConfig, ...cfg };
}

export function getOkxConfig() {
  return _okxConfig;
}

function signRequest(timestamp, method, requestPath, body) {
  const { apiSecret } = getOkxConfig();
  if (!apiSecret) throw new Error('OKX Secret 未配置');
  const message = timestamp + method + requestPath + (body || '');
  return crypto.createHmac('sha256', apiSecret).update(message).digest('base64');
}

async function okxRequest(method, requestPath, body = null) {
  const { apiKey, apiSecret, passphrase, projectId } = getOkxConfig();
  if (!apiKey || !apiSecret || !passphrase) {
    throw new Error('OKX API 未配置：请在配置页设置');
  }
  const timestamp = new Date().toISOString().slice(0, 19) + 'Z';
  const sign = signRequest(timestamp, method, requestPath, body);
  const headers = {
    'OK-ACCESS-KEY': apiKey,
    'OK-ACCESS-SIGN': sign,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': passphrase,
    'Content-Type': 'application/json',
  };
  if (projectId) headers['OK-ACCESS-PROJECT'] = projectId;
  const url = OKX_REST_HOST + requestPath;
  const response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (data.code !== '0') throw new Error(`OKX API 错误: [${data.code}] ${data.msg || JSON.stringify(data)}`);
  return data;
}

export async function getQuote({ chain, fromToken, toToken, amount, slippage = 0.5 }) {
  const chainId = CHAIN_TO_OKX_ID[chain];
  if (!chainId) throw new Error(`不支持链: ${chain}`);
  const params = new URLSearchParams({
    chainId: String(chainId), fromTokenAddress: fromToken || '', toTokenAddress: toToken,
    amount, slippage: String(slippage),
  });
  const result = await okxRequest('GET', `/api/v5/dex/aggregator/quote?${params}`);
  return result.data;
}

export async function getApproveTransaction({ chain, tokenAddress, amount = '0' }) {
  const chainId = CHAIN_TO_OKX_ID[chain];
  if (!chainId) throw new Error(`不支持链: ${chain}`);
  const params = new URLSearchParams({ chainId: String(chainId), tokenAddress, amount });
  const result = await okxRequest('GET', `/api/v5/dex/aggregator/approve-transaction?${params}`);
  return result.data;
}

export async function getSwapTransaction({ chain, fromToken, toToken, amount, slippage = 0.5, userWallet, router, routerType, approveTx }) {
  const chainId = CHAIN_TO_OKX_ID[chain];
  if (!chainId) throw new Error(`不支持链: ${chain}`);
  const body = {
    chainId: String(chainId), fromTokenAddress: fromToken || '', toTokenAddress: toToken,
    amount, slippage: String(slippage), userWalletAddress: userWallet, router, routerType,
  };
  if (approveTx) body.approveTx = approveTx;
  const result = await okxRequest('POST', '/api/v5/dex/aggregator/swap', body);
  return result.data;
}

export async function broadcastTransaction({ chain, txData, walletAddress }) {
  const chainId = CHAIN_TO_OKX_ID[chain];
  if (!chainId) throw new Error(`不支持链: ${chain}`);
  try {
    const result = await okxRequest('POST', '/api/v5/wallet/broadcast', { chainId: String(chainId), tx: txData, ...(walletAddress ? { walletAddress } : {}) });
    return { txHash: result.data?.txHash, status: 'broadcasted' };
  } catch (err) {
    console.warn('[OKX] Onchain Gateway 广播失败，尝试 RPC:', err.message);
    const rpcUrls = { ETH: 'https://ethereum-rpc.publicnode.com', BSC: 'https://bsc-rpc.publicnode.com', BASE: 'https://base-rpc.publicnode.com' };
    const rpcUrl = rpcUrls[chain];
    if (!rpcUrl) throw new Error(`不支持链: ${chain}`);
    const response = await fetch(rpcUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_sendRawTransaction', params: [txData.rawTransaction || txData], id: 1 }),
    });
    const result = await response.json();
    if (result.error) throw new Error(`RPC 广播失败: ${result.error.message}`);
    return { txHash: result.result, status: 'broadcasted' };
  }
}

export async function executeSwap({ chain, fromToken, toToken, amount, slippage = 0.5, walletAddress }) {
  console.log(`[OKX] Swap: ${chain} ${fromToken||'ETH'}→${toToken} amt=${amount}`);
  const quotes = await getQuote({ chain, fromToken, toToken, amount, slippage });
  if (!quotes || quotes.length === 0) throw new Error('无有效报价');
  const best = quotes[0];
  let approveTx = null;
  if (fromToken && fromToken !== '') {
    const appr = await getApproveTransaction({ chain, tokenAddress: fromToken, amount: '0' });
    approveTx = appr.approveTx;
  }
  const swapTx = await getSwapTransaction({ chain, fromToken, toToken, amount, slippage, userWallet: walletAddress, router: best.router, routerType: best.routerType, approveTx });
  const broadcast = await broadcastTransaction({ chain, txData: swapTx.tx, walletAddress });
  return { txHash: broadcast.txHash, quote: best, swapTx: swapTx.tx, status: broadcast.status, estimatedOut: best.toTokenAmount };
}
