// Local plan X points east and local Z points north at zero rotation.
// rotationDeg turns local +X counterclockwise toward geographic north.
const EARTH_RADIUS_M = 6371008.8
const RAD = Math.PI / 180

export const isValidLatLng = (lat, lng) => lat !== null && lng !== null && lat !== undefined && lng !== undefined && lat !== '' && lng !== '' && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180

export const isValidAlignment = (alignment) => Boolean(
  alignment && isValidLatLng(alignment.lat, alignment.lng) &&
  alignment.x !== null && alignment.z !== null && alignment.rotationDeg !== null &&
  alignment.x !== '' && alignment.z !== '' && alignment.rotationDeg !== '' &&
  Number.isFinite(Number(alignment.x)) && Number.isFinite(Number(alignment.z)) &&
  Number.isFinite(Number(alignment.rotationDeg)) && alignment.unit === 'm',
)

export const localToGeographic = ({ x, z }, alignment) => {
  if (!isValidAlignment(alignment)) return null
  const angle = Number(alignment.rotationDeg) * RAD
  const dx = Number(x) - Number(alignment.x)
  const dz = Number(z) - Number(alignment.z)
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return null
  const east = dx * Math.cos(angle) - dz * Math.sin(angle)
  const north = dx * Math.sin(angle) + dz * Math.cos(angle)
  const lat = Number(alignment.lat) + north / EARTH_RADIUS_M / RAD
  const lng = Number(alignment.lng) + east / (EARTH_RADIUS_M * Math.cos(Number(alignment.lat) * RAD)) / RAD
  return { lat, lng }
}

export const geographicToLocal = ({ lat, lng }, alignment) => {
  if (!isValidAlignment(alignment) || !isValidLatLng(lat, lng)) return null
  const east = (Number(lng) - Number(alignment.lng)) * RAD * EARTH_RADIUS_M * Math.cos(Number(alignment.lat) * RAD)
  const north = (Number(lat) - Number(alignment.lat)) * RAD * EARTH_RADIUS_M
  const angle = Number(alignment.rotationDeg) * RAD
  return {
    x: Number(alignment.x) + east * Math.cos(angle) + north * Math.sin(angle),
    z: Number(alignment.z) - east * Math.sin(angle) + north * Math.cos(angle),
  }
}

export const rotationFromTwoPoints = (planStart, planEnd, mapStart, mapEnd) => {
  if (!isValidLatLng(mapStart?.lat, mapStart?.lng) || !isValidLatLng(mapEnd?.lat, mapEnd?.lng)) return null
  const dx = Number(planEnd?.x) - Number(planStart?.x)
  const dz = Number(planEnd?.z) - Number(planStart?.z)
  const east = (Number(mapEnd.lng) - Number(mapStart.lng)) * RAD * EARTH_RADIUS_M * Math.cos(Number(mapStart.lat) * RAD)
  const north = (Number(mapEnd.lat) - Number(mapStart.lat)) * RAD * EARTH_RADIUS_M
  if (![dx, dz, east, north].every(Number.isFinite) || Math.hypot(dx, dz) < 0.5 || Math.hypot(east, north) < 0.5) return null
  const degrees = (Math.atan2(north, east) - Math.atan2(dz, dx)) / RAD
  return ((degrees + 180) % 360 + 360) % 360 - 180
}

const pointInPolygon = (x, z, points) => {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i], b = points[j]
    const ax = Number(a.x ?? a[0]), az = Number(a.z ?? a[1])
    const bx = Number(b.x ?? b[0]), bz = Number(b.z ?? b[1])
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside
  }
  return inside
}

export const getAlignmentFootprintCoverage = (logs, alignment, footprint) => {
  const geographicLogs = logs.filter((log) => isValidLatLng(log.lat, log.lng))
  if (!isValidAlignment(alignment) || !Array.isArray(footprint) || footprint.length < 3) return { total: geographicLogs.length, inside: 0, outside: geographicLogs.length, medianAccuracyM: null }
  let inside = 0
  const accuracies = []
  for (const log of geographicLogs) {
    const point = geographicToLocal(log, alignment)
    if (point && pointInPolygon(point.x, point.z, footprint)) inside += 1
    const accuracy = Number(log.accuracyM)
    if (log.accuracyM != null && Number.isFinite(accuracy) && accuracy > 0) accuracies.push(accuracy)
  }
  accuracies.sort((a, b) => a - b)
  const mid = Math.floor(accuracies.length / 2)
  const medianAccuracyM = accuracies.length ? (accuracies[mid] + accuracies[Math.max(0, mid - (accuracies.length % 2 === 0 ? 1 : 0))]) / 2 : null
  return { total: geographicLogs.length, inside, outside: geographicLogs.length - inside, medianAccuracyM }
}

export const projectLogs = (logs, alignment) => logs.map((log) => {
  if (!isValidLatLng(log.lat, log.lng)) return log
  const local = geographicToLocal(log, alignment)
  return local ? { ...log, ...local } : { ...log, x: null, z: null }
})

export const getPlottableLogs = (logs) => logs
  .filter((log) => log.x !== null && log.z !== null && log.x !== '' && log.z !== '' && Number.isFinite(Number(log.x)) && Number.isFinite(Number(log.z)))
  .map((log) => ({ ...log, x: Number(log.x), z: Number(log.z) }))

export const getFloorElevations = (floors, rooms, defaultFloorHeightM = 3.2) => {
  const result = new Map()
  let next = 0
  for (const floor of floors) {
    const floorRooms = rooms.filter((room) => (room.floorId || 'level-1') === floor.id)
    const explicit = floorRooms.map((room) => room.floorElevationM == null ? NaN : Number(room.floorElevationM)).find(Number.isFinite)
    const elevation = explicit ?? next
    result.set(floor.id, elevation)
    const height = floorRooms.map((room) => room.floorHeightM == null ? NaN : Number(room.floorHeightM)).find((value) => Number.isFinite(value) && value > 0)
    next = elevation + (height || defaultFloorHeightM)
  }
  return result
}
