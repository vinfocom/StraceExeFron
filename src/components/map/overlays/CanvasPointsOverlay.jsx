import React, { useEffect, useRef } from "react";

export default function CanvasPointsOverlay({
  map,
  points,
  neigh,
  getRadiusPx, 

  opacity = 0.9,
  maxDraw = 50000,
  padding = 80,
  showLabels = true, 
  labelStyle = {   
    font: "bold 10px Arial",
    color: "#000",
    strokeColor: "#fff",
    strokeWidth: 2,
  },
}) {
  const overlayRef = useRef(null);
  const canvasRef = useRef(null);
  const listenersRef = useRef([]);

  useEffect(() => {
    if (!map) return;
    const overlay = new window.google.maps.OverlayView();
    overlayRef.current = overlay;

    overlay.onAdd = () => {
      const canvas = document.createElement("canvas");
      canvas.style.position = "absolute";
      canvas.style.pointerEvents = "none";
      canvasRef.current = canvas;
      overlay.getPanes()?.overlayLayer.appendChild(canvas);

      
    };

    overlay.draw = () => drawCanvas();

    overlay.onRemove = () => {
      listenersRef.current.forEach((l) => l.remove());
      listenersRef.current = [];
      if (canvasRef.current?.parentNode) {
        canvasRef.current.parentNode.removeChild(canvasRef.current);
      }
      canvasRef.current = null;
    };

    overlay.setMap(map);
    return () => overlay.setMap(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    drawCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, getRadiusPx, opacity, maxDraw, padding, neigh, showLabels]);

  function resolveRadiusPx(zoom) {
    if (typeof getRadiusPx === "function") return getRadiusPx(zoom);
    if (Number.isFinite(getRadiusPx)) return getRadiusPx;
    return 5; // fallback default
  }

  function drawCanvas() {
    const overlay = overlayRef.current;
    const canvas = canvasRef.current;
    if (!overlay || !canvas || !map) return;

    const proj = overlay.getProjection?.();
    const bounds = map.getBounds?.();
    if (!proj || !bounds) return;

    const zoom = map.getZoom?.() ?? 10;
    const dpr = window.devicePixelRatio || 1;

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const topLeft = proj.fromLatLngToDivPixel(
      new window.google.maps.LatLng(ne.lat(), sw.lng())
    );
    const bottomRight = proj.fromLatLngToDivPixel(
      new window.google.maps.LatLng(sw.lat(), ne.lng())
    );

    const width = Math.ceil(bottomRight.x - topLeft.x) + padding * 2;
    const height = Math.ceil(bottomRight.y - topLeft.y) + padding * 2;

    canvas.style.left = Math.floor(topLeft.x - padding) + "px";
    canvas.style.top = Math.floor(topLeft.y - padding) + "px";
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = opacity;

    const paddedBounds = new window.google.maps.LatLngBounds(
      proj.fromDivPixelToLatLng({ x: topLeft.x - padding, y: bottomRight.y + padding }),
      proj.fromDivPixelToLatLng({ x: bottomRight.x + padding, y: topLeft.y - padding })
    );

    const rPx = Math.max(1, resolveRadiusPx(zoom));
    const n = points?.length || 0;
    
   
    let drawnCount = 0; 

    // Draw points
    for (let i = 0; i < n; i++) {
      // Optimization: If we have already drawn the max visible points allowed, stop.
      if (drawnCount >= maxDraw) break;

      const p = points[i];
      
      const ll = new window.google.maps.LatLng(p.lat, p.lng);
      
      if (!paddedBounds.contains(ll)) continue;

      const pix = proj.fromLatLngToDivPixel(ll);
      const x = pix.x - (topLeft.x - padding);
      const y = pix.y - (topLeft.y - padding);

      ctx.fillStyle = p.color || "#808080";
      
      if (p.isNeighbour) {
        // Draw Square
        // Center the square on x, y. Side length = 2 * rPx
        ctx.fillRect(x - rPx, y - rPx, rPx * 2, rPx * 2);
      } else {
        // Draw Circle
        ctx.beginPath();
        ctx.arc(x, y, rPx, 0, Math.PI * 2);
        ctx.fill();
      }
      
      drawnCount++; 
    }

   
    
    if (neigh && showLabels) {
      ctx.globalAlpha = 1; 
      ctx.font = labelStyle.font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      let labelDrawnCount = 0;

      for (let i = 0; i < n; i++) {
        if (labelDrawnCount >= maxDraw) break;

        const p = points[i];
        // Optimization: Check for empty label first to save calc time
        if (!p.label) continue; 

        const ll = new window.google.maps.LatLng(p.lat, p.lng);
        if (!paddedBounds.contains(ll)) continue;

        const pix = proj.fromLatLngToDivPixel(ll);
        const x = pix.x - (topLeft.x - padding);
        const y = pix.y - (topLeft.y - padding);

        if (labelStyle.strokeWidth > 0) {
          ctx.strokeStyle = labelStyle.strokeColor;
          ctx.lineWidth = labelStyle.strokeWidth;
          ctx.strokeText(p.label, x, y);
        }

        ctx.fillStyle = labelStyle.color;
        ctx.fillText(p.label, x, y);
        
        labelDrawnCount++;
      }
    }
   
    
    ctx.globalAlpha = 1;
  }

  return null;
}