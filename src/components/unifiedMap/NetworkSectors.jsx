// src/components/NetworkSectors.jsx
import React, { useMemo, useState, memo } from "react";
import { PolygonF, InfoWindowF } from "@react-google-maps/api";

function computeOffset(center, distanceMeters, headingDegrees) {
  const earthRadius = 6378137;
  const lat1 = (center.lat * Math.PI) / 180;
  const lng1 = (center.lng * Math.PI) / 180;
  const heading = (headingDegrees * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceMeters / earthRadius) +
      Math.cos(lat1) * Math.sin(distanceMeters / earthRadius) * Math.cos(heading)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(heading) * Math.sin(distanceMeters / earthRadius) * Math.cos(lat1),
      Math.cos(distanceMeters / earthRadius) - Math.sin(lat1) * Math.sin(lat2)
    );

  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

// Color mapping by operator
const OPERATOR_COLORS = {
  "Jio True5G": "#3B82F6",
    "JIO 4G": "#3B82F6",
    "JIO4G": "#3B82F6",
    "IND-JIO": "#3B82F6",
    "IND airtel": "#EF4444",
    "IND Airtel": "#EF4444",
    "airtel": "#EF4444",
    "Airtel 5G": "#EF4444",
    "VI India": "#22C55E",
    "vi India": "#22C55E",
    "Vodafone IN": "#22C55E",
    BSNL: "#F59E0B",
    Unknown: "#6B7280",
};

const getOperatorColor = (operator) => {
  return OPERATOR_COLORS[operator] || OPERATOR_COLORS.default;
};

const SectorPolygon = memo(({ sector, onSectorClick, isSelected, onSelect }) => {
  const p0 = { lat: sector.lat, lng: sector.lng };
  const bw = sector.beamwidth;
  const r = sector.range;

  const p1 = computeOffset(p0, r, sector.azimuth - bw / 2);
  const p2 = computeOffset(p0, r, sector.azimuth + bw / 2);

  const triangleCoords = useMemo(() => [p0, p1, p2], [p0.lat, p0.lng, p1.lat, p1.lng, p2.lat, p2.lng]);

  // Calculate center point for info window
  const centerPos = useMemo(() => ({
    lat: (p0.lat + p1.lat + p2.lat) / 3,
    lng: (p0.lng + p1.lng + p2.lng) / 3
  }), [p0, p1, p2]);

  return (
    <>
      <PolygonF
        paths={triangleCoords}
        options={{
          fillColor: sector.color,
          fillOpacity: 0.35,
          strokeColor: sector.color,
          strokeWeight: 1.5,
          clickable: true,
          zIndex: 50,
        }}
        onClick={() => {
          onSelect(sector);
          onSectorClick?.(sector);
        }}
      />

      {isSelected && (
        <InfoWindowF
          position={centerPos}
          onCloseClick={() => onSelect(null)}
          options={{ zIndex: 200 }}
        >
          <div className="p-2 min-w-[200px] max-w-[280px]">
            <h3 className="font-semibold text-sm mb-2 text-gray-900 border-b pb-1">
              Cell: {sector.id}
            </h3>
            <div className="space-y-1 text-xs text-gray-700">
              <div className="flex justify-between gap-2">
                <span className="text-gray-500">Site:</span>
                <span className="font-medium">{sector.site}</span>
              </div>
              {sector.operator && (
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Operator:</span>
                  <span className="font-medium">{sector.operator}</span>
                </div>
              )}
              {sector.tech && (
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Tech:</span>
                  <span className="font-medium">{sector.tech}</span>
                </div>
              )}
              {sector.band && (
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Band:</span>
                  <span className="font-medium">{sector.band}</span>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <span className="text-gray-500">Azimuth:</span>
                <span className="font-medium">{sector.azimuth}°</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-gray-500">Beamwidth:</span>
                <span className="font-medium">{sector.beamwidth}°</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-gray-500">Range:</span>
                <span className="font-medium">{sector.range}m</span>
              </div>
            </div>
          </div>
        </InfoWindowF>
      )}
    </>
  );
});

SectorPolygon.displayName = 'SectorPolygon';

const NetworkSectors = ({ 
  sectors = [], 
  showSectors = true,
  defaultRadius = 220,
  onSectorClick,
  viewport = null
}) => {
  const [selectedSector, setSelectedSector] = useState(null);

  // Normalize sector data
  const normalizedSectors = useMemo(() => {
    return sectors.map(sector => ({
      id: sector.cell_id || sector.cellId || sector.id,
      site: sector.site || sector.site_id || sector.siteId,
      lat: sector.lat || sector.latitude,
      lng: sector.lng || sector.longitude,
      azimuth: sector.azimuth || 0,
      beamwidth: sector.beamwidth || sector.beam_width || 65,
      range: sector.range || sector.radius || defaultRadius,
      color: sector.color || getOperatorColor(sector.operator),
      operator: sector.operator,
      tech: sector.tech || sector.technology,
      band: sector.band || sector.frequency_band,
    }));
  }, [sectors, defaultRadius]);

  // Filter sectors within viewport for performance
  console.log(`[NetworkSectors] RENDER. showSectors: ${showSectors}, Sector Count: ${sectors.length}`);
  const visibleSectors = useMemo(() => {
    if (!viewport || normalizedSectors.length < 50) {
      return normalizedSectors;
    }

    return normalizedSectors.filter(sector => {
      // Add buffer for sector range
      const buffer = (sector.range / 111320) || 0.002; // Convert meters to degrees approximately
      return sector.lat >= (viewport.south - buffer) && 
             sector.lat <= (viewport.north + buffer) && 
             sector.lng >= (viewport.west - buffer) && 
             sector.lng <= (viewport.east + buffer);
    });
  }, [normalizedSectors, viewport]);

  if (!showSectors || sectors.length === 0) {
    return null;
  }

  console.log(`📡 Rendering ${visibleSectors.length}/${normalizedSectors.length} sectors`);

  return (
    <>
      {visibleSectors.map((sector) => (
        <SectorPolygon
          key={sector.id}
          sector={sector}
          onSectorClick={onSectorClick}
          isSelected={selectedSector?.id === sector.id}
          onSelect={setSelectedSector}
        />
      ))}
    </>
  );
};

export default memo(NetworkSectors);