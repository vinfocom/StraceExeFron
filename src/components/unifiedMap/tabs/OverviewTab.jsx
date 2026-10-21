import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  MapPin,
  Activity,
  Layers,
  Clock,
  Antenna,
  Wifi,
  AlertCircle,
  Download,
  Upload,
  Timer,
  Gauge,
  Square,
  SlidersHorizontal,
  Loader2,
} from "lucide-react";
import { StatCard } from "../common/StatCard";
import { PCI_COLOR_PALETTE } from "@/components/map/layers/MultiColorCirclesLayer";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { mapViewApi, pptReportApi, settingApi } from "@/api/apiEndpoints";
import ReportProgressToast from "../ReportProgressToast";
import { useAuth } from "@/hooks/useAuth";
import { resolveUserRegion } from "@/utils/authSession";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  normalizeProviderName,
  normalizeTechName,
  COLOR_SCHEMES,
  getLogColor,
} from "@/utils/colorUtils";
import { downloadKmlForLogs } from "@/utils/kmlExport";

const PROVIDER_VOLUME_CACHE = new Map();
const PROVIDER_VOLUME_PENDING = new Map();
const PROVIDER_VOLUME_CACHE_VERSION = "v2";

const getProviderVolumeCacheKey = (projectId, sessionIds = []) => {
  const normalizedProjectId = String(projectId ?? "").trim() || "no-project";
  const normalizedSessions = Array.isArray(sessionIds)
    ? sessionIds.map((id) => String(id ?? "").trim()).filter(Boolean).join(",")
    : "";
  return `${PROVIDER_VOLUME_CACHE_VERSION}::${normalizedProjectId}::${normalizedSessions}`;
};

const formatDuration = (seconds) => {
  if (!seconds || seconds <= 0) return "N/A";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
};

const formatSpeed = (mbps) => {
  if (!mbps || mbps <= 0) return "N/A";
  return mbps >= 1 ? `${mbps.toFixed(2)} Mbps` : `${(mbps * 1000).toFixed(0)} kbps`;
};

const formatMetricNumber = (value, decimals = 3) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "N/A";
  return numeric.toFixed(decimals);
};

const formatBytes = (gb, toUnit = "GB") => {
  if (!gb || gb <= 0) return "0.00";
  if (toUnit === "GB") {
    return gb.toFixed(2);
  } else if (toUnit === "MB") {
    return (gb * 1024).toFixed(2);
  }
  return gb.toFixed(2);
};

const PROVIDER_VOLUME_DEFAULT_COLUMNS = ["downloadGb", "uploadGb", "avgDlSpeedFormatted", "avgUlSpeedFormatted"];

const PROVIDER_VOLUME_OPTIONAL_COLUMNS = [
  {
    key: "sampleCount",
    label: "Samples",
    headerClassName: "text-right min-w-[5rem]",
    cellClassName: "text-right text-white",
    render: (item) => item.sampleCount,
  },
  {
    key: "downloadGb",
    label: "DL (GB)",
    icon: Download,
    headerClassName: "text-right min-w-[5.5rem]",
    cellClassName: "text-right text-blue-400",
    render: (item) => item.downloadGb,
  },
  {
    key: "uploadGb",
    label: "UL (GB)",
    icon: Upload,
    headerClassName: "text-right min-w-[5.5rem]",
    cellClassName: "text-right text-green-400",
    render: (item) => item.uploadGb,
  },
  {
    key: "avgDlSpeedFormatted",
    label: "Avg DL",
    icon: Gauge,
    headerClassName: "text-right min-w-[6.5rem]",
    cellClassName: "text-right text-cyan-400",
    render: (item) => item.avgDlSpeedFormatted,
  },
  {
    key: "minDlSpeedFormatted",
    label: "Min DL",
    headerClassName: "text-right min-w-[6.5rem]",
    cellClassName: "text-right text-cyan-300",
    render: (item) => item.minDlSpeedFormatted,
  },
  {
    key: "medianDlSpeedFormatted",
    label: "Median DL",
    headerClassName: "text-right min-w-[7rem]",
    cellClassName: "text-right text-cyan-300",
    render: (item) => item.medianDlSpeedFormatted,
  },
  {
    key: "maxDlSpeedFormatted",
    label: "Max DL",
    headerClassName: "text-right min-w-[6.5rem]",
    cellClassName: "text-right text-cyan-300",
    render: (item) => item.maxDlSpeedFormatted,
  },
  {
    key: "stddevDlSpeedFormatted",
    label: "Std DL",
    headerClassName: "text-right min-w-[5.5rem]",
    cellClassName: "text-right text-cyan-300",
    render: (item) => item.stddevDlSpeedFormatted,
  },
  {
    key: "avgUlSpeedFormatted",
    label: "Avg UL",
    icon: Gauge,
    headerClassName: "text-right min-w-[6.5rem]",
    cellClassName: "text-right text-teal-400",
    render: (item) => item.avgUlSpeedFormatted,
  },
  {
    key: "minUlSpeedFormatted",
    label: "Min UL",
    headerClassName: "text-right min-w-[6.5rem]",
    cellClassName: "text-right text-teal-300",
    render: (item) => item.minUlSpeedFormatted,
  },
  {
    key: "medianUlSpeedFormatted",
    label: "Median UL",
    headerClassName: "text-right min-w-[7rem]",
    cellClassName: "text-right text-teal-300",
    render: (item) => item.medianUlSpeedFormatted,
  },
  {
    key: "maxUlSpeedFormatted",
    label: "Max UL",
    headerClassName: "text-right min-w-[6.5rem]",
    cellClassName: "text-right text-teal-300",
    render: (item) => item.maxUlSpeedFormatted,
  },
  {
    key: "stddevUlSpeedFormatted",
    label: "Std UL",
    headerClassName: "text-right min-w-[5.5rem]",
    cellClassName: "text-right text-teal-300",
    render: (item) => item.stddevUlSpeedFormatted,
  },
  {
    key: "durationFormatted",
    label: "Duration",
    icon: Timer,
    headerClassName: "text-right min-w-[6.5rem]",
    cellClassName: "text-right text-orange-400",
    render: (item) => item.durationFormatted,
  },
];

export const PROBLEM_AREA_9_KPIS = [
  { key: "rsrp", label: "RSRP", op: "<", unit: "dBm", defaultCutoff: -105, placeholder: "-105" },
  { key: "rsrq", label: "RSRQ", op: "<", unit: "dB", defaultCutoff: -14, placeholder: "-14" },
  { key: "sinr", label: "SINR", op: "<", unit: "dB", defaultCutoff: 0, placeholder: "0" },
  { key: "mos", label: "MOS", op: "<", unit: "", defaultCutoff: 3.0, placeholder: "3.0" },
  { key: "dl_tpt", label: "DL THP", op: "<", unit: "Mbps", defaultCutoff: 5, placeholder: "5", aliases: ["dl", "poor_dl"] },
  { key: "ul_tpt", label: "UL THP", op: "<", unit: "Mbps", defaultCutoff: 1, placeholder: "1", aliases: ["ul"] },
  { key: "latency", label: "LATENCY", op: ">", unit: "ms", defaultCutoff: 100, placeholder: "100", aliases: ["lat"] },
  { key: "jitter", label: "JITTER", op: ">", unit: "ms", defaultCutoff: 25, placeholder: "25", aliases: ["jit"] },
  { key: "packet_loss", label: "PACKET LOSS", op: ">", unit: "%", defaultCutoff: 2, placeholder: "2", aliases: ["loss"] },
];

const extractPoorCutoffFromThresholds = (thresholdData) => {
  const defaults = {
    rsrp: -105,
    rsrq: -14,
    sinr: 0,
    mos: 3.0,
    dl_tpt: 5,
    ul_tpt: 1,
    latency: 100,
    jitter: 25,
    packet_loss: 2,
  };

  if (!thresholdData) return defaults;

  // 1. Check PPT Report Acceptance first (explicit user setting)
  let pptAcceptance = thresholdData.ppt_report_acceptance || thresholdData.ppt_report_acceptance_json;
  if (typeof pptAcceptance === "string") {
    try { pptAcceptance = JSON.parse(pptAcceptance); } catch { pptAcceptance = null; }
  }
  if (pptAcceptance && typeof pptAcceptance === "object") {
    const src = pptAcceptance.default || pptAcceptance;
    const res = { ...defaults };
    let foundAny = false;
    PROBLEM_AREA_9_KPIS.forEach((kpi) => {
      const v = src[kpi.key] ?? src[kpi.key.replace("_tpt", "")];
      if (v !== undefined && v !== null && v !== "" && !Number.isNaN(Number(v))) {
        res[kpi.key] = Number(v);
        foundAny = true;
      }
    });
    if (foundAny) return res;
  }

  // 2. Fall back to parsing the general threshold bins for the red/poor row
  const parseItem = (val, isLowerBetter = false, fallbackVal = 0) => {
    if (val === null || val === undefined || val === "") return fallbackVal;
    if (typeof val === "number") return val;
    let parsed = val;
    if (typeof val === "string") {
      try {
        parsed = JSON.parse(val);
      } catch {
        const num = parseFloat(val);
        return Number.isNaN(num) ? fallbackVal : num;
      }
    }
    if (parsed && typeof parsed === "object") {
      let arr = Array.isArray(parsed) ? parsed : (parsed.default || parsed["4g"] || parsed["5g"] || []);
      if (Array.isArray(arr) && arr.length > 0) {
        const red = arr.find(
          (x) =>
            String(x?.color || "").toUpperCase().includes("FF0000") ||
            String(x?.color || "").toUpperCase().includes("RED") ||
            String(x?.label || "").toLowerCase().includes("poor") ||
            String(x?.label || "").toLowerCase().includes("bad")
        ) || (isLowerBetter ? arr[arr.length - 1] : arr[0]);
        if (red) {
          if (!isLowerBetter && red.max !== undefined && red.max !== null) return Number(red.max);
          if (isLowerBetter && red.min !== undefined && red.min !== null) return Number(red.min);
        }
      }
    }
    return fallbackVal;
  };

  return {
    rsrp: parseItem(thresholdData.rsrp_json || thresholdData.rsrp, false, defaults.rsrp),
    rsrq: parseItem(thresholdData.rsrq_json || thresholdData.rsrq, false, defaults.rsrq),
    sinr: parseItem(thresholdData.sinr_json || thresholdData.sinr, false, defaults.sinr),
    mos: parseItem(thresholdData.mos_json || thresholdData.mos, false, defaults.mos),
    dl_tpt: parseItem(thresholdData.dl_thpt_json || thresholdData.dl_tpt || thresholdData.dl, false, defaults.dl_tpt),
    ul_tpt: parseItem(thresholdData.ul_thpt_json || thresholdData.ul_tpt || thresholdData.ul, false, defaults.ul_tpt),
    latency: parseItem(thresholdData.latency, true, defaults.latency),
    jitter: parseItem(thresholdData.jitter, true, defaults.jitter),
    packet_loss: parseItem(thresholdData.packet_loss, true, defaults.packet_loss),
  };
};

export const OverviewTab = ({
  totalLocations,
  filteredCount,
  siteData,
  siteToggle,
  enableSiteToggle,
  showPolygons,
  polygonStats,
  stats,
  selectedMetric,
  ioSummary,
  duration,
  locations,
  mapPlotLocations = [],
  expanded,
  tptVolume,
  durationData,
  distance,
  drawnShapeAnalytics = [],
  sessionIds: sessionIdsProp = [],
  projectId = null,
  availableBands = [],
  reportTechnologies = [],
  gridViewEnabled = false,
  gridViewSummary = null,
}) => {
  const [searchParams] = useSearchParams();
  const [providerVolume, setProviderVolume] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isGeneratingPpt, setIsGeneratingPpt] = useState(false);
  const [pptPercent, setPptPercent] = useState(null);
  const [readyPpt, setReadyPpt] = useState(null);
  const [isPptBandDialogOpen, setIsPptBandDialogOpen] = useState(false);
  const [lockedBand, setLockedBand] = useState("all");
  const [pptTemplate, setPptTemplate] = useState("");
  const [pptTechnologies, setPptTechnologies] = useState([]);
  const [pptMapViewType, setPptMapViewType] = useState("grid");
  const [pptAggregation, setPptAggregation] = useState("median");
  // Taiwan-template dynamic KPI selection: null means "all" (default full report)
  const [pptSelectedKpis, setPptSelectedKpis] = useState(null);
  const [pptKpiCategoryFilter, setPptKpiCategoryFilter] = useState("all");
  const [pptKpiSearchText, setPptKpiSearchText] = useState("");
  const [pptPoorDlThreshold, setPptPoorDlThreshold] = useState(5);
  const [pptProblemAreaTechs, setPptProblemAreaTechs] = useState(["5G SA", "5G NSA", "4G", "4G LTE Anchor"]);
  const [pptProblemAreaKpis, setPptProblemAreaKpis] = useState([
    "rsrp", "rsrq", "sinr", "mos", "dl_tpt", "ul_tpt", "latency", "jitter", "packet_loss"
  ]);
  const [pptProblemAreaThresholds, setPptProblemAreaThresholds] = useState({
    rsrp: -105, rsrq: -14, sinr: 0, mos: 3.0, dl_tpt: 5, ul_tpt: 1, latency: 100, jitter: 25, packet_loss: 2
  });

  // Load custom poor thresholds from threshold settings (prioritizing PPT Report Acceptance)
  useEffect(() => {
    let active = true;
    const fetchThresholds = async () => {
      try {
        const resp = await settingApi.getThresholdSettings();
        const data = resp?.data?.Data || resp?.Data || resp?.data;
        if (data && active) {
          const cutoffs = extractPoorCutoffFromThresholds(data);
          setPptProblemAreaThresholds(cutoffs);
          if (cutoffs.dl_tpt !== undefined) {
            setPptPoorDlThreshold(cutoffs.dl_tpt);
          }
        }
      } catch (e) {
        console.warn("Could not load threshold settings for PPT Problem Areas:", e);
      }
    };
    fetchThresholds();
    return () => { active = false; };
  }, []);

  // ─── Dynamic Technology-Wise KPI Options ───────────────────────────
  const PPT_KPI_OPTIONS = useMemo(() => [
    // ─── 5G KPIs ───────────────────────────────────────
    { key: "5g_rsrp",     label: "5G RSRP (dBm)",                group: "5G Coverage",    tech: "5G", category: "5g", isCore: true },
    { key: "5g_rsrq",     label: "5G RSRQ (dB)",                 group: "5G Quality",     tech: "5G", category: "5g", isCore: true },
    { key: "5g_sinr",     label: "5G SINR (dB)",                 group: "5G Quality",     tech: "5G", category: "5g", isCore: true },
    { key: "5g_dl_tpt",   label: "5G DL Throughput (Mbps)",      group: "5G Throughput",  tech: "5G", category: "5g", isCore: true },
    { key: "5g_ul_tpt",   label: "5G UL Throughput (Mbps)",      group: "5G Throughput",  tech: "5G", category: "5g", isCore: true },
    { key: "5g_pci",      label: "5G PCI Distribution",          group: "5G Cell & PCI",  tech: "5G", category: "5g" },
    { key: "5g_earfcn",   label: "5G NR-ARFCN",                  group: "5G Cell & PCI",  tech: "5G", category: "5g" },
    { key: "5g_cell_id",  label: "5G Cell ID",                   group: "5G Cell & PCI",  tech: "5G", category: "5g" },
    { key: "5g_ca",       label: "5G CA Configuration",          group: "5G Carrier Agg", tech: "5G", category: "5g" },
    { key: "5g_mac_dl",   label: "5G MAC DL Throughput",         group: "5G Throughput",  tech: "5G", category: "5g" },
    { key: "handover",    label: "5G Handover / ENDC",           group: "5G Mobility",    tech: "5G", category: "5g" },
    { key: "5g_mac_bler", label: "5G MAC BLER (%)",              group: "5G L3/MAC",      tech: "5G", category: "5g" },
    { key: "5g_mac_mcs",  label: "5G MAC MCS / Modulation",      group: "5G L3/MAC",      tech: "5G", category: "5g" },

    // ─── 4G KPIs ───────────────────────────────────────
    { key: "4g_rsrp",       label: "4G RSRP (dBm)",              group: "4G Coverage",    tech: "4G", category: "4g", isCore: true },
    { key: "4g_rsrq",       label: "4G RSRQ (dB)",               group: "4G Quality",     tech: "4G", category: "4g", isCore: true },
    { key: "4g_sinr",       label: "4G SINR (dB)",               group: "4G Quality",     tech: "4G", category: "4g", isCore: true },
    { key: "4g_dl_tpt",     label: "4G DL Throughput (Mbps)",    group: "4G Throughput",  tech: "4G", category: "4g", isCore: true },
    { key: "4g_ul_tpt",     label: "4G UL Throughput (Mbps)",    group: "4G Throughput",  tech: "4G", category: "4g", isCore: true },
    { key: "4g_pci",        label: "4G PCI Distribution",        group: "4G Cell & PCI",  tech: "4G", category: "4g" },
    { key: "4g_earfcn",     label: "4G EARFCN",                  group: "4G Cell & PCI",  tech: "4G", category: "4g" },
    { key: "4g_cell_id",    label: "4G Cell ID",                 group: "4G Cell & PCI",  tech: "4G", category: "4g" },
    { key: "4g_ca",         label: "4G CA Configuration",        group: "4G Carrier Agg", tech: "4G", category: "4g" },
    { key: "4g_mac_dl",     label: "4G MAC DL Throughput",       group: "4G Throughput",  tech: "4G", category: "4g" },
    { key: "4g_rsrp_l700",  label: "4G RSRP L700/L900 (dBm)",    group: "4G Band Cov",    tech: "4G", category: "4g" },
    { key: "4g_rsrp_l1800", label: "4G RSRP L1800 (dBm)",        group: "4G Band Cov",    tech: "4G", category: "4g" },
    { key: "4g_rsrp_l2100", label: "4G RSRP L2100 (dBm)",        group: "4G Band Cov",    tech: "4G", category: "4g" },
    { key: "4g_rsrp_l2600", label: "4G RSRP L2600 (dBm)",        group: "4G Band Cov",    tech: "4G", category: "4g" },
    { key: "4g_mac_bler",   label: "4G LTE BLER (%)",            group: "4G L3/MAC",      tech: "4G", category: "4g" },
    { key: "4g_mac_mcs",    label: "4G LTE MCS",                 group: "4G L3/MAC",      tech: "4G", category: "4g" },

    // ─── 3G KPIs ───────────────────────────────────────
    { key: "3g_rsrp",     label: "3G RSCP / RSRP (dBm)",         group: "3G Coverage",    tech: "3G", category: "3g", isCore: true },
    { key: "3g_rsrq",     label: "3G Ec/No / RSRQ (dB)",         group: "3G Quality",     tech: "3G", category: "3g", isCore: true },
    { key: "3g_sinr",     label: "3G SINR (dB)",                 group: "3G Quality",     tech: "3G", category: "3g", isCore: true },
    { key: "3g_dl_tpt",   label: "3G DL Throughput (Mbps)",      group: "3G Throughput",  tech: "3G", category: "3g", isCore: true },
    { key: "3g_ul_tpt",   label: "3G UL Throughput (Mbps)",      group: "3G Throughput",  tech: "3G", category: "3g", isCore: true },
    { key: "3g_pci",      label: "3G PSC / PCI",                 group: "3G Cell & PSC",  tech: "3G", category: "3g" },
    { key: "3g_earfcn",   label: "3G UARFCN",                    group: "3G Cell & PSC",  tech: "3G", category: "3g" },
    { key: "3g_cell_id",  label: "3G Cell ID",                   group: "3G Cell & PSC",  tech: "3G", category: "3g" },

    // ─── 2G KPIs ───────────────────────────────────────
    { key: "2g_rsrp",     label: "2G RxLev / RSRP (dBm)",        group: "2G Coverage",    tech: "2G", category: "2g", isCore: true },
    { key: "2g_rxqual",   label: "2G RxQual / Quality",          group: "2G Quality",     tech: "2G", category: "2g", isCore: true },
    { key: "2g_dl_tpt",   label: "2G DL Throughput (Mbps)",      group: "2G Throughput",  tech: "2G", category: "2g", isCore: true },
    { key: "2g_ul_tpt",   label: "2G UL Throughput (Mbps)",      group: "2G Throughput",  tech: "2G", category: "2g", isCore: true },
    { key: "2g_pci",      label: "2G BSIC / PCI",                group: "2G Cell & BSIC", tech: "2G", category: "2g" },
    { key: "2g_earfcn",   label: "2G BCCH / ARFCN",              group: "2G Cell & BSIC", tech: "2G", category: "2g" },
    { key: "2g_cell_id",  label: "2G Cell ID",                   group: "2G Cell & BSIC", tech: "2G", category: "2g" },

    // ─── Network & Performance Filters ─────────────────
    { key: "technology",         label: "Technology Mode Route",         group: "Network Overview", category: "network", isCore: true },
    { key: "ci_db",              label: "C/I (Carrier-to-Interference)", group: "Signal & Quality", category: "network" },
    { key: "mos",                label: "MOS (Mean Opinion Score)",       group: "Voice / Quality",  category: "network", isCore: true },
    { key: "jitter",             label: "Jitter (ms)",                    group: "Performance",      category: "network" },
    { key: "latency",            label: "Latency / Ping (ms)",            group: "Performance",      category: "network" },
    { key: "packet_loss",        label: "Packet Loss (%)",                group: "Performance",      category: "network" },
    { key: "num_cells",          label: "Pilot Pollution (Num Cells)",   group: "Network & Cell",   category: "network" },
    { key: "level",              label: "Ping Pong / Level",              group: "Network & Cell",   category: "network" },
    { key: "dominance",          label: "Dominance Analysis",             group: "Network & Cell",   category: "network" },
    { key: "coverage_violation", label: "Coverage Violation",             group: "Network & Cell",   category: "network" },
    { key: "tac",                label: "TAC / LAC",                      group: "Network & Cell",   category: "network" },
    { key: "app_dl",             label: "App DL Throughput (Overall)",    group: "Throughput",       category: "network" },
    { key: "poor_dl",            label: `Poor DL (< ${Number(pptProblemAreaThresholds?.dl_tpt || pptProblemAreaThresholds?.dl || pptPoorDlThreshold) || 5} Mbps)`, group: "Problem Areas", category: "network" },

    // ─── L3 / MAC KPIs ─────────────────────────────────
    { key: "mac_ul",             label: "MAC UL Throughput",              group: "L3 / MAC",         category: "network" },
    { key: "mac_dl_delivered",   label: "MAC DL Delivered",               group: "L3 / MAC",         category: "network" },
    { key: "mac_ul_delivered",   label: "MAC UL Delivered",               group: "L3 / MAC",         category: "network" },
    { key: "mac_bler",           label: "MAC BLER (%)",                   group: "L3 / MAC",         category: "network" },
    { key: "mac_bler_init",      label: "MAC BLER Init (%)",              group: "L3 / MAC",         category: "network" },
    { key: "mac_mcs",            label: "MAC MCS / Modulation Code",      group: "L3 / MAC",         category: "network" },
    { key: "mac_retx",           label: "MAC Retransmission (%)",         group: "L3 / MAC",         category: "network" },
    { key: "mac_rb",             label: "MAC Resource Blocks (RB)",       group: "L3 / MAC",         category: "network" },
    { key: "mac_grants",         label: "MAC Grants / Sec",               group: "L3 / MAC",         category: "network" },
    { key: "mac_tx_power",       label: "MAC Tx Power (dBm)",             group: "L3 / MAC",         category: "network" },
    { key: "mac_modulation_pct",  label: "MAC Modulation %",               group: "L3 / MAC",         category: "network" },
  ], [pptPoorDlThreshold, pptProblemAreaThresholds]);

  const filteredPptKpis = useMemo(() => {
    return PPT_KPI_OPTIONS.filter((kpi) => {
      if (pptKpiCategoryFilter !== "all") {
        if (kpi.category !== pptKpiCategoryFilter) {
          return false;
        }
      } else {
        if (kpi.tech && !pptTechnologies.includes(kpi.tech)) {
          return false;
        }
      }
      if (pptKpiSearchText.trim()) {
        const query = pptKpiSearchText.trim().toLowerCase();
        return (
          kpi.label.toLowerCase().includes(query) ||
          kpi.group.toLowerCase().includes(query) ||
          kpi.key.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [PPT_KPI_OPTIONS, pptKpiCategoryFilter, pptTechnologies, pptKpiSearchText]);

  const togglePptKpi = useCallback((key) => {
    setPptSelectedKpis((current) => {
      const base = current === null
        ? PPT_KPI_OPTIONS.filter((o) => (!o.tech || pptTechnologies.includes(o.tech)) && o.isCore).map((o) => o.key)
        : current;
      return base.includes(key) ? base.filter((k) => k !== key) : [...base, key];
    });
  }, [PPT_KPI_OPTIONS, pptTechnologies]);

  const isPptKpiSelected = useCallback((key) => {
    if (pptSelectedKpis === null) {
      const item = PPT_KPI_OPTIONS.find((o) => o.key === key);
      if (!item) return false;
      if (!item.tech) return item.isCore ?? false;
      return pptTechnologies.includes(item.tech) && (item.isCore ?? false);
    }
    return pptSelectedKpis.includes(key);
  }, [pptSelectedKpis, PPT_KPI_OPTIONS, pptTechnologies]);

  const selectAllKpis = useCallback(() => {
    const targetKeys = filteredPptKpis.map((o) => o.key);
    setPptSelectedKpis((current) => {
      const base = current === null
        ? PPT_KPI_OPTIONS.filter((o) => !o.tech || pptTechnologies.includes(o.tech)).map((o) => o.key)
        : current;
      return Array.from(new Set([...base, ...targetKeys]));
    });
  }, [filteredPptKpis, PPT_KPI_OPTIONS, pptTechnologies]);

  const selectCoreKpis = useCallback(() => {
    const coreKeys = PPT_KPI_OPTIONS
      .filter((o) => o.isCore && (!o.tech || pptTechnologies.includes(o.tech)))
      .map((o) => o.key);
    setPptSelectedKpis(coreKeys);
  }, [PPT_KPI_OPTIONS, pptTechnologies]);

  const deselectAllKpis = useCallback(() => setPptSelectedKpis([]), []);

  const { user } = useAuth();
  const isTaiwanUser = useMemo(
    () => String(user?.country_code ?? "").trim().toUpperCase() === "TW",
    [user?.country_code],
  );
  const pptTemplateOptions = useMemo(
    () => (isTaiwanUser ? ["stracer", "taiwan"] : ["stracer"]),
    [isTaiwanUser],
  );

  useEffect(() => {
    if (!isTaiwanUser && pptTemplate === "taiwan") {
      setPptTemplate("");
      setLockedBand("all");
    }
  }, [isTaiwanUser, pptTemplate]);

  const plottedExportLocations = useMemo(() => {
    if (Array.isArray(mapPlotLocations) && mapPlotLocations.length > 0) {
      return mapPlotLocations;
    }
    return Array.isArray(locations) ? locations : [];
  }, [locations, mapPlotLocations]);

  const pptBandOptions = useMemo(() => {
    const candidates = [
      ...(Array.isArray(availableBands) ? availableBands : []),
      ...(Array.isArray(plottedExportLocations) ? plottedExportLocations : []).map(
        (location) => location?.band ?? location?.primaryBand,
      ),
    ];
    const bandsByKey = new Map();

    candidates.forEach((candidate) => {
      const band = String(candidate ?? "").trim();
      if (!band || /^(all|unknown|null|undefined)$/i.test(band)) return;
      const key = band.toLowerCase();
      if (!bandsByKey.has(key)) bandsByKey.set(key, band);
    });

    return Array.from(bandsByKey.values()).sort((a, b) => {
      const numberA = Number.parseInt(a.replace(/\D/g, ""), 10);
      const numberB = Number.parseInt(b.replace(/\D/g, ""), 10);
      if (Number.isFinite(numberA) && Number.isFinite(numberB) && numberA !== numberB) {
        return numberA - numberB;
      }
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [availableBands, plottedExportLocations]);

  useEffect(() => {
    if (lockedBand !== "all" && !pptBandOptions.includes(lockedBand)) {
      setLockedBand("all");
    }
  }, [lockedBand, pptBandOptions]);

  // Derive available technologies from reportTechnologies or locations, defaulting to ["5G", "4G"]
  const pptTechnologyOptions = useMemo(() => {
    if (Array.isArray(reportTechnologies) && reportTechnologies.length > 0) {
      return reportTechnologies;
    }
    const found = new Set();
    if (Array.isArray(plottedExportLocations)) {
      plottedExportLocations.forEach((loc) => {
        const t = String(loc?.technology || loc?.tech || "").toUpperCase();
        if (t.includes("5G") || t.includes("NR")) found.add("5G");
        if (t.includes("4G") || t.includes("LTE")) found.add("4G");
        if (t.includes("3G") || t.includes("WCDMA") || t.includes("UMTS")) found.add("3G");
        if (t.includes("2G") || t.includes("GSM")) found.add("2G");
      });
    }
    if (found.size > 0) {
      return ["5G", "4G", "3G", "2G"].filter((t) => found.has(t));
    }
    return ["5G", "4G"];
  }, [reportTechnologies, plottedExportLocations]);

  useEffect(() => {
    setPptTechnologies((current) => {
      if (current.length === 0) return pptTechnologyOptions;
      const next = current.filter((technology) => pptTechnologyOptions.includes(technology));
      return next.length > 0 ? next : pptTechnologyOptions;
    });
  }, [pptTechnologyOptions]);

  const togglePptTechnology = useCallback((technology) => {
    setPptTechnologies((current) => {
      const next = current.includes(technology)
        ? current.filter((item) => item !== technology)
        : [...current, technology];
      return next;
    });
    setPptKpiCategoryFilter(technology.toLowerCase());
  }, []);

  useEffect(() => {
    setReadyPpt(null);
  }, [projectId]);

  const downloadReadyPpt = useCallback((report) => {
    if (!report?.blob) return;
    const url = window.URL.createObjectURL(report.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = report.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 60000);
  }, []);

  const handleDownloadKml = useCallback(() => {
    try {
      const result = downloadKmlForLogs({
        locations: plottedExportLocations,
        selectedMetric,
      });
      toast.success(`Downloaded ${result.exportedCount.toLocaleString()} plotted logs as KML`);
    } catch (exportError) {
      toast.error(exportError?.message || "Failed to export plotted logs as KML.");
    }
  }, [plottedExportLocations, selectedMetric]);

  const sessionParam = searchParams.get("session");

  const sessionIdsFromQuery = useMemo(() => {
    if (!sessionParam) return [];
    return sessionParam
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id);
  }, [sessionParam]);

  const sessionIds = useMemo(() => {
    if (Array.isArray(sessionIdsProp) && sessionIdsProp.length > 0) {
      return sessionIdsProp
        .map((id) => String(id ?? "").trim())
        .filter((id) => id);
    }

    return sessionIdsFromQuery;
  }, [sessionIdsProp, sessionIdsFromQuery]);

  const handlePptDownload = useCallback(async () => {
    const numericProjectId = Number(projectId);
    if (!Number.isFinite(numericProjectId) || numericProjectId <= 0) {
      toast.error("Select a project before generating the PPT report.");
      return;
    }

    if (isGeneratingPpt) return;

    if (!pptTemplate) {
      toast.error("Select a PPT template first.");
      return;
    }

    if (pptTemplate === "stracer" && pptTechnologies.length === 0) {
      toast.error("Select at least one technology for the Stracer template.");
      return;
    }

    setReadyPpt(null);
    const region = resolveUserRegion(user) || "india";
    const numericUserId = Number(
      user?.id ?? user?.user_id ?? user?.userId ?? user?.UserId ?? 0,
    );
    const selectedSessionIds = sessionIds
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0);
    const payload = {
      project_id: numericProjectId,
      country_code: region,
      user_id: Number.isFinite(numericUserId) ? numericUserId : 0,
      locked_bands: lockedBand,
      template: pptTemplate,
      technology: pptTechnologies.length > 0 ? pptTechnologies : ["5G", "4G"],
      map_view_type: pptMapViewType,
      ...(pptMapViewType === "grid" ? { aggregation: pptAggregation } : {}),
      ...(selectedSessionIds.length > 0 ? { session_ids: selectedSessionIds } : {}),
      ...(pptSelectedKpis !== null ? { selected_kpis: pptSelectedKpis } : {}),
      poor_dl_threshold: Number(pptProblemAreaThresholds?.dl_tpt || pptProblemAreaThresholds?.dl || pptPoorDlThreshold) || 5,
      problem_area_thresholds: pptProblemAreaThresholds,
      problem_area_technologies: pptProblemAreaTechs,
      problem_area_kpis: pptProblemAreaKpis,
    };

    setIsPptBandDialogOpen(false);
    setIsGeneratingPpt(true);
    setPptPercent(0);
    const toastId = toast.loading("Preparing PowerPoint report...");
    const startedAtMs = Date.now();

    // Cancel is offered once the backend has given the job an id. The backend reports "cancelled"
    // at once and stops the presentation at its next step.
    let cancelPpt = null;
    let pptCancelling = false;
    // Shows the backend's percentage, current stage, elapsed time, time left and recent log lines.
    const showProgress = (info) => {
      const percent = Math.min(
        100,
        Math.max(0, Math.round(Number(info?.percentage ?? info?.progress ?? 0) || 0)),
      );
      setPptPercent(percent);
      toast.update(toastId, {
        type: "info",
        isLoading: true,
        render: (
          <ReportProgressToast
            percent={percent}
            label={info?.step || info?.message || "Generating PowerPoint report..."}
            elapsedSeconds={info?.elapsed_seconds ?? Math.round((Date.now() - startedAtMs) / 1000)}
            etaSeconds={info?.eta_seconds ?? null}
            onCancel={cancelPpt || undefined}
            cancelling={pptCancelling}
          />
        ),
      });
    };

    try {
      const response = await pptReportApi.generate(payload);
      let reportResponse = response;
      let status = String(reportResponse?.status || "").toLowerCase();
      if (status === "processing" && reportResponse?.report_id) {
        const reportId = reportResponse.report_id;
        cancelPpt = async () => {
          if (pptCancelling) return;
          pptCancelling = true;
          showProgress(reportResponse);
          try {
            await pptReportApi.cancel(reportId);
          } catch (cancelError) {
            pptCancelling = false;
            toast.warn("Could not cancel the PowerPoint report. It is still running.");
          }
        };
        const startedAt = Date.now();
        const maxWaitMs = 30 * 60 * 1000;
        const maxTransientErrors = 30;
        let transientErrors = 0;
        showProgress(reportResponse);
        while (Date.now() - startedAt < maxWaitMs) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          try {
            reportResponse = await pptReportApi.getStatus(reportId);
            transientErrors = 0;
          } catch (pollError) {
            // A dropped poll is not a failed report; keep waiting unless it keeps failing.
            transientErrors += 1;
            if (transientErrors > maxTransientErrors) throw pollError;
            continue;
          }
          status = String(reportResponse?.status || "").toLowerCase();
          if (status === "ready" || status === "failed" || status === "cancelled") break;
          showProgress(reportResponse);
        }
        if (status === "cancelled") {
          toast.update(toastId, {
            render: "PowerPoint report cancelled.",
            type: "info",
            isLoading: false,
            autoClose: 4000,
          });
          return;
        }
        if (status !== "ready") {
          throw new Error(
            reportResponse?.error || reportResponse?.message || "The PPT report could not be generated.",
          );
        }
      }
      if (status && !["success", "ready"].includes(status)) {
        throw new Error(reportResponse?.message || "The PPT report could not be generated.");
      }

      const blob = await pptReportApi.download(reportResponse?.download_url, numericProjectId);
      const report = {
        blob: blob instanceof Blob ? blob : new Blob([blob], {
          type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        }),
        filename: String(reportResponse?.output_file || `Mobility_DT_Project_${numericProjectId}.pptx`)
          .split(/[\\/]/).pop(),
      };
      setReadyPpt(report);
      downloadReadyPpt(report);

      toast.update(toastId, {
        render: "PowerPoint report is ready. Use Download PPT to save it again.",
        type: "success",
        isLoading: false,
        autoClose: 3000,
      });
    } catch (pptError) {
      console.error("PPT report generation failed:", pptError);
      toast.update(toastId, {
        render: pptError?.message || "Failed to generate PowerPoint report.",
        type: "error",
        isLoading: false,
        autoClose: 5000,
      });
    } finally {
      setIsGeneratingPpt(false);
      setPptPercent(null);
    }
  }, [downloadReadyPpt, isGeneratingPpt, lockedBand, projectId, pptAggregation, pptMapViewType, pptTechnologies, pptTemplate, sessionIds, user]);

  const handlePptButtonClick = useCallback(() => {
    if (isGeneratingPpt) return;
    setLockedBand("all");
    setPptTemplate(isTaiwanUser ? "taiwan" : "stracer");
    const defaultTechs = pptTechnologyOptions.length > 0 ? pptTechnologyOptions : ["5G", "4G"];
    setPptTechnologies(defaultTechs);
    setPptSelectedKpis(null);
    setPptKpiCategoryFilter(defaultTechs.includes("5G") ? "5g" : (defaultTechs[0]?.toLowerCase() || "all"));
    setPptKpiSearchText("");
    setPptMapViewType("grid");
    setPptAggregation("median");
    setIsPptBandDialogOpen(true);
  }, [isGeneratingPpt, isTaiwanUser, pptTechnologyOptions]);

  const isUnknownOrEmpty = useCallback((value) => {
    if (!value) return true;
    const normalized = value.toString().trim().toLowerCase();
    return (
      normalized === "unknown" ||
      normalized === "" ||
      normalized === "null" ||
      normalized === "undefined"
    );
  }, []);

  const fetchVolumeData = useCallback(async () => {
    if (!sessionIds.length) {
      setProviderVolume({});
      setLoading(false);
      setError(null);
      return;
    }

    const cacheKey = getProviderVolumeCacheKey(projectId, sessionIds);
    if (PROVIDER_VOLUME_CACHE.has(cacheKey)) {
      const cached = PROVIDER_VOLUME_CACHE.get(cacheKey);
      setProviderVolume(cached || {});
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let request = PROVIDER_VOLUME_PENDING.get(cacheKey);
      if (!request) {
        request = mapViewApi.getproviderVolume({
          session_ids: sessionIds.join(","),
        });
        PROVIDER_VOLUME_PENDING.set(cacheKey, request);
      }

      const response = await request;

      if (response?.status === 0) {
        throw new Error(response.message || "Failed to fetch volume data");
      }

      const volumeData =
        response?.data?.tpt_provider_summary ||
        response?.tpt_provider_summary ||
        {};

      if (Object.keys(volumeData).length > 0) {
        PROVIDER_VOLUME_CACHE.set(cacheKey, volumeData);
        setProviderVolume(volumeData);
      } else {
        PROVIDER_VOLUME_CACHE.set(cacheKey, {});
        setProviderVolume({});
      }
    } catch (error) {
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        "Failed to fetch volume data";
      setError(errorMessage);
      toast.error(errorMessage);
      setProviderVolume({});
    } finally {
      PROVIDER_VOLUME_PENDING.delete(cacheKey);
      setLoading(false);
    }
  }, [projectId, sessionIds]);

  useEffect(() => {
    if (sessionIds.length > 0) {
      fetchVolumeData();
    } else {
      setProviderVolume({});
      setError(null);
    }
  }, [sessionIds, fetchVolumeData]);

  const topPCIs = useMemo(() => {
    if (!locations?.length || selectedMetric !== "pci") return [];

    const pciCounts = locations.reduce((acc, loc) => {
      const pci = loc.pci;
      if (pci != null) {
        acc[pci] = (acc[pci] || 0) + 1;
      }
      return acc;
    }, {});

    return Object.entries(pciCounts)
      .map(([pci, count]) => ({
        pci: parseInt(pci),
        count,
        color: PCI_COLOR_PALETTE[parseInt(pci) % PCI_COLOR_PALETTE.length],
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [locations, selectedMetric]);

  const volume = useMemo(() => {
    if (!tptVolume) return null;

    if (typeof tptVolume.dl_kb === "number") {
      return {
        dlGb: formatBytes(tptVolume.dl_kb / 1024 / 1024, "GB"),
        ulGb: formatBytes(tptVolume.ul_kb / 1024 / 1024, "GB"),
      };
    }

    let totalDlKb = 0;
    let totalUlKb = 0;

    Object.values(tptVolume).forEach((item) => {
      if (item && typeof item === "object") {
        totalDlKb += item?.dl_kb || 0;
        totalUlKb += item?.ul_kb || 0;
      }
    });

    return {
      dlGb: formatBytes(totalDlKb / 1024 / 1024, "GB"),
      ulGb: formatBytes(totalUlKb / 1024 / 1024, "GB"),
    };
  }, [tptVolume]);

  const sessionWiseVolume = useMemo(() => {
    if (!tptVolume || typeof tptVolume.dl_kb === "number") return null;

    return Object.entries(tptVolume)
      .filter(([_, item]) => item && typeof item === "object")
      .map(([session, item]) => ({
        session,
        dl: formatBytes((item?.dl_kb || 0) / 1024 / 1024, "GB"),
        ul: formatBytes((item?.ul_kb || 0) / 1024 / 1024, "GB"),
      }));
  }, [tptVolume]);

  const processedProviderVolume = useMemo(() => {
    if (!providerVolume || Object.keys(providerVolume).length === 0) {
      return null;
    }

    const aggregateMap = new Map();

    Object.entries(providerVolume).forEach(([sessionId, providers]) => {
      if (typeof providers !== "object" || providers === null) return;

      Object.entries(providers).forEach(([provider, techs]) => {
        if (typeof techs !== "object" || techs === null) return;

        const normalizedProvider = normalizeProviderName(provider);
        if (!normalizedProvider || normalizedProvider === "Unknown") return;

        Object.entries(techs).forEach(([tech, volumeData]) => {
          const normalizedTech = normalizeTechName(tech);
          if (!normalizedTech || normalizedTech === "Unknown") return;

          if (!volumeData || typeof volumeData !== "object") return;

          const key = `${normalizedProvider}::${normalizedTech}`;
          let agg = aggregateMap.get(key);
          if (!agg) {
            agg = {
              provider: normalizedProvider,
              technology: normalizedTech,
              dlGbTotal: 0,
              ulGbTotal: 0,
              durationSec: 0,
              sampleCount: 0,
              constantThroughputSessions: 0,
              sessions: new Set(),
              weightSum: 0,
              weightedAvgDlSum: 0,
              weightedAvgUlSum: 0,
              weightedMedianDlSum: 0,
              weightedMedianUlSum: 0,
              weightedStddevDlSum: 0,
              weightedStddevUlSum: 0,
              minDlSpeedMbps: Infinity,
              maxDlSpeedMbps: -Infinity,
              minUlSpeedMbps: Infinity,
              maxUlSpeedMbps: -Infinity,
              providerColor: getLogColor("provider", normalizedProvider),
              techColor: getLogColor("technology", normalizedTech),
            };
            aggregateMap.set(key, agg);
          }

          const durationSec = Number(volumeData?.duration_sec) || 0;
          const sampleCount = Number(volumeData?.sample_count) || 0;
          const dlGb = Number(volumeData?.dl_gb) || 0;
          const ulGb = Number(volumeData?.ul_gb) || 0;
          const weight = sampleCount > 0 ? sampleCount : durationSec > 0 ? durationSec : 1;

          agg.dlGbTotal += dlGb;
          agg.ulGbTotal += ulGb;
          agg.durationSec += durationSec;
          agg.sampleCount += sampleCount;
          agg.sessions.add(sessionId);
          if (volumeData?.is_constant_tpt) agg.constantThroughputSessions += 1;

          const avgDl = Number(volumeData?.avg_dl_mbps) || 0;
          const avgUl = Number(volumeData?.avg_ul_mbps) || 0;
          const medianDl = Number(volumeData?.median_dl_mbps) || 0;
          const medianUl = Number(volumeData?.median_ul_mbps) || 0;
          const stddevDl = Number(volumeData?.stddev_dl_mbps) || 0;
          const stddevUl = Number(volumeData?.stddev_ul_mbps) || 0;

          agg.weightSum += weight;
          agg.weightedAvgDlSum += avgDl * weight;
          agg.weightedAvgUlSum += avgUl * weight;
          agg.weightedMedianDlSum += medianDl * weight;
          agg.weightedMedianUlSum += medianUl * weight;
          agg.weightedStddevDlSum += stddevDl * weight;
          agg.weightedStddevUlSum += stddevUl * weight;

          const minDl = Number(volumeData?.min_dl_mbps);
          const maxDl = Number(volumeData?.max_dl_mbps);
          const minUl = Number(volumeData?.min_ul_mbps);
          const maxUl = Number(volumeData?.max_ul_mbps);

          if (Number.isFinite(minDl) && minDl > 0) agg.minDlSpeedMbps = Math.min(agg.minDlSpeedMbps, minDl);
          if (Number.isFinite(maxDl)) agg.maxDlSpeedMbps = Math.max(agg.maxDlSpeedMbps, maxDl);
          if (Number.isFinite(minUl) && minUl > 0) agg.minUlSpeedMbps = Math.min(agg.minUlSpeedMbps, minUl);
          if (Number.isFinite(maxUl)) agg.maxUlSpeedMbps = Math.max(agg.maxUlSpeedMbps, maxUl);
        });
      });
    });

    const rows = Array.from(aggregateMap.values()).map((agg) => {
      const weightSum = agg.weightSum || 0;
      const avgDlSpeedMbps = weightSum > 0 ? agg.weightedAvgDlSum / weightSum : 0;
      const avgUlSpeedMbps = weightSum > 0 ? agg.weightedAvgUlSum / weightSum : 0;
      const medianDlSpeedMbps = weightSum > 0 ? agg.weightedMedianDlSum / weightSum : 0;
      const medianUlSpeedMbps = weightSum > 0 ? agg.weightedMedianUlSum / weightSum : 0;
      const stddevDlSpeedMbps = weightSum > 0 ? agg.weightedStddevDlSum / weightSum : 0;
      const stddevUlSpeedMbps = weightSum > 0 ? agg.weightedStddevUlSum / weightSum : 0;
      const minDlSpeedMbps = Number.isFinite(agg.minDlSpeedMbps) ? agg.minDlSpeedMbps : 0;
      const maxDlSpeedMbps = Number.isFinite(agg.maxDlSpeedMbps) ? agg.maxDlSpeedMbps : 0;
      const minUlSpeedMbps = Number.isFinite(agg.minUlSpeedMbps) ? agg.minUlSpeedMbps : 0;
      const maxUlSpeedMbps = Number.isFinite(agg.maxUlSpeedMbps) ? agg.maxUlSpeedMbps : 0;
      const sessionCount = agg.sessions.size;

      return {
        provider: agg.provider,
        technology: agg.technology,
        downloadGb: formatBytes(agg.dlGbTotal, "GB"),
        uploadGb: formatBytes(agg.ulGbTotal, "GB"),
        totalGb: formatBytes(agg.dlGbTotal + agg.ulGbTotal, "GB"),
        dl_gb: agg.dlGbTotal,
        ul_gb: agg.ulGbTotal,
        durationSec: agg.durationSec,
        durationFormatted: formatDuration(agg.durationSec),
        avgDlSpeedMbps,
        avgUlSpeedMbps,
        avgDlSpeedFormatted: formatSpeed(avgDlSpeedMbps),
        avgUlSpeedFormatted: formatSpeed(avgUlSpeedMbps),
        minDlSpeedFormatted: formatSpeed(minDlSpeedMbps),
        maxDlSpeedFormatted: formatSpeed(maxDlSpeedMbps),
        medianDlSpeedFormatted: formatSpeed(medianDlSpeedMbps),
        stddevDlSpeedFormatted: formatMetricNumber(stddevDlSpeedMbps),
        minUlSpeedFormatted: formatSpeed(minUlSpeedMbps),
        maxUlSpeedFormatted: formatSpeed(maxUlSpeedMbps),
        medianUlSpeedFormatted: formatSpeed(medianUlSpeedMbps),
        stddevUlSpeedFormatted: formatMetricNumber(stddevUlSpeedMbps),
        sampleCount: agg.sampleCount,
        constantThroughputSessions: agg.constantThroughputSessions,
        isConstantTpt: sessionCount > 0 && agg.constantThroughputSessions === sessionCount,
        sessionCount,
        sessions: Array.from(agg.sessions),
        providerColor: agg.providerColor,
        techColor: agg.techColor,
      };
    });

    rows.sort((a, b) => {
      const providerCompare = a.provider.localeCompare(b.provider);
      if (providerCompare !== 0) return providerCompare;
      return a.technology.localeCompare(b.technology);
    });

    return rows.length > 0 ? rows : null;
  }, [providerVolume]);

  const providerVolumeDurationRows = useMemo(() => {
    if (!processedProviderVolume || processedProviderVolume.length === 0) {
      return [];
    }

    return processedProviderVolume
      .filter((item) => {
        if (isUnknownOrEmpty(item.provider) || isUnknownOrEmpty(item.technology)) {
          return false;
        }
        return Number(item.durationSec || 0) > 0;
      })
      .map((item) => ({
        provider: item.provider,
        networkType: item.technology,
        timeSeconds: item.durationSec,
        totaltime: item.durationFormatted,
      }))
      .sort((a, b) => (b.timeSeconds || 0) - (a.timeSeconds || 0));
  }, [processedProviderVolume, isUnknownOrEmpty]);

  const displayedDurationData =
    providerVolumeDurationRows.length > 0 ? providerVolumeDurationRows : durationData;

  const drawingSummary = useMemo(() => {
    if (!Array.isArray(drawnShapeAnalytics) || drawnShapeAnalytics.length === 0) {
      return null;
    }

    return drawnShapeAnalytics.reduce(
      (acc, shape) => {
        const areaSqKm = Number(shape?.areaInSqKm);
        const logsCount = Number(shape?.count);
        const gridCells = Number(shape?.grid?.cells);
        const gridCellsWithLogs = Number(shape?.grid?.cellsWithLogs);

        acc.shapes += 1;
        acc.logs += Number.isFinite(logsCount) ? logsCount : 0;
        acc.totalAreaSqKm += Number.isFinite(areaSqKm) ? areaSqKm : 0;
        acc.totalGridCells += Number.isFinite(gridCells) ? gridCells : 0;
        acc.gridCellsWithLogs += Number.isFinite(gridCellsWithLogs)
          ? gridCellsWithLogs
          : 0;

        return acc;
      },
      {
        shapes: 0,
        logs: 0,
        totalAreaSqKm: 0,
        totalGridCells: 0,
        gridCellsWithLogs: 0,
      },
    );
  }, [drawnShapeAnalytics]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
          <span className="text-red-400 text-sm">{error}</span>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={handleDownloadKml}
          disabled={plottedExportLocations.length === 0}
          title="Export plotted Unified Map logs as KML"
          className="inline-flex items-center gap-1.5 rounded-md border border-blue-500/50 bg-blue-600/15 px-2.5 py-1.5 text-xs font-medium text-blue-200 transition hover:bg-blue-600/25 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
        >
          <Download className="h-3.5 w-3.5" />
          Export KML
        </button>
        <button
          type="button"
          onClick={handlePptButtonClick}
          disabled={isGeneratingPpt}
          title={isGeneratingPpt ? (pptPercent != null ? `Generating PPT ${pptPercent}%` : "Preparing PPT") : "Download PPT"}
          className="inline-flex items-center gap-1.5 rounded-md border border-purple-500/50 bg-purple-600/15 px-2.5 py-1.5 text-xs font-medium text-purple-200 transition hover:bg-purple-600/25 disabled:cursor-wait disabled:opacity-60"
        >
          {isGeneratingPpt && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {isGeneratingPpt ? (pptPercent != null ? `Generating ${pptPercent}%` : "Preparing PPT…") : "PPT"}
        </button>
        {readyPpt && (
          <button
            type="button"
            onClick={() => downloadReadyPpt(readyPpt)}
            title="Download the generated PowerPoint report"
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/50 bg-emerald-600/15 px-2.5 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-600/25"
          >
            <Download className="h-3.5 w-3.5" />
            Download PPT
          </button>
        )}
      </div>

      <Dialog open={isPptBandDialogOpen} onOpenChange={setIsPptBandDialogOpen}>
        <DialogContent
          title="Configure PPT report"
          style={{
            width: "min(34rem, calc(100vw - 2rem))",
            background: "#0f172a",
            color: "#e2e8f0",
            border: "1px solid #334155",
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: "#f8fafc" }}>Configure PPT report</DialogTitle>
            <DialogDescription style={{ color: "#94a3b8" }}>
              Select a template and provide the filters for the PowerPoint report.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <span className="text-sm font-medium text-slate-200">Template</span>
            <div className={`grid ${pptTemplateOptions.length === 1 ? "grid-cols-1" : "grid-cols-2"} gap-2`}>
              {pptTemplateOptions.map((template) => (
                <button
                  key={template}
                  type="button"
                  onClick={() => setPptTemplate(template)}
                  className={`rounded-md border px-3 py-2 text-sm font-medium capitalize transition ${
                    pptTemplate === template
                      ? "border-purple-400 bg-purple-600/30 text-purple-100"
                      : "border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {template}
                </button>
              ))}
            </div>
          </div>

          {/* Technology Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-200">Technologies</span>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setPptTechnologies([...pptTechnologyOptions])}
                  className="text-xs text-purple-400 hover:text-purple-300 underline"
                >
                  Select All
                </button>
                <span className="text-slate-600">|</span>
                <button
                  type="button"
                  onClick={() => setPptTechnologies([])}
                  className="text-xs text-slate-400 hover:text-slate-300 underline"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {pptTechnologyOptions.map((technology) => {
                const isSelected = pptTechnologies.includes(technology);
                return (
                  <button
                    key={technology}
                    type="button"
                    onClick={() => togglePptTechnology(technology)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                      isSelected
                        ? "border-purple-500 bg-purple-600 text-white shadow-sm"
                        : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {technology}
                  </button>
                );
              })}
            </div>
            {pptTechnologies.length === 0 && (
              <p className="text-[11px] text-amber-400">Select at least one technology to include in the report.</p>
            )}
          </div>

          {/* Locked Band (if Taiwan template) */}
          {pptTemplate === "taiwan" && (
            <div className="space-y-2">
              <label htmlFor="ppt-locked-bands" className="text-sm font-medium text-slate-200">
                Band
              </label>
              <select
                id="ppt-locked-bands"
                aria-label="locked_bands"
                value={lockedBand}
                onChange={(event) => setLockedBand(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/30"
              >
                <option value="all">All bands</option>
                {pptBandOptions.map((band) => (
                  <option key={band} value={band}>
                    {band}
                  </option>
                ))}
              </select>
              {pptBandOptions.length === 0 && (
                <p className="text-xs text-slate-400">No individual bands were found; the report will use all bands.</p>
              )}
            </div>
          )}

          {/* Technology-Wise KPI Options */}
          <fieldset className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <legend className="text-sm font-semibold text-slate-100">
                Report KPIs ({filteredPptKpis.length})
              </legend>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={selectAllKpis}
                  className="rounded bg-purple-900/40 px-2 py-0.5 text-[11px] font-medium text-purple-300 hover:bg-purple-800/50 transition border border-purple-700/40"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={selectCoreKpis}
                  className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-300 hover:bg-slate-700 transition border border-slate-700"
                >
                  Core KPIs
                </button>
                <button
                  type="button"
                  onClick={deselectAllKpis}
                  className="rounded bg-slate-800/80 px-2 py-0.5 text-[11px] font-medium text-rose-400 hover:bg-rose-950/40 transition border border-rose-900/30"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Category / Technology Filter Tabs & Search */}
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1 rounded-md border border-slate-700/60 bg-slate-900/60 p-1">
                {[
                  { id: "all", label: "All" },
                  { id: "5g", label: "5G KPIs" },
                  { id: "4g", label: "4G KPIs" },
                  { id: "3g", label: "3G KPIs" },
                  { id: "2g", label: "2G KPIs" },
                  { id: "network", label: "Network & L3" },
                ].map((tab) => {
                  const isActive = pptKpiCategoryFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setPptKpiCategoryFilter(tab.id)}
                      className={`flex-1 rounded px-2 py-1 text-center text-xs font-medium transition ${
                        isActive
                          ? "bg-purple-600 text-white shadow-sm"
                          : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <input
                type="text"
                value={pptKpiSearchText}
                onChange={(e) => setPptKpiSearchText(e.target.value)}
                placeholder="Search KPI (e.g. RSRP, RSRQ, SINR, Throughput, PCI)..."
                className="h-8 w-full rounded border border-slate-700 bg-slate-800/90 px-2.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
              />
            </div>

            {/* KPI Checklist */}
            <div className="max-h-56 overflow-y-auto space-y-1 pr-1 rounded-md border border-slate-700/60 bg-slate-900/40 p-2">
              {filteredPptKpis.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-500">
                  No parameters matching "{pptKpiSearchText}"
                </div>
              ) : (
                filteredPptKpis.map((kpi) => {
                  const isChecked = isPptKpiSelected(kpi.key);
                  return (
                    <label
                      key={kpi.key}
                      className={`flex cursor-pointer items-center justify-between gap-2 rounded px-2.5 py-1.5 text-xs transition ${
                        isChecked
                          ? "bg-purple-950/50 text-purple-100 border border-purple-800/50 shadow-sm"
                          : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => togglePptKpi(kpi.key)}
                          className="h-3.5 w-3.5 rounded accent-purple-500"
                        />
                        <span className="font-medium">{kpi.label}</span>
                      </span>
                      <span className="text-[10px] font-semibold tracking-wider text-slate-400 px-1.5 py-0.5 rounded bg-slate-800/90 border border-slate-700/50">
                        {kpi.group}
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>
                {pptSelectedKpis === null
                  ? "Standard core parameters selected for active technologies"
                  : `${pptSelectedKpis.length} parameters selected`}
              </span>
              {pptSelectedKpis !== null && (
                <button
                  type="button"
                  onClick={() => setPptSelectedKpis(null)}
                  className="text-purple-400 hover:text-purple-300 underline"
                >
                  Reset to Default
                </button>
              )}
            </div>
          </fieldset>

          <div className="space-y-2">
            <span className="text-sm font-medium text-slate-200">KPI map view</span>
            <div className="grid grid-cols-2 gap-2">
              {["grid", "raw"].map((viewType) => (
                <button
                  key={viewType}
                  type="button"
                  onClick={() => setPptMapViewType(viewType)}
                  className={`rounded-md border px-3 py-2 text-sm font-medium capitalize transition ${
                    pptMapViewType === viewType
                      ? "border-purple-400 bg-purple-600/30 text-purple-100"
                      : "border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {viewType}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400">
              Grid view aggregates numeric KPI samples into the project grid cells. Categorical and event maps remain point-based.
            </p>
          </div>

          {pptMapViewType === "grid" && (
            <div className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Grid Aggregation</span>
              <div className="grid grid-cols-4 gap-2">
                {["max", "mean", "min", "median"].map((method) => (
                  <button
                    key={method}
                    type="button"
                    aria-pressed={pptAggregation === method}
                    onClick={() => setPptAggregation(method)}
                    className={`rounded-md border px-2 py-2 text-xs font-medium capitalize transition ${
                      pptAggregation === method
                        ? "border-purple-400 bg-purple-600/30 text-purple-100"
                        : "border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsPptBandDialogOpen(false)}
              className="rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePptDownload}
              disabled={
                isGeneratingPpt ||
                !pptTemplate ||
                (pptTemplate === "stracer" && pptTechnologies.length === 0) ||
                (pptTemplate === "taiwan" && pptSelectedKpis !== null && pptSelectedKpis.length === 0)
              }
              className="rounded-md bg-purple-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-purple-500 disabled:cursor-wait disabled:opacity-60"
            >
              Generate PPT
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div
        className={`grid ${expanded ? "grid-cols-4" : "grid-cols-2"} gap-3`}
      >
        <StatCard
          icon={MapPin}
          label="Total Distance (km)"
          value={distance?.toLocaleString()}
          color="blue"
        />
        <StatCard
          icon={Activity}
          label={gridViewEnabled ? "Grid Showing" : "Displayed"}
          value={
            gridViewEnabled
              ? Number(gridViewSummary?.populatedCells) || 0
              : filteredCount.toLocaleString()
          }
          subValue={
            gridViewEnabled
              ? `${Number(gridViewSummary?.totalSamples) || 0} samples`
              : undefined
          }
          color="green"
        />

        {enableSiteToggle && (
          <StatCard
            icon={Layers}
            label="Sites"
            value={siteData.length}
            subValue={siteToggle}
            color="purple"
          />
        )}

        {showPolygons && polygonStats && (
          <StatCard
            icon={Layers}
            label="Polygons"
            value={polygonStats.total}
            subValue={`${polygonStats.withData} with data`}
            color="orange"
          />
        )}
      </div>

      {stats && (
        <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
          <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4" />
            {selectedMetric?.toUpperCase() || "METRIC"} Statistics
          </h4>

          <div
            className={`grid ${expanded ? "grid-cols-5" : "grid-cols-3"} gap-3`}
          >
            <MetricCard label="Average" value={stats.avg} />
            <MetricCard label="Minimum" value={stats.min} color="blue" />
            <MetricCard label="Maximum" value={stats.max} color="green" />
            <MetricCard label="Median" value={stats.median} color="purple" />
            <MetricCard label="Count" value={stats.count} color="yellow" raw />
          </div>
        </div>
      )}

      {drawingSummary && (
        <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
          <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Square className="h-4 w-4" />
            Drawn Shape Grid Analytics
          </h4>

          <div
            className={`grid ${expanded ? "grid-cols-5" : "grid-cols-2"} gap-3`}
          >
            <StatCard
              icon={Layers}
              label="Drawn Shapes"
              value={drawingSummary.shapes}
              color="purple"
            />
            <StatCard
              icon={MapPin}
              label="Logs Inside Shapes"
              value={drawingSummary.logs}
              color="green"
            />
            <StatCard
              icon={Gauge}
              label="Total Area (km²)"
              value={drawingSummary.totalAreaSqKm.toFixed(4)}
              color="blue"
            />
            <StatCard
              icon={Activity}
              label="Grid Cells Formed"
              value={drawingSummary.totalGridCells}
              color="orange"
            />
            <StatCard
              icon={Wifi}
              label="Grid Cells With Logs"
              value={drawingSummary.gridCellsWithLogs}
              color="cyan"
            />
          </div>
        </div>
      )}

      

      {selectedMetric === "pci" && topPCIs.length > 0 && (
        <PCIReferenceCard topPCIs={topPCIs} />
      )}

      <ProviderVolumeCard
        providerVolume={processedProviderVolume}
        loading={loading}
        sessionIds={sessionIds}
        error={error}
      />

      {/* {volume && (
        <DataVolumeCard volume={volume} sessionWiseVolume={sessionWiseVolume} />
      )} */}

      {displayedDurationData && displayedDurationData.length > 0 && (
        <DurationData durationData={displayedDurationData} />
      )}

      {duration && <SessionDurationCard duration={duration} />}
    </div>
  );
};

const MetricCard = ({ label, value, color = "white", raw = false }) => {
  const colorClasses = {
    white: "text-white",
    blue: "text-blue-400",
    green: "text-green-400",
    purple: "text-purple-400",
    yellow: "text-yellow-400",
  };

  return (
    <div className="bg-slate-800 rounded p-3 text-center hover:bg-slate-750 transition-colors">
      <div className="text-xs text-white mb-1">{label}</div>
      <div className={`text-xl font-bold ${colorClasses[color]}`}>
        {raw ? value : typeof value === "number" ? value.toFixed(2) : "N/A"}
      </div>
    </div>
  );
};



const PCIReferenceCard = ({ topPCIs }) => (
  <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
    <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
      <Antenna className="h-4 w-4" />
      PCI Color Reference
    </h4>

    <div className="text-xs text-white mb-2">Top 10 PCIs in Current View</div>
    <div className="grid grid-cols-5 gap-1.5">
      {topPCIs.map((item, idx) => (
        <div
          key={idx}
          className="flex items-center gap-1 bg-slate-800 p-1.5 rounded text-[10px] hover:bg-slate-750 transition-colors"
        >
          <div
            className="w-4 h-4 rounded-full border border-slate-600 flex-shrink-0"
            style={{ backgroundColor: item.color }}
          />
          <div className="flex-1 min-w-0">
            <div className="text-white font-semibold truncate">
              PCI {item.pci}
            </div>
            <div className="text-white">{item.count} pts</div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const SessionDurationCard = ({ duration }) => (
  <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
    <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
      <Clock className="h-4 w-4" />
      Session Information
    </h4>
    <div className="grid grid-cols-2 gap-3 text-sm">
      <div className="bg-slate-800 p-3 rounded hover:bg-slate-750 transition-colors">
        <div className="text-white text-xs mb-1">Duration</div>
        <div className="text-white font-semibold">
          {duration.total_duration || "N/A"}
        </div>
      </div>
      <div className="bg-slate-800 p-3 rounded hover:bg-slate-750 transition-colors">
        <div className="text-white text-xs mb-1">Start Time</div>
        <div className="text-white font-semibold">
          {duration.start_time
            ? new Date(duration.start_time).toLocaleTimeString()
            : "N/A"}
        </div>
      </div>
    </div>
  </div>
);

const ProviderVolumeCard = ({
  providerVolume,
  loading,
  sessionIds,
  error,
}) => {
  const [visibleColumnKeys, setVisibleColumnKeys] = useState(() =>
    new Set(PROVIDER_VOLUME_DEFAULT_COLUMNS)
  );

  const getTechBadgeStyle = (tech) => {
    const color = getLogColor("technology", tech);
    return {
      backgroundColor: `${color}20`,
      borderColor: `${color}50`,
      color: color,
    };
  };

  const filteredProviderVolume = useMemo(() => {
    if (!providerVolume || !Array.isArray(providerVolume)) return [];

    return providerVolume.filter((item) => {
      const normalizedProvider = normalizeProviderName(item.provider);
      if (normalizedProvider === "Unknown") return false;
      return true;
    });
  }, [providerVolume]);

  const hasValidData = filteredProviderVolume && filteredProviderVolume.length > 0;
  const visibleColumns = useMemo(
    () => PROVIDER_VOLUME_OPTIONAL_COLUMNS.filter((column) => visibleColumnKeys.has(column.key)),
    [visibleColumnKeys]
  );

  const toggleColumn = useCallback((key) => {
    setVisibleColumnKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const resetColumns = useCallback(() => {
    setVisibleColumnKeys(new Set(PROVIDER_VOLUME_DEFAULT_COLUMNS));
  }, []);

  return (
    <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <h4 className="text-sm font-semibold text-white flex min-w-0 items-center gap-2">
          <Wifi className="h-4 w-4 flex-shrink-0" />
          <span className="text-clamp-2">Provider Volume by Technology</span>
          {sessionIds.length > 0 && (
            <span className="text-xs text-white font-normal">
              ({sessionIds.length} session{sessionIds.length > 1 ? "s" : ""})
            </span>
          )}
        </h4>

        <details className="group relative">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white hover:border-slate-500 hover:bg-slate-700">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Columns
          </summary>
          <div className="absolute right-0 z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded border border-slate-700 bg-slate-900 p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white">Show columns</span>
              <button
                type="button"
                onClick={resetColumns}
                className="rounded px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                Default
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDER_VOLUME_OPTIONAL_COLUMNS.map((column) => (
                <label
                  key={column.key}
                  className="flex min-w-0 cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                >
                  <input
                    type="checkbox"
                    checked={visibleColumnKeys.has(column.key)}
                    onChange={() => toggleColumn(column.key)}
                    className="h-3.5 w-3.5 flex-shrink-0 accent-blue-500"
                  />
                  <span className="whitespace-nowrap">{column.label}</span>
                </label>
              ))}
            </div>
          </div>
        </details>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 border-2 border-slate-600 border-t-blue-400 rounded-full animate-spin" />
            <span className="text-white text-sm">
              Loading provider volume data...
            </span>
          </div>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
            <div className="text-white text-sm">
              Failed to load provider volume data
            </div>
            <div className="text-xs text-white mt-1">{error}</div>
          </div>
        </div>
      ) : !hasValidData ? (
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <Wifi className="h-8 w-8 text-white mx-auto mb-2" />
            <div className="text-white text-sm">
              No valid provider volume data available
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto bg-slate-800/50 rounded">
            <table className="min-w-max w-full text-xs" style={{ overflowWrap: "normal" }}>
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800">
                  <th className="min-w-[8rem] whitespace-nowrap px-2 py-2 text-left font-medium text-white">
                    Provider
                  </th>
                  <th className="min-w-[5.5rem] whitespace-nowrap px-2 py-2 text-left font-medium text-white">
                    Tech
                  </th>
                  {visibleColumns.map((column) => {
                    const Icon = column.icon;
                    return (
                      <th
                        key={column.key}
                        className={`whitespace-nowrap px-2 py-2 font-medium text-white ${column.headerClassName}`}
                      >
                        <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                          {Icon && <Icon className="h-3 w-3 flex-shrink-0" />}
                          <span>{column.label}</span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredProviderVolume.length === 0 ? (
                  <tr>
                    <td
                      colSpan={2 + visibleColumns.length}
                      className="px-2 py-8 text-center text-white text-sm"
                    >
                      No data available for known providers
                    </td>
                  </tr>
                ) : (
                  filteredProviderVolume.map((item, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-slate-800 hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="min-w-[8rem] max-w-[12rem] whitespace-nowrap px-2 py-2 text-white">
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: item.providerColor }}
                          />
                          <span className="truncate capitalize font-medium">
                            {item.provider}
                          </span>
                        </div>
                      </td>
                      <td className="min-w-[5.5rem] whitespace-nowrap px-2 py-2">
                        <span
                          className="inline-flex items-center whitespace-nowrap px-1.5 py-0.5 rounded text-[10px] font-medium border"
                          style={getTechBadgeStyle(item.technology)}
                        >
                          {item.technology}
                        </span>
                      </td>
                      {visibleColumns.map((column) => (
                        <td
                          key={column.key}
                          className={`whitespace-nowrap px-2 py-2 font-medium ${column.cellClassName}`}
                        >
                          {column.render(item)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

        </>
      )}
    </div>
  );
};

const DurationData = ({ durationData }) => (
  <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
    <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
      <Clock className="h-4 w-4" />
      Duration Data
    </h4>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="text-left px-3 py-2 text-white font-medium">
              Provider
            </th>
            <th className="text-left px-3 py-2 text-white font-medium">
              Network Type
            </th>
            <th className="text-right px-3 py-2 text-white font-medium">
              Total Time
            </th>
          </tr>
        </thead>
        <tbody>
          {durationData
            ?.filter(
              (item) =>
                (item.provider || "").trim() !== "UNKNOWN" &&
                (item.provider || "").trim() !== "Unknown" &&
                (item.provider || "").trim() !== ""
            )
            .map((item, idx) => (
              <tr
                key={idx}
                className="border-b border-slate-800 hover:bg-slate-700/30 transition-colors"
              >
                <td className="px-3 py-2 text-white">{item.provider}</td>
                <td className="px-3 py-2 text-white">{item.networkType}</td>
                <td className="px-3 py-2 text-right text-white">
                  {item.totaltime}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  </div>
);

const DataVolumeCard = ({ volume, sessionWiseVolume }) => (
  <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
    <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
      <Activity className="h-4 w-4" />
      Data Volume (Total)
    </h4>

    <div className="grid grid-cols-2 gap-3 text-sm">
      <div className="bg-slate-800 p-3 rounded hover:bg-slate-750 transition-colors">
        <div className="text-white text-xs mb-1 flex items-center gap-1">
          <Download className="h-3 w-3" />
          Download Volume
        </div>
        <div className="text-blue-400 font-semibold">
          {volume.dlGb || "N/A"} GB
        </div>
      </div>
      <div className="bg-slate-800 p-3 rounded hover:bg-slate-750 transition-colors">
        <div className="text-white text-xs mb-1 flex items-center gap-1">
          <Upload className="h-3 w-3" />
          Upload Volume
        </div>
        <div className="text-green-400 font-semibold">
          {volume.ulGb || "N/A"} GB
        </div>
      </div>
    </div>

    {sessionWiseVolume && sessionWiseVolume.length > 0 && (
      <div className="mt-4">
        <h5 className="text-sm font-semibold text-white mb-2">
          Session-wise Volume
        </h5>
        <div className="overflow-x-auto bg-slate-800/50 rounded">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left px-3 py-2 text-white font-medium">
                  Session
                </th>
                <th className="text-right px-3 py-2 text-white font-medium">
                  Download (GB)
                </th>
                <th className="text-right px-3 py-2 text-white font-medium">
                  Upload (GB)
                </th>
              </tr>
            </thead>
            <tbody>
              {sessionWiseVolume.map((item, idx) => (
                <tr
                  key={idx}
                  className="border-b border-slate-800 hover:bg-slate-700/30 transition-colors"
                >
                  <td className="px-3 py-2 text-white">{item.session}</td>
                  <td className="px-3 py-2 text-right text-blue-400">
                    {item.dl}
                  </td>
                  <td className="px-3 py-2 text-right text-green-400">
                    {item.ul}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}
  </div>
);

export default OverviewTab;
