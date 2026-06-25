// OKX 实盘交易模块 — 供 index.js require
// v4: 多用户独立登录（per-user HOME 隔离）
// 每个用户独立 onchainos session，通过 HOME 环境变量隔离
import crypto from 'crypto';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const OKX_REST_HOST = 'https://www.okx.com';
const CHAIN_TO_OKX_ID = { ETH: 1, BSC: 56, BASE: 8453, POLYGON: 137, ARBITRUM: 42161, OPTIMISM: 10 };
const ONCHAINOS_USERS_BASE = '/tmp/onchainos-users';

let _okxConfig = { apiKey: '', apiSecret: '', passphrase: '', projectId: '' };

export function setOkxConfig(cfg) { _okxConfig = { ..._okxConfig, ...cfg }; }
export function getOkxConfig() { return _okxConfig; }

function signRequest(timestamp, method, requestPath, body) {
  const { apiSecret } = getOkxConfig();
  if (!apiSecret) throw new Error('OKX Secret 未配置');
  return crypto.createHmac('sha256', apiSecret).update(timestamp + method + requestPath + (body || '')).digest('base64');
}

async function okxRequest(method, requestPath, body = null) {
  const { apiKey, apiSecret, passphrase, projectId } = getOkxConfig();
  if (!apiKey || !apiSecret || !passphrase) throw new Error('OKX API 未配置');
  const timestamp = new Date().toISOString().slice(0, 19) + 'Z';
  const sign = signRequest(timestamp, method, requestPath, body);
  const headers = {
    'OK-ACCESS-KEY': apiKey, 'OK-ACCESS-SIGN': sign, 'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': passphrase, 'Content-Type': 'application/json',
  };
  if (projectId) headers['OK-ACCESS-PROJECT'] = projectId;
  const url = OKX_REST_HOST + requestPath;
  const response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (data.code !== '0') throw new Error(`OKX API: [${data.code}] ${data.msg || JSON.stringify(data)}`);
  return data;
}

export async function getQuote({ chain, fromToken, toToken, amount, slippage = 0.5 }) {
  const chainId = CHAIN_TO_OKX_ID[chain];
  if (!chainId) throw new Error(`unsupported chain: ${chain}`);
  const params = new URLSearchParams({ chainId: String(chainId), fromTokenAddress: fromToken || '', toTokenAddress: toToken, amount, slippage: String(slippage) });
  const result = await okxRequest('GET', `/api/v5/dex/aggregator/quote?${params}`);
  return result.data;
}

export async function getApproveTransaction({ chain, tokenAddress, amount = '0' }) {
  const chainId = CHAIN_TO_OKX_ID[chain];
  if (!chainId) throw new Error(`unsupported chain: ${chain}`);
  const params = new URLSearchParams({ chainId: String(chainId), tokenAddress, amount });
  const result = await okxRequest('GET', `/api/v5/dex/aggregator/approve-transaction?${params}`);
  return result.data;
}

export async function getSwapTransaction({ chain, fromToken, toToken, amount, slippage = 0.5, userWallet, router, routerType, approveTx }) {
  const chainId = CHAIN_TO_OKX_ID[chain];
  if (!chainId) throw new Error(`unsupported chain: ${chain}`);
  const body = { chainId: String(chainId), fromTokenAddress: fromToken || '', toTokenAddress: toToken, amount, slippage: String(slippage), userWalletAddress: userWallet, router, routerType };
  if (approveTx) body.approveTx = approveTx;
  const result = await okxRequest('POST', '/api/v5/dex/aggregator/swap', body);
  return result.data;
}

export async function broadcastTransaction({ chain, txData, walletAddress }) {
  const chainId = CHAIN_TO_OKX_ID[chain];
  if (!chainId) throw new Error(`unsupported chain: ${chain}`);
  try {
    const result = await okxRequest('POST', '/api/v5/wallet/broadcast', { chainId: String(chainId), tx: txData, ...(walletAddress ? { walletAddress } : {}) });
    return { txHash: result.data?.txHash, status: 'broadcasted' };
  } catch (err) {
    console.warn('[OKX] broadcast failed, trying RPC:', err.message);
    const rpcUrls = { ETH: 'https://ethereum-rpc.publicnode.com', BSC: 'https://bsc-rpc.publicnode.com', BASE: 'https://base-rpc.publicnode.com' };
    const rpcUrl = rpcUrls[chain];
    if (!rpcUrl) throw new Error(`unsupported chain: ${chain}`);
    const response = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_sendRawTransaction', params: [txData.rawTransaction || txData], id: 1 }) });
    const result = await response.json();
    if (result.error) throw new Error(`RPC broadcast failed: ${result.error.message}`);
    return { txHash: result.result, status: 'broadcasted' };
  }
}

export async function executeSwap({ chain, fromToken, toToken, amount, slippage = 0.5, walletAddress }) {
  console.log(`[OKX] Swap: ${chain} ${fromToken||'ETH'}→${toToken} amt=${amount}`);
  const quotes = await getQuote({ chain, fromToken, toToken, amount, slippage });
  if (!quotes || quotes.length === 0) throw new Error('no quote');
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

// ====================================================================
// Agentic Wallet — 多用户独立登录
// 每个用户分配独立 HOME 目录，onchainos 凭证完全隔离
// ====================================================================

function ensureUserHome(userId) {
  const home = path.join(ONCHAINOS_USERS_BASE, userId);
  fs.mkdirSync(home, { recursive: true });
  return home;
}

function onchainosForUser(userId, args) {
  const userHome = ensureUserHome(userId);
  try {
    const stdout = execSync(`/root/.local/bin/onchainos ${args}`, {
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, HOME: userHome },
    });
    return JSON.parse(stdout);
  } catch (err) {
    if (err.stdout) { try { return JSON.parse(err.stdout); } catch {} }
    if (err.stderr) { try { return JSON.parse(err.stderr); } catch {} }
    throw new Error(`onchainos failed: ${err.message}`);
  }
}

// --------------- 用户登录（每人用自己的邮箱） ---------------
export async function onchainosLogin(userId, email) {
  return onchainosForUser(userId, `wallet login ${email}`);
}

export async function onchainosVerifyOtp(userId, code) {
  return onchainosForUser(userId, `wallet verify ${code}`);
}

export async function onchainosWalletStatus(userId) {
  return onchainosForUser(userId, 'wallet status');
}

export async function getWalletBalances(userId, chain = 'ethereum') {
  const result = onchainosForUser(userId, `wallet balance --chain ${chain}`);
  const data = result.data || result;
  return {
    walletAddress: data.address || '',
    balances: data.balances || [],
    totalUsd: typeof data.totalUsd === 'number' ? data.totalUsd : 0,
  };
}

// --------------- 管理（几乎不需要） ---------------
export async function onchainosLogout(userId) {
  return onchainosForUser(userId, 'wallet logout');
}

export async function onchainosWalletAdd(userId) {
  return onchainosForUser(userId, 'wallet add');
}

export async function onchainosWalletAddresses(userId) {
  return onchainosForUser(userId, 'wallet addresses');
}

export async function onchainosWalletSwitch(userId, accountId) {
  return onchainosForUser(userId, 'wallet switch --id ' + accountId);
}
