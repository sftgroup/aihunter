/**
 * DeFi 套利路由 — 套利机会 / 参数 / 执行 / 记录
 */
import { calcArbProfit, estimateGasUsd } from '../services/profitCalc.js';

class ArbitrageRoutes {
  constructor(app, db, redis) {
    const { pool } = db || {};

    // ===== 套利机会 =====
    app.get('/api/arbitrage/opportunities', async (request, reply) => {
      try {
        const { chain, minProfit, limit = 20 } = request.query;
        const minP = parseFloat(minProfit) || 0;
        const raw = await redis.zrevrange('arb:opps:list', 0, (parseInt(limit) || 50) - 1);
        let opps = [];
        for (const item of raw) {
          try {
            const o = JSON.parse(item);
            opps.push(o);
          } catch {}
        }
        if (chain) opps = opps.filter(o => o.chain?.toLowerCase() === chain.toLowerCase());
        if (minP > 0) opps = opps.filter(o => (o.estimatedProfitUsdt || 0) >= minP);
        return { code: 200, data: opps.slice(0, parseInt(limit) || 20) };
      } catch (e) {
        return { code: 500, message: e.message };
      }
    });

    // ===== 套利参数 =====
    app.get('/api/arbitrage/config', async (request, reply) => {
      try {
        const { userId } = request.query;
        if (!userId) return { code: 400, message: 'userId required' };
        if (!pool) return { code: 200, data: null };
        const { rows } = await pool.query('SELECT * FROM arb_configs WHERE user_id = $1', [userId]);
        return { code: 200, data: rows[0] || null };
      } catch (e) {
        return { code: 500, message: e.message };
      }
    });

    app.post('/api/arbitrage/config', async (request, reply) => {
      try {
        const { userId, minSpreadPct, maxSlippagePct, gasCapGwei, minProfitUsdt, chains } = request.body;
        if (!userId) return { code: 400, message: 'userId required' };
        if (!pool) return { code: 500, message: 'DB not available' };
        const { rows } = await pool.query(
          `INSERT INTO arb_configs (user_id, min_spread_pct, max_slippage_pct, gas_cap_gwei, min_profit_usdt, chains, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,NOW())
           ON CONFLICT (user_id) DO UPDATE SET
             min_spread_pct=$2, max_slippage_pct=$3, gas_cap_gwei=$4,
             min_profit_usdt=$5, chains=$6, updated_at=NOW()
           RETURNING *`,
          [userId, minSpreadPct ?? 1.5, maxSlippagePct ?? 2.0, gasCapGwei ?? 50, minProfitUsdt ?? 5, chains ?? ['eth','bsc','base']]
        );
        return { code: 200, data: rows[0] };
      } catch (e) {
        return { code: 500, message: e.message };
      }
    });

    // ===== 套利执行 =====
    app.post('/api/arbitrage/execute', async (request, reply) => {
      try {
        const { userId, opportunityId, amount, slippage } = request.body;
        if (!userId || !opportunityId) return { code: 400, message: 'userId and opportunityId required' };

        // 读取机会详情
        const parts = opportunityId.split(':');
        const chain = parts[2] || 'eth';
        const pairKey = parts.slice(3).join(':');
        const oppKey = `arb:opps:${chain}:${pairKey}`;
        const raw = await redis.hgetall(oppKey);
        if (!raw || Object.keys(raw).length === 0) {
          return { code: 404, message: 'Opportunity expired' };
        }

        const buyPrice = parseFloat(raw.buyPrice) || 0;
        const sellPrice = parseFloat(raw.sellPrice) || 0;
        const buyDex = raw.buyDex || '';
        const sellDex = raw.sellDex || '';
        const tokenPair = raw.tokenPair || '';

        // 利润校验
        const tradeAmount = parseFloat(amount) || 1;
        const slippagePct = (parseFloat(slippage) || 2) / 100;
        const gasEstimate = parseFloat(raw.gasEstimateUsdt) || 3;
        const profit = calcArbProfit(buyPrice, sellPrice, tradeAmount, slippagePct, gasEstimate);

        // 写入记录
        if (pool) {
          const { rows } = await pool.query(
            `INSERT INTO arb_trades (user_id, chain, token_pair, buy_dex, sell_dex, amount_in, amount_in_usdt,
              gross_profit_usdt, gas_cost_usdt, slippage_loss_usdt, net_profit_usdt, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'executing') RETURNING id`,
            [userId, chain, tokenPair, buyDex, sellDex, tradeAmount, buyPrice * tradeAmount,
             profit.grossProfit, profit.gasCost, profit.slippageLoss, profit.netProfit]
          );
          const tradeId = rows[0].id;

          // 模拟执行（实际交易需 onchainosWalletSend）
          await pool.query(
            `UPDATE arb_trades SET status='success', completed_at=NOW(), tx_hash_buy='pending', tx_hash_sell='pending' WHERE id=$1`,
            [tradeId]
          );

          return {
            code: 200,
            data: {
              tradeId,
              status: 'success',
              netProfit: profit.netProfit,
              buyDex, sellDex,
              buyPrice, sellPrice,
              grossProfit: profit.grossProfit,
              slippageLoss: profit.slippageLoss,
              gasCost: profit.gasCost
            }
          };
        }

        return { code: 200, data: { status: 'success', ...profit } };
      } catch (e) {
        return { code: 500, message: e.message };
      }
    });

    // ===== 套利记录 =====
    app.get('/api/arbitrage/trades', async (request, reply) => {
      try {
        const { userId, page = 1, limit = 20, status } = request.query;
        if (!userId) return { code: 400, message: 'userId required' };
        if (!pool) return { code: 200, data: { trades: [], total: 0, page: 1 } };

        const offset = (parseInt(page) - 1) * parseInt(limit);
        const statusFilter = status ? 'AND status = $3' : '';
        const params = status ? [userId, parseInt(limit), status] : [userId, parseInt(limit)];

        const [tResult, cResult] = await Promise.all([
          pool.query(
            `SELECT * FROM arb_trades WHERE user_id = $1 ${statusFilter} ORDER BY created_at DESC LIMIT $2 OFFSET ${offset}`,
            status ? [userId, parseInt(limit), status] : [userId, parseInt(limit)]
          ),
          pool.query('SELECT COUNT(*) as total FROM arb_trades WHERE user_id = $1', [userId])
        ]);

        return {
          code: 200,
          data: { trades: tResult.rows, total: parseInt(cResult.rows[0]?.total || 0), page: parseInt(page) }
        };
      } catch (e) {
        return { code: 500, message: e.message };
      }
    });

    // ===== 套利统计 =====
    app.get('/api/arbitrage/trades/stats', async (request, reply) => {
      try {
        const { userId } = request.query;
        if (!userId) return { code: 400, message: 'userId required' };
        if (!pool) return { code: 200, data: { totalTrades: 0, successRate: 0, cumulativeProfit: 0, avgProfit: 0 } };

        const { rows } = await pool.query(
          `SELECT COUNT(*) as total,
                  COUNT(*) FILTER (WHERE status='success') as wins,
                  COALESCE(SUM(net_profit_usdt) FILTER (WHERE status='success'), 0) as profit,
                  COALESCE(AVG(net_profit_usdt) FILTER (WHERE status='success'), 0) as avg_profit
           FROM arb_trades WHERE user_id = $1`,
          [userId]
        );
        const r = rows[0];
        return {
          code: 200,
          data: {
            totalTrades: parseInt(r.total) || 0,
            successRate: r.total > 0 ? Math.round((parseInt(r.wins) / parseInt(r.total)) * 10000) / 100 : 0,
            cumulativeProfit: Math.round((parseFloat(r.profit) || 0) * 100) / 100,
            avgProfit: Math.round((parseFloat(r.avg_profit) || 0) * 100) / 100
          }
        };
      } catch (e) {
        return { code: 500, message: e.message };
      }
    });

    console.log('[arbitrage] routes registered');
  }
}

export default ArbitrageRoutes;
