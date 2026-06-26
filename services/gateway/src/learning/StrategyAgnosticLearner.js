/**
 * AIHunter V3 Phase 3 — 通用学习引擎
 * 策略无关的学习层，分析交易记录并生成优化建议
 *
 * 适配现有数据库 schema:
 *   trade_records: id, strategy_id, chain, token_address, token_symbol, action,
 *                  amount_in, amount_out, entry_price_usd, exit_price_usd,
 *                  net_pnl_usdt, status, error_message, created_at, completed_at, execution_detail
 *   learning_history: id, strategy, params (jsonb), rules (jsonb), score,
 *                     experience_count, created_at
 */

export class StrategyAgnosticLearner {
  constructor({ db, redis, deepseekClient } = {}) {
    this.db = db;
    this.redis = redis;
    this.deepseekClient = deepseekClient;
    this.inProgress = new Set();
  }

  /**
   * 触发学习
   * @param {string} strategyId
   * @returns {Promise<{version, metrics, suggestions, ai_analysis}>}
   */
  async triggerLearning(strategyId) {
    try {
      if (this.inProgress.has(strategyId)) {
        console.log('[Learning] ' + strategyId + ' 学习已在执行中，跳过');
        return { version: -1, metrics: null, suggestions: [], ai_analysis: null, skipped: true };
      }
      this.inProgress.add(strategyId);
      console.log('[Learning] 开始学习策略: ' + strategyId);

      // ① 查询策略注册信息
      const regResult = await this.db.query(
        'SELECT * FROM strategy_registry WHERE strategy_id = $1',
        [strategyId]
      );
      if (regResult.rows.length === 0) {
        throw new Error('策略 ' + strategyId + ' 未在 strategy_registry 中注册');
      }

      // ② 查询最近 200 条 completed + failed 交易
      const tradesResult = await this.db.query(
        'SELECT id, strategy_id, chain, token_address, token_symbol, '
        + 'action, net_pnl_usdt, status, error_message, execution_detail, '
        + 'created_at, completed_at, '
        + "EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000 AS execution_ms "
        + 'FROM trade_records '
        + "WHERE strategy_id = $1 AND (status = 'completed' OR status = 'failed') "
        + 'ORDER BY created_at DESC LIMIT 200',
        [strategyId]
      );
      const trades = tradesResult.rows;

      // 也查询信号相关的字段（如果用 strategy_id 匹配不到可用 data_signal 表）
      // 先从 execution_detail 中提取风险信息
      for (const t of trades) {
        try {
          const detail = typeof t.execution_detail === 'string'
            ? JSON.parse(t.execution_detail)
            : (t.execution_detail || {});
          t.confidence = detail.confidence || null;
          t.risk_level = detail.risk_level || null;
          t.flags = detail.flags || [];
        } catch {
          t.confidence = null;
          t.risk_level = null;
          t.flags = [];
        }
      }

      if (trades.length === 0) {
        console.log('[Learning] ' + strategyId + ' 无交易记录，跳过学习');
        return { version: 0, metrics: { total_trades: 0 }, suggestions: [], ai_analysis: null };
      }

      // ③ 计算学习指标
      const metrics = this._computeMetrics(trades);

      // 记录当前最大 trade_id 用于后续检测触发
      const maxId = trades.reduce((m, t) => Math.max(m, parseInt(t.id) || 0), 0);
      metrics._max_trade_id = maxId;

      // ④ 获取当前版本号（使用 score 字段作为版本号）
      const versionResult = await this.db.query(
        'SELECT COALESCE(MAX(score), 0) AS v FROM learning_history WHERE strategy = $1',
        [strategyId]
      );
      const version = parseInt(versionResult.rows[0].v) + 1;

      // ⑤ 生成优化建议（基于规则）
      const suggestions = this._generateSuggestions(metrics);

      // ⑥ AI 分析（如果有 deepseekClient）
      let ai_analysis = null;
      if (this.deepseekClient) {
        try {
          ai_analysis = await this._aiAnalysis(strategyId, trades.slice(0, 50));
        } catch (aiErr) {
          console.error('[Learning] AI分析失败:', aiErr.message);
          ai_analysis = { error: aiErr.message };
        }
      }

      // ⑦ 写入 learning_history 表（使用现有 schema）
      const params = { ...metrics, ai_analysis };
      await this.db.query(
        'INSERT INTO learning_history (strategy, params, rules, score, experience_count, created_at) '
        + 'VALUES ($1, $2, $3, $4, $5, NOW())',
        [
          strategyId,
          JSON.stringify(params),
          JSON.stringify(suggestions),
          version,
          metrics.total_trades
        ]
      );

      // ⑧ 写入 learning_rules 表（如果已存在该表）
      for (const suggestion of suggestions) {
        if (suggestion.rule_key && suggestion.rule_value !== undefined) {
          try {
            await this.db.query(
              'INSERT INTO learning_rules (strategy_id, rule_type, rule_key, rule_value, reason, confidence) '
              + 'VALUES ($1, $2, $3, $4, $5, $6) '
              + 'ON CONFLICT DO NOTHING',
              [
                strategyId,
                suggestion.rule_type || 'param',
                suggestion.rule_key,
                suggestion.rule_value,
                suggestion.reason || null,
                suggestion.confidence || 0.5
              ]
            );
          } catch (e) {
            // learning_rules 表可能还不存在，忽略
          }
        }
      }

      // 缓存到 Redis
      const cacheKey = 'learning:latest:' + strategyId;
      await this.redis.set(cacheKey, JSON.stringify({
        version, metrics, suggestions, ai_analysis,
        created_at: new Date().toISOString()
      }), 'EX', 86400);

      console.log('[Learning] ' + strategyId + ' 学习完成 v' + version
        + ': 胜率=' + metrics.win_rate + '% 平均利润=$' + metrics.avg_profit
        + ' 建议数=' + suggestions.length);
      return { version, metrics, suggestions, ai_analysis };
    } catch (err) {
      console.error('[Learning] ' + strategyId + ' 学习异常:', err.message);
      throw err;
    } finally {
      this.inProgress.delete(strategyId);
    }
  }

  /**
   * 计算学习指标
   */
  _computeMetrics(trades) {
    const completed = trades.filter(t => t.status === 'completed');
    const failed = trades.filter(t => t.status === 'failed');
    const totalTrades = trades.length;
    const completedCount = completed.length;

    // 胜率 (net_pnl_usdt > 0)
    const wins = completed.filter(t => parseFloat(t.net_pnl_usdt || 0) > 0).length;
    const winRate = completedCount > 0
      ? parseFloat(((wins / completedCount) * 100).toFixed(2))
      : 0;

    // 平均利润
    const totalPnl = completed.reduce((s, t) => s + parseFloat(t.net_pnl_usdt || 0), 0);
    const avgProfit = completedCount > 0 ? parseFloat((totalPnl / completedCount).toFixed(4)) : 0;

    // 今日交易量
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayTrades = trades.filter(t => new Date(t.created_at) >= todayStart).length;

    // 平均执行时间
    const execTimes = completed
      .filter(t => t.execution_ms !== null)
      .map(t => parseFloat(t.execution_ms));
    const avgExecutionMs = execTimes.length > 0
      ? Math.round(execTimes.reduce((s, v) => s + v, 0) / execTimes.length)
      : 0;

    // 按 token 分组统计
    const tokenGroups = {};
    for (const t of trades) {
      const addr = t.token_address || 'unknown';
      if (!tokenGroups[addr]) {
        tokenGroups[addr] = {
          token: addr,
          symbol: t.token_symbol || addr.slice(0, 8),
          total: 0, wins: 0, pnl: 0
        };
      }
      tokenGroups[addr].total++;
      if (t.status === 'completed') {
        const pnl = parseFloat(t.net_pnl_usdt || 0);
        tokenGroups[addr].pnl += pnl;
        if (pnl > 0) tokenGroups[addr].wins++;
      }
    }

    // 连续失败统计
    let consecutiveLosses = 0;
    let maxConsecutiveLosses = 0;
    const reversed = [...trades].reverse();
    for (const t of reversed) {
      const pnl = parseFloat(t.net_pnl_usdt || 0);
      if (t.status === 'completed' && pnl <= 0) {
        consecutiveLosses++;
        if (consecutiveLosses > maxConsecutiveLosses) {
          maxConsecutiveLosses = consecutiveLosses;
        }
      } else {
        consecutiveLosses = 0;
      }
    }

    // 最近3笔检查
    const recent3 = trades.slice(0, 3);
    const recent3Failed = recent3.filter(t => t.status === 'failed').length;

    // 链分布
    const chainDistribution = {};
    for (const t of trades) {
      const c = t.chain || 'unknown';
      chainDistribution[c] = (chainDistribution[c] || 0) + 1;
    }

    return {
      total_trades: totalTrades,
      completed_count: completedCount,
      failed_count: failed.length,
      win_rate: winRate,
      wins,
      losses: completedCount - wins,
      avg_profit: avgProfit,
      total_pnl: parseFloat(totalPnl.toFixed(4)),
      today_trades: todayTrades,
      avg_execution_ms: avgExecutionMs,
      consecutive_losses: consecutiveLosses,
      max_consecutive_losses: maxConsecutiveLosses,
      recent_3_failed: recent3Failed,
      token_groups: tokenGroups,
      chain_distribution: chainDistribution
    };
  }

  /**
   * 基于规则生成优化建议
   */
  _generateSuggestions(metrics) {
    const suggestions = [];

    if (metrics.win_rate < 40 && metrics.total_trades >= 10) {
      suggestions.push({
        rule_type: 'threshold',
        rule_key: 'min_score',
        rule_value: 65,
        reason: '胜率仅 ' + metrics.win_rate + '%（低于40%），建议提高 min_score 阈值到 65 以上',
        confidence: 0.7,
        action: 'increase_min_score'
      });
    }

    if (metrics.avg_profit < 0 && metrics.total_trades >= 5) {
      suggestions.push({
        rule_type: 'param',
        rule_key: 'max_single_amount',
        rule_value: 50,
        reason: '平均利润为负 ($' + metrics.avg_profit + ')，建议缩小最大单笔仓位金额至 $50',
        confidence: 0.6,
        action: 'reduce_position_size'
      });
    }

    if (metrics.avg_execution_ms > 30000 && metrics.total_trades >= 5) {
      suggestions.push({
        rule_type: 'param',
        rule_key: 'slippage',
        rule_value: 3,
        reason: '平均执行时间 ' + Math.round(metrics.avg_execution_ms / 1000)
          + ' 秒（超过 30 秒），建议增加滑点容忍度至 3%',
        confidence: 0.5,
        action: 'increase_slippage'
      });
    }

    if (metrics.recent_3_failed >= 3 && metrics.total_trades >= 5) {
      suggestions.push({
        rule_type: 'param',
        rule_key: 'max_single_amount',
        rule_value: 30,
        reason: '最近3笔交易全部失败，建议大幅降低最大单笔仓位金额至 $30',
        confidence: 0.8,
        action: 'reduce_position_size_urgent'
      });
    }

    if (metrics.consecutive_losses >= 5) {
      suggestions.push({
        rule_type: 'action',
        rule_key: 'pause_trading',
        rule_value: 1,
        reason: '连续 ' + metrics.consecutive_losses + ' 笔亏损，建议暂停交易进行策略调整',
        confidence: 0.75,
        action: 'pause_trading'
      });
    }

    return suggestions;
  }

  /**
   * AI 分析（使用 DeepSeek）
   */
  async _aiAnalysis(strategyId, trades) {
    if (!this.deepseekClient) return null;

    const tradeSummary = trades.map((t, i) => ({
      index: i + 1,
      chain: t.chain,
      action: t.action,
      token: t.token_symbol || t.token_address,
      net_pnl: parseFloat(t.net_pnl_usdt || 0),
      status: t.status,
      execution_ms: t.execution_ms ? Math.round(parseFloat(t.execution_ms)) : null
    }));

    const prompt = '你是一个加密货币交易策略分析师。分析以下策略 "' + strategyId
      + '" 的最近 ' + trades.length + ' 笔交易数据，输出JSON格式的分析报告。\n\n'
      + '交易数据：\n' + JSON.stringify(tradeSummary, null, 2) + '\n\n'
      + '请分析并输出以下JSON结构（只输出JSON，不要其他文字）：\n'
      + '{\n'
      + '  "pattern": "交易模式描述",\n'
      + '  "strengths": ["优势1", "优势2"],\n'
      + '  "weaknesses": ["劣势1", "劣势2"],\n'
      + '  "recommendations": ["建议1", "建议2"],\n'
      + '  "optimal_conditions": {"chain": "表现最好的链", "confidence_range": [最低, 最高]},\n'
      + '  "risk_assessment": "low/medium/high",\n'
      + '  "profitability_score": 0-100,\n'
      + '  "key_insight": "核心洞察（一句话）"\n'
      + '}';

    const response = await this.deepseekClient.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是一个专业的加密货币交易策略分析师。只输出JSON，不要其他文字。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    try {
      return JSON.parse(response.choices[0].message.content);
    } catch (parseErr) {
      return { error: 'AI响应解析失败', raw: response.choices[0].message.content };
    }
  }

  /**
   * 获取最新学习记录
   */
  async getLatestLearning(strategyId) {
    try {
      // 先查 Redis 缓存
      const cacheKey = 'learning:latest:' + strategyId;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // 查 DB (现有 schema: strategy, params, rules, score, created_at)
      const result = await this.db.query(
        'SELECT strategy, params, rules, score, experience_count, created_at '
        + 'FROM learning_history '
        + 'WHERE strategy = $1 '
        + 'ORDER BY score DESC LIMIT 1',
        [strategyId]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      const params = typeof row.params === 'string'
        ? JSON.parse(row.params) : (row.params || {});
      const rules = typeof row.rules === 'string'
        ? JSON.parse(row.rules) : (row.rules || []);

      const data = {
        strategy_id: row.strategy,
        version: row.score,
        metrics: params,
        suggestions: rules,
        ai_analysis: params.ai_analysis || null,
        created_at: row.created_at
      };

      // 写回缓存
      await this.redis.set(cacheKey, JSON.stringify(data), 'EX', 86400);
      return data;
    } catch (err) {
      console.error('[Learning] 获取最新学习记录失败:', err.message);
      return null;
    }
  }
}
