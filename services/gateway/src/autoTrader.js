// AIHunter AutoTrader — 实盘自动交易执行引擎
// 监听 WebSocket 信号，经风控过滤后通过 OKX Dex Aggregator 执行买入

export class AutoTrader {
  constructor({ db, redis, okxClient, wss }) {
    this.db = db;
    this.redis = redis;
    this.okxClient = okxClient;
    this.wss = wss;
    console.log("[AutoTrader] initialized");
  }

  async onSignal(userId, signal) {
    try {
      // 1. 检查实盘交易是否已激活
      const active = await this.redis.get(`live:trading:active:${userId}`);
      if (active !== "1") {
        console.log(`[AutoTrader] skip: trading not active for ${userId}`);
        return;
      }

      // 2. 加载实盘交易配置
      const cfgResult = await this.db.query(
        "SELECT * FROM live_trading_configs WHERE user_id = $1",
        [userId]
      );
      if (cfgResult.rows.length === 0) {
        console.log(`[AutoTrader] skip: no config for ${userId}`);
        return;
      }
      const cfg = cfgResult.rows[0];

      // 3. 信号评分过滤（若配置了 min_score 字段）
      const minScore = cfg.min_score || 0;
      const signalScore = signal.score || signal.confidence || 0;
      if (signalScore < minScore) {
        console.log(`[AutoTrader] skip: score ${signalScore} < min ${minScore}`);
        return;
      }

      // 4a. 风控 — 当日亏损上限
      const dailyMaxLoss = parseFloat(cfg.daily_max_loss) || 0;
      if (dailyMaxLoss > 0) {
        const lossResult = await this.db.query(
          `SELECT COALESCE(SUM(pnl_usd), 0)::float as today_loss
           FROM live_trade_records
           WHERE user_id = $1 AND created_at >= CURRENT_DATE AND pnl_usd < 0`,
          [userId]
        );
        const todayLoss = Math.abs(lossResult.rows[0]?.today_loss || 0);
        if (todayLoss >= dailyMaxLoss) {
          console.log(`[AutoTrader] daily loss limit reached: ${todayLoss.toFixed(2)} >= ${dailyMaxLoss}, auto-stopping`);
          await this.redis.set(`live:trading:active:${userId}`, "0");
          return;
        }
      }

      // 4b. 风控 — 最大持仓数
      const maxHoldings = parseInt(cfg.max_holdings) || 0;
      if (maxHoldings > 0) {
        const holdingsResult = await this.db.query(
          `SELECT COUNT(*)::int as current_holdings FROM (
             SELECT token_out FROM live_trade_records
             WHERE user_id = $1 AND created_at >= CURRENT_DATE
             GROUP BY token_out
             HAVING SUM(CASE WHEN status = 'BUY' THEN amount_in ELSE 0 END)
                  - SUM(CASE WHEN status = 'SELL' THEN COALESCE(amount_out, 0) ELSE 0 END) > 0
           ) sub`,
          [userId]
        );
        const currentHoldings = holdingsResult.rows[0]?.current_holdings || 0;
        if (currentHoldings >= maxHoldings) {
          console.log(`[AutoTrader] skip: holdings ${currentHoldings} >= max ${maxHoldings}`);
          return;
        }
      }

      // 5. 查询已授权的 Agentic Wallet
      const walletResult = await this.db.query(
        `SELECT * FROM agentic_wallets
         WHERE user_id = $1 AND status = 'authorized' AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      if (walletResult.rows.length === 0) {
        console.log(`[AutoTrader] skip: no authorized wallet for ${userId}`);
        return;
      }
      const wallet = walletResult.rows[0];

      // 6. 计算交易金额
      const maxSingleAmount = parseFloat(cfg.max_single_amount) || 1000;
      const suggestedAmount = signal.suggested_amount || signal.amount;
      const amount = Math.min(maxSingleAmount, suggestedAmount || maxSingleAmount);

      // 交易参数
      const chain = signal.chain || wallet.chain || "ETH";
      const fromToken = "USDT";
      const toToken = signal.contract || signal.token;
      const slippage = parseFloat(cfg.slippage_tolerance) || 1.0;

      if (!toToken) {
        console.log("[AutoTrader] skip: no contract/token in signal");
        return;
      }

      // 7. 执行 OKX Swap
      let txHash = null;
      let estimatedOut = null;
      try {
        const swapResult = await this.okxClient.executeSwap({
          chain,
          fromToken,
          toToken,
          amount: String(amount),
          slippage,
          walletAddress: wallet.wallet_address,
        });
        txHash = swapResult.txHash || null;
        estimatedOut = swapResult.estimatedOut || null;
        console.log(`[AutoTrader] swap executed: tx=${txHash} out=${estimatedOut}`);
      } catch (swapErr) {
        console.error(`[AutoTrader] swap failed: ${swapErr.message}`);
      }

      // 价格：优先用 OKX 报价折算，否则从信号取
      let price = signal.price_usd || signal.price || 0;
      if (estimatedOut) {
        try {
          const outNum = parseFloat(estimatedOut);
          if (outNum > 0) price = amount / outNum;
        } catch (_) {}
      }

      // 8. 写入交易记录
      const recordStatus = txHash ? "pending" : "failed";
      const recordResult = await this.db.query(
        `INSERT INTO live_trade_records
         (user_id, strategy, chain, token_in, token_out, amount_in, amount_out, price, status, tx_hash, pnl_usd, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         RETURNING *`,
        [
          userId,
          cfg.strategy || "momentum",
          chain,
          fromToken,
          toToken,
          amount,
          amount,
          price,
          recordStatus,
          txHash,
          0,
        ]
      );
      const record = recordResult.rows[0];

      // 9. WebSocket 广播 TRADE_EXECUTED
      try {
        const wsServer = this.wss;
        if (wsServer && wsServer.clients && wsServer.clients.size > 0) {
          const msg = JSON.stringify({ type: "TRADE_EXECUTED", data: record });
          for (const client of wsServer.clients) {
            try {
              client.send(msg);
            } catch (_) {
              /* per-client send error */
            }
          }
        }
      } catch (broadcastErr) {
        console.error("[AutoTrader] broadcast error:", broadcastErr.message);
      }

      console.log(
        `[AutoTrader] trade recorded: id=${record.id} user=${userId} token=${toToken} amount=${amount} status=${recordStatus}`
      );
    } catch (err) {
      console.error("[AutoTrader] onSignal error:", err.message);
    }
  }
}
