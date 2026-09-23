import { memo, useMemo, useState } from "react";
import { Rnd } from "react-rnd";
import { GeoJsonLayer } from "@deck.gl/layers";
import { useGoogleMap } from "@react-google-maps/api";
import { useDeckLayerGroup } from "@/components/maps/deckLayerRegistry";
import { useClutterGeometry } from "@/hooks/useClutterGeometry";
import {
  CLUTTER_CLASS_DEFINITIONS,
  getClutterClassColor,
} from "@/utils/clutterClasses";

const HOVER_CARD_WIDTH = 288;
const HOVER_CARD_HEIGHT = 150;

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
  const [hovered, setHovered] = useState(null);
  const [hiddenClasses, setHiddenClasses] = useState(() => new Set());
  const {
    featureCollection,
    classCounts,
    invalidGeometryCount,
    conflictingGeometryCount,
    processing,
    processingError,
  } = useClutterGeometry(tiles, enabled);
  const countByClass = useMemo(() => new Map(classCounts), [classCounts]);
  const legendClasses = useMemo(() => {
    const rows = CLUTTER_CLASS_DEFINITIONS
      .filter(({ name }) => name !== "Water")
      .map(({ name }) => [name, countByClass.get(name) || 0]);
    const unclassifiedCount = countByClass.get("Unclassified") || 0;
    if (unclassifiedCount > 0) rows.push(["Unclassified", unclassifiedCount]);
    return rows;
  }, [countByClass]);
  const visibleFeatureCollection = useMemo(() => ({
    ...featureCollection,
    features: featureCollection.features.filter(
      (feature) => !hiddenClasses.has(feature?.properties?.clutterClass),
    ),
  }), [featureCollection, hiddenClasses]);
  const toggleClass = (className) => {
    setHiddenClasses((current) => {
      const next = new Set(current);
      if (next.has(className)) next.delete(className);
      else next.add(className);
      return next;
    });
  };

  const clutterLayer = useMemo(() => {
    if (!enabled || visibleFeatureCollection.features.length === 0) return null;
    return new GeoJsonLayer({
        id: "project-clutter-tiles",
        data: visibleFeatureCollection,
        pickable: true,
        autoHighlight: false,
        filled: true,
        stroked: false,
        getFillColor: (feature) => [...getClutterClassColor(feature?.properties?.clutterClass), 150],
        parameters: { depthTest: false },
        transitions: {
          getFillColor: 220,
        },
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
  }, [enabled, visibleFeatureCollection, map]);

  useDeckLayerGroup("clutterTiles", clutterLayer ? [clutterLayer] : []);

  if (!enabled) return null;

  const hoveredProperties = hovered?.properties;
  const visibleCount = visibleFeatureCollection.features.length;

  return (
    <>
      <Rnd
        default={{ x: 12, y: 12, width: 292, height: "auto" }}
        bounds="parent"
        enableResizing={false}
        dragHandleClassName="clutter-legend-drag-handle"
        cancel=".clutter-legend-control"
        className="pointer-events-auto z-[1100]"
      >
      <div className="rounded-xl border border-slate-700/80 bg-slate-950/90 p-3 text-[11px] text-slate-100 shadow-2xl backdrop-blur-md">
        <div className="clutter-legend-drag-handle flex cursor-move items-center justify-between gap-3 select-none">
          <div>
            <div className="font-semibold">Clutter classification</div>
            <div className="text-[10px] text-slate-400">Drag to move · select classes to show</div>
          </div>
          {!error && !processingError && featureCollection.features.length > 0 && (
            <div className="shrink-0 text-right text-slate-400">
              <div>{visibleCount.toLocaleString()} shown</div>
              <div className="text-[10px]">{featureCollection.features.length.toLocaleString()} total</div>
            </div>
          )}
        </div>

        {loading && (
          <div className="mt-1 text-sky-300">
            Loading more tiles… Results appear as each page arrives.
          </div>
        )}
        {processing && <div className="mt-1 text-slate-300">Updating the map…</div>}
        {processingError && <div className="mt-1 text-rose-300">{processingError}</div>}
        {error && <div className="mt-1 text-rose-300">{error}</div>}
        {!loading && !processing && !error && !processingError && featureCollection.features.length === 0 && (
          <div className="mt-1 text-slate-300">
            No classified clutter tiles are available for this project.
          </div>
        )}
        {hasMore && (
          <div className="mt-1 text-sky-300">
            More tiles are being loaded.
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
              const [red, green, blue] = getClutterClassColor(name);
              const selected = !hiddenClasses.has(name);
              const percentage = featureCollection.features.length > 0
                ? (count / featureCollection.features.length) * 100
                : 0;
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleClass(name)}
                  className={`clutter-legend-control flex w-full items-center justify-between gap-3 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-slate-800/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400 ${
                    selected ? "text-slate-100" : "text-slate-500"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-1.5 truncate">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-white/15 ${selected ? "" : "opacity-25"}`}
                      style={{ backgroundColor: `rgb(${red} ${green} ${blue})` }}
                    />
                    <span className={`truncate ${selected ? "" : "line-through"}`}>{name}</span>
                  </span>
                  <span className="text-slate-400">
                    {count.toLocaleString()} · {percentage.toFixed(1)}%
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      </Rnd>

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

export default memo(ClutterTilesLayer);
