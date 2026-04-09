import React, { useState, useMemo, useEffect } from "react";
import {
  Activity,
  BarChart3,
  Signal,
  TrendingUp,
  Filter,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// ==================== APP NAME NORMALIZATION ====================
const APP_NAME_MAPPINGS = {
  // WhatsApp variations
  whatsapp: "WhatsApp",
  "whats app": "WhatsApp",
  "whatsapp messenger": "WhatsApp",
  "whatsapp business": "WhatsApp Business",

  // YouTube variations
  youtube: "YouTube",
  "youtube music": "YouTube Music",
  "youtube kids": "YouTube Kids",
  "yt music": "YouTube Music",

  // Instagram variations
  instagram: "Instagram",
  insta: "Instagram",

  // Facebook variations
  facebook: "Facebook",
  fb: "Facebook",
  "facebook messenger": "Messenger",
  "fb messenger": "Messenger",
  messenger: "Messenger",

  // Google variations
  google: "Google",
  "google chrome": "Chrome",
  chrome: "Chrome",
  "google maps": "Google Maps",
  maps: "Google Maps",
  gmail: "Gmail",
  "google meet": "Google Meet",

  // Microsoft variations
  "microsoft teams": "MS Teams",
  teams: "MS Teams",
  "ms teams": "MS Teams",
  outlook: "Outlook",
  "microsoft outlook": "Outlook",

  // Streaming
  netflix: "Netflix",
  "amazon prime": "Prime Video",
  "prime video": "Prime Video",
  hotstar: "Disney+ Hotstar",
  "disney+ hotstar": "Disney+ Hotstar",
  "disney hotstar": "Disney+ Hotstar",
  spotify: "Spotify",

  // Social
  twitter: "X (Twitter)",
  x: "X (Twitter)",
  snapchat: "Snapchat",
  snap: "Snapchat",
  telegram: "Telegram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",

  // Gaming
  pubg: "PUBG",
  "pubg mobile": "PUBG",
  "call of duty": "Call of Duty",
  cod: "Call of Duty",
  "cod mobile": "Call of Duty",
  freefire: "Free Fire",
  "free fire": "Free Fire",

  // Communication
  zoom: "Zoom",
  "zoom meeting": "Zoom",
  skype: "Skype",
  discord: "Discord",

  // Others
  jio: "Jio",
  "jio tv": "JioTV",
  jiotv: "JioTV",
  "jio cinema": "JioCinema",
  jiocinema: "JioCinema",
  airtel: "Airtel",
  "airtel xstream": "Airtel Xstream",
  paytm: "Paytm",
  phonepe: "PhonePe",
  gpay: "Google Pay",
  "google pay": "Google Pay",
  amazon: "Amazon",
  flipkart: "Flipkart",
};

// Normalize app name
const normalizeAppName = (appName) => {
  if (!appName) return "Unknown";
  const normalized = appName.toLowerCase().trim();
  return APP_NAME_MAPPINGS[normalized] || appName.trim();
};

// Get app category
const getAppCategory = (appName) => {
  const normalized = appName.toLowerCase();

  if (
    ["whatsapp", "telegram", "messenger", "discord", "skype"].some((a) =>
      normalized.includes(a),
    )
  ) {
    return "Messaging";
  }
  if (
    [
      "youtube",
      "netflix",
      "prime video",
      "hotstar",
      "spotify",
      "jiotv",
      "jiocinema",
    ].some((a) => normalized.includes(a))
  ) {
    return "Streaming";
  }
  if (
    [
      "instagram",
      "facebook",
      "twitter",
      "x",
      "snapchat",
      "tiktok",
      "linkedin",
    ].some((a) => normalized.includes(a))
  ) {
    return "Social";
  }
  if (
    ["pubg", "call of duty", "free fire", "fortnite"].some((a) =>
      normalized.includes(a),
    )
  ) {
    return "Gaming";
  }
  if (["zoom", "teams", "meet", "webex"].some((a) => normalized.includes(a))) {
    return "Video Call";
  }
  if (
    ["chrome", "safari", "firefox", "edge", "browser"].some((a) =>
      normalized.includes(a),
    )
  ) {
    return "Browser";
  }
  if (
    ["paytm", "phonepe", "gpay", "google pay", "amazon", "flipkart"].some((a) =>
      normalized.includes(a),
    )
  ) {
    return "Shopping/Payment";
  }
  if (["gmail", "mail", "outlook"].some((a) => normalized.includes(a))) {
    return "Email";
  }

  return "Other";
};

// ==================== HELPER FUNCTIONS ====================
const parseDuration = (durationStr) => {
  if (!durationStr) return 0;
  if (typeof durationStr === "number") return durationStr;
  const parts = durationStr.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] || 0;
};

const formatDuration = (totalSeconds) => {
  if (!totalSeconds || totalSeconds <= 0) return "00:00:00";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const formatValue = (value, decimals = 1) => {
  if (value == null || isNaN(value)) return "N/A";
  return value.toFixed(decimals);
};

const getSignalColor = (value, thresholds) => {
  if (value == null) return "text-white";
  if (value >= thresholds[0]) return "text-green-400";
  if (value >= thresholds[1]) return "text-yellow-400";
  return "text-red-400";
};

const getMosColor = (value) => {
  if (value == null) return "text-white";
  if (value >= 4) return "text-green-400";
  if (value >= 3) return "text-yellow-400";
  return "text-red-400";
};

const getLatencyColor = (value) => {
  if (value == null) return "text-white";
  if (value < 50) return "text-green-400";
  if (value < 100) return "text-yellow-400";
  return "text-red-400";
};

const getPacketLossColor = (value) => {
  if (value == null) return "text-white";
  if (value === 0) return "text-green-400";
  if (value < 1) return "text-yellow-400";
  return "text-red-400";
};

const getCategoryColor = (category) => {
  const colors = {
    Messaging: "bg-green-900/50 text-green-300 border border-green-700/30",
    Streaming: "bg-red-900/50 text-red-300 border border-red-700/30",
    Social: "bg-blue-900/50 text-blue-300 border border-blue-700/30",
    Gaming: "bg-purple-900/50 text-purple-300 border border-purple-700/30",
    "Video Call": "bg-cyan-900/50 text-cyan-300 border border-cyan-700/30",
    Browser: "bg-orange-900/50 text-orange-300 border border-orange-700/30",
    "Shopping/Payment":
      "bg-yellow-900/50 text-yellow-300 border border-yellow-700/30",
    Email: "bg-pink-900/50 text-pink-300 border border-pink-700/30",
    Other: "bg-slate-700/50 text-white border border-slate-600/30",
  };
  return colors[category] || colors["Other"];
};

// Get operator color for visual distinction
const getOperatorColor = (operator) => {
  const colors = {
    Airtel: "bg-red-500/20 text-red-300 border border-red-500/30",
    Jio: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
    Vodafone: "bg-orange-500/20 text-orange-300 border border-orange-500/30",
    "Vi": "bg-purple-500/20 text-purple-300 border border-purple-500/30",
    BSNL: "bg-green-500/20 text-green-300 border border-green-500/30",
  };
  
  // Fuzzy match for operator names
  const normalizedOp = operator.toLowerCase();
  for (const [key, value] of Object.entries(colors)) {
    if (normalizedOp.includes(key.toLowerCase())) {
      return value;
    }
  }
  
  return "bg-slate-600/20 text-slate-300 border border-slate-500/30";
};

// ==================== DETECT DATA STRUCTURE ====================
const isNestedBySession = (data) => {
  if (!data || typeof data !== "object") return false;

  const firstValue = Object.values(data)[0];
  if (!firstValue || typeof firstValue !== "object") return false;

  const hasAppMetrics =
    "sampleCount" in firstValue ||
    "avgRsrp" in firstValue ||
    "appName" in firstValue;

  return !hasAppMetrics;
};

// ==================== MAIN COMPONENT ====================
export const ApplicationTab = ({
  appSummary,
  expanded,
  chartRefs,
  dataFilters = { providers: [], bands: [], technologies: [] },
}) => {
  const [appSubTab, setAppSubTab] = useState("table");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedOperator, setSelectedOperator] = useState("all");
  const [sortConfig, setSortConfig] = useState({
    key: "totalSamples",
    direction: "desc",
  });

  // Aggregate and normalize app data - HANDLES BOTH FLAT AND NESTED STRUCTURES
  const aggregatedAppData = useMemo(() => {
    if (!appSummary || !Object.keys(appSummary).length) return [];

    const appAggregates = {};
    const isNested = isNestedBySession(appSummary);

    console.log(
      "appSummary structure:",
      isNested ? "Nested by session" : "Flat",
      appSummary,
    );

    const processAppMetrics = (appName, metrics, sessionId = "default") => {
      if (!metrics || typeof metrics !== "object") return;

      const normalizedName = normalizeAppName(metrics.appName || appName);
      const operator = metrics.operatorName || "Unknown Operator";
      const category = getAppCategory(normalizedName);

      // Create unique key combining app name and operator
      const aggregateKey = normalizedName;

      if (!appAggregates[aggregateKey]) {
        appAggregates[aggregateKey] = {
          key: aggregateKey,
          name: normalizedName,
          operators: new Set(), 
          category,
          sessions: new Set(),
          totalDurationSeconds: 0,
          totalSamples: 0,
          rsrpValues: [],
          rsrqValues: [],
          sinrValues: [],
          dlValues: [],
          ulValues: [],
          mosValues: [],
          latencyValues: [],
          jitterValues: [],
          packetLossValues: [],
        };
      }

      const agg = appAggregates[aggregateKey];
      agg.operators.add(operator);
      agg.sessions.add(sessionId);

      agg.totalDurationSeconds += metrics.durationSeconds || 0;
      agg.totalSamples += metrics.sampleCount || 0;

      if (metrics.avgRsrp != null) agg.rsrpValues.push(+metrics.avgRsrp);
      if (metrics.avgRsrq != null) agg.rsrqValues.push(+metrics.avgRsrq);
      if (metrics.avgSinr != null) agg.sinrValues.push(+metrics.avgSinr);
      if (metrics.avgDlTptMbps != null)
        agg.dlValues.push(+metrics.avgDlTptMbps);
      if (metrics.avgUlTptMbps != null)
        agg.ulValues.push(+metrics.avgUlTptMbps);
      if (metrics.avgMos != null) agg.mosValues.push(+metrics.avgMos);
      if (metrics.avgLatency != null)
        agg.latencyValues.push(+metrics.avgLatency);
      if (metrics.avgJitter != null) agg.jitterValues.push(+metrics.avgJitter);
      if (metrics.avgPacketLoss != null)
        agg.packetLossValues.push(+metrics.avgPacketLoss);
    };

    if (isNested) {
      Object.entries(appSummary).forEach(([sessionId, apps]) => {
        if (!apps || typeof apps !== "object") return;

        Object.entries(apps).forEach(([appName, metrics]) => {
          processAppMetrics(appName, metrics, sessionId);
        });
      });
    } else {
      Object.entries(appSummary).forEach(([appName, metrics]) => {
        processAppMetrics(appName, metrics, "session-1");
      });
    }

    // Calculate averages
    const calculateAverage = (values) => {
      if (!values?.length) return null;
      const validValues = values.filter((v) => v != null && !isNaN(v));
      if (!validValues.length) return null;
      return validValues.reduce((a, b) => a + b, 0) / validValues.length;
    };

    const result = Object.values(appAggregates)
      .filter((app) => app.totalSamples > 0 || app.totalDurationSeconds > 0)
      .map((app) => ({
        name: app.name,
        category: app.category,
       operators: Array.from(app.operators).join(", "),
        sessionCount: app.sessions.size,
        totalSamples: app.totalSamples,
        totalDurationSeconds: app.totalDurationSeconds,
        duration: formatDuration(app.totalDurationSeconds),
        avgRsrp: calculateAverage(app.rsrpValues),
        avgRsrq: calculateAverage(app.rsrqValues),
        avgSinr: calculateAverage(app.sinrValues),
        avgDl: calculateAverage(app.dlValues),
        avgUl: calculateAverage(app.ulValues),
        avgMos: calculateAverage(app.mosValues),
        avgLatency: calculateAverage(app.latencyValues),
        avgJitter: calculateAverage(app.jitterValues),
        avgPacketLoss: calculateAverage(app.packetLossValues),
      }));

    console.log("Aggregated App Data:", result);
    return result;
  }, [appSummary]);

  useEffect(() => {
    console.log(
      aggregatedAppData,
      "Final Aggregated App Data in ApplicationTab",
    );
  }, [aggregatedAppData]);

  const categories = useMemo(() => {
    const cats = [
      ...new Set(aggregatedAppData.map((app) => app.category)),
    ].sort();
    return ["all", ...cats];
  }, [aggregatedAppData]);

  const operators = useMemo(() => {
    const ops = [...new Set(aggregatedAppData.map((app) => app.operator))];
    return ["all", ...ops.sort()];
  }, [aggregatedAppData]);

  // ✅ FIXED: Properly filtered and sorted data with operator filter
  const filteredAndSortedData = useMemo(() => {
    let filtered = [...aggregatedAppData];

    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (app) =>
          app.name.toLowerCase().includes(search) ||
          app.category.toLowerCase().includes(search) ||
          app.operators.toLowerCase().includes(search)
      );
    }

    // Category filter
    if (selectedCategory !== "all") {
      filtered = filtered.filter((app) => app.category === selectedCategory);
    }

    // ✅ OPERATOR FILTER - NOW CONNECTED
    if (selectedOperator !== "all") {
      filtered = filtered.filter((app) => app.operator === selectedOperator);
    }

    // Sorting
    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];

        if (aVal == null) aVal = -Infinity;
        if (bVal == null) bVal = -Infinity;

        if (typeof aVal === "string") {
          return sortConfig.direction === "asc"
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        }

        return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
      });
    }

    return filtered;
  }, [aggregatedAppData, searchTerm, selectedCategory, selectedOperator, sortConfig]); // ✅ Added selectedOperator dependency

  const chartData = useMemo(() => {
    return filteredAndSortedData.map((app) => ({
      name: `${app.name} (${app.operator})`, // ✅ Include operator in chart labels
      mos: app.avgMos || 0,
      avgSinr: app.avgSinr || 0,
      avgRsrp: app.avgRsrp || 0,
      avgRsrq: app.avgRsrq || 0,
      dl: app.avgDl || 0,
      ul: app.avgUl || 0,
      avgLatency: app.avgLatency || 0,
      avgJitter: app.avgJitter || 0,
      avgPacketLoss: app.avgPacketLoss || 0,
      sessionCount: app.sessionCount,
      operator: app.operator,
    }));
  }, [filteredAndSortedData]);

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  };

  if (!appSummary || Object.keys(appSummary).length === 0) {
    return (
      <div className="space-y-4">
        <div className="bg-slate-800 rounded-lg p-6 text-center border border-slate-700">
          <Activity className="h-14 w-14 text-white mx-auto mb-3" />
          <p className="text-white text-[17px] mb-2">
            No Application Performance Data Available
          </p>
          <p className="text-white text-[15px]">
            Application metrics will appear here when data is available from
            your sessions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sub-Tab Navigation */}
      <div className="flex gap-2 bg-slate-800 p-2 rounded-lg">
        <button
          onClick={() => setAppSubTab("table")}
          className={`flex-1 px-4 py-2 text-[17px] font-medium rounded-md transition-all ${
            appSubTab === "table"
              ? "bg-blue-600 text-white shadow-md"
              : "bg-slate-700 text-white hover:bg-slate-600"
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Activity className="h-5 w-5" />
            App Table ({filteredAndSortedData.length})
          </div>
        </button>
        <button
          onClick={() => setAppSubTab("comparison")}
          className={`flex-1 px-4 py-2 text-[17px] font-medium rounded-md transition-all ${
            appSubTab === "comparison"
              ? "bg-blue-600 text-white shadow-md"
              : "bg-slate-700 text-white hover:bg-slate-600"
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Comparison Charts
          </div>
        </button>
      </div>

      {/* ✅ IMPROVED FILTERS SECTION */}
      <div className="flex gap-3 items-center flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-white" />
          <input
            type="text"
            placeholder="Search apps or operators..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-[17px] text-white placeholder-white/60 focus:outline-none focus:border-blue-500"
          />
        </div>

    

        {/* Category Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-white" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg text-[17px] text-white px-3 py-2 focus:outline-none focus:border-blue-500 min-w-[150px]"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat === "all" ? "All Categories" : cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table View */}
      {appSubTab === "table" && (
        <AppTableView
          data={filteredAndSortedData}
          sortConfig={sortConfig}
          onSort={handleSort}
          expanded={expanded}
        />
      )}

      {/* Comparison View */}
      {appSubTab === "comparison" && (
        <AppComparisonView chartData={chartData} chartRefs={chartRefs} />
      )}
    </div>
  );
};

// ==================== TABLE VIEW COMPONENT ====================
const AppTableView = ({ data, sortConfig, onSort, expanded }) => {
  if (!data?.length) {
    return (
      <div className="bg-slate-800 rounded-lg p-8 text-center border border-slate-700">
        <Activity className="h-14 w-14 text-white mx-auto mb-3" />
        <p className="text-white text-[17px]">
          No apps match the current filters
        </p>
      </div>
    );
  }

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) {
      return <ArrowUpDown className="h-4 w-4 text-white" />;
    }
    return sortConfig.direction === "asc" ? (
      <ArrowUp className="h-4 w-4 text-blue-400" />
    ) : (
      <ArrowDown className="h-4 w-4 text-blue-400" />
    );
  };

  const HeaderCell = ({ children, sortKey, className = "" }) => (
    <th
      className={`p-3 text-white font-medium cursor-pointer hover:text-blue-300 hover:bg-slate-800 transition-colors ${className}`}
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center justify-center gap-1">
        {children}
        <SortIcon columnKey={sortKey} />
      </div>
    </th>
  );

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full text-[15px]">
          <thead className="bg-slate-800 sticky top-0 z-10">
            <tr className="border-b border-slate-700">
              <HeaderCell sortKey="name" className="text-left min-w-[180px]">
                App Name
              </HeaderCell>
              <HeaderCell sortKey="operator" className="min-w-[140px]">
                Operator
              </HeaderCell>
              <HeaderCell sortKey="category" className="min-w-[120px]">
                Category
              </HeaderCell>
              <HeaderCell sortKey="sessionCount" className="min-w-[90px]">
                Sessions
              </HeaderCell>
              <HeaderCell sortKey="totalSamples" className="min-w-[100px]">
                Samples
              </HeaderCell>
              <HeaderCell
                sortKey="totalDurationSeconds"
                className="min-w-[110px]"
              >
                Duration
              </HeaderCell>
              <HeaderCell sortKey="avgRsrp" className="min-w-[90px]">
                RSRP
              </HeaderCell>
              <HeaderCell sortKey="avgRsrq" className="min-w-[90px]">
                RSRQ
              </HeaderCell>
              <HeaderCell sortKey="avgSinr" className="min-w-[90px]">
                SINR
              </HeaderCell>
              <HeaderCell sortKey="avgDl" className="min-w-[100px]">
                Download
              </HeaderCell>
              <HeaderCell sortKey="avgUl" className="min-w-[100px]">
                Upload
              </HeaderCell>
              <HeaderCell sortKey="avgMos" className="min-w-[80px]">
                MOS
              </HeaderCell>
              <HeaderCell sortKey="avgLatency" className="min-w-[90px]">
                Latency
              </HeaderCell>
              <HeaderCell sortKey="avgJitter" className="min-w-[80px]">
                Jitter
              </HeaderCell>
              <HeaderCell sortKey="avgPacketLoss" className="min-w-[100px]">
                Packet Loss
              </HeaderCell>
            </tr>
          </thead>
          <tbody>
            {data.map((app, idx) => (
              <tr
                key={`${app.name}-${app.operator}-${idx}`}
                className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
              >
                {/* App Name */}
                <td className="p-3 text-left">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-full flex-shrink-0"></div>
                    <span className="font-semibold text-white">{app.name}</span>
                  </div>
                </td>

                {/* ✅ IMPROVED Operator Display */}
                <td className="p-3 text-center">
  <div className="flex flex-wrap gap-1 justify-center">
    {app.operators.split(", ").map((op, idx) => (
      <span
        key={idx}
        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${getOperatorColor(op)}`}
      >
        {op}
      </span>
    ))}
  </div>
</td>


                {/* Category */}
                <td className="p-3 text-center">
                  <span
                    className={`px-2 py-1 rounded-full text-[13px] font-medium ${getCategoryColor(app.category)}`}
                  >
                    {app.category}
                  </span>
                </td>

                {/* Sessions */}
                <td className="p-3 text-center text-white font-medium">
                  {app.sessionCount}
                </td>

                {/* Samples */}
                <td className="p-3 text-center text-white font-semibold">
                  {app.totalSamples.toLocaleString()}
                </td>

                {/* Duration */}
                <td className="p-3 text-center text-green-400 font-mono text-[13px] font-semibold">
                  {app.duration}
                </td>

                {/* RSRP */}
                <td
                  className={`p-3 text-center font-semibold ${getSignalColor(app.avgRsrp, [-90, -105])}`}
                >
                  {formatValue(app.avgRsrp, 1)} dBm
                </td>

                {/* RSRQ */}
                <td className="p-3 text-center font-semibold text-purple-400">
                  {formatValue(app.avgRsrq, 1)} dB
                </td>

                {/* SINR */}
                <td className="p-3 text-center font-semibold text-green-400">
                  {formatValue(app.avgSinr, 1)} dB
                </td>

                {/* Download */}
                <td className="p-3 text-center font-semibold text-cyan-400">
                  {app.avgDl != null ? `${app.avgDl.toFixed(1)} Mbps` : "N/A"}
                </td>

                {/* Upload */}
                <td className="p-3 text-center font-semibold text-orange-400">
                  {app.avgUl != null ? `${app.avgUl.toFixed(1)} Mbps` : "N/A"}
                </td>

                {/* MOS */}
                <td
                  className={`p-3 text-center font-semibold ${getMosColor(app.avgMos)}`}
                >
                  {formatValue(app.avgMos, 2)}
                </td>

                {/* Latency */}
                <td
                  className={`p-3 text-center font-semibold ${getLatencyColor(app.avgLatency)}`}
                >
                  {app.avgLatency != null
                    ? `${app.avgLatency.toFixed(1)} ms`
                    : "N/A"}
                </td>

                {/* Jitter */}
                <td className="p-3 text-center font-semibold text-indigo-400">
                  {app.avgJitter != null
                    ? `${app.avgJitter.toFixed(1)} ms`
                    : "N/A"}
                </td>

                {/* Packet Loss */}
                <td
                  className={`p-3 text-center font-semibold ${getPacketLossColor(app.avgPacketLoss)}`}
                >
                  {app.avgPacketLoss != null
                    ? `${app.avgPacketLoss.toFixed(2)}%`
                    : "N/A"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ✅ IMPROVED Table Footer with Better Stats */}
      <div className="bg-slate-800 px-4 py-3 text-[15px] text-white border-t border-slate-700">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <span className="font-medium">
            Showing {data.length} app{data.length !== 1 ? "s" : ""} •{" "}
            {[...new Set(data.map((app) => app.operator))].length} operator
            {[...new Set(data.map((app) => app.operator))].length !== 1
              ? "s"
              : ""}
          </span>
          <div className="flex gap-4 text-[14px]">
            <span className="text-cyan-400">
              Total Samples:{" "}
              {data
                .reduce((sum, app) => sum + app.totalSamples, 0)
                .toLocaleString()}
            </span>
            <span className="text-green-400">
              Total Duration:{" "}
              {formatDuration(
                data.reduce((sum, app) => sum + app.totalDurationSeconds, 0)
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== COMPARISON VIEW COMPONENT ====================
const AppComparisonView = ({ chartData, chartRefs }) => {
  const [selectedQualityMetric, setSelectedQualityMetric] = useState("mos");
  const [selectedPerformanceMetric, setSelectedPerformanceMetric] =
    useState("latency");

  const QUALITY_METRICS = {
    mos: {
      key: "mos",
      label: "MOS Score",
      color: "#fbbf24",
      format: (val) => val?.toFixed(2) || "N/A",
      domain: [0, 5],
      unit: "",
    },
    sinr: {
      key: "avgSinr",
      label: "SINR",
      color: "#22c55e",
      format: (val) => `${val?.toFixed(1) || 0} dB`,
      domain: [-20, 30],
      unit: "dB",
    },
    rsrp: {
      key: "avgRsrp",
      label: "RSRP",
      color: "#3b82f6",
      format: (val) => `${val?.toFixed(1) || 0} dBm`,
      domain: [-140, -40],
      unit: "dBm",
    },
    rsrq: {
      key: "avgRsrq",
      label: "RSRQ",
      color: "#a855f7",
      format: (val) => `${val?.toFixed(1) || 0} dB`,
      domain: [-20, 0],
      unit: "dB",
    },
  };

  const PERFORMANCE_METRICS = {
    latency: {
      key: "avgLatency",
      label: "Latency",
      color: "#a855f7",
      format: (val) => `${val?.toFixed(1) || 0} ms`,
      domain: [0, "auto"],
      unit: "ms",
    },
    jitter: {
      key: "avgJitter",
      label: "Jitter",
      color: "#6366f1",
      format: (val) => `${val?.toFixed(1) || 0} ms`,
      domain: [0, "auto"],
      unit: "ms",
    },
    packetLoss: {
      key: "avgPacketLoss",
      label: "Packet Loss",
      color: "#ef4444",
      format: (val) => `${val?.toFixed(2) || 0}%`,
      domain: [0, "auto"],
      unit: "%",
    },
  };

  const currentQualityMetric = QUALITY_METRICS[selectedQualityMetric];
  const currentPerformanceMetric =
    PERFORMANCE_METRICS[selectedPerformanceMetric];

  if (!chartData?.length) {
    return (
      <div className="bg-slate-800 rounded-lg p-8 text-center border border-slate-700">
        <BarChart3 className="h-14 w-14 text-white mx-auto mb-3" />
        <p className="text-white text-[17px]">
          No application data for comparison
        </p>
      </div>
    );
  }

  const ChartCard = ({
    children,
    chartRef,
    title,
    icon: Icon,
    metricSelector,
  }) => (
    <div
      ref={chartRef}
      className="bg-slate-900 rounded-lg p-4 border border-slate-700 w-full max-w-[650px]"
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h4 className="text-[17px] font-semibold text-white flex items-center gap-2">
          <Icon className="h-5 w-5" />
          {title}
        </h4>
        {metricSelector}
      </div>
      <div className="h-[320px] w-full">{children}</div>
    </div>
  );

  // ✅ Custom Tooltip with Operator Information
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-lg">
          <p className="text-white font-semibold mb-1">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: {entry.value?.toFixed(2)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 justify-center">
        {/* Signal Quality Chart */}
        <ChartCard
          chartRef={chartRefs?.mosChart}
          title="Signal Quality Comparison"
          icon={BarChart3}
          metricSelector={
            <div className="flex items-center gap-2">
              <span className="text-[15px] text-white">Metric:</span>
              <select
                value={selectedQualityMetric}
                onChange={(e) => setSelectedQualityMetric(e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-[15px] text-white focus:outline-none focus:border-blue-500"
              >
                {Object.entries(QUALITY_METRICS).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.label}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 20, left: 10, bottom: 80 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="name"
                angle={-45}
                textAnchor="end"
                height={100}
                tick={{ fill: "#ffffff", fontSize: 10 }}
                interval={0}
              />
              <YAxis
                domain={currentQualityMetric.domain}
                tick={{ fill: "#ffffff", fontSize: 12 }}
                width={60}
                label={{
                  value: `${currentQualityMetric.label} ${currentQualityMetric.unit ? `(${currentQualityMetric.unit})` : ""}`,
                  angle: -90,
                  position: "insideLeft",
                  style: { fill: "#ffffff", fontSize: 12 },
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: "13px", paddingTop: "10px" }} />
              <Bar
                dataKey={currentQualityMetric.key}
                fill={currentQualityMetric.color}
                name={currentQualityMetric.label}
                radius={[6, 6, 0, 0]}
                maxBarSize={60}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Throughput Chart */}
        <ChartCard
          chartRef={chartRefs?.throughputChart}
          title="Throughput Comparison"
          icon={TrendingUp}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 20, left: 10, bottom: 80 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="name"
                angle={-45}
                textAnchor="end"
                height={100}
                tick={{ fill: "#ffffff", fontSize: 10 }}
                interval={0}
              />
              <YAxis
                tick={{ fill: "#ffffff", fontSize: 12 }}
                width={60}
                label={{
                  value: "Speed (Mbps)",
                  angle: -90,
                  position: "insideLeft",
                  style: { fill: "#ffffff", fontSize: 12 },
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: "13px", paddingTop: "10px" }} />
              <Bar
                dataKey="dl"
                fill="#06b6d4"
                name="Download"
                radius={[6, 6, 0, 0]}
                maxBarSize={45}
              />
              <Bar
                dataKey="ul"
                fill="#fb923c"
                name="Upload"
                radius={[6, 6, 0, 0]}
                maxBarSize={45}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Network Performance Chart */}
        <ChartCard
          chartRef={chartRefs?.qoeChart}
          title="Network Performance"
          icon={Signal}
          metricSelector={
            <div className="flex items-center gap-2">
              <span className="text-[15px] text-white">Metric:</span>
              <select
                value={selectedPerformanceMetric}
                onChange={(e) => setSelectedPerformanceMetric(e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-[15px] text-white focus:outline-none focus:border-blue-500"
              >
                {Object.entries(PERFORMANCE_METRICS).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.label}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 20, left: 10, bottom: 80 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="name"
                angle={-45}
                textAnchor="end"
                height={100}
                tick={{ fill: "#ffffff", fontSize: 10 }}
                interval={0}
              />
              <YAxis
                domain={currentPerformanceMetric.domain}
                tick={{ fill: "#ffffff", fontSize: 12 }}
                width={60}
                label={{
                  value: `${currentPerformanceMetric.label} ${currentPerformanceMetric.unit ? `(${currentPerformanceMetric.unit})` : ""}`,
                  angle: -90,
                  position: "insideLeft",
                  style: { fill: "#ffffff", fontSize: 12 },
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: "13px", paddingTop: "10px" }} />
              <Bar
                dataKey={currentPerformanceMetric.key}
                fill={currentPerformanceMetric.color}
                name={currentPerformanceMetric.label}
                radius={[6, 6, 0, 0]}
                maxBarSize={60}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
};

export default ApplicationTab;