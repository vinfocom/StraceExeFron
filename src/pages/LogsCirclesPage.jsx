import React, { useCallback, useEffect, useRef, useState } from "react";
import { GoogleMap, useJsApiLoader } from "@react-google-maps/api";
import LogCirclesLayer from "@/components/map/layers/LogCirclesLayer";
import MapLegend from "@/components/map/MapLegend";
import DrawingToolsLayer from "@/components/map/tools/DrawingToolsLayer";
import { settingApi } from "@/api/apiEndpoints";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "@/lib/googleMapsLoader";
import PCILegend from "@/components/map/PCILegend";
import AllLogsDetailPanel from "@/components/map/layout/AllLogsDetailPanel";

const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID;
const DEFAULT_CENTER = { lat: 28.6139, lng: 77.209 };
const MAP_CONTAINER_STYLE = { height: "100vh", width: "100%" };

export default function LogsCirclesPage() {
  const { isLoaded, loadError } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);

  const [map, setMap] = useState(null);
  const [thresholds, setThresholds] = useState({});
  const [selectedMetric, setSelectedMetric] = useState("rsrp");
  const [showCoverageHoleOnly, setShowCoverageHoleOnly] = useState(false); 
   const [appSummary, setAppSummary] = useState(null);
   const [colorBy, setColorBy] = useState(null);
  
  const [filters, setFilters] = useState({
    startDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1),
    endDate: new Date(),
    provider: "ALL",
    technology: "ALL",
    band: "ALL",
  });

  const [drawnLogs, setDrawnLogs] = useState([]);
  const [analysis, setAnalysis] = useState(null);

  const [drawUi, setDrawUi] = useState({
    enabled: false,
    pixelateRect: false,
    cellSizeMeters: 100,
    clearSignal: 0,
    showNeighbours: false,
  });

  const idleTimerRef = useRef(null);
  const [visibleBounds, setVisibleBounds] = useState(null);

  useEffect(() => {
    const fetchThresholds = async () => {
      try {
        const res = await settingApi.getThresholdSettings();
        if (res?.Data) {
          const d = res.Data;
          setThresholds({
            rsrp: JSON.parse(d.rsrp_json || "[]"),
            rsrq: JSON.parse(d.rsrq_json || "[]"),
            sinr: JSON.parse(d.sinr_json || "[]"),
            dl_thpt: JSON.parse(d.dl_thpt_json || "[]"),
            ul_thpt: JSON.parse(d.ul_thpt_json || "[]"),
            mos: JSON.parse(d.mos_json || "[]"),
            lte_bler: JSON.parse(d.lte_bler_json || "[]"),
            coveragehole: parseFloat(d.coveragehole_json) || -105, 
          });
        }
      } catch {}
     
    };
    
    fetchThresholds();
  }, []);

setTimeout(() => {
    console.log("Current thresholds:", appSummary);
  }, 2000);

  const onMapLoad = useCallback((m) => {
    setMap(m);
    m.addListener("idle", () => {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        const b = m.getBounds?.();
        if (b) {
          const ne = b.getNorthEast();
          const sw = b.getSouthWest();
          setVisibleBounds({
            north: ne.lat(),
            east: ne.lng(),
            south: sw.lat(),
            west: sw.lng(),
          });
        }
      }, 120);
    });
  }, []);

  if (loadError) return <div>Error loading Google Maps.</div>;
  if (!isLoaded) return <div style={{ padding: 16 }}>Loading map…</div>;

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 10,
          background: "white",
          borderRadius: 8,
          padding: 12,
          boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
          minWidth: 280,
          maxWidth: 320,
        }}
      >
        <label style={{ display: "block", marginBottom: 8 }}>
          Metric:
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value)}
            style={{ marginLeft: 6, width: "100%" }}
          >
            <option value="rsrp">RSRP</option>
            <option value="rsrq">RSRQ</option>
            <option value="sinr">SINR</option>
            <option value="dl-throughput">DL Throughput</option>
            <option value="ul-throughput">UL Throughput</option>
            <option value="mos">MOS</option>
            <option value="lte-bler">LTE BLER</option>
            <option value="pci">PCI</option>
          </select>
        </label>

        
        <label 
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: 6, 
            marginBottom: 8,
            padding: "8px",
            background: "#fef3c7",
            borderRadius: 6,
            border: "1px solid #fbbf24",
            cursor: "pointer"
          }}
        >
          <input
            type="checkbox"
            checked={showCoverageHoleOnly}
            onChange={(e) => setShowCoverageHoleOnly(e.target.checked)}
          />
          <span style={{ fontSize: 13, fontWeight: 500 }}>
            Show only coverage holes (RSRP &lt; {thresholds.coveragehole || -110} dBm)
          </span>
        </label>

        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => setDrawUi((d) => ({ ...d, enabled: !d.enabled }))}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              background: drawUi.enabled ? "#2563eb" : "#e5e7eb",
              color: drawUi.enabled ? "white" : "#111827",
              border: "none",
              cursor: "pointer",
            }}
            title="Enable drawing tools"
          >
            {drawUi.enabled ? "Drawing: ON" : "Drawing: OFF"}
          </button>

          <button
            onClick={() => setDrawUi((d) => ({ ...d, clearSignal: (d.clearSignal || 0) + 1 }))}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              background: "#f3f4f6",
              border: "1px solid #e5e7eb",
              cursor: "pointer",
            }}
            title="Clear drawn shapes"
          >
            Clear
          </button>

          <label style={{ display: "flex", alignItems: "center", gap: 6, opacity: drawUi.enabled ? 1 : 0.6 }}>
            <input
              type="checkbox"
              checked={drawUi.pixelateRect}
              onChange={(e) => setDrawUi((d) => ({ ...d, pixelateRect: e.target.checked }))}
              disabled={!drawUi.enabled}
            />
            Pixelate rectangle
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 6, opacity: drawUi.enabled ? 1 : 0.6 }}>
            Cell size (m):
            <input
              type="number"
              min={10}
              step={10}
              value={drawUi.cellSizeMeters}
              onChange={(e) =>
                setDrawUi((d) => ({ ...d, cellSizeMeters: Math.max(10, Number(e.target.value || 100)) }))
              }
              disabled={!drawUi.enabled}
              style={{ width: 80 }}
            />
          </label>
        </div>
         <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
            Color Logs By:
          </div>
          
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "pointer" }}>
            <input
              type="radio"
              name="colorBy"
              checked={colorBy === null}
              onChange={() => setColorBy(null)}
            />
            <span style={{ fontSize: 13 }}>Metric Value (Default)</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "pointer" }}>
            <input
              type="radio"
              name="colorBy"
              checked={colorBy === "provider"}
              onChange={() => setColorBy("provider")}
            />
            <span style={{ fontSize: 13 }}>Provider/Carrier</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "pointer" }}>
            <input
              type="radio"
              name="colorBy"
              checked={colorBy === "technology"}
              onChange={() => setColorBy("technology")}
            />
            <span style={{ fontSize: 13 }}>Technology</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "pointer" }}>
            <input
              type="radio"
              name="colorBy"
              checked={colorBy === "band"}
              onChange={() => setColorBy("band")}
            />
            <span style={{ fontSize: 13 }}>Band/Frequency</span>
          </label>
        </div>
      </div>

      <GoogleMap
        mapContainerStyle={MAP_CONTAINER_STYLE}
        center={DEFAULT_CENTER}
        zoom={13}
        onLoad={onMapLoad}
        options={{
          disableDefaultUI: true,
          zoomControl: true,
          mapId: MAP_ID,
          gestureHandling: "greedy",
        }}
      >
        <LogCirclesLayer
          map={map}
          filters={filters}
          selectedMetric={selectedMetric}
          setAppSummary={setAppSummary}
          appSummary={appSummary}
          thresholds={thresholds}
          showCircles={true}
          showHeatmap={false}
          visibleBounds={visibleBounds}
            showNeighbours={drawUi.showNeighbours}
 
          renderVisibleOnly={true}
          canvasRadiusPx={(zoom) => Math.max(3, Math.min(7, Math.floor(zoom / 2)))}
          maxDraw={70000}
          onLogsLoaded={(list) => setDrawnLogs(Array.isArray(list) ? list : [])}
          coverageHoleOnly={showCoverageHoleOnly} 
          colorBy={colorBy}
        />

        {drawUi.enabled && (
          <DrawingToolsLayer
            map={map}
            enabled={drawUi.enabled}
            logs={drawnLogs}
            selectedMetric={selectedMetric}
            thresholds={thresholds}
            pixelateRect={drawUi.pixelateRect}
            cellSizeMeters={drawUi.cellSizeMeters}
            onSummary={setAnalysis}
            clearSignal={drawUi.clearSignal}
            maxCells={1500}
          />
        )}
      </GoogleMap>

      <MapLegend thresholds={thresholds} selectedMetric={selectedMetric} colorBy={colorBy} />
      <PCILegend show={selectedMetric === 'pci'} />
      <AllLogsDetailPanel appSummary={appSummary} />

      {analysis && (
        <div
          style={{
            position: "absolute",
            bottom: 16,
            left: 16,
            zIndex: 10,
            background: "white",
            padding: 12,
            borderRadius: 8,
            boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
            minWidth: 220,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Selection stats</div>
          <div style={{ fontSize: 14, lineHeight: "20px" }}>
            <div>Shape: {analysis.type}</div>
            <div>Logs: {analysis.count}</div>
            {analysis.stats?.count ? (
              <>
                <div>Mean: {analysis.stats.mean?.toFixed(2)}</div>
                <div>Median: {analysis.stats.median?.toFixed(2)}</div>
                <div>Max: {analysis.stats.max?.toFixed(2)}</div>
                <div>Min: {analysis.stats.min?.toFixed(2)}</div>
                {analysis.grid ? (
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                    Grid: ~{analysis.grid.cells} cells @ {analysis.grid.cellSizeMeters}m
                  </div>
                ) : null}
              </>
            ) : (
              <div>No metric values in selection.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}