import React, { useMemo, useState } from "react";
import { 
  ArrowRightLeft, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Signal,
  ChevronUp,
  ChevronDown
} from "lucide-react";
import { format } from "date-fns";

const TECH_ORDER = {
  "5G": 5, "5G NR": 5, "NR": 5,
  "4G": 4, "LTE": 4, "4G LTE": 4,
  "3G": 3, "WCDMA": 3, "UMTS": 3,
  "2G": 2, "GSM": 2, "EDGE": 2
};

const TYPE_STYLES = {
  upgrade: "text-green-400 bg-green-500/10",
  downgrade: "text-red-400 bg-red-500/10",
  lateral: "text-blue-400 bg-blue-500/10"
};

const getHandoverType = (from, to) => {
  const fromOrder = TECH_ORDER[from?.toUpperCase()] || 0;
  const toOrder = TECH_ORDER[to?.toUpperCase()] || 0;
  if (toOrder > fromOrder) return "upgrade";
  if (toOrder < fromOrder) return "downgrade";
  return "lateral";
};

const EmptyState = () => (
  <div className="flex flex-col items-center justify-center py-16 text-slate-400">
    <Activity className="w-12 h-12 mb-4 opacity-50" />
    <p className="text-lg font-medium">No Handover Data</p>
    <p className="text-sm mt-1">No technology transitions detected</p>
  </div>
);

const TransitionCard = ({ transition, index, onClick }) => {
  const type = getHandoverType(transition.from, transition.to);
  const rsrpDiff = (transition.nextRsrp - transition.rsrp) || 0;
  const diffColor = rsrpDiff > 0 ? "text-green-400" : rsrpDiff < 0 ? "text-red-400" : "text-slate-400";
  
  return (
    <div 
      onClick={() => onClick?.(transition)}
      className="p-3 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-slate-600 cursor-pointer transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">#{index + 1}</span>
          <span className="text-xs font-mono text-slate-300">
            {format(new Date(transition.timestamp), "HH:mm:ss")}
          </span>
        </div>
        <span className={`px-2 py-0.5 rounded text-xs capitalize ${TYPE_STYLES[type]}`}>
          {type}
        </span>
      </div>
      
      <div className="flex items-center justify-center gap-3 py-2">
        <span className="px-2 py-1 bg-slate-700 rounded text-sm font-medium text-slate-200">
          {transition.from}
        </span>
        <ArrowRightLeft className="w-4 h-4 text-slate-500" />
        <span className="px-2 py-1 bg-slate-700 rounded text-sm font-medium text-slate-200">
          {transition.to}
        </span>
      </div>
      
      <div className="flex justify-between text-xs text-slate-400 mt-2 pt-2 border-t border-slate-700">
        <div>
          <span className="text-slate-500">Rsrp: </span>
          <span className="font-mono">{transition.rsrp?.toFixed(0) || "-"}</span>
          <span className="text-slate-600 mx-1">→</span>
          <span className="font-mono">{transition.nextRsrp?.toFixed(0) || "-"}</span>
          <span className={`ml-1 ${diffColor}`}>
            ({rsrpDiff > 0 ? "+" : ""}{rsrpDiff.toFixed(0)})
          </span>
        </div>
        <div>
          <span className="text-slate-500">Rsrq: </span>
          <span className="font-mono">{transition.rsrq?.toFixed(0) || "-"}</span>
          <span className="text-slate-600 mx-1">→</span>
          <span className="font-mono">{transition.nextRsrq?.toFixed(0) || "-"}</span>
          <span className={`ml-1 ${diffColor}`}>
            ({rsrpDiff > 0 ? "+" : ""}{rsrpDiff.toFixed(0)})
          </span>
        </div>
        <div>
          <span className="text-slate-500">PCI: </span>
          <span className="font-mono">{transition.pci || "-"} → {transition.nextPci || "-"}</span>
        </div>
      </div>
    </div>
  );
};

export const HandoverAnalysisTab = ({ transitions = [], onRowClick }) => {
  const [sortOrder, setSortOrder] = useState("desc");

  const stats = useMemo(() => {
    const result = {
      total: transitions.length,
      upgrade: 0,
      downgrade: 0,
      lateral: 0,
      avgRsrpDiff: 0,
      topPairs: []
    };

    if (!transitions.length) return result;

    const pairs = {};
    let totalRsrpDiff = 0;
    let validDiffs = 0;

    transitions.forEach((t) => {
      const type = getHandoverType(t.from, t.to);
      result[type]++;

      const pair = `${t.from} → ${t.to}`;
      pairs[pair] = (pairs[pair] || 0) + 1;

      if (t.rsrp != null && t.nextRsrp != null) {
        totalRsrpDiff += t.nextRsrp - t.rsrp;
        validDiffs++;
      }
    });

    result.avgRsrpDiff = validDiffs ? (totalRsrpDiff / validDiffs).toFixed(1) : 0;
    result.topPairs = Object.entries(pairs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return result;
  }, [transitions]);

  const sortedTransitions = useMemo(() => {
    return [...transitions].sort((a, b) => {
      const dateA = new Date(a.timestamp || 0);
      const dateB = new Date(b.timestamp || 0);
      return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
    });
  }, [transitions, sortOrder]);

  if (!transitions.length) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col gap-4">
      
      <div className="grid grid-cols-4 gap-2">
        <div className="p-3 bg-slate-800 rounded-lg text-center">
          <p className="text-2xl font-bold text-slate-100">{stats.total}</p>
          <p className="text-xs text-slate-400">Total</p>
        </div>
        <div className="p-3 bg-slate-800 rounded-lg text-center">
          <p className="text-2xl font-bold text-green-400">{stats.upgrade}</p>
          <p className="text-xs text-slate-400">Upgrades</p>
        </div>
        <div className="p-3 bg-slate-800 rounded-lg text-center">
          <p className="text-2xl font-bold text-red-400">{stats.downgrade}</p>
          <p className="text-xs text-slate-400">Downgrades</p>
        </div>
        <div className="p-3 bg-slate-800 rounded-lg text-center">
          <p className={`text-2xl font-bold ${Number(stats.avgRsrpDiff) >= 0 ? "text-green-400" : "text-yellow-400"}`}>
            {stats.avgRsrpDiff > 0 ? "+" : ""}{stats.avgRsrpDiff}
          </p>
          <p className="text-xs text-slate-400">Avg Δ dB</p>
        </div>
      </div>

      {stats.topPairs.length > 0 && (
        <div className="flex gap-2">
          {stats.topPairs.map(([pair, count]) => (
            <div key={pair} className="flex-1 p-2 bg-slate-800/50 rounded-lg border border-slate-700">
              <div className="text-xs text-slate-300 font-medium truncate">{pair}</div>
              <div className="text-lg font-bold text-blue-400">{count}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">Handover Events</h3>
        <button 
          onClick={() => setSortOrder(prev => prev === "desc" ? "asc" : "desc")}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          {sortOrder === "desc" ? "Newest first" : "Oldest first"}
          {sortOrder === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
        </button>
      </div>

      <div className="flex flex-col gap-2 max-h-[350px] overflow-y-auto pr-1">
        {sortedTransitions.map((t, idx) => (
          <TransitionCard 
            key={`${t.session_id}-${idx}`}
            transition={t}
            index={idx}
            onClick={onRowClick}
          />
        ))}
      </div>

      <div className="flex items-center justify-center gap-6 py-2 border-t border-slate-700">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          Upgrade
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          Downgrade
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          Lateral
        </div>
      </div>
    </div>
  );
};

export default HandoverAnalysisTab;