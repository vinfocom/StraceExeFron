import { getLogTechnology, normalizeMetricTechnology, getTechnologySignalRows, getTechnologyMetricValue } from "@/utils/technologyMetricLabels";
import React, { memo, useEffect, useMemo, useState } from "react";
import {
  FLOAT_PANE,
  InfoWindowF,
  MarkerF,
  OverlayViewF,
  PolylineF,
} from "@react-google-maps/api";
import { getColorForMetric } from "@/utils/metrics";

const formatMetric = (value, suffix = "") => {
  if (value == null || value === "" || !Number.isFinite(Number(value))) return "N/A";
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;
};

const formatField = (value) => {
  if (value == null || String(value).trim() === "") return "N/A";
  return String(value);
};

const formatDuration = (value) => {
  if (value == null || Number.isNaN(Number(value))) return "N/A";
  const totalSeconds = Math.floor(Number(value) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
};

const toMetric = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const firstPresentValue = (...values) =>
  values.find((value) => {
    if (value == null) return false;
    const normalized = String(value).trim().toLowerCase();
    return normalized !== "" && !["na", "n/a", "null", "undefined", "-"].includes(normalized);
  }) ?? null;

const NETWORK_LOG_BUCKET_PRECISION = 4;
const MAX_THPUT_MATCH_DISTANCE_METERS = 50;

const getHoverCardOffset = (width, height) => ({
  x: -(width / 2),
  y: -(height + 18),
});

const disableOverlayPointerEvents = (overlay) => {
  if (overlay?.container) {
    overlay.container.style.pointerEvents = "none";
  }
};

const toBucketKey = (lat, lng) =>
  `${Number(lat).toFixed(NETWORK_LOG_BUCKET_PRECISION)}|${Number(lng).toFixed(NETWORK_LOG_BUCKET_PRECISION)}`;

const getDistanceMeters = (start, end) => {
  if (!start || !end) return Number.POSITIVE_INFINITY;

  const earthRadius = 6371000;
  const lat1 = (Number(start.lat) * Math.PI) / 180;
  const lat2 = (Number(end.lat) * Math.PI) / 180;
  const deltaLat = ((Number(end.lat) - Number(start.lat)) * Math.PI) / 180;
  const deltaLng = ((Number(end.lng) - Number(start.lng)) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const findNearestNetworkSample = (position, bucketedLogs, matchesSample) => {
  if (!position || !bucketedLogs) return null;

  const centerLat = Number(position.lat);
  const centerLng = Number(position.lng);
  if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) return null;

  const candidates = [];
  for (let latOffset = -1; latOffset <= 1; latOffset += 1) {
    for (let lngOffset = -1; lngOffset <= 1; lngOffset += 1) {
      const bucketLat = centerLat + latOffset / 10 ** NETWORK_LOG_BUCKET_PRECISION;
      const bucketLng = centerLng + lngOffset / 10 ** NETWORK_LOG_BUCKET_PRECISION;
      const bucket = bucketedLogs.get(toBucketKey(bucketLat, bucketLng));
      if (Array.isArray(bucket) && bucket.length > 0) candidates.push(...bucket);
    }
  }

  if (candidates.length === 0) return null;

  let bestMatch = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  candidates.forEach((sample) => {
    if (!matchesSample(sample)) return;
    const samplePosition = {
      lat: sample.lat ?? sample.latitude,
      lng: sample.lng ?? sample.longitude ?? sample.lon,
    };
    const distance = getDistanceMeters(position, samplePosition);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = sample;
    }
  });

  if (bestDistance > MAX_THPUT_MATCH_DISTANCE_METERS) return null;
  return bestMatch;
};

const getNormalizedStatus = (statusRaw) => {
  const numeric = Number(statusRaw);
  if (Number.isFinite(numeric)) {
    if (numeric === 1) return "success";
    if (numeric === 2) return "failed";
  }

  const value = String(statusRaw ?? "").trim().toLowerCase().replace(/[_\s-]+/g, " ");
  if (["drop", "dropped", "drop call", "dropped call", "call drop", "call dropped"].includes(value)) return "drop";
  if (["success", "succeeded", "pass", "passed", "connected"].includes(value)) return "success";
  if (["failed", "fail", "error", "not connected", "disconnected"].includes(value)) return "failed";
  return "failed";
};



const formatStatus = (statusRaw) => {
  const status = getNormalizedStatus(statusRaw);

  if (status === "success" || status === "drop") {
    return {
      status: "Success",
      color: "#22C55E",
    };
  }

  return {
    status: "Failed",
    color: "#EF4444",
  };
};

const DIAMOND_PATH = "M 0,-10 10,0 0,10 -10,0 z";
const HEXAGON_PATH = "M 0,-10 8.66,-5 8.66,5 0,10 -8.66,5 -8.66,-5 z";
const CROSS_PATH = "M -9,-7 -7,-9 0,-2 7,-9 9,-7 2,0 9,7 7,9 0,2 -7,9 -9,7 -2,0 z";

const formatSubSessionType = (subSessionType) => {
  const value = String(subSessionType ?? "").trim();
  if (value === "1") return "PS";
  if (value === "2") return "CS";
  return value || "N/A";
};

const normalizeMarkerTechnology = normalizeMetricTechnology;

const hasNetworkSignalMetric = (sample) => [
  sample?.rsrp,
  sample?.RSRP,
  sample?.nr_rsrp,
  sample?.nrRsrp,
  sample?.rsrq,
  sample?.RSRQ,
  sample?.nr_rsrq,
  sample?.nrRsrq,
  sample?.sinr,
  sample?.SINR,
  sample?.nr_sinr,
  sample?.nrSinr,
  sample?.rxlev,
  sample?.RxLev,
  sample?.rxqual,
  sample?.RxQual,
  sample?.cqi,
  sample?.CQI,
  sample?.rscp,
  sample?.RSCP,
  sample?.ecno,
  sample?.EcNo,
].some((value) => toMetric(value) != null);

const getSubSessionMarkerPath = (subSessionType, statusRaw) => {
  if (getNormalizedStatus(statusRaw) === "failed") return CROSS_PATH;

  const value = String(subSessionType ?? "").trim();
  if (value === "2") return HEXAGON_PATH;
  return DIAMOND_PATH;
};



const SubSessionTooltip = ({ marker }) => {
  const isCs = formatSubSessionType(marker.subSessionType) === "CS";
  const technology = normalizeMarkerTechnology(getLogTechnology(marker));
  const technologyMetrics = getTechnologySignalRows(marker);
  const rows = [
    ["Technology", technology],
    isCs
      ? ["Call Duration", formatDuration(marker.duration)]
      : ["Avg Speed", formatMetric(marker.metrics?.avg_speed == null ? null : Number(marker.metrics.avg_speed) / 1000, " Mbps")],
    ...technologyMetrics.map(({ label, value, unit }) => [label, formatMetric(value, unit ? ` ${unit}` : "")]),
    ["CI", formatField(marker.ci ?? marker.ci_db)],
    ["NodeB", formatField(marker.nodeb_id ?? marker.nodebId)],
    ["BCCH", formatField(technology === "2G" ? getTechnologyMetricValue(marker, "earfcn") : marker.bcch)],
  ];

  return (
    <div className="min-w-[190px] space-y-1 text-xs text-slate-800">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3">
          <span className="text-slate-500">{label}</span>
          <span className="font-medium">{value}</span>
        </div>
      ))}
    </div>
  );
};

const SubSessionMarkers = ({
  markers = [],
  show = false,
  thresholds = {},
  networkLogData = [],
  selectedMarkerId = null,
  selectedMarkerIds = [],
  onMarkerSelect,
}) => {
  const [internalSelectedMarkerId, setInternalSelectedMarkerId] = useState(null);
  const [hoveredMarkerId, setHoveredMarkerId] = useState(null);
  const activeMarkerId = selectedMarkerId ?? internalSelectedMarkerId;
  const highlightedMarkerIdSet = useMemo(() => {
    const values = Array.isArray(selectedMarkerIds) ? selectedMarkerIds : [];
    return new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean));
  }, [selectedMarkerIds]);

  useEffect(() => {
    if (!show) {
      setInternalSelectedMarkerId(null);
      setHoveredMarkerId(null);
    }
  }, [show]);

  useEffect(() => {
    if (!Array.isArray(markers) || markers.length === 0) {
      setInternalSelectedMarkerId(null);
      setHoveredMarkerId(null);
      return;
    }

    const exists = markers.some((item) => item.id === activeMarkerId);
    if (!exists) {
      setInternalSelectedMarkerId(null);
    }

    const hoveredExists = markers.some((item) => item.id === hoveredMarkerId);
    if (!hoveredExists) {
      setHoveredMarkerId(null);
    }
  }, [markers, activeMarkerId, hoveredMarkerId]);

  const bucketedNetworkLogs = useMemo(() => {
    if (!Array.isArray(networkLogData) || networkLogData.length === 0) return new Map();

    return networkLogData.reduce((accumulator, log) => {
      const lat = Number(log?.lat ?? log?.latitude);
      const lng = Number(log?.lng ?? log?.longitude ?? log?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return accumulator;
      if (String(log?.log_type ?? log?.connection_type ?? "").toLowerCase() === "wifi") {
        return accumulator;
      }

      const dlThroughput = toMetric(
        log?.dl_tpt ?? log?.dl_thpt ?? log?.dl_rpt ?? log?.dl_throughput ?? log?.throughput_dl,
      );

      const key = toBucketKey(lat, lng);
      const current = accumulator.get(key) || [];
      current.push({ ...log, dlThroughput });
      accumulator.set(key, current);
      return accumulator;
    }, new Map());
  }, [networkLogData]);

  const enrichedMarkers = useMemo(
    () =>
      (Array.isArray(markers) ? markers : []).map((marker) => {
        const position = marker.start ?? marker.position;
        const matchedSample = findNearestNetworkSample(
          position, bucketedNetworkLogs, (sample) => sample.dlThroughput != null,
        );
        const signalSample = findNearestNetworkSample(
          position, bucketedNetworkLogs,
          hasNetworkSignalMetric,
        );
        const dlThroughput = toMetric(
          marker.dlThroughput ??
            marker.dl_tpt ??
            marker.dl_thpt ??
            matchedSample?.dlThroughput ??
            matchedSample?.dl_tpt ??
            matchedSample?.dl_thpt,
        );
        const isPsMarker = String(marker.subSessionType ?? "").trim() === "1";
        const thresholdColor =
          isPsMarker && dlThroughput != null
            ? getColorForMetric("dl_thpt", dlThroughput, thresholds)
            : null;
        const cellId = firstPresentValue(
          marker.cell_id,
          marker.cellId,
          signalSample?.cell_id,
          signalSample?.cellId,
          signalSample?.CellId,
          signalSample?.CELL_ID,
        );

        return {
          ...marker,
          dlThroughput,
          technology: normalizeMarkerTechnology(
            marker.technology ??
              marker.networkType ??
              marker.network ??
              signalSample?.technology ??
              signalSample?.networkType ??
              signalSample?.network,
          ),
          rsrp: toMetric(marker.rsrp ?? signalSample?.rsrp ?? signalSample?.RSRP),
          rsrq: toMetric(marker.rsrq ?? signalSample?.rsrq ?? signalSample?.RSRQ),
          sinr: toMetric(marker.sinr ?? signalSample?.sinr ?? signalSample?.SINR),
          rxlev: toMetric(marker.rxlev ?? signalSample?.rxlev ?? signalSample?.RxLev ?? signalSample?.RXLEV),
          rxqual: toMetric(marker.rxqual ?? signalSample?.rxqual ?? signalSample?.RxQual ?? signalSample?.RXQUAL),
          cqi: toMetric(marker.cqi ?? signalSample?.cqi ?? signalSample?.CQI),
          rscp: toMetric(marker.rscp ?? signalSample?.rscp ?? signalSample?.RSCP),
          ecno: toMetric(marker.ecno ?? signalSample?.ecno ?? signalSample?.EcNo ?? signalSample?.ECNO),
          nrRsrp: toMetric(marker.nrRsrp ?? signalSample?.nrRsrp ?? signalSample?.nr_rsrp ?? signalSample?.NR_RSRP ?? signalSample?.rsrp ?? signalSample?.RSRP),
          nrRsrq: toMetric(marker.nrRsrq ?? signalSample?.nrRsrq ?? signalSample?.nr_rsrq ?? signalSample?.NR_RSRQ ?? signalSample?.rsrq ?? signalSample?.RSRQ),
          nrSinr: toMetric(marker.nrSinr ?? signalSample?.nrSinr ?? signalSample?.nr_sinr ?? signalSample?.NR_SINR),
          ci: cellId ?? marker.ci ?? signalSample?.ci ?? signalSample?.CI ?? signalSample?.ci_db ?? signalSample?.ciDb,
          ci_db: marker.ci_db ?? signalSample?.ci_db ?? signalSample?.ciDb ?? signalSample?.CI_DB,
          cell_id: cellId,
          nodeb_id: marker.nodeb_id ?? marker.nodebId ?? signalSample?.nodeb_id ?? signalSample?.nodebId ?? signalSample?.NodeBId,
          nodebId: marker.nodebId ?? marker.nodeb_id ?? signalSample?.nodebId ?? signalSample?.nodeb_id ?? signalSample?.NodeBId,
          bcch: firstPresentValue(
            marker.bcch,
            signalSample?.bcch,
            signalSample?.BCCH,
            signalSample?.bcch_id,
            signalSample?.bcchId,
            marker.earfcn,
            signalSample?.earfcn,
            signalSample?.EARFCN,
            signalSample?.Earfcn,
          ),
          fillColor: thresholdColor || formatStatus(marker.resultStatus).color,
        };
      }),
    [bucketedNetworkLogs, markers, thresholds],
  );

  const activeSelectedMarker = useMemo(
    () => enrichedMarkers.find((item) => item.id === activeMarkerId) || null,
    [enrichedMarkers, activeMarkerId],
  );

  const activeHoveredMarker = useMemo(
    () => enrichedMarkers.find((item) => item.id === hoveredMarkerId) || null,
    [enrichedMarkers, hoveredMarkerId],
  );

  if (!show || !Array.isArray(markers) || markers.length === 0) {
    return null;
  }

  return (
    <>
      {activeHoveredMarker?.start && activeHoveredMarker?.end && (
        <PolylineF
          path={[activeHoveredMarker.start, activeHoveredMarker.end]}
          options={{
            strokeColor: "#22d3ee",
            strokeOpacity: 0.95,
            strokeWeight: 3,
            geodesic: true,
            clickable: false,
            zIndex: 900,
            icons: [
              {
                icon: {
                  path: window.google.maps.SymbolPath.FORWARD_OPEN_ARROW,
                  scale: 3,
                  strokeColor: "#22d3ee",
                  strokeOpacity: 1,
                },
                offset: "100%",
              },
            ],
          }}
        />
      )}

      {activeHoveredMarker && activeHoveredMarker.id !== activeMarkerId && (
        <OverlayViewF
          position={activeHoveredMarker.position}
          mapPaneName={FLOAT_PANE}
          getPixelPositionOffset={getHoverCardOffset}
          onLoad={disableOverlayPointerEvents}
          zIndex={1100}
        >
          <div className="pointer-events-none rounded-md border border-slate-200 bg-white px-3 py-2 shadow-lg">
            <SubSessionTooltip marker={activeHoveredMarker} />
          </div>
        </OverlayViewF>
      )}

      {enrichedMarkers.map((marker, index) => (
        (() => {
          const markerKey = String(marker.id ?? "");
          const isHighlighted = highlightedMarkerIdSet.has(markerKey);

          return (
            <MarkerF
              key={`${marker.id ?? "sub"}-${marker.sessionId ?? "na"}-${marker.subSessionId ?? "na"}-${index}`}
              position={marker.position}
              icon={{
                path: getSubSessionMarkerPath(
                  marker.subSessionType,
                  marker.resultStatusRaw ?? marker.resultStatus,
                ),
                fillColor: marker.fillColor,
                fillOpacity: 1,
                strokeColor: isHighlighted ? marker.fillColor : "#f7f8f8",
                strokeWeight: isHighlighted ? 5 : 2,
                scale: isHighlighted ? 1.28 : 1,
              }}
              zIndex={isHighlighted ? 1000 : undefined}
              onClick={() => {
                setInternalSelectedMarkerId(marker.id);
                if (typeof onMarkerSelect === "function") {
                  onMarkerSelect(marker);
                }
              }}
              onMouseOver={() => {
                setHoveredMarkerId(marker.id);
              }}
              onMouseOut={() => {
                setHoveredMarkerId((current) => (current === marker.id ? null : current));
              }}
            />
          );
        })()
      ))}

      {activeSelectedMarker && (
        <InfoWindowF
          position={activeSelectedMarker.position}
          onCloseClick={() => {
            if (selectedMarkerId == null) {
              setInternalSelectedMarkerId(null);
            }
            if (typeof onMarkerSelect === "function") {
              onMarkerSelect(null);
            }
          }}
        >
          <SubSessionTooltip marker={activeSelectedMarker} />
        </InfoWindowF>
      )}
    </>
  );
};

export default memo(SubSessionMarkers);
