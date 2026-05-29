export const getFirst = (row, keys) => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key]
  }
  return undefined
}

export const toNumber = (value, fallback) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

export const normalizeWallSide = (value) => String(value || '').trim().toLowerCase()
export const safeRoomKey = (value) => String(value || '').trim().toLowerCase()
const parseJsonMaybe = (value) => {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export const slugifyFloor = (value, fallback = 'level-1') => {
  const slug = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return slug || fallback
}

export const getFloorIdentity = (row, fallbackId = 'level-1', fallbackName = 'Level 1') => {
  const floorName = getFirst(row, ['floor_name', 'floor', 'level_name', 'level', 'story', 'storey']) || fallbackName
  const floorId = getFirst(row, ['floor_id', 'floorId', 'level_id', 'levelId']) || slugifyFloor(floorName, fallbackId)
  return { floorId: String(floorId), floorName: String(floorName) }
}

export const sameFloor = (item, floorId) => (item.floorId || 'level-1') === floorId
export const floorSheetNumber = (sheetName) => /^Floor[_\s-]*(\d+)$/i.exec(sheetName)?.[1]
export const hasAllowedExtension = (fileName, extensions) => extensions.some((extension) => fileName.toLowerCase().endsWith(extension))

export const buildFloorOptions = (rooms) => {
  const floorMap = new Map()
  rooms.forEach((room) => {
    const floorId = room.floorId || 'level-1'
    if (!floorMap.has(floorId)) floorMap.set(floorId, { id: floorId, name: room.floorName || floorId })
  })
  return Array.from(floorMap.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
}

export const getVisiblePlan = ({ rooms, doors, windows, selectedFloor }) => {
  const visibleRooms = rooms.filter((room) => sameFloor(room, selectedFloor.id))
  const visibleRoomIds = new Set(visibleRooms.map((room) => room.id))
  return {
    visibleRooms,
    visibleDoors: doors.filter((door) => sameFloor(door, selectedFloor.id) || visibleRoomIds.has(door.roomId)),
    visibleWindows: windows.filter((windowItem) => sameFloor(windowItem, selectedFloor.id) || visibleRoomIds.has(windowItem.roomId)),
  }
}

export const getOverlapWarnings = (rooms) => {
  const warnings = []
  for (let i = 0; i < rooms.length; i += 1) {
    for (let j = i + 1; j < rooms.length; j += 1) {
      const a = rooms[i]
      const b = rooms[j]
      if (a.shape && a.shape !== 'rectangle') continue
      if (b.shape && b.shape !== 'rectangle') continue
      const overlapsX = a.x < b.x + b.width && a.x + a.width > b.x
      const overlapsZ = a.z < b.z + b.depth && a.z + a.depth > b.z
      if (overlapsX && overlapsZ) warnings.push(`${a.name} overlaps ${b.name}`)
    }
  }
  return warnings
}

export const normalizeParsedPlan = (data, selectedFloor) => {
  let parsedRooms = Array.isArray(data.rooms)
    ? data.rooms
        .map((room, index) => ({
          id: room.id || `R${index + 1}`,
          floorId: room.floorId || room.floor_id || selectedFloor.id,
          floorName: room.floorName || room.floor_name || selectedFloor.name,
          name: String(room.name || `Room ${index + 1}`),
          x: toNumber(room.x, 0),
          z: toNumber(room.z ?? room.y, 0),
          width: toNumber(room.width, 1),
          depth: toNumber(room.depth ?? room.height, 1),
          height: toNumber(room.wallHeight ?? room.wall_height, 3),
          shape: String(room.shape || room.shape_type || 'rectangle').trim().toLowerCase(),
          radius: toNumber(room.radius ?? room.r, NaN),
          polygonPoints: parseJsonMaybe(room.polygonPoints ?? room.polygon_json ?? room.polygon),
        }))
        .filter((room) => room.width > 0 && room.depth > 0 && room.height > 0)
    : []

  if (parsedRooms.length > 3) {
    const xs = parsedRooms.map((r) => r.x).sort((a, b) => a - b)
    const zs = parsedRooms.map((r) => r.z).sort((a, b) => a - b)
    const q1x = xs[Math.floor(xs.length * 0.25)]
    const q3x = xs[Math.floor(xs.length * 0.75)]
    const q1z = zs[Math.floor(zs.length * 0.25)]
    const q3z = zs[Math.floor(zs.length * 0.75)]
    const iqrX = Math.max(0.001, q3x - q1x)
    const iqrZ = Math.max(0.001, q3z - q1z)
    parsedRooms = parsedRooms.filter((r) => r.x >= q1x - 3 * iqrX && r.x <= q3x + 3 * iqrX && r.z >= q1z - 3 * iqrZ && r.z <= q3z + 3 * iqrZ)
  }

  const parsedDoors = Array.isArray(data.doors)
    ? data.doors.map((d, index) => ({
        id: d.id || `D${index + 1}`,
        floorId: d.floorId || d.floor_id || selectedFloor.id,
        roomId: d.roomId || d.room_id || d.room || '',
        wallSide: d.wallSide || d.wall_side || d.wall || '',
        offset: toNumber(d.offset ?? d.x, 0),
        width: toNumber(d.width, 0.9),
        height: toNumber(d.height, 2.1),
      }))
    : []

  const parsedWindows = Array.isArray(data.windows)
    ? data.windows.map((w, index) => ({
        id: w.id || `W${index + 1}`,
        floorId: w.floorId || w.floor_id || selectedFloor.id,
        roomId: w.roomId || w.room_id || w.room || '',
        wallSide: w.wallSide || w.wall_side || w.wall || '',
        offset: toNumber(w.offset ?? w.x, 0),
        width: toNumber(w.width, 1),
        height: toNumber(w.height, 1),
        sillHeight: toNumber(w.sillHeight ?? w.sill_height, 1),
      }))
    : []

  const roomByName = Object.fromEntries(parsedRooms.map((r) => [safeRoomKey(r.name), r]))
  const inferOpening = (item) => {
    const room = roomByName[safeRoomKey(item.roomId)]
    if (!room) return item
    const isVertical = ['west', 'east'].includes(normalizeWallSide(item.wallSide))
    if (!item.wallSide && Number.isFinite(item.offset)) {
      if (item.offset >= room.x && item.offset <= room.x + room.width) return { ...item, wallSide: 'north', offset: Math.max(0, item.offset - room.x) }
      if (item.offset >= room.z && item.offset <= room.z + room.depth) return { ...item, wallSide: 'west', offset: Math.max(0, item.offset - room.z) }
    }
    return { ...item, offset: Math.max(0, item.offset), wallSide: item.wallSide || (isVertical ? 'west' : 'north') }
  }

  const normalizedDoors = parsedDoors.map(inferOpening)
  const normalizedWindows = parsedWindows.map(inferOpening)

  return {
    siteName: data.site_name || data.siteName || '',
    wallThickness: Math.max(0.1, toNumber(data.wall_thickness ?? data.wallThickness, 0.2)),
    rooms: parsedRooms,
    doors: normalizedDoors.filter((item) => item.roomId && normalizeWallSide(item.wallSide)),
    windows: normalizedWindows.filter((item) => item.roomId && normalizeWallSide(item.wallSide)),
    warnings: Array.isArray(data.warnings) ? data.warnings.filter(Boolean) : [],
    confidence: toNumber(data.confidence, null),
  }
}
