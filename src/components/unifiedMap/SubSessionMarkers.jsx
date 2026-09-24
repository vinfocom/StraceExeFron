import { getLogTechnology, normalizeMetricTechnology, getTechnologySignalRows, getTechnologyMetricValue } from "@/utils/technologyMetricLabels";
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  FLOAT_PANE,
  InfoWindowF,
  OverlayViewF,
  PolylineF,
  useGoogleMap,
} from "@react-google-maps/api";
import { getColorForMetric } from "@/utils/metrics";
import { ScatterplotLayer } from "@deck.gl/layers";
import { useDeckLayerGroup } from "@/components/maps/deckLayerRegistry.jsx";

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

const readLatLng = (position) => ({
  lat: Number(typeof position?.lat === "function" ? position.lat() : position?.lat),
  lng: Number(typeof position?.lng === "function" ? position.lng() : position?.lng),
});

const readPaddedMapViewport = (map) => {
  const bounds = map?.getBounds?.();
  const northEast = bounds?.getNorthEast?.();
  const southWest = bounds?.getSouthWest?.();
  if (!northEast || !southWest) return null;

  const north = northEast.lat();
  const east = northEast.lng();
  const south = southWest.lat();
  const west = southWest.lng();
  const latPadding = Math.max(0, north - south) * 0.2;
  const longitudeSpan = east >= west ? east - west : east + 360 - west;
  const longitudePadding = longitudeSpan * 0.2;
  const coversAllLongitudes = longitudeSpan + longitudePadding * 2 >= 360;
  const wrapLongitude = (longitude) => ((longitude + 180) % 360 + 360) % 360 - 180;

  return {
    north: Math.min(90, north + latPadding),
    south: Math.max(-90, south - latPadding),
    east: coversAllLongitudes ? 180 : wrapLongitude(east + longitudePadding),
    west: coversAllLongitudes ? -180 : wrapLongitude(west - longitudePadding),
  };
};

const isInsideViewport = (position, viewport) => {
  const { lat, lng } = readLatLng(position);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  const insideLongitude = viewport.west <= viewport.east
    ? lng >= viewport.west && lng <= viewport.east
    : lng >= viewport.west || lng <= viewport.east;
  return lat >= viewport.south && lat <= viewport.north && insideLongitude;
};

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

  const { lat: centerLat, lng: centerLng } = readLatLng(position);
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

const enrichMarkerDetails = (marker, bucketedNetworkLogs, thresholds) => {
  if (!marker) return null;

  const position = marker.start ?? marker.position;
  const matchedSample = findNearestNetworkSample(
    position,
    bucketedNetworkLogs,
    (sample) => sample.dlThroughput != null,
  );
  const signalSample = findNearestNetworkSample(position, bucketedNetworkLogs, hasNetworkSignalMetric);
  const dlThroughput = toMetric(
    marker.dlThroughput ?? marker.dl_tpt ?? marker.dl_thpt ??
      matchedSample?.dlThroughput ?? matchedSample?.dl_tpt ?? matchedSample?.dl_thpt,
  );
  const isPsMarker = String(marker.subSessionType ?? "").trim() === "1";
  const thresholdColor = isPsMarker && dlThroughput != null
    ? getColorForMetric("dl_thpt", dlThroughput, thresholds)
    : null;
  const cellId = firstPresentValue(
    marker.cell_id, marker.cellId, signalSample?.cell_id, signalSample?.cellId,
    signalSample?.CellId, signalSample?.CELL_ID,
  );

  return {
    ...marker,
    dlThroughput,
    technology: normalizeMarkerTechnology(
      marker.technology ?? marker.networkType ?? marker.network ??
        signalSample?.technology ?? signalSample?.networkType ?? signalSample?.network,
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
      marker.bcch, signalSample?.bcch, signalSample?.BCCH, signalSample?.bcch_id,
      signalSample?.bcchId, marker.earfcn, signalSample?.earfcn, signalSample?.EARFCN,
      signalSample?.Earfcn,
    ),
    fillColor: thresholdColor || formatStatus(marker.resultStatus).color,
  };
};

const toDeckColor = (value) => {
  const color = String(value ?? "").trim();
  const hex = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (hex) {
    const expanded = hex.length === 3 ? [...hex].map((part) => `${part}${part}`).join("") : hex;
    return [
      Number.parseInt(expanded.slice(0, 2), 16),
      Number.parseInt(expanded.slice(2, 4), 16),
      Number.parseInt(expanded.slice(4, 6), 16),
      235,
    ];
  }
  const rgb = color.match(/^rgba?\(([^)]+)\)$/i)?.[1];
  if (rgb) {
    const channels = rgb.split(",").slice(0, 3).map((channel) => Number.parseFloat(channel));
    if (channels.length === 3 && channels.every(Number.isFinite)) return [...channels, 235];
  }
  return [34, 197, 94, 235];
};

const buildDeckPointGroups = (markers, zoom, highlightedIds) => {
  const safeZoom = Math.max(0, Math.min(21, Number(zoom) || 0));
  const worldSize = 256 * 2 ** safeZoom;
  const cellSize = 52;
  const groups = new Map();

  markers.forEach((marker) => {
    const position = marker.position ?? marker.start;
    const { lat, lng } = readLatLng(position);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
    const sinLat = Math.sin((clampedLat * Math.PI) / 180);
    const worldX = ((lng + 180) / 360) * worldSize;
    const worldY = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * worldSize;
    const key = safeZoom >= 19
      ? `location-${lat.toFixed(5)}:${lng.toFixed(5)}`
      : `${Math.floor(worldX / cellSize)}:${Math.floor(worldY / cellSize)}`;
    let group = groups.get(key);
    if (!group) {
      group = { markers: [], latTotal: 0, lngTotal: 0 };
      groups.set(key, group);
    }
    group.markers.push(marker);
    group.latTotal += lat;
    group.lngTotal += lng;
  });

  return Array.from(groups.values(), (group) => {
    const count = group.markers.length;
    const marker = group.markers[0];
    const selected = group.markers.some((item) => highlightedIds.has(String(item.id ?? "").trim()));
    return {
      position: [group.lngTotal / count, group.latTotal / count],
      markers: group.markers,
      count,
      selected,
      isCluster: count > 1,
      fillColor: toDeckColor(marker.fillColor),
      radius: selected ? 7 : 5.5,
    };
  });
};

const createSubSessionDeckLayers = (points, onClick, onHover, interactive = true) => {
  const smoothEase = (value) => value * value * (3 - 2 * value);
  const scatterplot = new ScatterplotLayer({
    id: "sub-session-points",
    data: points,
    pickable: interactive,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 180],
    stroked: true,
    filled: true,
    opacity: 0.96,
    radiusUnits: "pixels",
    radiusMinPixels: 4,
    radiusMaxPixels: 18,
    lineWidthUnits: "pixels",
    lineWidthMinPixels: 1,
    getPosition: (point) => point.position,
    getRadius: (point) => point.radius,
    getFillColor: (point) => point.fillColor,
    getLineColor: (point) => point.selected ? [250, 204, 21, 255] : [255, 255, 255, 235],
    getLineWidth: (point) => point.selected ? 2.5 : 1.25,
    transitions: {
      getPosition: { duration: 180, easing: smoothEase },
      getRadius: { duration: 180, easing: smoothEase, enter: () => 0 },
      getFillColor: {
        duration: 180,
        easing: smoothEase,
        enter: (color) => [color[0], color[1], color[2], 0],
      },
      getLineColor: { duration: 180, easing: smoothEase },
      getLineWidth: { duration: 180, easing: smoothEase },
    },
    onClick: ({ object }) => {
      if (!object || !interactive) return false;
      onClick?.(object);
      return true;
    },
    onHover: ({ object }) => onHover?.(object),
  });
  return [scatterplot];
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
  interactionsDisabled = false,
}) => {
  const map = useGoogleMap();
  const [internalSelectedMarkerId, setInternalSelectedMarkerId] = useState(null);
  const [hoveredMarkerId, setHoveredMarkerId] = useState(null);
  const [viewport, setViewport] = useState(null);
  const [mapZoom, setMapZoom] = useState(0);
  const deckClickRef = useRef(null);
  const deckHoverRef = useRef(null);
  const duplicateCycleRef = useRef(new Map());
  const onMarkerSelectRef = useRef(onMarkerSelect);
  onMarkerSelectRef.current = onMarkerSelect;
  const activeMarkerId = selectedMarkerId ?? internalSelectedMarkerId;
  const hasMarkers = Array.isArray(markers) && markers.length > 0;
  const highlightedMarkerIdsKey = (Array.isArray(selectedMarkerIds) ? selectedMarkerIds : [])
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .sort()
    .join("\u0000");
  const highlightedMarkerIdSet = useMemo(() => {
    return new Set(highlightedMarkerIdsKey ? highlightedMarkerIdsKey.split("\u0000") : []);
  }, [highlightedMarkerIdsKey]);

  useEffect(() => {
    if (!show) {
      setInternalSelectedMarkerId(null);
      setHoveredMarkerId(null);
    }
  }, [show]);

  useEffect(() => {
    if (!show || !map) {
      setViewport(null);
      return undefined;
    }

    const updateViewport = () => {
      const nextViewport = readPaddedMapViewport(map);
      const nextZoom = Number(map.getZoom?.());
      if (Number.isFinite(nextZoom)) {
        setMapZoom((current) => (current === nextZoom ? current : nextZoom));
      }
      if (!nextViewport) return;
      setViewport((current) => {
        if (
          current &&
          current.north === nextViewport.north &&
          current.south === nextViewport.south &&
          current.east === nextViewport.east &&
          current.west === nextViewport.west
        ) {
          return current;
        }
        return nextViewport;
      });
    };

    updateViewport();
    const listener = map.addListener?.("idle", updateViewport);
    return () => listener?.remove?.();
  }, [map, show]);

  const visibleMarkers = useMemo(() => {
    if (!viewport) return [];
    return (Array.isArray(markers) ? markers : []).filter((marker) =>
      isInsideViewport(marker.position ?? marker.start, viewport),
    );
  }, [markers, viewport]);

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

    const hoveredExists = visibleMarkers.some((item) => item.id === hoveredMarkerId);
    if (!hoveredExists) {
      setHoveredMarkerId(null);
    }
  }, [markers, visibleMarkers, activeMarkerId, hoveredMarkerId]);

  const bucketedNetworkLogs = useMemo(() => {
    if (!viewport || !Array.isArray(networkLogData) || networkLogData.length === 0) return new Map();

    return networkLogData.reduce((accumulator, log) => {
      const lat = Number(log?.lat ?? log?.latitude);
      const lng = Number(log?.lng ?? log?.longitude ?? log?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return accumulator;
      if (!isInsideViewport({ lat, lng }, viewport)) return accumulator;
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
  }, [networkLogData, viewport]);

  const renderMarkers = useMemo(
    () => visibleMarkers.map((marker) => {
      const dlThroughput = toMetric(marker.dlThroughput ?? marker.dl_tpt ?? marker.dl_thpt);
      const hasDirectThroughput = String(marker.subSessionType ?? "").trim() === "1" && dlThroughput != null;
      return {
        ...marker,
        fillColor: hasDirectThroughput
          ? getColorForMetric("dl_thpt", dlThroughput, thresholds)
          : formatStatus(marker.resultStatus).color,
      };
    }),
    [visibleMarkers, thresholds],
  );

  const activeSelectedMarker = useMemo(
    () => renderMarkers.find((item) => item.id === activeMarkerId) || null,
    [renderMarkers, activeMarkerId],
  );

  const activeHoveredMarker = useMemo(
    () => renderMarkers.find((item) => item.id === hoveredMarkerId) || null,
    [renderMarkers, hoveredMarkerId],
  );

  const detailedSelectedMarker = useMemo(
    () => enrichMarkerDetails(activeSelectedMarker, bucketedNetworkLogs, thresholds),
    [activeSelectedMarker, bucketedNetworkLogs, thresholds],
  );

  const detailedHoveredMarker = useMemo(
    () => enrichMarkerDetails(activeHoveredMarker, bucketedNetworkLogs, thresholds),
    [activeHoveredMarker, bucketedNetworkLogs, thresholds],
  );

  const deckPoints = useMemo(
    () => show
      ? buildDeckPointGroups(renderMarkers, mapZoom, highlightedMarkerIdSet)
      : [],
    [show, renderMarkers, mapZoom, highlightedMarkerIdSet],
  );
  deckClickRef.current = (point) => {
    if (!point) return;
    if (point.isCluster) {
      const LatLngBounds = window.google?.maps?.LatLngBounds;
      if (!LatLngBounds) return;
      const bounds = new LatLngBounds();
      point.markers.forEach((marker) => {
        const position = marker.position ?? marker.start;
        const { lat, lng } = readLatLng(position);
        if (Number.isFinite(lat) && Number.isFinite(lng)) bounds.extend({ lat, lng });
      });
      const northEast = bounds.getNorthEast();
      const southWest = bounds.getSouthWest();
      const isSingleLocation =
        Math.abs(northEast.lat() - southWest.lat()) < 0.00008 &&
        Math.abs(northEast.lng() - southWest.lng()) < 0.00008;
      if (isSingleLocation) {
        const currentZoom = Number(map.getZoom?.()) || 0;
        if (currentZoom < 21) {
          map.setZoom(Math.min(21, Math.max(currentZoom + 2, 19)));
        } else {
          const centerLat = point.position[1];
          const centerLng = point.position[0];
          const duplicateKey = `${centerLat.toFixed(5)}:${centerLng.toFixed(5)}`;
          const nextIndex = ((duplicateCycleRef.current.get(duplicateKey) ?? -1) + 1) % point.markers.length;
          duplicateCycleRef.current.set(duplicateKey, nextIndex);
          const marker = point.markers[nextIndex];
          setInternalSelectedMarkerId(marker.id);
          onMarkerSelectRef.current?.(marker);
        }
      } else {
        map.fitBounds(bounds, 64);
      }
      return;
    }

    const marker = point.markers[0];
    if (!marker) return;
    setInternalSelectedMarkerId(marker.id);
    onMarkerSelectRef.current?.(marker);
  };
  deckHoverRef.current = (point) => {
    const marker = point?.isCluster ? null : point?.markers?.[0];
    setHoveredMarkerId((current) => (current === (marker?.id ?? null) ? current : marker?.id ?? null));
  };

  const subSessionLayers = useMemo(() => show && hasMarkers
    ? createSubSessionDeckLayers(
      deckPoints,
      (point) => deckClickRef.current?.(point),
      (point) => deckHoverRef.current?.(point),
      !interactionsDisabled,
    )
    : [], [deckPoints, show, hasMarkers, interactionsDisabled]);
  useDeckLayerGroup("events", subSessionLayers, 30);

  if (!show || !Array.isArray(markers) || markers.length === 0) {
    return null;
  }

  return (
    <>
      {detailedHoveredMarker?.start && detailedHoveredMarker?.end && (
        <PolylineF
          path={[detailedHoveredMarker.start, detailedHoveredMarker.end]}
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

      {detailedHoveredMarker && detailedHoveredMarker.id !== activeMarkerId && (
        <OverlayViewF
          position={detailedHoveredMarker.position}
          mapPaneName={FLOAT_PANE}
          getPixelPositionOffset={getHoverCardOffset}
          onLoad={disableOverlayPointerEvents}
          zIndex={1100}
        >
          <div className="pointer-events-none rounded-md border border-slate-200 bg-white px-3 py-2 shadow-lg">
            <SubSessionTooltip marker={detailedHoveredMarker} />
          </div>
        </OverlayViewF>
      )}

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
          <SubSessionTooltip marker={detailedSelectedMarker} />
        </InfoWindowF>
      )}
    </>
  );
};

export default memo(SubSessionMarkers);
