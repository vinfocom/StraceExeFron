const isFiniteNumber = (value) => Number.isFinite(Number(value))

const pointInPolygon = (x, z, points) => {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = Number(points[i].x ?? points[i][0])
    const zi = Number(points[i].z ?? points[i][1])
    const xj = Number(points[j].x ?? points[j][0])
    const zj = Number(points[j].z ?? points[j][1])
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-9) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export const getLogMetricValue = (item, metric) => {
  if (!item) return NaN
  if (metric === 'rsrq') return Number(item.rsrq ?? item.RSRQ ?? item.rsrqDb ?? item.RSRQ_DB)
  if (metric === 'sinr') return Number(item.sinr ?? item.SINR ?? item.sinrDb ?? item.SINR_DB)
  return Number(item.rsrp ?? item.RSRP ?? item.rssiDbm ?? item.RSSI_DBM ?? item.rssi ?? item.RSSI)
}

export const aggregateValues = (values, method) => {
  if (!values.length) return null
  if (method === 'min') return Math.min(...values)
  if (method === 'max') return Math.max(...values)
  if (method === 'median') {
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
  }
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

const isPointInsideRoom = (x, z, room) => {
  const shape = String(room.shape || 'rectangle').toLowerCase()
  if (shape === 'circle') {
    const radius = Number.isFinite(room.radius) && room.radius > 0 ? room.radius : Math.min(Number(room.width), Number(room.depth)) / 2
    const cx = Number(room.x) + Number(room.width) / 2
    const cz = Number(room.z) + Number(room.depth) / 2
    return Math.hypot(x - cx, z - cz) <= radius
  }
  if ((shape === 'polygon' || shape === 'poly') && Array.isArray(room.polygonPoints) && room.polygonPoints.length >= 3) {
    return pointInPolygon(x, z, room.polygonPoints)
  }
  return x >= Number(room.x) && x <= Number(room.x) + Number(room.width) && z >= Number(room.z) && z <= Number(room.z) + Number(room.depth)
}

const findContainingRoom = (rooms, x, z) => {
  for (let i = 0; i < rooms.length; i += 1) {
    const room = rooms[i]
    if (isPointInsideRoom(x, z, room)) return room
  }
  return null
}

export const buildAggregatedLogGridCells = ({
  enabled,
  showLogs,
  logs,
  rooms,
  gridSizeM,
  aggregationMethod,
  metric,
  getMetricColor,
}) => {
  if (!enabled || !showLogs || !Array.isArray(logs) || logs.length === 0 || !Array.isArray(rooms) || rooms.length === 0) return []
  const safeGridSize = Math.max(1, Number(gridSizeM) || 1)
  const roomById = new Map(rooms.map((room) => [String(room.id), room]))
  const buckets = new Map()

  logs.forEach((logItem) => {
    const x = Number(logItem.x)
    const z = Number(logItem.z)
    if (!isFiniteNumber(x) || !isFiniteNumber(z)) return
    const metricValue = getLogMetricValue(logItem, metric)
    if (!isFiniteNumber(metricValue)) return

    let room = roomById.get(String(logItem.roomId))
    if (!room || !isPointInsideRoom(x, z, room)) {
      room = findContainingRoom(rooms, x, z)
    }
    if (!room) return

    const col = Math.floor((x - Number(room.x)) / safeGridSize)
    const row = Math.floor((z - Number(room.z)) / safeGridSize)
    if (!Number.isFinite(col) || !Number.isFinite(row)) return
    const key = `${room.id}:${row}:${col}`
    if (!buckets.has(key)) buckets.set(key, { room, row, col, values: [] })
    buckets.get(key).values.push(metricValue)
  })

  return Array.from(buckets.values())
    .map((bucket, idx) => {
      const value = aggregateValues(bucket.values, aggregationMethod)
      const xStart = Number(bucket.room.x) + bucket.col * safeGridSize
      const zStart = Number(bucket.room.z) + bucket.row * safeGridSize
      const width = Math.min(safeGridSize, Number(bucket.room.width) - bucket.col * safeGridSize)
      const depth = Math.min(safeGridSize, Number(bucket.room.depth) - bucket.row * safeGridSize)
      return {
        id: `grid-cell-${idx}-${bucket.room.id}-${bucket.row}-${bucket.col}`,
        roomId: bucket.room.id,
        x: xStart + width / 2,
        z: zStart + depth / 2,
        width,
        depth,
        value,
        color: Number.isFinite(value) ? getMetricColor(value, metric) : '#808080',
        samples: bucket.values.length,
      }
    })
    .filter((cell) => cell.width > 0 && cell.depth > 0)
}
