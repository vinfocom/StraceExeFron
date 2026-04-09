// src/utils/pciCollisionUtils.js

/**
 * Detects PCI collisions in neighbor data
 */
export function detectPCICollisions(data, selectedMetric = 'rsrp') {
  if (!data?.primaries || !Array.isArray(data.primaries)) {
    return {
      collisions: [],
      allNeighbors: [],
      stats: { total: 0, collisions: 0, uniquePCIs: 0, collisionCells: 0 }
    };
  }

  const allNeighbors = [];
  const pciMap = new Map();
  
  data.primaries.forEach((primary) => {
    if (!primary.neighbours_data) return;
    
    primary.neighbours_data.forEach((neighbor) => {
      // ✅ FIX: Handle both lon and lng, with better validation
      const lat = parseFloat(neighbor.lat);
      const lng = parseFloat(neighbor.lng || neighbor.lon);
      
      // Skip if coordinates are invalid
      if (!isValidCoordinate(lat, lng)) {
        console.warn('⚠️ Skipping neighbor with invalid coordinates:', {
          id: neighbor.id,
          pci: neighbor.pci,
          lat: neighbor.lat,
          lng: neighbor.lng || neighbor.lon,
          parsedLat: lat,
          parsedLng: lng
        });
        return;
      }
      
      const neighborWithContext = {
        ...neighbor,
        primary_id: primary.primary_id,
        primary_pci: primary.primary_pci,
        primary_cell_id: primary.primary_cell_id,
        lat: lat,  // Use parsed value
        lng: lng,  // Use parsed value
        lon: lng,  // Keep both for compatibility
        isCollision: false
      };
      
      allNeighbors.push(neighborWithContext);
      
      if (!pciMap.has(neighbor.pci)) {
        pciMap.set(neighbor.pci, []);
      }
      pciMap.get(neighbor.pci).push(neighborWithContext);
    });
  });

  // Detect collisions
  const collisions = [];
  const DISTANCE_THRESHOLD = 0.001; // ~111 meters
  
  pciMap.forEach((neighbors, pci) => {
    if (neighbors.length > 1) {
      const locations = neighbors.map(n => ({ lat: n.lat, lng: n.lng }));
      const hasDistinctLocations = hasSignificantLocationDifferences(locations, DISTANCE_THRESHOLD);
      
      if (hasDistinctLocations) {
        neighbors.forEach(n => {
          n.isCollision = true;
        });
        
        collisions.push({
          pci,
          count: neighbors.length,
          locations: locations,
          cells: neighbors.map(n => ({
            id: n.id,
            cell_id: n.cell_id,
            primary_id: n.primary_id,
            lat: n.lat,
            lng: n.lng,
            rsrp: n.rsrp,
            rsrq: n.rsrq,
            sinr: n.sinr
          }))
        });
      }
    }
  });

  const stats = {
    total: allNeighbors.length,
    collisions: collisions.length,
    uniquePCIs: pciMap.size,
    collisionCells: collisions.reduce((sum, c) => sum + c.count, 0)
  };

  console.log('✅ PCI Collision Detection Complete:', {
    total: stats.total,
    collisions: stats.collisions,
    uniquePCIs: stats.uniquePCIs
  });

  return {
    collisions,
    allNeighbors,
    stats
  };
}

// Helper functions
function isValidCoordinate(lat, lng) {
  return (
    lat != null && 
    lng != null && 
    !isNaN(lat) && 
    !isNaN(lng) && 
    isFinite(lat) && 
    isFinite(lng) &&
    lat >= -90 && 
    lat <= 90 && 
    lng >= -180 && 
    lng <= 180 &&
    lat !== 0 || lng !== 0  // Avoid 0,0 coordinates unless legitimate
  );
}

function hasSignificantLocationDifferences(locations, threshold) {
  for (let i = 0; i < locations.length - 1; i++) {
    for (let j = i + 1; j < locations.length; j++) {
      const distance = calculateDistance(
        locations[i].lat,
        locations[i].lng,
        locations[j].lat,
        locations[j].lng
      );
      if (distance > threshold) {
        return true;
      }
    }
  }
  return false;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

export function getColorFromThresholds(value, thresholds) {
  if (!thresholds || thresholds.length === 0) {
    return '#808080';
  }
  
  const sortedThresholds = [...thresholds].sort((a, b) => a.value - b.value);
  
  for (const threshold of sortedThresholds) {
    if (value <= threshold.value) {
      return threshold.color;
    }
  }
  
  return sortedThresholds[sortedThresholds.length - 1].color;
}