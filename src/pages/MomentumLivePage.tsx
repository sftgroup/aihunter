import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar
} from 'recharts';
import { Wallet, Play, Pause, Settings, History, TrendingUp, AlertCircle } from 'lucide-react';

// Mock data for charts
const pnlData = [
  { time: '10:00', pnl: 0 },
  { time: '10:05', pnl: 23.5 },
  { time: '10:10', pnl: 18.3 },
  { time: '10:15', pnl: 45.2 },
  { time: '10:20', pnl: 38.7 },
  { time: '10:25', pnl: 67.4 },
];

const distributionData = [
  { name: '盈利', value: 68, color: '#10b981' },
  { name: '亏损', value: 32, color: '#ef4444' },
];

const assetData = [
  { time: '10:00', value: 12458 },
  { time: '10:05', value: 12481 },
  { time: '10:10', value: 12476 },
  { time: '10:15', value: 12503 },
  { time: '10:20', value: 12497 },
  { time: '10:25', value: 12526 },
];

const tokenPnlData = [
  { token: 'PEPE', pnl: 45.2 },
  { token: 'DOGE', pnl: -5.2 },
  { token: 'SHIB', pnl: 23.5 },
  { token: 'FLOKI', pnl: -12.1 },
];

interface Trade {
  id: string;
  time: string;
  token: string;
  direction: 'BUY' | 'SELL';
  price: string;
  score: number;
  status: string;
}

interface TradeRecord {
  id: string;
  time: string;
  token: string;
  direction: 'BUY' | 'SELL';
  amount: string;
  pnl: string;
  status: string;
}

export default function MomentumLivePage() {
  const [walletConnected, setWalletConnected] = useState(true);
  const [authorized, setAuthorized] = useState(true);
  const [isTrading, setIsTrading] = useState(false);
  const [config, setConfig] = useState({
    maxSingleAmount: 1000,
    slippageTolerance: 1.0,
    gasStrategy: 'medium',
    takeProfit: 10,
    stopLoss: 5,
    autoApplyParams: true,
    pauseOnParamChange: false,
  });

  const [signals] = useState<Trade[]>([
    { id: '1', time: '10:05:23', token: 'PEPE', direction: 'BUY', price: '$0.00001234', score: 72, status: '已执行' },
    { id: '2', time: '09:42:15', token: 'DOGE', direction: 'SELL', price: '$0.1523', score: 68, status: '已执行' },
    { id: '3', time: '09:15:08', token: 'SHIB', direction: 'BUY', price: '$0.00000852', score: 65, status: '执行中' },
  ]);

  const [trades] = useState<TradeRecord[]>([
    { id: '1', time: '2026-06-24 10:05', token: 'PEPE', direction: 'BUY', amount: '$500.00', pnl: '+$23.50', status: '成功' },
    { id: '2', time: '2026-06-24 09:42', token: 'DOGE', direction: 'SELL', amount: '$300.00', pnl: '-$5.20', status: '成功' },
  ]);

  const handleStartTrading = () => {
    if (!walletConnected || !authorized) {
      alert('请先连接钱包并授权');
      return;
    }
    setIsTrading(true);
  };

  const handleStopTrading = () => {
    setIsTrading(false);
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-100">
      {/* Wallet Status */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">Agentic Wallet</div>
                  <div className="text-xs text-gray-400">0x7a8b...9c2d</div>
                </div>
              </div>
              <div className="h-8 w-px bg-gray-700" />
              <div>
                <div className="text-xs text-gray-400">余额</div>
                <div className="text-lg font-bold text-white">$12,458.32</div>
              </div>
              <div className="h-8 w-px bg-gray-700" />
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm text-green-400">已授权</span>
                <span className="text-xs text-gray-500">有效期至 2027-06-24</span>
              </div>
            </div>
            <button
              onClick={() => setWalletConnected(false)}
              className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition"
            >
              断开连接
            </button>
          </div>
        </div>

        {/* Strategy Config */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <Settings className="w-5 h-5 mr-2" />
              策略参数
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">单笔上限 (USDT)</label>
                <input
                  type="number"
                  value={config.maxSingleAmount}
                  onChange={(e) => setConfig({ ...config, maxSingleAmount: Number(e.target.value) })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">滑点容忍 (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={config.slippageTolerance}
                  onChange={(e) => setConfig({ ...config, slippageTolerance: Number(e.target.value) })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Gas 策略</label>
                <select
                  value={config.gasStrategy}
                  onChange={(e) => setConfig({ ...config, gasStrategy: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="slow">慢 (Slow)</option>
                  <option value="medium">中 (Medium)</option>
                  <option value="fast">快 (Fast)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">止盈 / 止损 (%)</label>
                <div className="flex space-x-2">
                  <input
                    type="number"
                    value={config.takeProfit}
                    onChange={(e) => setConfig({ ...config, takeProfit: Number(e.target.value) })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                  <input
                    type="number"
                    value={config.stopLoss}
                    onChange={(e) => setConfig({ ...config, stopLoss: Number(e.target.value) })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Learning Config */}
          <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2" />
              自动学习配置
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-white">自动应用学习参数</div>
                  <div className="text-xs text-gray-400">学习系统优化后的参数自动应用到实盘</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.autoApplyParams}
                    onChange={(e) => setConfig({ ...config, autoApplyParams: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                </label>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-white">参数变更时暂停</div>
                  <div className="text-xs text-gray-400">学习参数更新时自动暂停实盘交易</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.pauseOnParamChange}
                    onChange={(e) => setConfig({ ...config, pauseOnParamChange: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Trade Control */}
        <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <button
                onClick={handleStartTrading}
                disabled={isTrading}
                className={`px-6 py-3 rounded-lg font-medium transition flex items-center space-x-2 ${
                  isTrading
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                <Play className="w-4 h-4" />
                <span>开启实盘</span>
              </button>
              <button
                onClick={handleStopTrading}
                disabled={!isTrading}
                className={`px-6 py-3 rounded-lg font-medium transition flex items-center space-x-2 ${
                  !isTrading
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                <Pause className="w-4 h-4" />
                <span>暂停实盘</span>
              </button>
              <div className="h-8 w-px bg-gray-700" />
              <div className="flex items-center space-x-4 text-sm">
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${isTrading ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                  <span className="text-gray-400">
                    状态: <span className={isTrading ? 'text-green-400' : 'text-gray-500'}>{isTrading ? '运行中' : '已暂停'}</span>
                  </span>
                </div>
                <div className="text-gray-400">今日交易: <span className="text-white font-medium">5笔</span></div>
                <div className="text-gray-400">今日盈亏: <span className="text-green-400 font-medium">+$123.45</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Signal Stream */}
        <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl p-6 mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">实时信号流</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left py-2">时间</th>
                  <th className="text-left py-2">代币</th>
                  <th className="text-left py-2">方向</th>
                  <th className="text-left py-2">价格</th>
                  <th className="text-left py-2">评分</th>
                  <th className="text-left py-2">状态</th>
                </tr>
              </thead>
              <tbody className="text-gray-300">
                {signals.map((signal) => (
                  <tr key={signal.id} className="border-b border-gray-800">
                    <td className="py-3">{signal.time}</td>
                    <td className="py-3 font-medium text-white">{signal.token}</td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded text-xs ${
                        signal.direction === 'BUY' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                      }`}>
                        {signal.direction}
                      </span>
                    </td>
                    <td className="py-3">{signal.price}</td>
                    <td className="py-3 text-blue-400">{signal.score}</td>
                    <td className="py-3">
                      <span className={signal.status === '已执行' ? 'text-green-400' : 'text-yellow-400'}>
                        {signal.status === '已执行' ? '✓' : '⏳'} {signal.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Charts Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">盈亏曲线</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={pnlData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none' }} />
                <Line type="monotone" dataKey="pnl" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">交易分布</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={distributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {distributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center space-x-4 mt-2">
              {distributionData.map((entry) => (
                <div key={entry.name} className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-sm text-gray-400">{entry.name} {entry.value}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">资产变化</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={assetData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none' }} />
                <Area type="monotone" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">代币盈亏排名</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={tokenPnlData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" stroke="#9ca3af" />
                <YAxis dataKey="token" type="category" stroke="#9ca3af" />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none' }} />
                <Bar dataKey="pnl" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Trade History */}
        <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center">
              <History className="w-5 h-5 mr-2" />
              交易记录
            </h3>
            <div className="flex space-x-2">
              <button className="px-3 py-1 rounded bg-blue-600 text-white text-sm">全部</button>
              <button className="px-3 py-1 rounded bg-gray-800 text-gray-400 text-sm hover:bg-gray-700">今日</button>
              <button className="px-3 py-1 rounded bg-gray-800 text-gray-400 text-sm hover:bg-gray-700">本周</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left py-2">时间</th>
                  <th className="text-left py-2">代币</th>
                  <th className="text-left py-2">方向</th>
                  <th className="text-left py-2">金额</th>
                  <th className="text-left py-2">盈亏</th>
                  <th className="text-left py-2">状态</th>
                </tr>
              </thead>
              <tbody className="text-gray-300">
                {trades.map((trade) => (
                  <tr key={trade.id} className="border-b border-gray-800">
                    <td className="py-3">{trade.time}</td>
                    <td className="py-3 font-medium text-white">{trade.token}</td>
                    <td className="py-3">
                      <span className={trade.direction === 'BUY' ? 'text-green-400' : 'text-red-400'}>
                        {trade.direction}
                      </span>
                    </td>
                    <td className="py-3">{trade.amount}</td>
                    <td className={`py-3 ${trade.pnl.startsWith('+') ? 'text-green-400' : 'text-red-400'}`}>
                      {trade.pnl}
                    </td>
                    <td className="py-3">
                      <span className="px-2 py-1 rounded bg-green-900/50 text-green-400 text-xs">
                        {trade.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
