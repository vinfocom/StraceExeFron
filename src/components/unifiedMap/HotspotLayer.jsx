import React, { useEffect, useMemo, useRef, useState } from "react";
import { InfoWindowF, OverlayView, OverlayViewF, PolylineF } from "@react-google-maps/api";
import { Flag, Info, MapPin, Star, TriangleAlert } from "lucide-react";

export const HOTSPOT_SYMBOLS = [
  { value: "warning", label: "Warning", icon: TriangleAlert, color: "#d97706" },
  { value: "info", label: "Info", icon: Info, color: "#2563eb" },
  { value: "star", label: "Star", icon: Star, color: "#7c3aed" },
  { value: "flag", label: "Flag", icon: Flag, color: "#dc2626" },
  { value: "pin", label: "Pin", icon: MapPin, color: "#059669" },
];

const centerMarker = () => ({ x: -19, y: -19 });

export const HotspotMarker = ({ position, symbolName, title, onMouseEnter, onMouseLeave, onClick, preview = false }) => {
  const symbol = HOTSPOT_SYMBOLS.find((item) => item.value === symbolName) || HOTSPOT_SYMBOLS[0];
  const Icon = symbol.icon;
  const markerPosition = useMemo(
    () => ({ lat: position.lat, lng: position.lng }),
    [position.lat, position.lng],
  );
  return (
    <OverlayViewF
      position={markerPosition}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
      getPixelPositionOffset={centerMarker}
      zIndex={preview ? 1100 : 1000}
    >
      <button
        type="button"
        title={title}
        aria-label={title}
        disabled={preview}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onFocus={onMouseEnter}
        onBlur={onMouseLeave}
        onClick={(event) => {
          event.stopPropagation();
          onClick?.();
        }}
        className={`flex h-[38px] w-[38px] items-center justify-center rounded-full border-2 border-white text-white shadow-lg transition-transform ${preview ? "pointer-events-none opacity-80" : "cursor-pointer hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"}`}
        style={{ backgroundColor: symbol.color }}
      >
        <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
      </button>
    </OverlayViewF>
  );
};

export const getHotspotPoint = (row) => {
  const rawLat = row?.lat ?? row?.latitude;
  const rawLon = row?.lon ?? row?.lng ?? row?.longitude;
  if (rawLat == null || rawLat === "" || rawLon == null || rawLon === "") return null;
  const lat = Number(rawLat);
  const lon = Number(rawLon);
  return Number.isFinite(lat) && Math.abs(lat) <= 90 &&
    Number.isFinite(lon) && Math.abs(lon) <= 180 ? { lat, lon } : null;
};

export const getHotspotLine = (row) => {
  let value = row?.hotspot_line_json ?? row?.line ?? [];
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return []; }
  }
  return Array.isArray(value) ? value.map(getHotspotPoint).filter(Boolean) : [];
};

export const getHotspotAnchor = (row) => getHotspotLine(row)[0] ?? getHotspotPoint(row);

const HotspotLayer = ({ hotspots, onEdit }) => {
  const [hoveredId, setHoveredId] = useState(null);
  const hideTimer = useRef(null);

  useEffect(() => () => clearTimeout(hideTimer.current), []);
  const showInfo = (id) => {
    clearTimeout(hideTimer.current);
    setHoveredId(id);
  };
  const hideInfo = () => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setHoveredId(null), 250);
  };

  return hotspots.map((hotspot) => {
    const point = getHotspotAnchor(hotspot);
    if (!point) return null;
    const symbol = HOTSPOT_SYMBOLS.find((item) => item.value === hotspot.hotspot_symbol) || HOTSPOT_SYMBOLS[0];
    const position = { lat: point.lat, lng: point.lon };
    const line = getHotspotLine(hotspot);
    return (
      <React.Fragment key={hotspot.id}>
        {line.length > 1 && (
          <PolylineF
            path={line.map((p) => ({ lat: p.lat, lng: p.lon }))}
            options={{ strokeColor: symbol.color, strokeOpacity: 0.9, strokeWeight: 3, clickable: false, zIndex: 950 }}
          />
        )}
        <HotspotMarker
          position={position}
          symbolName={hotspot.hotspot_symbol}
          title={hotspot.hotspot || "Hotspot"}
          onMouseEnter={() => showInfo(hotspot.id)}
          onMouseLeave={hideInfo}
          onClick={() => onEdit?.(hotspot)}
        />
        {hoveredId === hotspot.id && (
          <InfoWindowF position={position} onCloseClick={() => setHoveredId(null)}>
            <div className="max-w-64 text-sm text-slate-800" onMouseEnter={() => clearTimeout(hideTimer.current)} onMouseLeave={hideInfo}>
              <div className="font-semibold">{hotspot.hotspot || "Hotspot"}</div>
              <div>Symbol: {symbol.label}</div>
              <div>{Number(hotspot.id) < 0 ? `Hotspot #${-Number(hotspot.id)}` : `Network log: #${hotspot.id}`}</div>
              {Number(hotspot.session_id) > 0 && <div>Session: #{hotspot.session_id}</div>}
              {hotspot.timestamp && <div>Time: {new Date(hotspot.timestamp).toLocaleString()}</div>}
              <div>Location: {point.lat.toFixed(6)}, {point.lon.toFixed(6)}</div>
              {line.length > 1 && <div>Line points: {line.length}</div>}
              <button type="button" className="mt-1 text-blue-700 underline" onClick={() => onEdit?.(hotspot)}>Edit hotspot</button>
            </div>
          </InfoWindowF>
        )}
      </React.Fragment>
    );
  });
};

export default HotspotLayer;
