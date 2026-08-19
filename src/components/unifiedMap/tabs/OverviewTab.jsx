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
} from "lucide-react";
import { StatCard } from "../common/StatCard";
import { PCI_COLOR_PALETTE } from "@/components/map/layers/MultiColorCirclesLayer";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { mapViewApi } from "@/api/apiEndpoints";
import {
  normalizeProviderName,
  normalizeTechName,
  COLOR_SCHEMES,
  getLogColor,
} from "@/utils/colorUtils";
import { downloadMifMidForLogs } from "@/utils/mifExport";

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
  gridViewEnabled = false,
  gridViewSummary = null,
}) => {
  const [searchParams] = useSearchParams();
  const [providerVolume, setProviderVolume] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const plottedExportLocations = useMemo(() => {
    if (Array.isArray(mapPlotLocations) && mapPlotLocations.length > 0) {
      return mapPlotLocations;
    }
    return Array.isArray(locations) ? locations : [];
  }, [locations, mapPlotLocations]);

  const handleDownloadMif = useCallback(() => {
    try {
      const result = downloadMifMidForLogs({
        locations: plottedExportLocations,
        selectedMetric,
      });
      toast.success(`Downloaded ${result.exportedCount.toLocaleString()} plotted logs as MIF/MID`);
    } catch (exportError) {
      toast.error(exportError?.message || "Failed to export plotted logs as MIF.");
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

    const rows = [];

    Object.entries(providerVolume).forEach(([sessionId, providers]) => {
      if (typeof providers !== "object" || providers === null) return;

      Object.entries(providers).forEach(([provider, techs]) => {
        if (typeof techs !== "object" || techs === null) return;

        const normalizedProvider = normalizeProviderName(provider);
        if (!normalizedProvider || normalizedProvider === "Unknown") return;

        Object.entries(techs).forEach(([tech, volumeData]) => {
          const normalizedTech = normalizeTechName(tech);
          if (!normalizedTech || normalizedTech === "Unknown") return;

          if (volumeData && typeof volumeData === "object") {
            const durationSec = volumeData?.duration_sec || 0;
            const sampleCount = volumeData?.sample_count || 0;
            const dlGb = volumeData?.dl_gb || 0;
            const ulGb = volumeData?.ul_gb || 0;

            rows.push({
              sessionId,
              provider: normalizedProvider,
              technology: normalizedTech,
              downloadGb: formatBytes(dlGb, "GB"),
              uploadGb: formatBytes(ulGb, "GB"),
              totalGb: formatBytes(dlGb + ulGb, "GB"),
              dl_gb: dlGb,
              ul_gb: ulGb,
              durationSec,
              durationFormatted: formatDuration(durationSec),
              avgDlSpeedMbps: volumeData?.avg_dl_mbps || 0,
              avgUlSpeedMbps: volumeData?.avg_ul_mbps || 0,
              avgDlSpeedFormatted: formatSpeed(volumeData?.avg_dl_mbps || 0),
              avgUlSpeedFormatted: formatSpeed(volumeData?.avg_ul_mbps || 0),
              minDlSpeedFormatted: formatSpeed(volumeData?.min_dl_mbps || 0),
              maxDlSpeedFormatted: formatSpeed(volumeData?.max_dl_mbps || 0),
              medianDlSpeedFormatted: formatSpeed(volumeData?.median_dl_mbps || 0),
              stddevDlSpeedFormatted: formatMetricNumber(volumeData?.stddev_dl_mbps),
              minUlSpeedFormatted: formatSpeed(volumeData?.min_ul_mbps || 0),
              maxUlSpeedFormatted: formatSpeed(volumeData?.max_ul_mbps || 0),
              medianUlSpeedFormatted: formatSpeed(volumeData?.median_ul_mbps || 0),
              stddevUlSpeedFormatted: formatMetricNumber(volumeData?.stddev_ul_mbps),
              sampleCount,
              constantThroughputSessions: volumeData?.is_constant_tpt ? 1 : 0,
              isConstantTpt: Boolean(volumeData?.is_constant_tpt),
              sessionCount: 1,
              sessions: [sessionId],
              providerColor: getLogColor("provider", normalizedProvider),
              techColor: getLogColor("technology", normalizedTech),
            });
          }
        });
      });
    });

    rows.sort((a, b) => {
      const sessionCompare = String(a.sessionId).localeCompare(String(b.sessionId));
      if (sessionCompare !== 0) return sessionCompare;
      const providerCompare = a.provider.localeCompare(b.provider);
      if (providerCompare !== 0) return providerCompare;
      return a.technology.localeCompare(b.technology);
    });

    return rows.length > 0 ? rows : null;
  }, [providerVolume]);

  const volumeSummaryStats = useMemo(() => {
    if (!processedProviderVolume || processedProviderVolume.length === 0)
      return null;

    const totalDownloadGb = processedProviderVolume.reduce(
      (sum, item) => sum + (item.dl_gb || 0),
      0
    );
    const totalUploadGb = processedProviderVolume.reduce(
      (sum, item) => sum + (item.ul_gb || 0),
      0
    );
    const totalDurationSec = processedProviderVolume.reduce(
      (sum, item) => sum + (item.durationSec || 0),
      0
    );
    const totalSampleCount = processedProviderVolume.reduce(
      (sum, item) => sum + (item.sampleCount || 0),
      0
    );

    const avgDlSpeed =
      totalSampleCount > 0
        ? processedProviderVolume.reduce(
            (sum, item) =>
              sum + (item.avgDlSpeedMbps || 0) * (item.sampleCount || 0),
            0
          ) / totalSampleCount
        : totalDurationSec > 0
        ? processedProviderVolume.reduce(
            (sum, item) =>
              sum + (item.avgDlSpeedMbps || 0) * (item.durationSec || 0),
            0
          ) / totalDurationSec
        : 0;
    const avgUlSpeed =
      totalSampleCount > 0
        ? processedProviderVolume.reduce(
            (sum, item) =>
              sum + (item.avgUlSpeedMbps || 0) * (item.sampleCount || 0),
            0
          ) / totalSampleCount
        : totalDurationSec > 0
        ? processedProviderVolume.reduce(
            (sum, item) =>
              sum + (item.avgUlSpeedMbps || 0) * (item.durationSec || 0),
            0
          ) / totalDurationSec
        : 0;

    const byProvider = {};
    processedProviderVolume.forEach((item) => {
      if (isUnknownOrEmpty(item.provider)) return;

      const providerKey = item.provider.toLowerCase();
      if (!byProvider[providerKey]) {
        byProvider[providerKey] = {
          name: item.provider,
          dl_gb: 0,
          ul_gb: 0,
          durationSec: 0,
          technologies: [],
          color: item.providerColor,
        };
      }
      byProvider[providerKey].dl_gb += item.dl_gb || 0;
      byProvider[providerKey].ul_gb += item.ul_gb || 0;
      byProvider[providerKey].durationSec += item.durationSec || 0;
      if (!byProvider[providerKey].technologies.includes(item.technology)) {
        byProvider[providerKey].technologies.push(item.technology);
      }
    });

    const byTech = {};
    processedProviderVolume.forEach((item) => {
      if (isUnknownOrEmpty(item.technology)) return;

      const techKey = item.technology.toUpperCase();
      if (!byTech[techKey]) {
        byTech[techKey] = {
          dl_gb: 0,
          ul_gb: 0,
          durationSec: 0,
          color: item.techColor,
        };
      }
      byTech[techKey].dl_gb += item.dl_gb || 0;
      byTech[techKey].ul_gb += item.ul_gb || 0;
      byTech[techKey].durationSec += item.durationSec || 0;
    });

    return {
      totalDownload: formatBytes(totalDownloadGb, "GB"),
      totalUpload: formatBytes(totalUploadGb, "GB"),
      totalData: formatBytes(totalDownloadGb + totalUploadGb, "GB"),
      totalDuration: formatDuration(totalDurationSec),
      avgDlSpeed: formatSpeed(avgDlSpeed),
      avgUlSpeed: formatSpeed(avgUlSpeed),
      byProvider,
      byTech,
      sessionsCount: sessionIds.length,
    };
  }, [processedProviderVolume, sessionIds, isUnknownOrEmpty]);

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

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleDownloadMif}
          disabled={plottedExportLocations.length === 0}
          title="Export plotted Unified Map logs as MapInfo MIF/MID"
          className="inline-flex items-center gap-1.5 rounded-md border border-blue-500/50 bg-blue-600/15 px-2.5 py-1.5 text-xs font-medium text-blue-200 transition hover:bg-blue-600/25 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
        >
          <Download className="h-3.5 w-3.5" />
          Export KPI MIF
        </button>
      </div>

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
        summaryStats={volumeSummaryStats}
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
  summaryStats,
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

  const filteredTechSummary = useMemo(() => {
    if (!summaryStats?.byTech) return {};

    const filtered = {};

    Object.entries(summaryStats.byTech).forEach(([tech, data]) => {
      const normalizedTech = normalizeTechName(tech);
      if (normalizedTech === "Unknown") return;

      const dlValue = parseFloat(data.dl_gb) || 0;
      const ulValue = parseFloat(data.ul_gb) || 0;

      if (dlValue > 0 || ulValue > 0) {
        filtered[tech] = data;
      }
    });

    return filtered;
  }, [summaryStats]);

  const hasValidData = filteredProviderVolume && filteredProviderVolume.length > 0;
  const hasTechData = Object.keys(filteredTechSummary).length > 0;
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

          {hasTechData && (
            <div className="mt-4 pt-3 border-t border-slate-700">
              <h5 className="text-xs font-semibold text-white mb-2">
                By Technology
              </h5>
              <div className="flex flex-wrap text-white gap-2">
                {Object.entries(filteredTechSummary).map(([tech, data]) => (
                  <div
                    key={tech}
                    className="inline-flex items-center gap-2 text-white px-3 py-1.5 rounded-lg border"
                    style={getTechBadgeStyle(tech)}
                  >
                    <span className="font-medium text-white/80">{tech}</span>
                    <span className="text-xs text-white/80">
                      {formatBytes(data.dl_gb, "GB")} GB /{" "}
                      {formatBytes(data.ul_gb, "GB")} GB
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
