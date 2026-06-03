"""
离线回测引擎 - 基于历史价格数据模拟交易
"""
import json, math
from datetime import datetime, timedelta

def run_backtest(price_data, params):
    """
    price_data: list of {time, price, liquidity_usd}
    params: {per_amount, take_profit_pct, stop_loss_pct, max_slippage, min_confidence}
    returns: {trades, stats, cum_pnl}
    """
    per_amount = params.get('per_amount', 100)
    take_profit = params.get('take_profit_pct', 30) / 100.0
    stop_loss = params.get('stop_loss_pct', 20) / 100.0
    max_slippage = params.get('max_slippage', 5) / 100.0
    
    trades = []
    holding = None  # {entry_price, entry_time, amount, qty}
    total_pnl = 0
    wins = 0
    cum_pnl = []
    peak = 0
    max_dd = 0
    
    for i in range(1, len(price_data)):
        cur = price_data[i]
        prev = price_data[i-1]
        
        if not cur.get('price') or cur['price'] <= 0:
            continue
        
        if holding is None:
            # 模拟买入条件：价格波动>0.5%（代表有新交易活动）
            price_change = abs(cur['price'] - prev['price']) / prev['price'] if prev['price'] > 0 else 0
            if price_change > 0.005 and price_change < max_slippage:
                qty = per_amount / cur['price']
                holding = {
                    'entry_price': cur['price'],
                    'entry_time': cur['time'],
                    'amount': per_amount,
                    'qty': qty,
                    'chain': cur.get('chain', '?'),
                    'contract': cur.get('contract', '?'),
                    'symbol': cur.get('symbol', '')
                }
        else:
            # 检查止盈止损
            pnl_pct = (cur['price'] - holding['entry_price']) / holding['entry_price']
            
            if pnl_pct >= take_profit or pnl_pct <= -stop_loss:
                # 平仓
                exit_value = holding['qty'] * cur['price']
                pnl_usd = exit_value - holding['amount']
                total_pnl += pnl_usd
                if pnl_usd > 0:
                    wins += 1
                
                trade = {
                    'contract': holding['contract'],
                    'symbol': holding['symbol'],
                    'chain': holding['chain'],
                    'entry_price': round(holding['entry_price'], 18),
                    'exit_price': round(cur['price'], 18),
                    'amount_usd': round(holding['amount'], 2),
                    'pnl_usd': round(pnl_usd, 2),
                    'pnl_pct': round(pnl_pct * 100, 2),
                    'entry_time': holding['entry_time'],
                    'exit_time': cur['time'],
                    'reason': '止盈' if pnl_pct > 0 else '止损'
                }
                trades.append(trade)
                holding = None
                
                # 累计曲线
                cum_pnl.append({'x': cur['time'], 'y': round(total_pnl, 2)})
                if total_pnl > peak:
                    peak = total_pnl
                dd = (total_pnl - peak) / peak * 100 if peak > 0 else 0
                if dd < max_dd:
                    max_dd = dd
    
    # 还有持仓的强制平仓
    if holding:
        last = price_data[-1]
        pnl_pct = (last['price'] - holding['entry_price']) / holding['entry_price']
        exit_value = holding['qty'] * last['price']
        pnl_usd = exit_value - holding['amount']
        total_pnl += pnl_usd
        if pnl_usd > 0:
            wins += 1
        trades.append({
            'contract': holding['contract'],
            'symbol': holding['symbol'],
            'chain': holding['chain'],
            'entry_price': round(holding['entry_price'], 18),
            'exit_price': round(last['price'], 18),
            'amount_usd': round(holding['amount'], 2),
            'pnl_usd': round(pnl_usd, 2),
            'pnl_pct': round(pnl_pct * 100, 2),
            'entry_time': holding['entry_time'],
            'exit_time': last['time'],
            'reason': '到期平仓'
        })
        holding = None
    
    total = len(trades)
    if total == 0:
        return {'total': 0, 'trades': [], 'stats': None, 'cum_pnl': []}
    
    win_rate = round(wins / total * 100, 1) if total > 0 else 0
    avg_pnl = total_pnl / total if total > 0 else 0
    
    # 夏普
    if total > 1:
        variance = sum((t['pnl_usd'] - avg_pnl) ** 2 for t in trades) / total
        std_dev = math.sqrt(variance) if variance > 0 else 0.001
        sharpe = (avg_pnl / std_dev) * math.sqrt(365) if std_dev > 0 else 0
    else:
        sharpe = 0
    
    return {
        'total': total,
        'trades': trades,
        'stats': {
            'total_pnl': round(total_pnl, 2),
            'win_rate': f"{win_rate}%",
            'wins': wins,
            'losses': total - wins,
            'max_drawdown': round(max_dd, 2),
            'sharpe_ratio': round(sharpe, 3),
            'avg_pnl': round(avg_pnl, 2),
        },
        'cum_pnl': cum_pnl
    }
