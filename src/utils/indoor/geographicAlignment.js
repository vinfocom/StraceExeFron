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
