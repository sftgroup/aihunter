
export class LiveTradingRoutes {
  constructor(fastify, deps = {}) {
    this.fastify = fastify;
    this.db = deps.db;
    this.redis = deps.redis;
    this.okx = deps.okx || {};

    if (!this.okx?.onchainosLogin) {
      console.error('[liveTrading] OKX module missing onchainosLogin');
    }

    // 公开路由（无需 token）
    this.fastify.post('/api/agentic-wallet/login', this.sendOtp.bind(this));
    this.fastify.post('/api/agentic-wallet/verify', this.verifyOtp.bind(this));
    this.fastify.get('/api/agentic-wallet/status', this.getWallets.bind(this));
    this.fastify.post('/api/agentic-wallet/switch', this.switchWallet.bind(this));
    this.fastify.post('/api/agentic-wallet/logout', this.logoutWallet.bind(this));

    console.log('[liveTrading] routes registered: login/verify/status/switch/logout');
  }

  // ===== 发送验证码（每次都要，仅用于创建新地址）=====
  async sendOtp(request, reply) {
    try {
      const { userId, email } = request.body || {};
      if (!userId || !email) {
        return reply.status(400).send({ code: 400, message: '缺少 userId 或 email' });
      }

      const { onchainosLogin } = this.okx;
      if (!onchainosLogin) {
        return reply.status(500).send({ code: 500, message: 'onchainos 模块未加载' });
      }

      const result = await onchainosLogin(userId, email);
      if (!result.ok) {
        return reply.status(400).send({ code: 400, message: result.error || '发送验证码失败' });
      }

      // 保存邮箱到 Redis（10 分钟有效）
      await this.redis.set(`agentic:login:${userId}`, email, 'EX', 600);

      return reply.send({ code: 200, message: '验证码已发送到邮箱', data: { email } });
    } catch (error) {
      console.error('[sendOtp]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }

  // ===== 验证 + 创建新地址（每次 OTP 验完都建新地址）=====
  async verifyOtp(request, reply) {
    try {
      const { userId, code, chain = 'ethereum', label } = request.body || {};
      if (!userId || !code) {
        return reply.status(400).send({ code: 400, message: '缺少 userId 或验证码' });
      }

      const { onchainosVerifyOtp, onchainosWalletAdd, onchainosWalletAddresses,
              getWalletBalances } = this.okx;
      if (!onchainosVerifyOtp) {
        return reply.status(500).send({ code: 500, message: 'onchainos 模块未加载' });
      }

      const email = await this.redis.get(`agentic:login:${userId}`);
      if (!email) {
        return reply.status(400).send({ code: 400, message: '登录会话已过期，请重新发起登录' });
      }

      // 验证 OTP
      const verifyResult = await onchainosVerifyOtp(userId, code);
      if (!verifyResult.ok) {
        return reply.status(400).send({ code: 400, message: verifyResult.message || verifyResult.error || '验证码错误' });
      }

      // 创建新地址
      if (onchainosWalletAdd) {
        try {
          const addResult = await onchainosWalletAdd(userId);
          console.log('[verifyOtp] wallet add:', JSON.stringify(addResult).slice(0, 200));
        } catch (e) {
          console.warn('[verifyOtp] wallet add 失败:', e.message);
        }
      }

      // 获取最新地址 + 余额
      let walletAddress = '', totalUsd = 0, balances = [];
      if (onchainosWalletAddresses) {
        try {
          const addrResult = await onchainosWalletAddresses(userId);
          const addrs = addrResult.data || addrResult;
          const evmList = addrs.evm || [];
          if (evmList.length > 0) {
            walletAddress = evmList[evmList.length - 1].address || '';
          }
          console.log('[verifyOtp] addresses:', JSON.stringify(addrs).slice(0, 300));
        } catch (e) { console.warn('[verifyOtp] 地址查询失败:', e.message); }
      }

      if (!walletAddress) {
        return reply.status(500).send({ code: 500, message: '创建地址失败，请重试' });
      }

      // 查余额
      if (getWalletBalances) {
        try {
          const balResult = await getWalletBalances(userId, chain);
          balances = balResult.balances || [];
          totalUsd = balResult.totalUsd || 0;
        } catch (_) {}
      }

      // 存库
      const existing = await this.db.query(
        `SELECT id FROM agentic_wallets WHERE user_id = $1 AND wallet_address = $2`,
        [userId, walletAddress]
      );

      const chainUpper = chain.toUpperCase();
      if (existing.rows.length > 0) {
        const addrLabel = label || `Wallet #${existing.rows[0].id}`;
        await this.db.query(
          `UPDATE agentic_wallets SET status = 'active', authorized_at = NOW(), label = $1 WHERE id = $2`,
          [addrLabel, existing.rows[0].id]
        );
      } else {
        const shortAddr = walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4);
        const addrLabel = label || shortAddr;
        const countResult = await this.db.query(
          `SELECT COUNT(*) as cnt FROM agentic_wallets WHERE user_id = $1 AND status = 'active'`,
          [userId]
        );
        const isFirst = parseInt(countResult.rows[0].cnt) === 0;

        await this.db.query(
          `INSERT INTO agentic_wallets (user_id, wallet_address, chain, status, email, label, is_default, created_at, authorized_at)
           VALUES ($1, $2, $3, 'active', $4, $5, $6, NOW(), NOW())`,
          [userId, walletAddress, chainUpper, email, addrLabel, isFirst]
        );
      }

      // 读回记录
      const result = await this.db.query(
        `SELECT * FROM agentic_wallets WHERE user_id = $1 AND wallet_address = $2`,
        [userId, walletAddress]
      );

      await this.redis.del(`agentic:login:${userId}`);
      return reply.send({
        code: 200,
        message: '新地址创建成功',
        data: { ...result.rows[0], authorized: true, balances, totalUsd },
      });
    } catch (error) {
      console.error('[verifyOtp]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }

  // ===== 获取用户所有钱包（无需 OTP，直接从 DB）=====
  async getWallets(request, reply) {
    try {
      const { userId } = request.query || {};
      if (!userId) return reply.status(400).send({ code: 400, message: '缺少 userId' });

      const { getWalletBalances } = this.okx;
      const result = await this.db.query(
        `SELECT * FROM agentic_wallets WHERE user_id = $1 AND status = 'active' ORDER BY is_default DESC, created_at DESC`,
        [userId]
      );

      const wallets = result.rows;
      for (const w of wallets) {
        w.authorized = !!w.authorized_at;
        // 查余额（离线也继续）
        const chain = (w.chain || 'ETH') === 'ETH' ? 'ethereum' : w.chain?.toLowerCase() || 'ethereum';
        if (getWalletBalances) {
          try {
            const bal = await getWalletBalances(userId, chain);
            w.balances = bal.balances || [];
            w.totalUsd = bal.totalUsd || 0;
          } catch (_) {}
        } else {
          w.balances = []; w.totalUsd = 0;
        }
      }

      return reply.send({ code: 200, data: wallets });
    } catch (error) {
      console.error('[getWallets]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }

  // ===== 切换默认钱包 =====
  async switchWallet(request, reply) {
    try {
      const { userId, walletAddress } = request.body || {};
      if (!userId || !walletAddress) {
        return reply.status(400).send({ code: 400, message: '缺少 userId 或 walletAddress' });
      }

      await this.db.query(`UPDATE agentic_wallets SET is_default = false WHERE user_id = $1`, [userId]);
      await this.db.query(
        `UPDATE agentic_wallets SET is_default = true WHERE user_id = $1 AND wallet_address = $2`,
        [userId, walletAddress]
      );

      return reply.send({ code: 200, message: '已切换默认钱包', data: { walletAddress } });
    } catch (error) {
      console.error('[switchWallet]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }

  // ===== 断开连接 =====
  async logoutWallet(request, reply) {
    try {
      const { userId } = request.body || {};
      if (!userId) return reply.status(400).send({ code: 400, message: '缺少 userId' });

      const { onchainosLogout } = this.okx;
      if (onchainosLogout) {
        try { await onchainosLogout(userId); } catch (_) {}
      }

      return reply.send({ code: 200, message: '已断开连接，钱包地址不变' });
    } catch (error) {
      console.error('[logoutWallet]', error);
      return reply.status(500).send({ code: 500, message: error.message });
    }
  }
}

export default LiveTradingRoutes;
