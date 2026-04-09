// src/components/multiMap/MapChild.jsx
import React, { useMemo, useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { normalizeProviderName, normalizeTechName } from "@/utils/colorUtils";
import MapwithMultipleCircle from "../unifiedMap/MapwithMultipleCircle";
import NetworkPlannerMap from "@/components/unifiedMap/NetworkPlannerMap";
import LtePredictionLocationLayer from "@/components/unifiedMap/LtePredictionLocationLayer";
import MapLegend from "@/components/map/MapLegend";
import MapChildFooter from "./MapChildFooter";
import DrawingToolsLayer from "@/components/map/tools/DrawingToolsLayer";
import { PolygonF } from "@react-google-maps/api";
import { useLtePrediction } from "@/hooks/useLtePrediction";


const EMPTY_SESSIONS = [];
const EMPTY_POINTS = [];
const MAX_OPTIONS_SCAN_POINTS = 50000;
const MAX_LEGEND_SAMPLE_POINTS = 40000;
const MAX_DRAWING_SAMPLE_POINTS = 60000;

const sampleRows = (rows, maxRows) => {
  if (!Array.isArray(rows)) return [];
  if (!Number.isFinite(maxRows) || maxRows <= 0 || rows.length <= maxRows) return rows;

  const step = Math.ceil(rows.length / maxRows);
  const sampled = [];
  for (let i = 0; i < rows.length && sampled.length < maxRows; i += step) {
    sampled.push(rows[i]);
  }
  return sampled;
};

const toPoint = (item) => {
  const lat = Number(item?.lat ?? item?.latitude ?? item?.Lat);
  const lng = Number(item?.lng ?? item?.longitude ?? item?.Lng ?? item?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
};

const getPathBounds = (path = []) => {
  if (!Array.isArray(path) || path.length < 3) return null;
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  path.forEach((pt) => {
    const lat = Number(pt?.lat);
    const lng = Number(pt?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
    if (lng < west) west = lng;
    if (lng > east) east = lng;
  });
  if (![south, north, west, east].every(Number.isFinite)) return null;
  return { south, north, west, east };
};

const isPointInsidePolygon = (point, path = [], bounds = null) => {
  if (!point || !Array.isArray(path) || path.length < 3) return false;
  if (
    bounds &&
    (point.lat < bounds.south ||
      point.lat > bounds.north ||
      point.lng < bounds.west ||
      point.lng > bounds.east)
  ) {
    return false;
  }

  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const yi = Number(path[i]?.lat);
    const xi = Number(path[i]?.lng);
    const yj = Number(path[j]?.lat);
    const xj = Number(path[j]?.lng);
    if (
      ![yi, xi, yj, xj].every(Number.isFinite) ||
      yi === yj
    ) {
      continue;
    }
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

const MapChild = ({
  id,
  title,
  allNeighbors = [],
  allLocations = [],
  mapRole = "primary",
  onRemove,
  onRoleChange,
  displayMode = "logs",
  sitePredictionVersion = "original",
  onSitePredictionVersionChange,
  thresholds,
  projectId,
  sharedPolygons = [],
  drawEnabled = false,
  drawShapeMode = "polygon",
  drawClearSignal = 0,
  onDrawingComplete,
  onDrawingsChange,
  onDrawingUiChange,
  onActivateForDrawing,
}) => {
  const isSecondaryView = mapRole === "secondary";
  const isAllView = mapRole === "all";
  const isSiteMode = String(displayMode || "logs").toLowerCase() === "site";
  const [metric, setMetric] = useState("rsrp");
  const [provider, setProvider] = useState("All");
  const [band, setBand] = useState("All");
  const [tech, setTech] = useState("All");
  const [legendFilter, setLegendFilter] = useState(null);
  const [mapRef, setMapRef] = useState(null);
  const [selectedSiteIds, setSelectedSiteIds] = useState([]);

  const shouldFetchSiteLtePrediction =
    isSiteMode && Number(projectId) > 0 && selectedSiteIds.length > 0;

  const {
    locations: siteLtePredictionLocations,
    loading: siteLtePredictionLoading,
    error: siteLtePredictionError,
  } = useLtePrediction({
    projectId,
    siteId: selectedSiteIds.join(","),
    metric,
    sitePredictionVersion,
    enabled: shouldFetchSiteLtePrediction,
    filterEnabled: false,
    polygons: EMPTY_POINTS,
  });

  useEffect(() => {
    if (!isSiteMode && selectedSiteIds.length > 0) {
      setSelectedSiteIds([]);
    }
  }, [isSiteMode, selectedSiteIds.length]);

  const handleSiteSelectionChange = useCallback((siteIds = []) => {
    const normalized = Array.isArray(siteIds)
      ? siteIds.map((id) => String(id ?? "").trim()).filter(Boolean)
      : [];
    const next = normalized.length > 0 ? [normalized[normalized.length - 1]] : [];
    setSelectedSiteIds((prev) => {
      if (prev.length === next.length && prev.every((id, idx) => id === next[idx])) {
        return prev;
      }
      return next;
    });
  }, []);

  const filteredPrimaryData = useMemo(() => {
    if (isSiteMode) return EMPTY_POINTS;
    if (!allLocations) return [];
    return allLocations.filter((loc) => {
      if (tech !== "All") {
        const t = normalizeTechName(loc.technology);
        if (t !== tech) return false;
      }
      if (provider !== "All") {
        const p = normalizeProviderName(loc.provider);
        if (p !== provider) return false;
      }
      if (band !== "All") {
        const b = String(loc.band || "");
        if (b !== band) return false;
      }
      return true;
    });
  }, [allLocations, tech, provider, band, isSiteMode]);

  const filteredNeighborData = useMemo(() => {
    if (isSiteMode) return EMPTY_POINTS;
    if (!allNeighbors) return [];
    return allNeighbors.filter((neighbor) => {
      const lat = parseFloat(
        neighbor.lat ?? neighbor.latitude ?? neighbor.Lat,
      );
      const lng = parseFloat(
        neighbor.lng ?? neighbor.longitude ?? neighbor.Lng ?? neighbor.lon,
      );
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

      const normalizedTech = normalizeTechName(
        neighbor.networkType || neighbor.technology,
        neighbor.neighbourBand || neighbor.neighborBand || neighbor.primaryBand,
      );
      const normalizedProvider = normalizeProviderName(neighbor.provider);
      const normalizedBand = String(
        neighbor.neighbourBand ??
          neighbor.neighborBand ??
          neighbor.primaryBand ??
          neighbor.band ??
          "",
      );

      if (tech !== "All" && normalizedTech !== tech) return false;
      if (provider !== "All" && normalizedProvider !== provider) return false;
      if (band !== "All" && normalizedBand !== band) return false;

      return true;
    });
  }, [allNeighbors, tech, provider, band, isSiteMode]);

  const normalizedPolygons = useMemo(() => {
    if (!Array.isArray(sharedPolygons) || sharedPolygons.length === 0) return [];
    return sharedPolygons
      .map((polygon) => {
        const path = Array.isArray(polygon?.path)
          ? polygon.path
              .map((pt) => ({ lat: Number(pt?.lat), lng: Number(pt?.lng) }))
              .filter((pt) => Number.isFinite(pt.lat) && Number.isFinite(pt.lng))
          : [];
        if (path.length < 3) return null;
        const bounds = polygon?.bbox || getPathBounds(path);
        return { path, bounds };
      })
      .filter(Boolean);
  }, [sharedPolygons]);

  const primaryDataForRender = useMemo(() => {
    if (normalizedPolygons.length === 0) return filteredPrimaryData;
    return filteredPrimaryData.filter((item) => {
      const point = toPoint(item);
      if (!point) return false;
      return normalizedPolygons.some((poly) =>
        isPointInsidePolygon(point, poly.path, poly.bounds),
      );
    });
  }, [filteredPrimaryData, normalizedPolygons]);

  const neighborDataForRender = useMemo(() => {
    if (normalizedPolygons.length === 0) return filteredNeighborData;
    return filteredNeighborData.filter((item) => {
      const point = toPoint(item);
      if (!point) return false;
      return normalizedPolygons.some((poly) =>
        isPointInsidePolygon(point, poly.path, poly.bounds),
      );
    });
  }, [filteredNeighborData, normalizedPolygons]);

  const secondaryDisplayData = useMemo(() => {
    return neighborDataForRender.map((neighbor) => {
      const neighbourRsrp = parseFloat(
        neighbor.neighbourRsrp ?? neighbor.neighbour_rsrp,
      );
      const neighbourRsrq = parseFloat(
        neighbor.neighbourRsrq ?? neighbor.neighbour_rsrq,
      );
      const neighbourSinr = parseFloat(
        neighbor.neighbourSinr ?? neighbor.neighbour_sinr,
      );

      return {
        ...neighbor,
        lat: parseFloat(neighbor.lat ?? neighbor.latitude ?? neighbor.Lat),
        lng: parseFloat(
          neighbor.lng ?? neighbor.longitude ?? neighbor.Lng ?? neighbor.lon,
        ),
        provider: normalizeProviderName(neighbor.provider),
        technology: normalizeTechName(
          neighbor.networkType || neighbor.technology,
          neighbor.neighbourBand || neighbor.neighborBand || neighbor.primaryBand,
        ),
        band: String(
          neighbor.neighbourBand ??
            neighbor.neighborBand ??
            neighbor.primaryBand ??
            neighbor.band ??
            "",
        ),
        pci: neighbor.neighbourPci ?? neighbor.neighbour_pci ?? neighbor.primaryPci,
        rsrp: Number.isFinite(neighbourRsrp) ? neighbourRsrp : null,
        rsrq: Number.isFinite(neighbourRsrq) ? neighbourRsrq : null,
        sinr: Number.isFinite(neighbourSinr) ? neighbourSinr : null,
      };
    });
  }, [neighborDataForRender]);

  const displayData = useMemo(() => {
    if (isAllView) {
      if (!primaryDataForRender.length) return secondaryDisplayData;
      if (!secondaryDisplayData.length) return primaryDataForRender;
      return [...primaryDataForRender, ...secondaryDisplayData];
    }
    return isSecondaryView ? secondaryDisplayData : primaryDataForRender;
  }, [isAllView, isSecondaryView, primaryDataForRender, secondaryDisplayData]);

  const legendData = useMemo(
    () => sampleRows(displayData, MAX_LEGEND_SAMPLE_POINTS),
    [displayData],
  );
  const drawingData = useMemo(
    () => sampleRows(displayData, MAX_DRAWING_SAMPLE_POINTS),
    [displayData],
  );
  const locationOptionsSource = useMemo(
    () => sampleRows(allLocations, MAX_OPTIONS_SCAN_POINTS),
    [allLocations],
  );
  const neighborOptionsSource = useMemo(
    () => sampleRows(allNeighbors, MAX_OPTIONS_SCAN_POINTS),
    [allNeighbors],
  );

  const options = useMemo(() => {
    if (isSiteMode) {
      return {
        tech: ["All"],
        provs: ["All"],
        bands: ["All"],
      };
    }

    const techSet = new Set(["All"]);
    const providerSet = new Set(["All"]);
    const bandSet = new Set(["All"]);

    if (isSecondaryView) {
      neighborOptionsSource.forEach((neighbor) => {
        const normalizedTech = normalizeTechName(
          neighbor.networkType || neighbor.technology,
          neighbor.neighbourBand ||
            neighbor.neighborBand ||
            neighbor.primaryBand,
        );
         const normalizedProvider = normalizeProviderName(neighbor.provider);
        const normalizedBand = String(
          neighbor.neighbourBand ??
            neighbor.neighborBand ??
            neighbor.primaryBand ??
            neighbor.band ??
            "",
        );

        if (normalizedTech) techSet.add(normalizedTech);
        if (normalizedProvider) providerSet.add(normalizedProvider);
        if (normalizedBand) bandSet.add(normalizedBand);
      });
    } else if (isAllView) {
      locationOptionsSource.forEach((loc) => {
        if (loc.technology) techSet.add(normalizeTechName(loc.technology));
        if (loc.provider) providerSet.add(normalizeProviderName(loc.provider));
        if (loc.band) bandSet.add(String(loc.band));
      });
      neighborOptionsSource.forEach((neighbor) => {
        const normalizedTech = normalizeTechName(
          neighbor.networkType || neighbor.technology,
          neighbor.neighbourBand ||
            neighbor.neighborBand ||
            neighbor.primaryBand,
        );
        const normalizedProvider = normalizeProviderName(neighbor.provider);
        const normalizedBand = String(
          neighbor.neighbourBand ??
            neighbor.neighborBand ??
            neighbor.primaryBand ??
            neighbor.band ??
            "",
        );

        if (normalizedTech) techSet.add(normalizedTech);
        if (normalizedProvider) providerSet.add(normalizedProvider);
        if (normalizedBand) bandSet.add(normalizedBand);
      });
    } else {
      locationOptionsSource.forEach((loc) => {
        if (loc.technology) techSet.add(normalizeTechName(loc.technology));
        if (loc.provider) providerSet.add(normalizeProviderName(loc.provider));
        if (loc.band) bandSet.add(String(loc.band));
      });
    }

    return {
      tech: Array.from(techSet).sort(),
      provs: Array.from(providerSet).sort(),
      bands: Array.from(bandSet).sort(),
    };
  }, [locationOptionsSource, neighborOptionsSource, isSecondaryView, isAllView, isSiteMode]);

  return (
    <div className="relative w-full h-full flex flex-col border rounded-lg bg-white shadow-sm overflow-hidden">
      {/* --- Mini Toolbar --- */}
      <div className="flex items-center justify-between p-2 bg-gray-50 border-b h-12">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-gray-700">{title}</span>
          {/* <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
              isSecondaryView
                ? "bg-purple-100 text-purple-700"
                : isAllView
                  ? "bg-sky-100 text-sky-700"
                  : "bg-green-100 text-green-700"
            }`}
          >
            {isSecondaryView
              ? "Secondary Logs"
              : isAllView
                ? "All Logs"
                : "Primary Logs"}
          </span> */}
          <select
            value={mapRole}
            onChange={(e) => onRoleChange?.(id, e.target.value)}
            className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 text-gray-600 bg-white"
          >
            <option value="all">All</option>
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
          </select>

          {isSiteMode && (
            <select
              value={sitePredictionVersion}
              onChange={(e) => onSitePredictionVersionChange?.(id, e.target.value)}
              className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 text-gray-700 bg-white"
            >
              <option value="original">Baselined</option>
              <option value="updated">Optimized</option>
            </select>
          )}

          {/* Metric Selector */}
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className="text-xs border rounded px-1 py-1 bg-white"
          >
            <option value="rsrp">RSRP</option>
            <option value="rsrq">RSRQ</option>
            <option value="sinr">SINR</option>
            <option value="ul_tpt">Ul Tpt</option>
            <option value="dl_tpt">DL Tpt</option>
            <option value="mos">MOS</option>
            <option value="lte_bler">LTE BLER</option>
            <option value="pci">PCI</option>
            <option value="num_cells">Pilot pollution</option>
            <option value="level">SSI</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          {/* Tech Filter */}
          <select
            value={tech}
            onChange={(e) => setTech(e.target.value)}
            className="text-xs border rounded px-1 py-1 bg-white max-w-[80px]"
          >
            {options.tech.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {/* Provider Filter */}
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="text-xs border rounded px-1 py-1 bg-white max-w-[80px]"
          >
            {options.provs.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <select
            value={band}
            onChange={(e) => setBand(e.target.value)}
            className="text-xs border rounded px-1 py-1 bg-white max-w-[80px]"
          >
            {options.bands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          <button
            onClick={() => onRemove(id)}
            className="text-gray-400 hover:text-red-500"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* --- The Map --- */}
      <div
        className="flex-grow relative"
        onMouseDown={() => onActivateForDrawing?.(id)}
      >
        <MapwithMultipleCircle
          isLoaded={true}
          locations={isSiteMode ? EMPTY_POINTS : isSecondaryView ? EMPTY_POINTS : primaryDataForRender}
          selectedMetric={metric}
          thresholds={thresholds}
          neighborData={isSiteMode ? EMPTY_POINTS : isSecondaryView || isAllView ? neighborDataForRender : EMPTY_POINTS}
          showNeighbors={isSiteMode ? false : isSecondaryView || isAllView}
          neighborSquareSize={30}
          neighborMinSquareSize={8}
          disableDeckInteractions={drawEnabled && Boolean(drawShapeMode)}
          fitToLocations={true}
          showControls={false}
          projectId={projectId}
          enablePolygonFilter={true}
          polygonSource="map"
          showPolygonBoundary={true}
          filterPolygons={sharedPolygons}
          filterInsidePolygons={sharedPolygons.length > 0}
          showPoints={isSiteMode ? false : !isSecondaryView}
          legendFilter={legendFilter}
          onLoad={(map) => {
            // Keep a local map reference for drawing tools.
            setMapRef(map);
          }}
        >
        {isSiteMode && mapRef && (
          <NetworkPlannerMap
            projectId={projectId}
            map={mapRef}
            siteToggle="Cell"
            sitePredictionVersion={sitePredictionVersion}
            enableSiteToggle
            showSiteMarkers
            showSiteSectors
            selectedMetric={metric}
            onlyInsidePolygons={sharedPolygons.length > 0}
            filterPolygons={sharedPolygons}
            onSiteSelect={handleSiteSelectionChange}
            enableSiteLteOverlay={false}
            singleSiteSelection={true}
            showBulkSiteActions={false}
            colorMode="Operator"
            options={{
              scale: 0.6,
              opacity: 0.6,
            }}
          />
        )}

        {isSiteMode && mapRef && selectedSiteIds.length > 0 && (
          <LtePredictionLocationLayer
            enabled={true}
            map={mapRef}
            locations={siteLtePredictionLocations || EMPTY_POINTS}
            selectedMetric={metric}
            thresholds={thresholds}
            filterPolygons={sharedPolygons}
            filterInsidePolygons={sharedPolygons.length > 0}
            legendFilter={legendFilter}
            maxPoints={4000}
            aggregateOverlaps={true}
          />
        )}

        {/* Always render shared polygon overlay so users can see the active filter
            on every map, including the draw-source map. */}
        {normalizedPolygons.map((poly, i) => (
          <PolygonF
            key={`shared-poly-${i}`}
            paths={poly.path}
            options={{
              strokeColor: "#1d4ed8",
              strokeWeight: 3,
              strokeOpacity: 1,
              fillColor: "#1d4ed8",
              fillOpacity: 0.05,
              clickable: false,
              editable: false,
              draggable: false,
              zIndex: 4500,
            }}
          />
        ))}

        {mapRef && (
          <DrawingToolsLayer
            map={mapRef}
            enabled={drawEnabled}
            shapeMode={drawShapeMode}
            showDrawingControl={false}
            logs={drawingData}
            sessions={EMPTY_SESSIONS}
            selectedMetric={metric}
            thresholds={thresholds}
            clearSignal={drawClearSignal}
            onSummary={onDrawingComplete}
            onUIChange={onDrawingUiChange}
            onDrawingsChange={onDrawingsChange}
          />
        )}
        </MapwithMultipleCircle>

        {!isSiteMode && (
          <div className="absolute top-14 right-2 z-20 pointer-events-auto">
            <div className="scale-90 origin-top-right">
              <MapLegend
                thresholds={thresholds}
                selectedMetric={metric}
                logs={legendData}
                activeFilter={legendFilter}
                onFilterChange={setLegendFilter}
                className="relative" // Added to fix positioning
              />
            </div>
          </div>
        )}

        {!isSiteMode && (
          <div>
            <MapChildFooter
              data={legendData}
              metric={metric}
              thresholds={thresholds}
            />
          </div>
        )}

        {/* Stats Overlay */}
        {!isSiteMode && (
          <div className="absolute bottom-2 left-2 bg-white/90 p-1 rounded text-[10px] shadow z-10">
            Pts: {displayData.length} | Avg:{" "}
            {displayData.length > 0
              ? (
                  legendData.reduce(
                    (acc, curr) => acc + (parseFloat(curr[metric]) || 0),
                    0,
                  ) / legendData.length
                ).toFixed(1)
              : 0}
          </div>
        )}

        {isSiteMode && selectedSiteIds.length > 0 && (
          <div className="absolute bottom-2 left-2 bg-black/80 p-1 rounded text-[10px] shadow z-20 text-white">
            Site LTE: {siteLtePredictionLoading ? "Loading..." : `${siteLtePredictionLocations.length} points`}
            {siteLtePredictionError ? " | error" : ""}
          </div>
        )}
      </div>
    </div>
  );
};

export default MapChild;
