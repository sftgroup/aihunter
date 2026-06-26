// ============================================================
// RecordWriter — 统一交易记录写入器
// ============================================================

class RecordWriter {
  constructor({ db } = {}) {
    this.db = db;
    console.log('[RecordWriter] initialized');
  }

  /**
   * 写入一条 trade_records
   * @returns {Promise<Object|null>} 插入后的记录对象
   */
  async write({ userId, strategyId, signal, config, execResult }) {
    try {
      if (!this.db) {
        console.log('[RecordWriter] no db instance, skipping write');
        return null;
      }

      const now = new Date();
      const params = {
        user_id: userId,
        strategy_id: strategyId,
        signal_id: signal?.signal_id || signal?.id || null,
        chain: signal?.chain || '',
        token_address: signal?.token_address || '',
        token_symbol: signal?.token_symbol || null,
        action: signal?.action || execResult?.action || 'buy',
        amount_in: execResult?.amount_in ?? signal?.amount_in ?? 0,
        amount_out: execResult?.amount_out ?? 0,
        entry_price_usd: execResult?.entry_price_usd ?? signal?.price_usd ?? 0,
        exit_price_usd: execResult?.exit_price_usd ?? 0,
        gross_profit_usdt: execResult?.gross_profit_usdt ?? 0,
        gas_cost_usdt: execResult?.gas_cost_usdt ?? 0,
        slippage_loss_usdt: execResult?.slippage_loss_usdt ?? 0,
        net_pnl_usdt: execResult?.net_pnl_usdt ?? 0,
        tx_hash: execResult?.tx_hash || null,
        tx_hash_2: execResult?.tx_hash_2 || null,
        execution_detail: JSON.stringify(execResult?.detail || {}),
        status: execResult?.status || 'completed',
        error_message: execResult?.error_message || null,
        created_at: now,
        completed_at: execResult?.status === 'completed' ? now : null,
      };

      const { rows } = await this.db.query(
        `INSERT INTO trade_records
           (user_id, strategy_id, signal_id, chain, token_address, token_symbol,
            action, amount_in, amount_out, entry_price_usd, exit_price_usd,
            gross_profit_usdt, gas_cost_usdt, slippage_loss_usdt, net_pnl_usdt,
            tx_hash, tx_hash_2, execution_detail, status, error_message,
            created_at, completed_at)
         VALUES
           ($1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11,
            $12, $13, $14, $15,
            $16, $17, $18, $19, $20,
            $21, $22)
         RETURNING *`,
        [
          params.user_id, params.strategy_id, params.signal_id,
          params.chain, params.token_address, params.token_symbol,
          params.action, params.amount_in, params.amount_out,
          params.entry_price_usd, params.exit_price_usd,
          params.gross_profit_usdt, params.gas_cost_usdt,
          params.slippage_loss_usdt, params.net_pnl_usdt,
          params.tx_hash, params.tx_hash_2, params.execution_detail,
          params.status, params.error_message,
          params.created_at, params.completed_at,
        ]
      );

      console.log(`[RecordWriter] trade record inserted: id=${rows[0]?.id} user=${userId} strategy=${strategyId}`);
      return rows[0] || null;
    } catch (err) {
      console.log(`[RecordWriter] write error: ${err.message}`);
      return null;
    }
  }
}

export default RecordWriter;
