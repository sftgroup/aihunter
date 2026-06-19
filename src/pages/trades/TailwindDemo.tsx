import { useState, useEffect } from "react";
import { signalsPageApi } from "../../utils/api";

export default function TailwindDemo() {
  const [signals, setSignals] = useState<any[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    signalsPageApi.getPage(1, 10).then((sr: any) => {
      if (sr?.code === 200 && sr.data) {
        setSignals(sr.data);
        setTotal(sr.total || 0);
      }
    });
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white text-lg font-bold">Tailwind Demo</h2>
        <span className="text-gray-400 text-xs">{total} 个代币</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {signals.slice(0, 6).map((sig: any) => {
          const sc = sig.score || sig.confidence || 0;
          const scoreColor = sc >= 70 ? "text-green-400" : sc >= 50 ? "text-amber-400" : "text-red-400";
          const chainBadge: Record<string, string> = {
            ETH: "bg-blue-500/20 text-blue-400",
            BSC: "bg-yellow-500/20 text-yellow-400",
            BASE: "bg-blue-600/20 text-blue-500",
            SOL: "bg-purple-500/20 text-purple-500",
          };

          return (
            <div key={sig.id} className="bg-white/5 backdrop-blur-xl border border-white/5 rounded-xl p-4 flex items-center gap-3 hover:border-indigo-500/20 hover:shadow-[0_0_15px_rgba(99,102,241,0.15)] transition-all">
              {/* 头像 */}
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#2a2a3e] to-[#1a1a2e] flex items-center justify-center text-white font-bold text-sm shrink-0">
                {(sig.symbol || "?").charAt(0).toUpperCase()}
              </div>

              {/* 信息 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-white text-sm font-semibold truncate">{sig.symbol || sig.contract?.slice(0, 10)}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${chainBadge[sig.chain] || "bg-gray-500/20 text-gray-400"}`}>
                    {sig.chain}
                  </span>
                  {sig.action === "buy" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">BUY</span>
                  )}
                </div>
                <div className="text-[11px] text-gray-400">
                  {sig.price_usd ? "$" + (sig.price_usd < 0.001 ? sig.price_usd.toFixed(8) : sig.price_usd < 1 ? sig.price_usd.toFixed(6) : sig.price_usd.toFixed(4)) : "-"}
                  {" · "}
                  {sig.liquidity_usd >= 1e6 ? (sig.liquidity_usd / 1e6).toFixed(1) + "M" : (sig.liquidity_usd / 1e3).toFixed(1) + "K"}
                  {" · 评分 " + sc}
                  {sig.hourly_bars ? " · " + sig.hourly_bars + "h" : ""}
                </div>
              </div>

              {/* 分数 */}
              <div className="text-right shrink-0">
                <div className={`text-lg font-bold ${scoreColor}`}>{sc}%</div>
                <p className="text-[10px] text-gray-500 mt-0.5">可信度</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
