// src/components/maps/NetworkSectorGLLayer.jsx
// GPU (deck.gl) renderer for the bulk cell-site sector triangles + site markers
// drawn by NetworkPlannerMap.jsx. Mirrors the GoogleMapsOverlay lifecycle used by
// DeckGLOverlay.jsx / LtePredictionLocationLayer.jsx elsewhere in this codebase —
// individual <PolygonF>/<MarkerF> overlays per sector don't scale past a few
// thousand DOM nodes, so the bulk (non-selected) sectors/sites are drawn as
// WebGL layers instead. The single currently-selected sector (which needs an
// InfoWindow + draggable "move" handle) is intentionally excluded from this
// layer and still rendered natively by NetworkPlannerMap.jsx.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import { PolygonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";

const SECTOR_LAYER_ID = "network-sector-triangles-layer";

const NetworkSectorGLLayer = ({
  map,
  sectorFeatures = [],
  siteFeatures = [],
  sectorLabelFeatures = [],
  siteLabelFeatures = [],
  onSectorClick,
  onSectorRightClick,
  onSiteClick,
}) => {
  const overlayRef = useRef(null);
  const isCleanedUpRef = useRef(false);
  const attachedMapRef = useRef(null);
  const idleListenerRef = useRef(null);
  const attachTimerRef = useRef(null);
  const contextMenuHandlerRef = useRef(null);
  const [, forceRerender] = useState(0);

  const isValidMapInstance = useCallback((m) => {
    if (!m || !window.google?.maps) return false;
    if (typeof m.getDiv !== "function") return false;
    return Boolean(m.getDiv());
  }, []);

  const canAttachOverlay = useCallback(
    (m) => {
      if (!isValidMapInstance(m)) return false;
      if (typeof m.addListener !== "function") return false;
      try {
        if (typeof m.getProjection === "function" && !m.getProjection()) return false;
      } catch {
        return false;
      }
      return true;
    },
    [isValidMapInstance],
  );

  const handleSectorClick = useCallback(
    (info) => {
      if (!onSectorClick || !info?.object) return;
      onSectorClick(info.object.source, info.object.infoPos);
    },
    [onSectorClick],
  );

  const handleSiteClick = useCallback(
    (info) => {
      if (!onSiteClick || !info?.object) return;
      onSiteClick(info.object.source);
    },
    [onSiteClick],
  );

  useEffect(() => {
    if (!isValidMapInstance(map)) return;
    isCleanedUpRef.current = false;

    if (!overlayRef.current) {
      overlayRef.current = new GoogleMapsOverlay({
        interleaved: false,
        glOptions: { preserveDrawingBuffer: false },
      });
    }

    const clearPendingAttach = () => {
      if (idleListenerRef.current && window.google?.maps?.event?.removeListener) {
        window.google.maps.event.removeListener(idleListenerRef.current);
      }
      idleListenerRef.current = null;
      if (attachTimerRef.current) window.clearTimeout(attachTimerRef.current);
      attachTimerRef.current = null;
    };

    const attachOverlay = () => {
      if (!overlayRef.current || isCleanedUpRef.current) return;
      if (attachedMapRef.current === map) return;
      if (!canAttachOverlay(map)) return;
      try {
        overlayRef.current.setMap(map);
        attachedMapRef.current = map;
        clearPendingAttach();
        forceRerender((n) => n + 1);
      } catch (err) {
        console.warn("Could not attach sector GL overlay to map instance:", err);
      }
    };

    attachOverlay();
    if (attachedMapRef.current !== map && typeof map.addListener === "function") {
      idleListenerRef.current = map.addListener("idle", attachOverlay);
      attachTimerRef.current = window.setTimeout(attachOverlay, 150);
    }

    return () => {
      clearPendingAttach();
      if (overlayRef.current) {
        try {
          overlayRef.current.setProps({ layers: [] });
          if (attachedMapRef.current === map) overlayRef.current.setMap(null);
        } catch {
          // ignore detach errors during fast remount/unmount
        }
      }
      if (attachedMapRef.current === map) attachedMapRef.current = null;
    };
  }, [map, isValidMapInstance, canAttachOverlay]);

  // Right-click support: deck.gl layers only expose onClick/onHover, so the
  // native browser contextmenu event on the map div is intercepted and hit
  // tested against the deck.gl scene via the overlay's own picking.
  useEffect(() => {
    if (!isValidMapInstance(map) || !onSectorRightClick) return undefined;
    const mapDiv = map.getDiv();
    if (!mapDiv) return undefined;

    const handleContextMenu = (event) => {
      const overlay = overlayRef.current;
      if (!overlay || attachedMapRef.current !== map) return;
      const rect = mapDiv.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      let picked = null;
      try {
        picked = overlay.pickObject({ x, y, layerIds: [SECTOR_LAYER_ID] });
      } catch {
        picked = null;
      }
      if (picked?.object) {
        event.preventDefault();
        onSectorRightClick(picked.object.source, picked.object.infoPos);
      }
    };

    contextMenuHandlerRef.current = handleContextMenu;
    mapDiv.addEventListener("contextmenu", handleContextMenu);
    return () => {
      mapDiv.removeEventListener("contextmenu", handleContextMenu);
      contextMenuHandlerRef.current = null;
    };
  }, [map, isValidMapInstance, onSectorRightClick]);

  const sortedSectorFeatures = useMemo(() => {
    if (!Array.isArray(sectorFeatures) || sectorFeatures.length === 0) return [];
    // Draw order = stacking order for flat (non-extruded) polygons: sort so
    // smaller/active/selected-matching sectors land later in the array and
    // therefore render on top of larger sibling-band triangles underneath them.
    return [...sectorFeatures].sort((a, b) => (a.sortRank ?? 0) - (b.sortRank ?? 0));
  }, [sectorFeatures]);

  useEffect(() => {
    if (!overlayRef.current || !isValidMapInstance(map)) return;
    if (attachedMapRef.current !== map) return;

    const layers = [];

    if (sortedSectorFeatures.length > 0) {
      layers.push(
        new PolygonLayer({
          id: SECTOR_LAYER_ID,
          data: sortedSectorFeatures,
          getPolygon: (d) => d.polygon,
          getFillColor: (d) => d.fillColor,
          getLineColor: (d) => d.lineColor,
          getLineWidth: (d) => d.lineWidth,
          lineWidthUnits: "pixels",
          filled: true,
          stroked: true,
          extruded: false,
          pickable: true,
          autoHighlight: false,
          onClick: handleSectorClick,
          updateTriggers: {
            getFillColor: [sortedSectorFeatures],
            getLineColor: [sortedSectorFeatures],
            getLineWidth: [sortedSectorFeatures],
          },
        }),
      );
    }

    if (Array.isArray(siteFeatures) && siteFeatures.length > 0) {
      layers.push(
        new ScatterplotLayer({
          id: "network-site-markers-layer",
          data: siteFeatures,
          getPosition: (d) => d.position,
          getFillColor: (d) => d.fillColor,
          getLineColor: [255, 255, 255, 240],
          getRadius: (d) => d.radiusPx,
          radiusUnits: "pixels",
          radiusMinPixels: 3,
          radiusMaxPixels: 14,
          lineWidthUnits: "pixels",
          getLineWidth: (d) => d.strokeWidthPx,
          filled: true,
          stroked: true,
          pickable: true,
          autoHighlight: false,
          onClick: handleSiteClick,
          updateTriggers: {
            getFillColor: [siteFeatures],
            getRadius: [siteFeatures],
          },
        }),
      );
    }

    if (Array.isArray(sectorLabelFeatures) && sectorLabelFeatures.length > 0) {
      layers.push(
        new TextLayer({
          id: "network-sector-labels-layer",
          data: sectorLabelFeatures,
          getPosition: (d) => d.position,
          getText: (d) => d.text,
          getSize: 15,
          getColor: [17, 24, 39, 255],
          getTextAnchor: "middle",
          getAlignmentBaseline: "center",
          fontWeight: 700,
          background: true,
          getBackgroundColor: [255, 255, 255, 225],
          backgroundPadding: [5, 3],
          pickable: false,
        }),
      );
    }

    if (Array.isArray(siteLabelFeatures) && siteLabelFeatures.length > 0) {
      layers.push(
        new TextLayer({
          id: "network-site-labels-layer",
          data: siteLabelFeatures,
          getPosition: (d) => d.position,
          getText: (d) => d.text,
          getSize: 13,
          getColor: [17, 24, 39, 255],
          getTextAnchor: "start",
          getAlignmentBaseline: "center",
          getPixelOffset: [8, 0],
          fontWeight: 700,
          background: true,
          getBackgroundColor: [255, 255, 255, 225],
          backgroundPadding: [5, 3],
          pickable: false,
        }),
      );
    }

    try {
      overlayRef.current.setProps({ layers });
    } catch {
      // Overlay can detach during map teardown; skip this update.
    }
  }, [
    map,
    isValidMapInstance,
    sortedSectorFeatures,
    siteFeatures,
    sectorLabelFeatures,
    siteLabelFeatures,
    handleSectorClick,
    handleSiteClick,
  ]);

  useEffect(() => {
    return () => {
      if (idleListenerRef.current && window.google?.maps?.event?.removeListener) {
        window.google.maps.event.removeListener(idleListenerRef.current);
      }
      idleListenerRef.current = null;
      if (attachTimerRef.current) window.clearTimeout(attachTimerRef.current);
      attachTimerRef.current = null;
      if (!overlayRef.current || isCleanedUpRef.current) return;
      try {
        overlayRef.current.setProps({ layers: [] });
        if (attachedMapRef.current) overlayRef.current.setMap(null);
        overlayRef.current.finalize();
      } catch {
        // ignore cleanup errors
      }
      overlayRef.current = null;
      attachedMapRef.current = null;
      isCleanedUpRef.current = true;
    };
  }, []);

  return null;
};

export default React.memo(NetworkSectorGLLayer);
