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

const getTransitionPair = (transition) =>
  `${transition?.from ?? "-"} -> ${transition?.to ?? "-"}`;

const getPairOptions = (items = []) =>
  summarizeTransitionPairs(items, Number.POSITIVE_INFINITY).map(({ pair, count }) => ({
    value: pair,
    label: `${pair} (${count})`,
  }));

const summarizeTransitionPairs = (items = [], limit = 3) => {
  const pairs = {};

  items.forEach((t) => {
    const pair = getTransitionPair(t);
    if (!pairs[pair]) {
      pairs[pair] = {
        from: t.from ?? "-",
        to: t.to ?? "-",
        count: 0,
        rsrpBefore: [],
        rsrpAfter: [],
        rsrqBefore: [],
        rsrqAfter: [],
        sinrBefore: [],
        sinrAfter: [],
      };
    }
    pairs[pair].count++;

    if (Number.isFinite(t.rsrp)) pairs[pair].rsrpBefore.push(t.rsrp);
    if (Number.isFinite(t.nextRsrp)) pairs[pair].rsrpAfter.push(t.nextRsrp);
    if (Number.isFinite(t.rsrq)) pairs[pair].rsrqBefore.push(t.rsrq);
    if (Number.isFinite(t.nextRsrq)) pairs[pair].rsrqAfter.push(t.nextRsrq);
    if (Number.isFinite(t.sinr)) pairs[pair].sinrBefore.push(t.sinr);
    if (Number.isFinite(t.nextSinr)) pairs[pair].sinrAfter.push(t.nextSinr);
  });

  const average = (values) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

  return Object.entries(pairs)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([pair, details]) => {
      const {
        rsrpBefore,
        rsrpAfter,
        rsrqBefore,
        rsrqAfter,
        sinrBefore,
        sinrAfter,
        ...rest
      } = details;
      return {
        pair,
        ...rest,
        avgRsrpBefore: average(rsrpBefore),
        avgRsrpAfter: average(rsrpAfter),
        avgRsrqBefore: average(rsrqBefore),
        avgRsrqAfter: average(rsrqAfter),
        avgSinrBefore: average(sinrBefore),
        avgSinrAfter: average(sinrAfter),
      };
    });
};

const formatAverage = (value, unit) =>
  value === null ? "-" : `${value.toFixed(1)} ${unit}`;

const averageValues = (values) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

const AverageBeforeAfter = ({ item }) => (
  <div className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 text-[10px] font-mono text-slate-400 sm:grid-cols-2 xl:grid-cols-3">
    <div className="truncate">
      <span className="text-slate-500">Avg RSRP: </span>
      {formatAverage(item.avgRsrpBefore, "dBm")} -&gt; {formatAverage(item.avgRsrpAfter, "dBm")}
    </div>
    <div className="truncate">
      <span className="text-slate-500">Avg RSRQ: </span>
      {formatAverage(item.avgRsrqBefore, "dB")} -&gt; {formatAverage(item.avgRsrqAfter, "dB")}
    </div>
    <div className="truncate">
      <span className="text-slate-500">Avg SINR: </span>
      {formatAverage(item.avgSinrBefore, "dB")} -&gt; {formatAverage(item.avgSinrAfter, "dB")}
    </div>
  </div>
);

const PairSummaryCard = ({ item }) => (
  <div className="min-w-0 rounded-lg border border-slate-700 bg-slate-800/50 p-3">
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0 flex items-center justify-center gap-2">
        <span className="max-w-[7rem] truncate rounded bg-slate-700 px-2 py-1 text-xs font-medium text-slate-200">
          {item.from}
        </span>
        <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        <span className="max-w-[7rem] truncate rounded bg-slate-700 px-2 py-1 text-xs font-medium text-slate-200">
          {item.to}
        </span>
      </div>
      <span className="shrink-0 rounded bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-blue-300">
        {item.count}
      </span>
    </div>
    <AverageBeforeAfter item={item} />
  </div>
);

const HandoverDetailSection = ({ title, label, transitions = [], onRowClick }) => {
  const [pairFilter, setPairFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("desc");
  const pairOptions = useMemo(() => getPairOptions(transitions), [transitions]);
  const filteredTransitions = useMemo(() => {
    if (pairFilter === "all") return transitions;
    return transitions.filter((t) => getTransitionPair(t) === pairFilter);
  }, [transitions, pairFilter]);
  const detailPairs = useMemo(
    () => summarizeTransitionPairs(filteredTransitions, Number.POSITIVE_INFINITY),
    [filteredTransitions]
  );
  const sortedTransitions = useMemo(() => {
    return [...filteredTransitions].sort((a, b) => {
      const dateA = new Date(a.timestamp || 0);
      const dateB = new Date(b.timestamp || 0);
      return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
    });
  }, [filteredTransitions, sortOrder]);

  if (!transitions.length) return null;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-300">{title}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={() => setSortOrder(prev => prev === "desc" ? "asc" : "desc")}
            className="flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-slate-200"
          >
            {sortOrder === "desc" ? "Newest first" : "Oldest first"}
            {sortOrder === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </button>
          <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-semibold text-blue-300">
            {filteredTransitions.length}
          </span>
        </div>
      </div>

      {pairOptions.length > 1 && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-semibold text-slate-300">Filter</div>
          <select
            value={pairFilter}
            onChange={(event) => setPairFilter(event.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-blue-500"
          >
            <option value="all">All {label} handovers</option>
            {pairOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {detailPairs.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {detailPairs.map((item) => (
            <PairSummaryCard key={item.pair} item={item} />
          ))}
        </div>
      )}

      <div className="mt-3 flex max-h-[350px] flex-col gap-2 overflow-y-auto pr-1">
        {sortedTransitions.map((t, idx) => (
          <TransitionCard 
            key={`${title}-${t.session_id ?? "handover"}-${idx}`}
            transition={t}
            index={idx}
            label={label}
            showType={false}
            onClick={onRowClick}
          />
        ))}
      </div>
    </div>
  );
};

const TransitionCard = ({ transition, index, label = "Technology", showType = true, onClick }) => {
  const type = getHandoverType(transition.from, transition.to);
  const rsrpDiff =
    Number.isFinite(transition.nextRsrp) && Number.isFinite(transition.rsrp)
      ? transition.nextRsrp - transition.rsrp
      : null;
  const rsrqDiff =
    Number.isFinite(transition.nextRsrq) && Number.isFinite(transition.rsrq)
      ? transition.nextRsrq - transition.rsrq
      : null;
  const sinrDiff =
    Number.isFinite(transition.nextSinr) && Number.isFinite(transition.sinr)
      ? transition.nextSinr - transition.sinr
      : null;
  const diffColor = rsrpDiff > 0 ? "text-green-400" : rsrpDiff < 0 ? "text-red-400" : "text-slate-400";
  const rsrqDiffColor = rsrqDiff > 0 ? "text-green-400" : rsrqDiff < 0 ? "text-red-400" : "text-slate-400";
  const sinrDiffColor = sinrDiff > 0 ? "text-green-400" : sinrDiff < 0 ? "text-red-400" : "text-slate-400";
  
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
        <span className={`px-2 py-0.5 rounded text-xs capitalize ${showType ? TYPE_STYLES[type] : "text-blue-400 bg-blue-500/10"}`}>
          {showType ? type : `${label} change`}
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

      <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 border-t border-slate-700 pt-2 text-xs text-slate-400 sm:grid-cols-2 xl:grid-cols-4">
        <div className="truncate">
          <span className="text-slate-500">RSRP: </span>
          <span className="font-mono">{Number.isFinite(transition.rsrp) ? `${transition.rsrp.toFixed(0)} dBm` : "-"}</span>
          <span className="text-slate-600 mx-1">-&gt;</span>
          <span className="font-mono">{Number.isFinite(transition.nextRsrp) ? `${transition.nextRsrp.toFixed(0)} dBm` : "-"}</span>
          {rsrpDiff !== null && (
            <span className={`ml-1 ${diffColor}`}>
              ({rsrpDiff > 0 ? "+" : ""}{rsrpDiff.toFixed(0)})
            </span>
          )}
        </div>
        <div className="truncate">
          <span className="text-slate-500">RSRQ: </span>
          <span className="font-mono">{Number.isFinite(transition.rsrq) ? `${transition.rsrq.toFixed(0)} dB` : "-"}</span>
          <span className="text-slate-600 mx-1">-&gt;</span>
          <span className="font-mono">{Number.isFinite(transition.nextRsrq) ? `${transition.nextRsrq.toFixed(0)} dB` : "-"}</span>
          {rsrqDiff !== null && (
            <span className={`ml-1 ${rsrqDiffColor}`}>
              ({rsrqDiff > 0 ? "+" : ""}{rsrqDiff.toFixed(0)})
            </span>
          )}
        </div>
        <div className="truncate">
          <span className="text-slate-500">SINR: </span>
          <span className="font-mono">{Number.isFinite(transition.sinr) ? `${transition.sinr.toFixed(0)} dB` : "-"}</span>
          <span className="text-slate-600 mx-1">-&gt;</span>
          <span className="font-mono">{Number.isFinite(transition.nextSinr) ? `${transition.nextSinr.toFixed(0)} dB` : "-"}</span>
          {sinrDiff !== null && (
            <span className={`ml-1 ${sinrDiffColor}`}>
              ({sinrDiff > 0 ? "+" : ""}{sinrDiff.toFixed(0)})
            </span>
          )}
        </div>
        <div className="truncate">
          <span className="text-slate-500">PCI: </span>
          <span className="font-mono">{transition.pci ?? "-"} -&gt; {transition.nextPci ?? "-"}</span>
        </div>
      </div>

      <div className="hidden">
        <div>
          <span className="text-slate-500">RSRP: </span>
          <span className="font-mono">{Number.isFinite(transition.rsrp) ? `${transition.rsrp.toFixed(0)} dBm` : "-"}</span>
          <span className="text-slate-600 mx-1">→</span>
          <span className="font-mono">{Number.isFinite(transition.nextRsrp) ? `${transition.nextRsrp.toFixed(0)} dBm` : "-"}</span>
          {rsrpDiff !== null && (
            <span className={`ml-1 ${diffColor}`}>
              ({rsrpDiff > 0 ? "+" : ""}{rsrpDiff.toFixed(0)})
            </span>
          )}
        </div>
        <div>
          <span className="text-slate-500">RSRQ: </span>
          <span className="font-mono">{Number.isFinite(transition.rsrq) ? `${transition.rsrq.toFixed(0)} dB` : "-"}</span>
          <span className="text-slate-600 mx-1">→</span>
          <span className="font-mono">{Number.isFinite(transition.nextRsrq) ? `${transition.nextRsrq.toFixed(0)} dB` : "-"}</span>
          {rsrqDiff !== null && (
            <span className={`ml-1 ${rsrqDiffColor}`}>
              ({rsrqDiff > 0 ? "+" : ""}{rsrqDiff.toFixed(0)})
            </span>
          )}
        </div>
        <div>
          <span className="text-slate-500">SINR: </span>
          <span className="font-mono">{Number.isFinite(transition.sinr) ? `${transition.sinr.toFixed(0)} dB` : "-"}</span>
          <span className="text-slate-600 mx-1">â†’</span>
          <span className="font-mono">{Number.isFinite(transition.nextSinr) ? `${transition.nextSinr.toFixed(0)} dB` : "-"}</span>
          {sinrDiff !== null && (
            <span className={`ml-1 ${sinrDiffColor}`}>
              ({sinrDiff > 0 ? "+" : ""}{sinrDiff.toFixed(0)})
            </span>
          )}
        </div>
        <div>
          <span className="text-slate-500">PCI: </span>
          <span className="font-mono">{transition.pci ?? "-"} → {transition.nextPci ?? "-"}</span>
        </div>
      </div>
    </div>
  );
};

export const HandoverAnalysisTab = ({
  transitions = [],
  bandTransitions = [],
  pciTransitions = [],
  onRowClick,
}) => {
  const [sortOrder, setSortOrder] = useState("desc");
  const [technologyPairFilter, setTechnologyPairFilter] = useState("all");

  const technologyPairOptions = useMemo(() => getPairOptions(transitions), [transitions]);
  const filteredTechnologyTransitions = useMemo(() => {
    if (technologyPairFilter === "all") return transitions;
    return transitions.filter((t) => getTransitionPair(t) === technologyPairFilter);
  }, [transitions, technologyPairFilter]);

  const stats = useMemo(() => {
    const result = {
      total: filteredTechnologyTransitions.length,
      upgrade: 0,
      downgrade: 0,
      lateral: 0,
      avgRsrpBefore: null,
      avgRsrpAfter: null,
      avgSinrBefore: null,
      avgSinrAfter: null,
      topPairs: []
    };

    if (!filteredTechnologyTransitions.length) return result;

    const rsrpBefore = [];
    const rsrpAfter = [];
    const sinrBefore = [];
    const sinrAfter = [];

    filteredTechnologyTransitions.forEach((t) => {
      const type = getHandoverType(t.from, t.to);
      result[type]++;

      if (Number.isFinite(t.rsrp)) rsrpBefore.push(t.rsrp);
      if (Number.isFinite(t.nextRsrp)) rsrpAfter.push(t.nextRsrp);
      if (Number.isFinite(t.sinr)) sinrBefore.push(t.sinr);
      if (Number.isFinite(t.nextSinr)) sinrAfter.push(t.nextSinr);
    });

    result.avgRsrpBefore = averageValues(rsrpBefore);
    result.avgRsrpAfter = averageValues(rsrpAfter);
    result.avgSinrBefore = averageValues(sinrBefore);
    result.avgSinrAfter = averageValues(sinrAfter);
    result.topPairs = summarizeTransitionPairs(filteredTechnologyTransitions);

    return result;
  }, [filteredTechnologyTransitions]);

  const sortedTransitions = useMemo(() => {
    return [...filteredTechnologyTransitions].sort((a, b) => {
      const dateA = new Date(a.timestamp || 0);
      const dateB = new Date(b.timestamp || 0);
      return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
    });
  }, [filteredTechnologyTransitions, sortOrder]);

  if (!transitions.length && !bandTransitions.length && !pciTransitions.length) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col gap-4">
      {transitions.length > 0 && (
      <>
      
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
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
          <p className="text-lg font-bold text-blue-300">{formatAverage(stats.avgRsrpBefore, "dBm")}</p>
          <p className="text-xs text-slate-400">RSRP Before</p>
        </div>
        <div className="p-3 bg-slate-800 rounded-lg text-center">
          <p className="text-lg font-bold text-blue-300">{formatAverage(stats.avgRsrpAfter, "dBm")}</p>
          <p className="text-xs text-slate-400">RSRP After</p>
        </div>
        <div className="p-3 bg-slate-800 rounded-lg text-center">
          <p className="text-lg font-bold text-blue-300">{formatAverage(stats.avgSinrBefore, "dB")}</p>
          <p className="text-xs text-slate-400">SINR Before</p>
        </div>
        <div className="p-3 bg-slate-800 rounded-lg text-center">
          <p className="text-lg font-bold text-blue-300">{formatAverage(stats.avgSinrAfter, "dB")}</p>
          <p className="text-xs text-slate-400">SINR After</p>
        </div>
      </div>
      </>
      )}

      {filteredTechnologyTransitions.length > 0 && stats.topPairs.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {stats.topPairs.map((item) => (
            <PairSummaryCard key={item.pair} item={item} />
          ))}
        </div>
      )}

      {filteredTechnologyTransitions.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-300">Technology Handover Events</h3>
            <button 
              onClick={() => setSortOrder(prev => prev === "desc" ? "asc" : "desc")}
              className="flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-slate-200"
            >
              {sortOrder === "desc" ? "Newest first" : "Oldest first"}
              {sortOrder === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
            </button>
            {technologyPairOptions.length > 1 && (
        <div className=" bg-slate-900/40 ">
          <div className=" text-sm font-semibold text-slate-300">Filter</div>
          <select
            value={technologyPairFilter}
            onChange={(event) => setTechnologyPairFilter(event.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-blue-500"
          >
            <option value="all">All</option>
            {technologyPairOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}
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
        </>
      )}

      <HandoverDetailSection
        title="Band Handover Details"
        label="Band"
        transitions={bandTransitions}
        onRowClick={onRowClick}
      />

      <HandoverDetailSection
        title="PCI Handover Details"
        label="PCI"
        transitions={pciTransitions}
        onRowClick={onRowClick}
      />

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
