/**
 * DeFi 套利利润计算引擎（纯函数）
 */

/**
 * 计算套利净利润
 */
export function calcArbProfit(buyPrice, sellPrice, amount, slippagePct = 0.02, gasUsd = 0) {
  const cost = buyPrice * amount;
  const revenue = sellPrice * amount;
  const grossProfit = revenue - cost;
  const slippageLoss = cost * slippagePct * 2; // 买入+卖出双向滑点
  const netProfit = grossProfit - slippageLoss - gasUsd;
  const roi = cost > 0 ? (netProfit / cost) * 100 : 0;
  return {
    grossProfit: Math.round(grossProfit * 100) / 100,
    slippageLoss: Math.round(slippageLoss * 100) / 100,
    gasCost: Math.round(gasUsd * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    roi: Math.round(roi * 100) / 100
  };
}

/**
 * 估算 Gas 费 (USD)
 */
export function estimateGasUsd(gasPriceGwei, ethPriceUsd = 2000) {
  const gasLimitPerSwap = 150000;
  const totalGas = gasLimitPerSwap * 2; // buy + sell
  const gasEth = (totalGas * gasPriceGwei) / 1e9;
  return Math.round(gasEth * ethPriceUsd * 100) / 100;
}
