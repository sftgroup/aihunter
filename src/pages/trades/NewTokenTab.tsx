import { useState, useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import {
  RefreshCw, Save,
  Trash2,
} from 'lucide-react';
import * as echarts from 'echarts';
import { paperApi, learningApi } from '../../utils/api';
import type { PaperTrade, EquitySnapshot, LearningHistory } from '../../types/api';

const cardBase: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
};



export default function NewTokenTab() {
  const { isConnected } = useAccount();
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [equity, setEquity] = useState<EquitySnapshot[]>([]);
  const [_learning, _setLearning] = useState<LearningHistory[]>([]);
  const [_config, _setConfig] = useState({
    initial_balance: 10000, min_amount: 100, max_amount: 500,
    take_profit_pct: 30, stop_loss_pct: -20, enabled: true,
  });
  const [btResult, setBtResult] = useState<any>(null);
  const [btLoading, setBtLoading] = useState(false);

  const equityRef = useRef<HTMLDivElement>(null);
  const winRateRef = useRef<HTMLDivElement>(null);
  const cumPnlRef = useRef<HTMLDivElement>(null);
  const learnRef = useRef<HTMLDivElement>(null);
  const btChartRef = useRef<HTMLDivElement>(null);
  const chartInstances = useRef<Map<string, echarts.ECharts>>(new Map());

  // Load data
  useEffect(() => {
    loadAll();
    const interval = setInterval(loadTrades, 10000);
    return () => clearInterval(interval);
  }, []);

  function loadAll() {
    loadTrades();
    loadEquity();
    loadConfig();
    loadLearning();
  }

  // 修复后端返回的字符串数字为数字类型
  function normalizeTrade(t: any): PaperTrade {
    return {
      ...t,
      amount_usd: parseFloat(t.amount_usd) || 0,
      pnl_usd: parseFloat(t.pnl_usd) || 0,
      pnl_pct: parseFloat(t.pnl_pct) || 0,
      entry_price: parseFloat(t.entry_price) || 0,
      exit_price: t.exit_price ? parseFloat(t.exit_price) : undefined as any,
      quantity: parseFloat(t.quantity) || 0,
      confidence: typeof t.confidence === 'string' ? parseInt(t.confidence) : (t.confidence || 0),
      liquidity_usd: parseFloat(t.liquidity_usd) || 0,
      price_impact: parseFloat(t.price_impact) || 0,
      sell_price_impact: parseFloat(t.sell_price_impact) || 0,
    } as PaperTrade;
  }

  async function loadTrades() {
    const res = await paperApi.getTrades(200);
    if (res.code === 200 && res.data) {
      // API 返回 { balance, openPositions, closedTrades, stats }
      const data = res.data as any;
      const all: PaperTrade[] = [];
      if (Array.isArray(data.openPositions)) all.push(...data.openPositions.map(normalizeTrade));
      if (Array.isArray(data.closedTrades)) all.push(...data.closedTrades.map(normalizeTrade));
      setTrades(all);
    }
  }

  async function loadEquity() {
    const res = await paperApi.getEquity();
    if (res.code === 200) {
      const eqData = (res.data || []).map((e: any) => ({
        balance: parseFloat(e.balance) || 0,
        total_pnl: parseFloat(e.total_pnl) || 0,
        total_trades: parseInt(e.total_trades) || 0,
        win_rate: typeof e.win_rate === 'string' ? parseFloat(e.win_rate) : (e.win_rate || 0),
        snapshot_at: e.snapshot_at,
      }));
      setEquity(eqData);
      setTimeout(() => renderCharts(eqData, []), 200);
    }
  }

  async function loadConfig() {
    const res = await paperApi.getConfig();
    if (res.code === 200 && res.data) {
      _setConfig(res.data);
      const c = res.data;
      const el = (id: string) => document.getElementById(id) as HTMLInputElement | null;
      const setVal = (id: string, val: any) => { const e = el(id); if (e) e.value = String(val); };
      setVal('cfgInitialBalance', c.initial_balance);
      setVal('cfgMinAmount', c.min_amount);
      setVal('cfgMaxAmount', c.max_amount);
      setVal('cfgTakeProfit', c.take_profit_pct);
      setVal('cfgStopLoss', c.stop_loss_pct);
      const cfgEnabled = el('cfgEnabled');
      if (cfgEnabled) cfgEnabled.checked = c.enabled;
    }
  }

  async function loadLearning() {
    const res = await learningApi.getHistory('signal_follow', 50);
    if (res.code === 200) {
      _setLearning(res.data || []);
      setTimeout(() => renderLearnChart(res.data), 300);
    }
  }

  function renderCharts(equityData: EquitySnapshot[] | undefined, tradeData: PaperTrade[]) {
    if (!equityData) equityData = [];
    // Win Rate Gauge
    const winRateEl = document.getElementById('chartWinRate');
    if (winRateEl) {
      const closed = tradeData.filter((t) => t.status === 'closed');
      const wins = closed.filter((t) => t.pnl_usd > 0).length;
      const total = closed.length;
      const rate = total > 0 ? (wins / total) * 100 : 0;
      const chart = echarts.init(winRateEl);
      chart.setOption({
        series: [{
          type: 'gauge', center: ['50%', '60%'], radius: '80%',
          startAngle: 220, endAngle: -40,
          min: 0, max: 100,
          axisLine: {
            lineStyle: { width: 8, color: [[rate / 100, '#10b981'], [1, '#404040']] },
          },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          detail: {
            formatter: `{value}%`, fontSize: 16, fontWeight: 700,
            color: rate >= 50 ? '#10b981' : '#ef4444',
            offsetCenter: [0, '40%'],
          },
          data: [{ value: parseFloat(rate.toFixed(1)) }],
        }],
      }, true);
      chartInstances.current.set('winRate', chart);
    }

    // Cumulative PnL
    const cumPnlEl = document.getElementById('chartCumPnl');
    if (cumPnlEl && tradeData.length > 0) {
      const sorted = [...tradeData].filter((t) => t.status === 'closed')
        .sort((a, b) => new Date(a.closed_at).getTime() - new Date(b.closed_at).getTime());
      let cum = 0;
      const data = sorted.map((t) => {
        cum += t.pnl_usd;
        return cum;
      });
      const chart = echarts.init(cumPnlEl);
      chart.setOption({
        tooltip: { trigger: 'axis', textStyle: { fontSize: 10 } },
        grid: { left: 8, right: 8, top: 4, bottom: 4 },
        xAxis: { show: false },
        yAxis: { show: false },
        series: [{
          type: 'line', data, smooth: true, symbol: 'none',
          lineStyle: { color: '#6366f1', width: 2 },
          areaStyle: {
            color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(99,102,241,0.3)' },
                { offset: 1, color: 'rgba(99,102,241,0)' },
              ] },
          },
        }],
      }, true);
      chartInstances.current.set('cumPnl', chart);
    }

    // Equity Chart
    if (equityData.length > 1) {
      const eqEl = document.getElementById('equityChart');
      if (eqEl) {
        const chart = echarts.init(eqEl);
        chart.setOption({
          tooltip: {
            trigger: 'axis', textStyle: { fontSize: 11 },
            formatter: (ps: any) => {
              const p = ps[0];
              const snap = equityData[p.dataIndex];
              return `<b>余额</b>: $${snap.balance.toFixed(2)}<br/>
                      <b>盈亏</b>: $${snap.total_pnl.toFixed(2)}<br/>
                      <b>交易</b>: ${snap.total_trades}笔<br/>
                      <b>胜率</b>: ${snap.win_rate}%`;
            },
            backgroundColor: 'rgba(26,26,46,0.9)',
            borderColor: 'rgba(255,255,255,0.1)',
          },
          grid: { left: 50, right: 16, top: 8, bottom: 20 },
          xAxis: {
            type: 'category',
            data: equityData.map((e) => new Date(e.snapshot_at).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })),
            axisLabel: { color: '#808080', fontSize: 9 },
            axisLine: { show: false },
          },
          yAxis: {
            type: 'value',
            axisLabel: { color: '#808080', fontSize: 9, formatter: '${value}' },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
          },
          series: [{
            type: 'line', smooth: true, symbol: 'none',
            data: equityData.map((e) => e.balance),
            lineStyle: { color: '#6366f1', width: 2 },
            areaStyle: {
              color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: 'rgba(99,102,241,0.2)' },
                  { offset: 1, color: 'rgba(99,102,241,0)' },
                ] },
            },
          }],
        }, true);
        chartInstances.current.set('equity', chart);
      }
    }
  }

  function renderLearnChart(data: LearningHistory[] | undefined) {
    if (!data) data = [];
    const el = document.getElementById('learnChart');
    if (!el || data.length < 2) return;
    const chart = echarts.init(el);
    chart.setOption({
      tooltip: { trigger: 'axis', textStyle: { fontSize: 10 },
        formatter: (ps: any) => {
          const p = ps[0];
          const h = data[p.dataIndex];
          return `<b>第${p.dataIndex + 1}次学习</b><br/>
                  评分: ${h.score ? (h.score * 100).toFixed(1) + '%' : '-'}<br/>
                  经验: ${h.experience_count}条`;
        },
        backgroundColor: 'rgba(26,26,46,0.9)',
        borderColor: 'rgba(255,255,255,0.1)',
      },
      grid: { left: 36, right: 8, top: 8, bottom: 16 },
      xAxis: {
        type: 'category',
        data: data.map((_, i) => `#${i + 1}`),
        axisLabel: { color: '#808080', fontSize: 8 },
        axisLine: { show: false },
      },
      yAxis: {
        type: 'value', max: 100,
        axisLabel: { color: '#808080', fontSize: 8, formatter: '{value}%' },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
      },
      series: [{
        type: 'line', smooth: true, symbol: 'diamond', symbolSize: 6,
        data: data.map((h) => h.score ? h.score * 100 : null),
        lineStyle: { color: '#6366f1', width: 2 },
        areaStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(99,102,241,0.2)' },
              { offset: 1, color: 'rgba(99,102,241,0)' },
            ] },
        },
      }],
    }, true);
    chartInstances.current.set('learn', chart);
  }

  async function saveConfig() {
    const data = {
      initial_balance: parseFloat((document.getElementById('cfgInitialBalance') as HTMLInputElement)!.value) || 10000,
      min_amount: parseFloat((document.getElementById('cfgMinAmount') as HTMLInputElement)!.value) || 100,
      max_amount: parseFloat((document.getElementById('cfgMaxAmount') as HTMLInputElement)!.value) || 500,
      take_profit_pct: parseFloat((document.getElementById('cfgTakeProfit') as HTMLInputElement)!.value) || 30,
      stop_loss_pct: parseFloat((document.getElementById('cfgStopLoss') as HTMLInputElement)!.value) || -20,
      enabled: (document.getElementById('cfgEnabled') as HTMLInputElement)!.checked,
    };
    await paperApi.saveConfig(data);
    _setConfig(data);
  }

  async function resetTrades() {
    if (!confirm('确定重置所有模拟交易？')) return;
    await paperApi.reset();
    loadAll();
  }

  async function runBacktest() {
    const hours = (document.getElementById('btTimeRange') as HTMLSelectElement)!.value;
    const chain = (document.getElementById('btChain') as HTMLSelectElement)!.value;
    const amount = parseFloat((document.getElementById('btAmount') as HTMLInputElement)!.value) || 100;
    setBtLoading(true);
    const res = await paperApi.backtest(hours, chain, amount);
    setBtLoading(false);
    if (res.code === 200) {
      setBtResult(res.data);
      setTimeout(() => {
        const el = document.getElementById('btChart');
        if (el && res.data?.cum_pnl) {
          const chart = echarts.init(el);
          chart.setOption({
            tooltip: { trigger: 'axis', textStyle: { fontSize: 10 } },
            grid: { left: 45, right: 8, top: 8, bottom: 20 },
            xAxis: {
              type: 'category',
              data: res.data.cum_pnl.map((p: any) => new Date(p.x).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })),
              axisLabel: { color: '#808080', fontSize: 8, rotate: 30 },
              axisLine: { show: false },
            },
            yAxis: {
              type: 'value',
              axisLabel: { color: '#808080', fontSize: 8, formatter: '${value}' },
              splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
            },
            series: [{
              type: 'line', smooth: true, symbol: 'none',
              data: res.data.cum_pnl.map((p: any) => p.y),
              lineStyle: { color: '#6366f1', width: 2 },
              areaStyle: {
                color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                  colorStops: [
                    { offset: 0, color: 'rgba(99,102,241,0.2)' },
                    { offset: 1, color: 'rgba(99,102,241,0)' },
                  ] },
              },
            }],
          }, true);
          chartInstances.current.set('bt', chart);
        }
      }, 100);
    }
  }

  // Compute stats
  const closedTrades = trades.filter((t) => t.status === 'closed');
  const openTrades = trades.filter((t) => t.status === 'open');
  const totalPnl = closedTrades.reduce((s, t) => s + t.pnl_usd, 0);
  const wins = closedTrades.filter((t) => t.pnl_usd > 0).length;
  const winRate = closedTrades.length > 0 ? (wins / closedTrades.length * 100).toFixed(1) : '0';
  const lastSnap = equity[equity.length - 1];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <div className="gradient-border" style={{ padding: 16 }}>
          <p style={{ fontSize: 11, color: 'var(--dark-400)', marginBottom: 4 }}>模拟余额</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-green)' }}>
            ${(lastSnap?.balance || 10000).toFixed(2)}
          </p>
        </div>
        <div style={{ ...cardBase, padding: 16 }}>
          <p style={{ fontSize: 11, color: 'var(--dark-400)', marginBottom: 4 }}>总盈亏</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: totalPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
            {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
          </p>
        </div>
        <div style={{ ...cardBase, padding: 16 }}>
          <p style={{ fontSize: 11, color: 'var(--dark-400)', marginBottom: 4 }}>胜率</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-blue)' }}>{winRate}%</p>
          <p style={{ fontSize: 11, color: 'var(--dark-400)', marginTop: 2 }}>{wins}/{closedTrades.length}</p>
        </div>
        <div style={{ ...cardBase, padding: 16 }}>
          <p style={{ fontSize: 11, color: 'var(--dark-400)', marginBottom: 4 }}>交易数</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: 'white' }}>{closedTrades.length}</p>
          <p style={{ fontSize: 11, color: 'var(--dark-400)', marginTop: 2 }}>持仓 {openTrades.length}</p>
        </div>
      </div>

      {/* Mini Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div style={{ ...cardBase, padding: 12 }}>
          <p style={{ fontSize: 11, color: 'var(--dark-400)', marginBottom: 4 }}>胜率</p>
          <div id="chartWinRate" style={{ width: '100%', height: 80 }} ref={winRateRef} />
        </div>
        <div style={{ ...cardBase, padding: 12 }}>
          <p style={{ fontSize: 11, color: 'var(--dark-400)', marginBottom: 4 }}>累计盈亏</p>
          <div id="chartCumPnl" style={{ width: '100%', height: 80 }} ref={cumPnlRef} />
        </div>
        <div style={{ ...cardBase, padding: 12 }}>
          <p style={{ fontSize: 11, color: 'var(--dark-400)', marginBottom: 4 }}>经验数</p>
          <div id="learnChart" style={{ width: '100%', height: 80 }} ref={learnRef} />
        </div>
      </div>

      {/* Equity Chart */}
      <div className="gradient-border" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>净值曲线</p>
          <RefreshCw size={14} style={{ color: 'var(--dark-400)', cursor: 'pointer' }} onClick={loadAll} />
        </div>
        <div id="equityChart" style={{ width: '100%', height: 200 }} ref={equityRef} />
      </div>

      {/* Paper Config */}
      <div className="gradient-border" style={{ padding: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'white', marginBottom: 12 }}>模拟参数</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8 }}>
          <div>
            <p style={{ fontSize: 10, color: 'var(--dark-400)', marginBottom: 2 }}>初始余额</p>
            <input id="cfgInitialBalance" type="number" defaultValue={10000}
              style={{
                width: '100%', padding: '6px 8px', borderRadius: 8,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
              }} />
          </div>
          <div>
            <p style={{ fontSize: 10, color: 'var(--dark-400)', marginBottom: 2 }}>最小单笔</p>
            <input id="cfgMinAmount" type="number" defaultValue={100}
              style={{
                width: '100%', padding: '6px 8px', borderRadius: 8,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
              }} />
          </div>
          <div>
            <p style={{ fontSize: 10, color: 'var(--dark-400)', marginBottom: 2 }}>最大单笔</p>
            <input id="cfgMaxAmount" type="number" defaultValue={500}
              style={{
                width: '100%', padding: '6px 8px', borderRadius: 8,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
              }} />
          </div>
          <div>
            <p style={{ fontSize: 10, color: 'var(--dark-400)', marginBottom: 2 }}>止盈 %</p>
            <input id="cfgTakeProfit" type="number" defaultValue={30}
              style={{
                width: '100%', padding: '6px 8px', borderRadius: 8,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
              }} />
          </div>
          <div>
            <p style={{ fontSize: 10, color: 'var(--dark-400)', marginBottom: 2 }}>止损 %</p>
            <input id="cfgStopLoss" type="number" defaultValue={-20}
              style={{
                width: '100%', padding: '6px 8px', borderRadius: 8,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
              }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--dark-300)', cursor: 'pointer' }}>
              <input id="cfgEnabled" type="checkbox" defaultChecked style={{ width: 'auto' }} /> 启用
            </label>
            <button onClick={saveConfig} style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 11,
              background: 'rgba(99,102,241,0.1)', color: 'var(--accent)',
              cursor: 'pointer', border: '1px solid rgba(99,102,241,0.2)',
            }}><Save size={12} /> 保存</button>
            <button onClick={resetTrades} style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 11,
              background: 'rgba(239,68,68,0.1)', color: 'var(--accent-red)',
              cursor: 'pointer', border: '1px solid rgba(239,68,68,0.2)',
            }}><Trash2 size={12} /> 重置</button>
          </div>
        </div>
      </div>

      {/* Backtest */}
      <div className="gradient-border" style={{ padding: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'white', marginBottom: 12 }}>批量回测</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <p style={{ fontSize: 10, color: 'var(--dark-400)', marginBottom: 2 }}>时间</p>
            <select id="btTimeRange" style={{
              padding: '6px 8px', borderRadius: 8, fontSize: 12,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--dark-200)',
            }}>
              <option value="1">1小时</option>
              <option value="6" selected>6小时</option>
              <option value="24">24小时</option>
              <option value="168">7天</option>
              <option value="0">全部</option>
            </select>
          </div>
          <div>
            <p style={{ fontSize: 10, color: 'var(--dark-400)', marginBottom: 2 }}>链</p>
            <select id="btChain" style={{
              padding: '6px 8px', borderRadius: 8, fontSize: 12,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--dark-200)',
            }}>
              <option value="all">全部</option>
              <option value="SOL">SOL</option>
              <option value="ETH">ETH</option>
              <option value="BSC">BSC</option>
              <option value="BASE">BASE</option>
            </select>
          </div>
          <div>
            <p style={{ fontSize: 10, color: 'var(--dark-400)', marginBottom: 2 }}>每笔 $</p>
            <input id="btAmount" type="number" defaultValue={100} style={{
              padding: '6px 8px', borderRadius: 8, fontSize: 12,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              width: 80, fontFamily: "'JetBrains Mono', monospace",
            }} />
          </div>
          <button onClick={runBacktest} disabled={btLoading} style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 12,
            background: 'var(--accent)', color: 'white',
            cursor: btLoading ? 'not-allowed' : 'pointer', opacity: btLoading ? 0.5 : 1,
          }}>
            {btLoading ? '回测中...' : '开始回测'}
          </button>
        </div>

        {btResult && btResult.total > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 }}>
              <div style={{ ...cardBase, padding: 10, textAlign: 'center' }}>
                <p style={{ fontSize: 16, fontWeight: 700, color: btResult.stats.total_pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                  {btResult.stats.total_pnl >= 0 ? '+' : ''}${btResult.stats.total_pnl.toFixed(2)}
                </p>
                <p style={{ fontSize: 10, color: 'var(--dark-400)' }}>总盈亏</p>
              </div>
              <div style={{ ...cardBase, padding: 10, textAlign: 'center' }}>
                <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent-green)' }}>{btResult.stats.win_rate}</p>
                <p style={{ fontSize: 10, color: 'var(--dark-400)' }}>胜率</p>
              </div>
              <div style={{ ...cardBase, padding: 10, textAlign: 'center' }}>
                <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent-orange)' }}>{btResult.stats.max_drawdown.toFixed(1)}%</p>
                <p style={{ fontSize: 10, color: 'var(--dark-400)' }}>最大回撤</p>
              </div>
              <div style={{ ...cardBase, padding: 10, textAlign: 'center' }}>
                <p style={{ fontSize: 16, fontWeight: 700, color: btResult.stats.sharpe_ratio >= 1 ? 'var(--accent-green)' : 'var(--accent-orange)' }}>
                  {btResult.stats.sharpe_ratio.toFixed(2)}
                </p>
                <p style={{ fontSize: 10, color: 'var(--dark-400)' }}>夏普比率</p>
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--dark-400)', marginBottom: 8 }}>
              {btResult.total} 笔交易 · 平均盈亏 ${btResult.stats.avg_pnl.toFixed(2)}
            </p>
            {btResult.cum_pnl && btResult.cum_pnl.length > 1 && (
              <div id="btChart" style={{ width: '100%', height: 140 }} ref={btChartRef} />
            )}
          </div>
        )}
        {btResult && btResult.total === 0 && (
          <p style={{ fontSize: 12, color: 'var(--dark-400)', marginTop: 8 }}>该时段暂无已平仓交易</p>
        )}
      </div>

      {/* Positions + Trades */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Open Positions */}
        <div style={{ ...cardBase, padding: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'white', marginBottom: 12 }}>当前持仓</p>
          {openTrades.length === 0 ? (
            <p style={{ color: 'var(--dark-400)', fontSize: 12 }}>无持仓</p>
          ) : (
            openTrades.slice(0, 10).map((t) => (
              <div key={t.id} style={{
                padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                display: 'flex', justifyContent: 'space-between', fontSize: 12,
              }}>
                <span style={{ color: 'white', fontWeight: 500 }}>{t.symbol || t.contract.slice(0, 10)}</span>
                <span style={{ color: 'var(--dark-400)' }}>${t.amount_usd.toFixed(2)}</span>
              </div>
            ))
          )}
        </div>

        {/* Closed Trades */}
        <div style={{ ...cardBase, padding: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'white', marginBottom: 12 }}>
            交易记录
            <span style={{ fontSize: 11, color: 'var(--dark-400)', fontWeight: 400, marginLeft: 8 }}>
              胜 {wins} / 负 {closedTrades.length - wins}
            </span>
          </p>
          {closedTrades.length === 0 ? (
            <p style={{ color: 'var(--dark-400)', fontSize: 12 }}>暂无交易记录</p>
          ) : (
            closedTrades.slice(0, 15).map((t) => (
              <div key={t.id} style={{
                padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: t.pnl_usd >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                  }} />
                  <span style={{ color: 'var(--dark-200)' }}>{t.symbol || t.contract.slice(0, 8)}</span>
                  <span style={{ fontSize: 10, color: 'var(--dark-500)', fontFamily: "'JetBrains Mono', monospace" }}>
                    {t.chain}
                  </span>
                </div>
                <span style={{
                  fontWeight: 600,
                  color: t.pnl_usd >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                }}>
                  {t.pnl_usd >= 0 ? '+' : ''}${t.pnl_usd.toFixed(2)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Real Trading Entry */}
      <div className="gradient-border" style={{ padding: 16, textAlign: 'center' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'white', marginBottom: 8 }}>实盘交易</p>
        {isConnected ? (
          <p style={{ fontSize: 12, color: 'var(--accent-green)' }}>
            ✅ 钱包已连接，可开启实盘交易
          </p>
        ) : (
          <p style={{ fontSize: 12, color: 'var(--dark-400)' }}>
            🔑 连接钱包后可开启实盘交易（SessionKey 免逐笔签名）
          </p>
        )}
      </div>
    </div>
  );
}
