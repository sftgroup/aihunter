// ============================================================
// MomentumTrader — 动量策略交易插件
// extends BaseAutoTrader
// ============================================================

import BaseAutoTrader from '../BaseAutoTrader.js';

class MomentumTrader extends BaseAutoTrader {
  /**
   * 信号过滤：score >= config.min_score
   */
  async passSignalFilter(signal, config) {
    const minScore = parseFloat(config.min_score || 0);
    const score = parseFloat(signal.score || signal.risk_score || 0);
    const passed = score >= minScore;
    console.log(`[MomentumTrader] passSignalFilter: score=${score} min_score=${minScore} → ${passed ? '✅' : '❌'}`);
    return passed;
  }

  /**
   * 计算交易金额：signal.confidence × config.max_single_amount (最少 50)
   */
  async calculateAmount(signal, config, wallet) {
    const confidence = parseFloat(signal.confidence || 50) / 100; // 转为 0-1
    const maxAmount = parseFloat(config.max_single_amount || 0);
    let amount = Math.round((confidence * maxAmount) * 100) / 100;
    if (amount < 50) amount = 50;
    console.log(`[MomentumTrader] calculateAmount: confidence=${confidence} max=${maxAmount} → ${amount}`);
    return amount;
  }

  /**
   * 执行交易：通过 okxClient 执行 swap
   */
  async executeTrade(signal, config, wallet, amount) {
    const chain = signal.chain || 'ETH';
    const tokenAddress = signal.token_address || '';
    const walletAddress = wallet?.wallet_address || '';

    if (!tokenAddress) {
      console.log('[MomentumTrader] executeTrade skipped: no token_address');
      return { status: 'failed', error_message: 'missing_token_address' };
    }

    try {
      console.log(`[MomentumTrader] executeTrade: chain=${chain} token=${tokenAddress} amount=${amount} wallet=${walletAddress}`);

      if (!this.okxClient || typeof this.okxClient.executeSwap !== 'function') {
        console.log('[MomentumTrader] okxClient.executeSwap not available');
        return { status: 'failed', error_message: 'okxClient_not_available' };
      }

      // 买入：从 native token（'' 表示 ETH/BNB）换为目标 token
      const result = await this.okxClient.executeSwap({
        chain,
        fromToken: '',        // native token (ETH/BNB/SOL)
        toToken: tokenAddress,
        amount: String(amount),
        slippage: parseFloat(config.slippage_tolerance || 0.005) * 100 || 0.5,
        walletAddress,
      });

      const txHash = result?.txHash || result?.tx_hash || '';
      const estimatedOut = result?.estimatedOut || 0;

      console.log(`[MomentumTrader] trade executed: txHash=${txHash} amount_in=${amount}`);

      return {
        txHash,
        amount_in: amount,
        estimated_out: estimatedOut,
        status: 'executing',
        detail: {
          chain,
          token_address: tokenAddress,
          result,
        },
      };
    } catch (err) {
      console.log(`[MomentumTrader] executeTrade error: ${err.message}`);
      return {
        status: 'failed',
        error_message: err.message,
        amount_in: amount,
        detail: { chain, token_address: tokenAddress },
      };
    }
  }
}

export default MomentumTrader;
