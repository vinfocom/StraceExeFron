// src/components/SiteMarkers.jsx
import React, { useMemo, useState, memo } from "react";
import { CircleF, InfoWindowF } from "@react-google-maps/api";

const SiteMarker = memo(({ site, onSiteClick, isSelected, onSelect, circleRadius }) => {
  const position = { lat: site.lat, lng: site.lng };
  
  return (
    <>
      <CircleF
        center={position}
        radius={circleRadius}
        options={{
          fillColor: "#3b82f6",
          fillOpacity: 0.1,
          strokeColor: "#3b82f6",
          strokeWeight: 2,
          strokeOpacity: 0.8,
          clickable: true,
          zIndex: 100,
        }}
        onClick={() => {
          onSelect(site);
          onSiteClick?.(site);
        }}
      />
      
      <CircleF
        center={position}
        radius={8}
        options={{
          fillColor: "#3b82f6",
          fillOpacity: 0.9,
          strokeColor: "#ffffff",
          strokeWeight: 2,
          strokeOpacity: 1,
          clickable: true,
          zIndex: 101,
        }}
        onClick={() => {
          onSelect(site);
          onSiteClick?.(site);
        }}
      />

      {isSelected && (
        <InfoWindowF
          position={position}
          onCloseClick={() => onSelect(null)}
          options={{ zIndex: 200 }}
        >
          <div className="p-2 min-w-[200px] max-w-[280px]">
            <h3 className="font-semibold text-sm mb-2 text-gray-900 border-b pb-1">
              {site.name}
            </h3>
            <div className="space-y-1 text-xs text-gray-700">
              {site.operator && (
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Operator:</span>
                  <span className="font-medium">{site.operator}</span>
                </div>
              )}
              {site.tech && (
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Technology:</span>
                  <span className="font-medium">{site.tech}</span>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <span className="text-gray-500">Sectors:</span>
                <span className="font-medium">{site.sectorCount}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-gray-500">Location:</span>
                <span className="font-mono text-[10px]">
                  {site.lat.toFixed(6)}, {site.lng.toFixed(6)}
                </span>
              </div>
            </div>
          </div>
        </InfoWindowF>
      )}
    </>
  );
});

SiteMarker.displayName = 'SiteMarker';

const SiteMarkers = ({ 
  sites = [], 
  showMarkers = true,
  circleRadius = 50,
  onSiteClick,
  viewport = null
}) => {
  const [selectedSite, setSelectedSite] = useState(null);

  const uniqueSites = useMemo(() => {
    const siteMap = new Map();
    
    sites.forEach(item => {
      const siteId = item.site || item.site_id || item.siteId;
      if (!siteMap.has(siteId)) {
        siteMap.set(siteId, {
          id: siteId,
          lat: item.lat || item.latitude,
          lng: item.lng || item.longitude,
          name: item.site_name || item.siteName || siteId,
          operator: item.operator,
          tech: item.tech || item.technology,
          sectorCount: 1,
        });
      } else {
        siteMap.get(siteId).sectorCount++;
      }
    });
    
    return Array.from(siteMap.values());
  }, [sites]);

  const visibleSites = useMemo(() => {
    if (!viewport || uniqueSites.length < 100) {
      return uniqueSites;
    }

    return uniqueSites.filter(site => {
      return site.lat >= viewport.south && 
             site.lat <= viewport.north && 
             site.lng >= viewport.west && 
             site.lng <= viewport.east;
    });
  }, [uniqueSites, viewport]);

  if (!showMarkers || sites.length === 0) {
    return null;
  }

  console.log(`📍 Rendering ${visibleSites.length}/${uniqueSites.length} site markers`);

  return (
    <>
      {visibleSites.map((site) => (
        <SiteMarker
          key={site.id}
          site={site}
          onSiteClick={onSiteClick}
          isSelected={selectedSite?.id === site.id}
          onSelect={setSelectedSite}
          circleRadius={circleRadius}
        />
      ))}
    </>
  );
};

export default memo(SiteMarkers);