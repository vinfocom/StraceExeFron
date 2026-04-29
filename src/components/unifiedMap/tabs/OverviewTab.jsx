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
} from "lucide-react";
import { StatCard } from "../common/StatCard";
import { PCI_COLOR_PALETTE } from "@/components/map/layers/MultiColorCirclesLayer";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { mapViewApi } from "@/api/apiEndpoints";
import {
  normalizeProviderName,
  normalizeTechName,
  COLOR_SCHEMES,
  getLogColor,
} from "@/utils/colorUtils";

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

const formatBytes = (gb, toUnit = "GB") => {
  if (!gb || gb <= 0) return "0.00";
  if (toUnit === "GB") {
    return gb.toFixed(2);
  } else if (toUnit === "MB") {
    return (gb * 1024).toFixed(2);
  }
  return gb.toFixed(2);
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
  expanded,
  tptVolume,
  durationData,
  distance,
  drawnShapeAnalytics = [],
  sessionIds: sessionIdsProp = [],
  gridViewEnabled = false,
  gridViewSummary = null,
}) => {
  const [searchParams] = useSearchParams();
  const [providerVolume, setProviderVolume] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await mapViewApi.getproviderVolume({
        session_ids: sessionIds.join(","),
      });

      if (response?.status === 0) {
        throw new Error(response.message || "Failed to fetch volume data");
      }

      const volumeData =
        response?.data?.tpt_provider_summary ||
        response?.tpt_provider_summary ||
        {};

      if (Object.keys(volumeData).length > 0) {
        toast.success(
          `Volume data loaded for ${Object.keys(volumeData).length} session(s)`
        );
        setProviderVolume(volumeData);
      } else {
        toast.warn("No volume data available");
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
      setLoading(false);
    }
  }, [sessionIds]);

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

    const aggregated = {};

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
            const key = `${normalizedProvider.toLowerCase()}_${normalizedTech.toLowerCase()}`;

            if (!aggregated[key]) {
              aggregated[key] = {
                provider: normalizedProvider,
                technology: normalizedTech,
                dl_gb: 0,
                ul_gb: 0,
                durationSec: 0,
                avgDlSpeedMbps: [],
                avgUlSpeedMbps: [],
                sessionCount: 0,
                sessions: [],
                providerColor: getLogColor("provider", normalizedProvider),
                techColor: getLogColor("technology", normalizedTech),
              };
            }

            aggregated[key].dl_gb += volumeData?.dl_gb || 0;
            aggregated[key].ul_gb += volumeData?.ul_gb || 0;
            aggregated[key].durationSec += volumeData?.duration_sec || 0;

            if (volumeData?.avg_dl_mbps) {
              aggregated[key].avgDlSpeedMbps.push(volumeData.avg_dl_mbps);
            }
            if (volumeData?.avg_ul_mbps) {
              aggregated[key].avgUlSpeedMbps.push(volumeData.avg_ul_mbps);
            }

            aggregated[key].sessionCount += 1;
            if (!aggregated[key].sessions.includes(sessionId)) {
              aggregated[key].sessions.push(sessionId);
            }
          }
        });
      });
    });

    const processed = Object.values(aggregated).map((item) => {
      const avgDlSpeed =
        item.avgDlSpeedMbps.length > 0
          ? item.avgDlSpeedMbps.reduce((a, b) => a + b, 0) /
            item.avgDlSpeedMbps.length
          : 0;
      const avgUlSpeed =
        item.avgUlSpeedMbps.length > 0
          ? item.avgUlSpeedMbps.reduce((a, b) => a + b, 0) /
            item.avgUlSpeedMbps.length
          : 0;

      return {
        provider: item.provider,
        technology: item.technology,
        downloadGb: formatBytes(item.dl_gb, "GB"),
        uploadGb: formatBytes(item.ul_gb, "GB"),
        totalGb: formatBytes(item.dl_gb + item.ul_gb, "GB"),
        dl_gb: item.dl_gb,
        ul_gb: item.ul_gb,
        durationSec: item.durationSec,
        durationFormatted: formatDuration(item.durationSec),
        avgDlSpeedMbps: avgDlSpeed,
        avgUlSpeedMbps: avgUlSpeed,
        avgDlSpeedFormatted: formatSpeed(avgDlSpeed),
        avgUlSpeedFormatted: formatSpeed(avgUlSpeed),
        sessionCount: item.sessionCount,
        sessions: item.sessions,
        providerColor: item.providerColor,
        techColor: item.techColor,
      };
    });

    processed.sort((a, b) => {
      const providerCompare = a.provider.localeCompare(b.provider);
      if (providerCompare !== 0) return providerCompare;
      return a.technology.localeCompare(b.technology);
    });

    return processed.length > 0 ? processed : null;
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

    const allDlSpeeds = processedProviderVolume
      .map((item) => item.avgDlSpeedMbps)
      .filter(Boolean);
    const allUlSpeeds = processedProviderVolume
      .map((item) => item.avgUlSpeedMbps)
      .filter(Boolean);

    const avgDlSpeed =
      allDlSpeeds.length > 0
        ? allDlSpeeds.reduce((a, b) => a + b, 0) / allDlSpeeds.length
        : 0;
    const avgUlSpeed =
      allUlSpeeds.length > 0
        ? allUlSpeeds.reduce((a, b) => a + b, 0) / allUlSpeeds.length
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

      {sessionIds.length > 0 && (
        <ProviderVolumeCard
          providerVolume={processedProviderVolume}
          summaryStats={volumeSummaryStats}
          loading={loading}
          sessionIds={sessionIds}
          error={error}
        />
      )}

      {/* {volume && (
        <DataVolumeCard volume={volume} sessionWiseVolume={sessionWiseVolume} />
      )} */}

      {durationData && durationData.length > 0 && (
        <DurationData durationData={durationData} />
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

      const downloadValue = parseFloat(item.downloadGb) || 0;
      const uploadValue = parseFloat(item.uploadGb) || 0;
      const totalValue = parseFloat(item.totalGb) || 0;

      return downloadValue > 0 || uploadValue > 0 || totalValue > 0;
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

  return (
    <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
      <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <Wifi className="h-4 w-4" />
        Provider Volume by Technology
        <span className="text-xs text-white font-normal ml-2">
          ({sessionIds.length} session{sessionIds.length > 1 ? "s" : ""})
        </span>
      </h4>

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
          <div className="overflow-x-auto scrollbar-hide bg-slate-800/50 rounded">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800">
                  <th className="text-left px-2 py-2 text-white font-medium">
                    Provider
                  </th>
                  <th className="text-left px-2 py-2 text-white font-medium">
                    Tech
                  </th>
                  <th className="text-right px-2 py-2 text-white font-medium whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      <Download className="h-3 w-3" />
                      DL (GB)
                    </div>
                  </th>
                  <th className="text-right px-2 py-2 text-white font-medium whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      <Upload className="h-3 w-3" />
                      UL (GB)
                    </div>
                  </th>
                  <th className="text-right px-2 py-2 text-white font-medium whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      <Gauge className="h-3 w-3" />
                      Avg DL
                    </div>
                  </th>
                  <th className="text-right px-2 py-2 text-white font-medium whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      <Gauge className="h-3 w-3" />
                      Avg UL
                    </div>
                  </th>
                  <th className="text-right px-2 py-2 text-white font-medium whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      <Timer className="h-3 w-3" />
                      Duration
                    </div>
                  </th>
                  <th className="text-right px-2 py-2 text-white font-medium">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredProviderVolume.length === 0 ? (
                  <tr>
                    <td
                      colSpan="8"
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
                      <td className="px-2 py-2 text-white">
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: item.providerColor }}
                          />
                          <span className="capitalize font-medium">
                            {item.provider}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border"
                          style={getTechBadgeStyle(item.technology)}
                        >
                          {item.technology}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right text-blue-400 font-medium">
                        {item.downloadGb}
                      </td>
                      <td className="px-2 py-2 text-right text-green-400 font-medium">
                        {item.uploadGb}
                      </td>
                      <td className="px-2 py-2 text-right text-cyan-400 font-medium whitespace-nowrap">
                        {item.avgDlSpeedFormatted}
                      </td>
                      <td className="px-2 py-2 text-right text-teal-400 font-medium whitespace-nowrap">
                        {item.avgUlSpeedFormatted}
                      </td>
                      <td className="px-2 py-2 text-right text-orange-400 font-medium whitespace-nowrap">
                        {item.durationFormatted}
                      </td>
                      <td className="px-2 py-2 text-right text-white font-bold">
                        {item.totalGb}
                      </td>
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
