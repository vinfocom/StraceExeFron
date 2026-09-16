import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import { GeoJsonLayer } from "@deck.gl/layers";
import { useGoogleMap } from "@react-google-maps/api";
import { buildClutterFeatureCollection } from "@/utils/clutterGeometry";

const CLASS_COLORS = {
  building: [239, 68, 68],
  vegetation: [34, 197, 94],
  forest: [22, 163, 74],
  tree: [22, 163, 74],
  water: [59, 130, 246],
  road: [148, 163, 184],
  railway: [100, 116, 139],
  urban: [168, 85, 247],
  suburban: [139, 92, 246],
  denseurban: [126, 34, 206],
  rural: [132, 204, 22],
  open: [163, 230, 53],
  green: [34, 197, 94],
  highway: [234, 179, 8],
  bareland: [217, 119, 6],
  bare: [217, 119, 6],
};
const DEFAULT_CLASS_COLOR = [245, 158, 11];
const MAX_LEGEND_CLASSES = 8;
const HOVER_CARD_WIDTH = 288;
const HOVER_CARD_HEIGHT = 150;

const normalizeClassKey = (value) =>
  String(value ?? "Unknown").trim().toLowerCase().replace(/[\s_-]+/g, "");

const getClassRgb = (value) => CLASS_COLORS[normalizeClassKey(value)] || DEFAULT_CLASS_COLOR;

const getDisplayValue = (value) => {
  if (value == null || value === "") return "-";
  return String(value);
};

const ClutterTilesLayer = ({
  enabled = false,
  tiles = [],
  loading = false,
  error = null,
  hasMore = false,
}) => {
  const map = useGoogleMap();
  const overlayRef = useRef(null);
  const [hovered, setHovered] = useState(null);
  const [overlayError, setOverlayError] = useState(null);
  const {
    featureCollection,
    classCounts,
    invalidGeometryCount,
    conflictingGeometryCount,
  } = useMemo(() => buildClutterFeatureCollection(tiles), [tiles]);

  useEffect(() => {
    if (!enabled || !map || !map.getDiv?.()) {
      setOverlayError(null);
      return undefined;
    }

    let overlay = null;
    try {
      overlay = new GoogleMapsOverlay({
        interleaved: true,
        glOptions: { preserveDrawingBuffer: false },
      });
      overlay.setMap(map);
      overlayRef.current = overlay;
      setOverlayError(null);
    } catch {
      try {
        overlay?.finalize();
      } catch {
        // Ignore cleanup failures while the map is being initialized.
      }
      overlayRef.current = null;
      setOverlayError("The map could not initialize the clutter layer.");
      return undefined;
    }

    return () => {
      try {
        overlay.setProps({ layers: [] });
        overlay.setMap(null);
        overlay.finalize();
      } catch {
        // The Google Map may already be tearing down.
      }
      if (overlayRef.current === overlay) overlayRef.current = null;
    };
  }, [enabled, map]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!enabled || !overlay || featureCollection.features.length === 0) {
      try {
        overlay?.setProps({ layers: [] });
      } catch {
        setOverlayError("The clutter layer could not be cleared from the map.");
      }
      setHovered(null);
      return;
    }

    try {
      const layer = new GeoJsonLayer({
        id: "project-clutter-tiles",
        data: featureCollection,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 210],
        filled: true,
        stroked: true,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 1,
        getFillColor: (feature) => [...getClassRgb(feature?.properties?.clutterClass), 105],
        getLineColor: (feature) => [...getClassRgb(feature?.properties?.clutterClass), 205],
        getLineWidth: 1,
        onHover: (info) => {
          if (!info?.object) {
            setHovered(null);
            return;
          }

          const bounds = map?.getDiv?.()?.getBoundingClientRect?.();
          const maxLeft = Math.max(8, (bounds?.width || HOVER_CARD_WIDTH) - HOVER_CARD_WIDTH);
          const maxTop = Math.max(8, (bounds?.height || HOVER_CARD_HEIGHT) - HOVER_CARD_HEIGHT);
          setHovered({
            x: Math.min(maxLeft, Math.max(8, (Number(info.x) || 0) + 12)),
            y: Math.min(maxTop, Math.max(8, (Number(info.y) || 0) + 12)),
            properties: info.object.properties || {},
          });
        },
      });

      overlay.setProps({ layers: [layer] });
      setOverlayError(null);
    } catch {
      setHovered(null);
      setOverlayError("The clutter layer could not be rendered.");
      try {
        overlay.setProps({ layers: [] });
      } catch {
        // Keep a broken overlay from affecting the rest of the map.
      }
    }
  }, [enabled, featureCollection, map]);

  if (!enabled) return null;

  const hoveredProperties = hovered?.properties;
  const legendClasses = classCounts.slice(0, MAX_LEGEND_CLASSES);
  const additionalClassCount = Math.max(0, classCounts.length - legendClasses.length);

  return (
    <>
      <div className="pointer-events-none absolute right-3 top-3 z-[1100] max-w-[260px] rounded-lg border border-slate-600 bg-slate-950/90 p-2.5 text-[11px] text-slate-100 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="font-semibold">Clutter tiles</div>
          {!loading && !error && (
            <div className="text-slate-400">
              {featureCollection.features.length.toLocaleString()} tiles
            </div>
          )}
        </div>

        {loading && <div className="mt-1 text-slate-300">Loading clutter tiles...</div>}
        {error && <div className="mt-1 text-rose-300">{error}</div>}
        {overlayError && <div className="mt-1 text-rose-300">{overlayError}</div>}
        {!loading && !error && featureCollection.features.length === 0 && (
          <div className="mt-1 text-slate-300">
            No clutter tiles overlap this project's buildings.
          </div>
        )}
        {hasMore && (
          <div className="mt-1 text-amber-300">
            The API limit was reached. Some tiles may be missing from this view.
          </div>
        )}
        {invalidGeometryCount > 0 && (
          <div className="mt-1 text-amber-300">
            Skipped {invalidGeometryCount.toLocaleString()} tile{invalidGeometryCount === 1 ? "" : "s"} with unsupported or invalid geometry.
          </div>
        )}
        {conflictingGeometryCount > 0 && (
          <div className="mt-1 text-amber-300">
            {conflictingGeometryCount.toLocaleString()} duplicate tile record{conflictingGeometryCount === 1 ? " has" : "s have"} conflicting geometry; the first valid geometry is shown.
          </div>
        )}

        {legendClasses.length > 0 && (
          <div className="mt-2 space-y-1 border-t border-slate-700 pt-2">
            {legendClasses.map(([name, count]) => {
              const [red, green, blue] = getClassRgb(name);
              return (
                <div key={name} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-1.5 truncate">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: `rgb(${red} ${green} ${blue})` }}
                    />
                    <span className="truncate">{name}</span>
                  </span>
                  <span className="text-slate-400">{count.toLocaleString()}</span>
                </div>
              );
            })}
            {additionalClassCount > 0 && (
              <div className="text-slate-400">+{additionalClassCount} more classes</div>
            )}
          </div>
        )}
      </div>

      {hoveredProperties && (
        <div
          className="pointer-events-none absolute z-[1200] max-w-[280px] rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800 shadow-lg"
          style={{ left: `${hovered.x}px`, top: `${hovered.y}px` }}
        >
          <div className="mb-1 font-semibold">{getDisplayValue(hoveredProperties.clutterClass)}</div>
          <div>Tile: {getDisplayValue(hoveredProperties.gridId || hoveredProperties.clutterTileId)}</div>
          <div>Land cover: {getDisplayValue(hoveredProperties.landCoverClass)}</div>
          <div>
            Resolution: {hoveredProperties.resolutionM == null ? "-" : `${hoveredProperties.resolutionM} m`}
          </div>
          {hoveredProperties.buildingPolygonNames?.length > 0 && (
            <div className="mt-1 border-t border-slate-200 pt-1">
              Building: {hoveredProperties.buildingPolygonNames.join(", ")}
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default ClutterTilesLayer;
