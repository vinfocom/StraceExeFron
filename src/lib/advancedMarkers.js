const getAdvancedMarkerElement = () =>
  typeof window !== "undefined"
    ? window.google?.maps?.marker?.AdvancedMarkerElement
    : null;

const getMarkerLabel = (label) => {
  if (label == null || label === "") return null;
  if (typeof label === "string" || typeof label === "number") {
    return { text: String(label) };
  }
  return label.text == null ? null : label;
};

export const createAdvancedMarkerContent = ({ icon, label, clickable = true } = {}) => {
  const content = document.createElement("div");
  content.style.position = "relative";
  content.style.display = "block";
  content.style.width = "30px";
  content.style.height = "30px";
  content.style.overflow = "visible";
  content.style.pointerEvents = clickable ? "auto" : "none";
  content.setAttribute("aria-hidden", "true");

  if (icon?.url) {
    const image = document.createElement("img");
    const width = Number(icon.scaledSize?.width) || 34;
    const height = Number(icon.scaledSize?.height) || width;
    image.src = icon.url;
    image.alt = "";
    image.draggable = false;
    image.style.display = "block";
    image.style.width = `${width}px`;
    image.style.height = `${height}px`;
    image.style.maxWidth = "none";
    image.style.objectFit = "contain";
    image.style.filter = "drop-shadow(0 1px 2px rgba(15, 23, 42, 0.45))";
    content.style.width = `${width}px`;
    content.style.height = `${height}px`;
    content.append(image);
  } else if (icon?.path != null) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "-10 -10 20 20");
    svg.setAttribute("width", "30");
    svg.setAttribute("height", "30");
    svg.style.display = "block";
    svg.style.overflow = "visible";
    svg.style.transform = `rotate(${Number(icon.rotation) || 0}deg)`;
    svg.style.filter = "drop-shadow(0 1px 2px rgba(15, 23, 42, 0.45))";

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const maps = window.google?.maps;
    const pathValue = icon.path === maps?.SymbolPath?.CIRCLE
      ? "M 0,-1 A 1,1 0 1,1 0,1 A 1,1 0 1,1 0,-1 Z"
      : icon.path === maps?.SymbolPath?.FORWARD_CLOSED_ARROW
        ? "M -1,-1 L 1,0 L -1,1 L -0.5,0 Z"
        : String(icon.path);
    path.setAttribute("d", pathValue);
    path.setAttribute("transform", `scale(${Number(icon.scale) || 1})`);
    path.setAttribute("fill", icon.fillColor || "#4285f4");
    path.setAttribute("fill-opacity", String(icon.fillOpacity ?? 1));
    path.setAttribute("stroke", icon.strokeColor || "#ffffff");
    path.setAttribute("stroke-opacity", String(icon.strokeOpacity ?? 1));
    path.setAttribute("stroke-width", String(icon.strokeWeight ?? 1));
    svg.append(path);
    content.append(svg);
  } else {
    const pinLibrary = window.google?.maps?.marker;
    const normalizedLabel = getMarkerLabel(label);
    const pin = pinLibrary?.PinElement
      ? new pinLibrary.PinElement({ glyphText: normalizedLabel?.text || undefined })
      : null;
    if (pin) {
      content.replaceChildren(pin);
      content.style.width = "auto";
      content.style.height = "auto";
    }
  }

  const normalizedLabel = getMarkerLabel(label);
  if (normalizedLabel && icon) {
    const labelElement = document.createElement("span");
    const origin = icon.labelOrigin;
    const scale = Number(icon.scale) || 1;
    labelElement.textContent = normalizedLabel.text;
    labelElement.style.position = "absolute";
    labelElement.style.left = `calc(50% + ${(Number(origin?.x) || 0) * scale}px)`;
    labelElement.style.top = `calc(50% + ${(Number(origin?.y) || 0) * scale}px)`;
    labelElement.style.transform = "translate(-50%, -50%)";
    labelElement.style.whiteSpace = "nowrap";
    labelElement.style.color = normalizedLabel.color || "#202124";
    labelElement.style.fontSize = normalizedLabel.fontSize || "14px";
    labelElement.style.fontWeight = normalizedLabel.fontWeight || "500";
    content.append(labelElement);
  }

  return content;
};

// Lightweight dot for high-volume markers (e.g. sessions): one plain div instead of
// a PinElement (shadow-DOM-heavy) per marker.
export const createDotMarkerContent = ({ color = "#2563eb", size = 14, clickable = true } = {}) => {
  const dot = document.createElement("div");
  Object.assign(dot.style, {
    width: `${size}px`,
    height: `${size}px`,
    boxSizing: "border-box",
    borderRadius: "50%",
    background: color,
    border: "2px solid #ffffff",
    boxShadow: "0 1px 3px rgba(15, 23, 42, 0.5)",
    pointerEvents: clickable ? "auto" : "none",
  });
  dot.setAttribute("aria-hidden", "true");
  return dot;
};

export const createAdvancedMarker = ({
  map,
  position,
  title,
  zIndex,
  draggable = false,
  clickable = true,
  icon,
  label,
  content,
} = {}) => {
  const AdvancedMarkerElement = getAdvancedMarkerElement();
  if (!AdvancedMarkerElement) return null;

  const marker = new AdvancedMarkerElement({
    map,
    position,
    title: title || "",
    ...(Number.isFinite(zIndex) ? { zIndex } : {}),
    gmpDraggable: Boolean(draggable),
    gmpClickable: Boolean(clickable),
    ...(icon || content ? { anchorTop: "-50%" } : {}),
  });
  marker.append(content || createAdvancedMarkerContent({ icon, label, clickable }));
  return marker;
};

export const ADVANCED_MARKER_CLUSTER_RENDERER = {
  render: (cluster, ...rendererArgs) => {
    const { count, position } = cluster;
    const map = rendererArgs[1];
    const AdvancedMarkerElement = getAdvancedMarkerElement();
    if (!AdvancedMarkerElement) return null;

    const marker = new AdvancedMarkerElement({
      map,
      position,
      title: `${count} locations`,
      zIndex: count,
      gmpClickable: true,
      anchorTop: "-50%",
    });
    const badge = document.createElement("div");
    const size = count > 99 ? 50 : 44;
    badge.textContent = count > 9999 ? "9999+" : String(count);
    badge.setAttribute("aria-label", `${count} locations`);
    Object.assign(badge.style, {
      display: "grid",
      placeItems: "center",
      width: `${size}px`,
      height: `${size}px`,
      boxSizing: "border-box",
      border: "3px solid #ffffff",
      borderRadius: "50%",
      background: "linear-gradient(145deg, #3b82f6 0%, #1d4ed8 100%)",
      boxShadow: "0 2px 8px rgba(15, 23, 42, 0.4)",
      color: "#ffffff",
      font: "700 13px/1 system-ui, sans-serif",
      letterSpacing: "-0.02em",
      userSelect: "none",
    });
    marker.append(badge);
    // MarkerClusterer defaults to addListener for cluster clicks; Advanced Markers require DOM events.
    if (cluster.bounds && typeof map?.fitBounds === "function") {
      marker.addEventListener("gmp-click", () => map.fitBounds(cluster.bounds));
    }
    return marker;
  },
};

export const getAdvancedMarkerLatLngEvent = (marker) => {
  const position = marker?.position;
  if (!position) return { latLng: null };
  const lat = typeof position.lat === "function" ? position.lat() : position.lat;
  const lng = typeof position.lng === "function" ? position.lng() : position.lng;
  const LatLng = window.google?.maps?.LatLng;
  return {
    latLng: LatLng && Number.isFinite(lat) && Number.isFinite(lng)
      ? new LatLng(lat, lng)
      : position,
  };
};

export const isSatelliteMapType = (mapTypeId) => mapTypeId === "satellite" || mapTypeId === "hybrid";

const getLabelTheme = (marker) => {
  const mapTypeId = marker?.map?.getMapTypeId?.();
  return isSatelliteMapType(mapTypeId)
    ? { color: "#f8fafc", textShadow: "0 0 3px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.8)" }
    : { color: "#0f172a", textShadow: "0 0 3px rgba(255,255,255,0.95), 0 1px 2px rgba(255,255,255,0.9)" };
};

// Re-applies black text on map/terrain and light text on satellite/hybrid.
export const refreshAdvancedMarkerLabelTheme = (marker) => {
  const label = marker?.__labelElement;
  if (label) Object.assign(label.style, getLabelTheme(marker));
};

export const setAdvancedMarkerLabel = (marker, text, style = {}) => {
  if (!marker) return;
  let label = marker.__labelElement;
  if (!label) {
    label = document.createElement("div");
    label.style.fontSize = "14px";
    label.style.fontWeight = "700";
    label.style.whiteSpace = "nowrap";
    label.style.pointerEvents = "none";
    // Absolutely positioned so the marker box is 0x0 and the anchor is exactly the position.
    label.style.position = "absolute";
    label.style.left = "0";
    label.style.top = "0";
    label.style.padding = "0 2px";
    marker.append(label);
    marker.__labelElement = label;
  }
  label.textContent = String(text ?? "");
  Object.assign(label.style, getLabelTheme(marker), style);
  orientAdvancedMarkerLabel(marker, marker.__labelAngle || 0);
};

// Rotates a label so it runs parallel to a line, sitting just above it.
export const orientAdvancedMarkerLabel = (marker, angleDeg = 0, offsetPx = 10) => {
  const label = marker?.__labelElement;
  if (!label) return;
  marker.__labelAngle = angleDeg;
  label.style.transformOrigin = "center";
  label.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg) translateY(${-offsetPx}px)`;
};
