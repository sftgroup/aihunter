// ============================================================
// SpreadArbitrageTrader — 价差套利策略交易插件
// extends BaseAutoTrader
// 跨 DEX 买卖套利：低买高卖
// ============================================================

import BaseAutoTrader from '../BaseAutoTrader.js';

class SpreadArbitrageTrader extends BaseAutoTrader {
  /**
   * 信号过滤：estimated_profit_usdt >= config.min_profit_usdt（通常 >= 5）
   */
  async passSignalFilter(signal, config) {
    const estimatedProfit = parseFloat(signal.execution_params?.estimated_profit_usdt || 0);
    const minProfit = parseFloat(config.extra_config?.min_profit_usdt || config.min_profit_usdt || 5);
    const passed = estimatedProfit >= minProfit;
    console.log(`[SpreadArbitrageTrader] passSignalFilter: profit=${estimatedProfit} min=${minProfit} → ${passed ? '✅' : '❌'}`);
    return passed;
  }

  /**
   * 计算交易金额：Math.min(现金, config.max_position_usdt) × 0.9
   */
  async calculateAmount(signal, config, wallet) {
    const maxPosition = parseFloat(config.extra_config?.max_position_usdt || config.max_single_amount || 100);
    const walletBalance = parseFloat(wallet?.balance_usdt || 0);
    // 最多使用 90% 可用余额
    const rawAmount = Math.min(walletBalance, maxPosition) * 0.9;
    const amount = Math.round(rawAmount * 100) / 100;
    console.log(`[SpreadArbitrageTrader] calculateAmount: balance=${walletBalance} max=${maxPosition} → ${amount}`);
    return amount;
  }

  /**
   * 执行交易：
   * 第1步: okxClient.executeSwap buy on ask_dex (token → base)
   * 第2步: okxClient.executeSwap sell on bid_dex (base → token)
   */
  async executeTrade(signal, config, wallet, amount) {
    const chain = signal.chain || 'ETH';
    const tokenAddress = signal.token_address || '';
    const walletAddress = wallet?.wallet_address || '';
    // 套利参数：from DEX (cheap) → to DEX (expensive)
    const askDex = signal.execution_params?.ask_dex || signal.execution_params?.buy_dex || '';
    const bidDex = signal.execution_params?.bid_dex || signal.execution_params?.sell_dex || '';

    if (!tokenAddress) {
      console.log('[SpreadArbitrageTrader] executeTrade skipped: no token_address');
      return { status: 'failed', error_message: 'missing_token_address' };
    }

    try {
      console.log(`[SpreadArbitrageTrader] executeTrade: chain=${chain} token=${tokenAddress} amount=${amount}`);

      if (!this.okxClient || typeof this.okxClient.executeSwap !== 'function') {
        console.log('[SpreadArbitrageTrader] okxClient.executeSwap not available');
        return { status: 'failed', error_message: 'okxClient_not_available' };
      }

      // 第1步：在 ask DEX 买入（native → token）
      const tx1 = await this.okxClient.executeSwap({
        chain,
        fromToken: '',
        toToken: tokenAddress,
        amount: String(amount),
        slippage: parseFloat(config.slippage_tolerance || 0.005) * 100 || 0.5,
        walletAddress,
        dex: askDex || undefined,
      });

      const txHash1 = tx1?.txHash || tx1?.tx_hash || '';
      const receivedTokens = parseFloat(tx1?.estimatedOut || 0) || amount;

      console.log(`[SpreadArbitrageTrader] step1 buy: tx=${txHash1} received=${receivedTokens}`);

      // 第2步：在 bid DEX 卖出（token → native）
      const tx2 = await this.okxClient.executeSwap({
        chain,
        fromToken: tokenAddress,
        toToken: '',
        amount: String(receivedTokens),
        slippage: parseFloat(config.slippage_tolerance || 0.005) * 100 || 0.5,
        walletAddress,
        dex: bidDex || undefined,
      });

      const txHash2 = tx2?.txHash || tx2?.tx_hash || '';
      const estimatedOutUsdt = parseFloat(tx2?.estimatedOut || 0);

      console.log(`[SpreadArbitrageTrader] step2 sell: tx=${txHash2} estimated=${estimatedOutUsdt}`);
      // Verify step2 actually executed
      if (!txHash2) {
        console.error(`[SpreadArbitrageTrader] ATOMICITY BREAK: step1=${txHash1} succeeded but step2 failed. Token=${tokenAddress} on ${chain}. Manual intervention required.`);
        return {
          status: 'partial',
          error_message: 'step2_failed_atomicity_break',
          tx_hash: txHash1,
          tx_hash_2: null,
          amount_in: amount,
          estimated_out: 0,
          estimated_profit: -amount,
          detail: {
            chain, token_address: tokenAddress, ask_dex: askDex, bid_dex: bidDex,
            step1: tx1, step2: null,
            warning: 'ATOMICITY_BREAK: buy succeeded, sell failed. Tokens stuck in intermediate asset.'
          }
        };
      }

      const estimatedProfit = estimatedOutUsdt - amount;

      return {
        txHash: [txHash1, txHash2],
        tx_hash: txHash1,
        tx_hash_2: txHash2,
        amount_in: amount,
        estimated_out: estimatedOutUsdt,
        estimated_profit: estimatedProfit,
        status: 'executing',
        detail: {
          chain,
          token_address: tokenAddress,
          ask_dex: askDex,
          bid_dex: bidDex,
          step1: tx1,
          step2: tx2,
          estimated_profit_usdt: estimatedProfit,
        },
      };
    } catch (err) {
      console.log(`[SpreadArbitrageTrader] executeTrade error: ${err.message}`);
      return {
        status: 'failed',
        error_message: err.message,
        amount_in: amount,
        detail: {
          chain,
          token_address: tokenAddress,
          ask_dex: askDex,
          bid_dex: bidDex,
        },
      };
    }
  }
}

export default SpreadArbitrageTrader;
