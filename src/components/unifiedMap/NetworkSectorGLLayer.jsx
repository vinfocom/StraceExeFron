// src/components/maps/NetworkSectorGLLayer.jsx
// GPU (deck.gl) renderer for the bulk cell-site sector triangles + site markers
// drawn by NetworkPlannerMap.jsx. Mirrors the GoogleMapsOverlay lifecycle used by
// DeckGLOverlay.jsx / LtePredictionLocationLayer.jsx elsewhere in this codebase —
// individual polygon or marker overlays per sector don't scale past a few
// thousand DOM nodes, so the bulk (non-selected) sectors/sites are drawn as
// WebGL layers instead. The single currently-selected sector (which needs an
// InfoWindow + draggable "move" handle) is intentionally excluded from this
// layer and still rendered natively by NetworkPlannerMap.jsx.
import React, { useCallback, useMemo } from "react";
import { PolygonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { useDeckLayerGroup } from "@/components/maps/deckLayerRegistry.jsx";

const SECTOR_LAYER_ID = "network-sector-triangles-layer";

const NetworkSectorGLLayer = ({
  sectorFeatures = [],
  siteFeatures = [],
  sectorLabelFeatures = [],
  siteLabelFeatures = [],
  onSectorClick,
  onSectorRightClick,
  onSiteClick,
}) => {
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

  const handleSectorContextMenu = useCallback(
    (info) => {
      if (!onSectorRightClick || !info?.object) return;
      onSectorRightClick(info.object.source, info.object.infoPos);
    },
    [onSectorRightClick],
  );

  const sortedSectorFeatures = useMemo(() => {
    if (!Array.isArray(sectorFeatures) || sectorFeatures.length === 0) return [];
    // Draw order = stacking order for flat (non-extruded) polygons: sort so
    // smaller/active/selected-matching sectors land later in the array and
    // therefore render on top of larger sibling-band triangles underneath them.
    return [...sectorFeatures].sort((a, b) => (a.sortRank ?? 0) - (b.sortRank ?? 0));
  }, [sectorFeatures]);

  const sectorLayers = useMemo(() => {
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
          onContextMenu: handleSectorContextMenu,
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

    return layers;
  }, [
    sortedSectorFeatures,
    siteFeatures,
    sectorLabelFeatures,
    siteLabelFeatures,
    handleSectorClick,
    handleSectorContextMenu,
    handleSiteClick,
  ]);

  useDeckLayerGroup("sectors", sectorLayers);

  return null;
};

export default React.memo(NetworkSectorGLLayer);
