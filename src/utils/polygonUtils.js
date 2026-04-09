export class PolygonChecker {
  constructor(polygons) {
    this.polygons = polygons || [];
    this.hasPolygons = this.polygons.length > 0;
  }

  isInside(lat, lng) {
    if (!this.hasPolygons) return true;
    
    for (const poly of this.polygons) {
      const { bbox, paths } = poly;
      const vertices = paths[0]; // Assuming single ring polygon

      // 1. Quick BBox Check
      if (bbox && (lat < bbox.south || lat > bbox.north || 
                   lng < bbox.west || lng > bbox.east)) {
        continue;
      }

      // 2. Ray Casting Algorithm
      let inside = false;
      for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const xi = vertices[i].lng, yi = vertices[i].lat;
        const xj = vertices[j].lng, yj = vertices[j].lat;

        const intersect = ((yi > lat) !== (yj > lat)) &&
            (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      if (inside) return true;
    }
    return false;
  }

  filter(data, latKey = 'lat', lngKey = 'lng') {
    if (!this.hasPolygons || !data?.length) return data;
    return data.filter(item => {
      const latRaw = item[latKey] ?? item.latitude ?? item.Lat ?? item.Latitude ?? item.LAT;
      const lngRaw = item[lngKey] ?? item.lon ?? item.longitude ?? item.Lng ?? item.Longitude ?? item.LNG;
      const lat = Number(latRaw);
      const lng = Number(lngRaw);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
      return this.isInside(lat, lng);
    });
  }
}