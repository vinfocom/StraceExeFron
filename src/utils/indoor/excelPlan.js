import ExcelJS from 'exceljs'
import { MAX_SHEET_ROWS } from '../../config/indoor/floorPlannerConfig'
import { floorSheetNumber, getFirst, getFloorIdentity, toNumber } from './floorPlan'

const parseJsonCell = (value) => {
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const getPolygonBounds = (points) => {
  if (!Array.isArray(points) || points.length < 3) return null
  const numeric = points
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) return null
      const x = Number(point[0])
      const z = Number(point[1])
      if (!Number.isFinite(x) || !Number.isFinite(z)) return null
      return { x, z }
    })
    .filter(Boolean)
  if (numeric.length < 3) return null
  const xs = numeric.map((p) => p.x)
  const zs = numeric.map((p) => p.z)
  return {
    points: numeric,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  }
}

const parseBoundaryFromBuildingMeta = (buildingMeta) => {
  const raw = buildingMeta?.outer_boundary_json
  if (!raw) return null
  const parsed = parseJsonCell(String(raw))
  if (!parsed || typeof parsed !== 'object') return null
  if (Array.isArray(parsed.polygon_m)) {
    const points = parsed.polygon_m
      .map((point) => {
        if (!Array.isArray(point) || point.length < 2) return null
        const x = Number(point[0])
        const z = Number(point[1])
        return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null
      })
      .filter(Boolean)
    return points.length >= 3 ? points : null
  }
  return null
}

export const worksheetToRows = (worksheet) => {
  if (!worksheet) return []
  const headers = worksheet.getRow(1).values.slice(1).map((value) => String(value || '').trim())
  const rows = []

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || rows.length >= MAX_SHEET_ROWS) return
    const item = {}
    let hasValue = false
    headers.forEach((header, index) => {
      if (!header) return
      const cellValue = row.getCell(index + 1).value
      const normalizedValue = typeof cellValue === 'object' && cellValue !== null && 'text' in cellValue ? cellValue.text : cellValue
      item[header] = normalizedValue ?? ''
      if (normalizedValue !== undefined && normalizedValue !== null && normalizedValue !== '') hasValue = true
    })
    if (hasValue) rows.push(item)
  })

  return rows
}

export const addJsonWorksheet = (workbook, name, rows) => {
  const worksheet = workbook.addWorksheet(name)
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
  worksheet.columns = headers.map((header) => ({ header, key: header }))
  rows.forEach((row) => worksheet.addRow(row))
}

export const downloadWorkbook = async (workbook, fileName) => {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export const createReviewedDetectedWorkbook = (detectedPlan, selectedFloor) => {
  const wb = new ExcelJS.Workbook()
  addJsonWorksheet(wb, 'FloorMeta', [{ site_name: detectedPlan.siteName || 'Parsed Floorplan', floor_id: selectedFloor.id, floor_name: selectedFloor.name, unit: 'ft', wall_thickness: detectedPlan.wallThickness, ceiling_height: 10, origin_x: 0, origin_z: 0 }])
  addJsonWorksheet(
    wb,
    'Rooms',
    detectedPlan.rooms.map((room) => ({
      floor_id: room.floorId || selectedFloor.id,
      floor_name: room.floorName || selectedFloor.name,
      room_id: room.id,
      room_name: room.name,
      x: room.x,
      z: room.z,
      width: room.width,
      depth: room.depth,
      height: room.height,
      shape: room.shape || 'rectangle',
      radius: room.radius ?? '',
      polygon_json: room.polygonPoints ? JSON.stringify(room.polygonPoints.map((point) => [point.x ?? point[0], point.z ?? point[1]])) : '',
    })),
  )
  addJsonWorksheet(wb, 'Doors', [])
  addJsonWorksheet(wb, 'Windows', [])
  return wb
}

export const parseBuildingWorkbook = async (buffer) => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  const allowedSheets = new Set(['BuildingMeta', 'FloorMeta', 'Rooms', 'Doors', 'Windows'])
  const floorSheets = workbook.worksheets.filter((worksheet) => floorSheetNumber(worksheet.name))
  const unexpectedSheet = workbook.worksheets.find((worksheet) => !allowedSheets.has(worksheet.name) && !floorSheetNumber(worksheet.name))?.name
  if (unexpectedSheet) {
    return { error: `Unexpected sheet "${unexpectedSheet}". Use BuildingMeta, FloorMeta, Rooms, Doors, Windows, or Floor_1 style sheets.` }
  }

  const buildingMetaSheet = workbook.getWorksheet('BuildingMeta')
  const floorMetaSheet = workbook.getWorksheet('FloorMeta')
  const roomsSheet = workbook.getWorksheet('Rooms')
  const doorsSheet = workbook.getWorksheet('Doors')
  const windowsSheet = workbook.getWorksheet('Windows')

  if (!roomsSheet && floorSheets.length === 0) {
    return { error: 'Missing room data. Add a Rooms sheet or Floor_1, Floor_2 style sheets.' }
  }

  const buildingRows = worksheetToRows(buildingMetaSheet)
  const metaRows = worksheetToRows(floorMetaSheet)
  const roomRows = roomsSheet
    ? worksheetToRows(roomsSheet)
    : floorSheets.flatMap((worksheet) => {
        const floorNumber = floorSheetNumber(worksheet.name)
        return worksheetToRows(worksheet).map((row) => ({ floor_id: `floor-${floorNumber}`, floor_name: `Floor ${floorNumber}`, ...row }))
      })
  const doorRows = worksheetToRows(doorsSheet)
  const windowRows = worksheetToRows(windowsSheet)

  if (roomRows.length === 0) return { error: 'Room sheets are empty.' }

  const buildingMeta = buildingRows[0] || {}
  const meta = metaRows[0] || {}
  const metaByFloorId = new Map(metaRows.map((row, index) => {
    const identity = getFloorIdentity(row, `level-${index + 1}`, `Level ${index + 1}`)
    return [identity.floorId, { ...row, ...identity }]
  }))
  const defaultHeight = toNumber(getFirst(meta, ['ceiling_height', 'height']), 3)
  const parsedWallThickness = toNumber(getFirst(meta, ['wall_thickness', 'wall']), 0.2)

  const rooms = roomRows
    .map((row, index) => {
      const rowFloor = getFloorIdentity(row)
      const floorMeta = metaByFloorId.get(rowFloor.floorId)
      const floorId = floorMeta?.floorId || rowFloor.floorId
      const floorName = floorMeta?.floorName || rowFloor.floorName
      const roomDefaultHeight = toNumber(getFirst(floorMeta || {}, ['ceiling_height', 'height']), defaultHeight)
      const roomName = getFirst(row, ['room_name', 'name'])
      const shapeType = String(getFirst(row, ['shape', 'shape_type']) || 'rectangle').trim().toLowerCase()
      const parsedPolygon = parseJsonCell(getFirst(row, ['polygon_json', 'polygon']))
      const polygonBounds = getPolygonBounds(parsedPolygon)
      const radius = toNumber(getFirst(row, ['radius', 'r']), NaN)
      let width = toNumber(getFirst(row, ['width', 'w']), NaN)
      let depth = toNumber(getFirst(row, ['depth', 'd']), NaN)
      const height = toNumber(getFirst(row, ['height', 'h']), roomDefaultHeight)
      let x = toNumber(getFirst(row, ['x', 'origin_x']), 0)
      let z = toNumber(getFirst(row, ['z', 'origin_z']), 0)

      if (shapeType === 'circle' && Number.isFinite(radius) && radius > 0) {
        width = radius * 2
        depth = radius * 2
      }

      if ((shapeType === 'polygon' || shapeType === 'poly') && polygonBounds) {
        width = polygonBounds.maxX - polygonBounds.minX
        depth = polygonBounds.maxZ - polygonBounds.minZ
        x = polygonBounds.minX
        z = polygonBounds.minZ
      }

      if (!roomName || width <= 0 || depth <= 0 || height <= 0) return null
      return {
        id: getFirst(row, ['room_id', 'id']) || `R${index + 1}`,
        floorId,
        floorName,
        name: String(roomName),
        width,
        depth,
        height,
        x,
        z,
        shape: shapeType,
        radius: Number.isFinite(radius) && radius > 0 ? radius : undefined,
        polygonPoints: polygonBounds?.points,
      }
    })
    .filter(Boolean)

  const doors = doorRows
    .map((row, index) => ({ id: getFirst(row, ['door_id', 'id']) || `D${index + 1}`, ...getFloorIdentity(row), roomId: getFirst(row, ['room_id', 'room']), wallSide: getFirst(row, ['wall_side', 'side']), offset: toNumber(getFirst(row, ['offset']), 0), width: toNumber(getFirst(row, ['width']), 0.9), height: toNumber(getFirst(row, ['height']), 2.1) }))
    .filter((item) => item.roomId && item.wallSide)

  const windows = windowRows
    .map((row, index) => ({ id: getFirst(row, ['window_id', 'id']) || `W${index + 1}`, ...getFloorIdentity(row), roomId: getFirst(row, ['room_id', 'room']), wallSide: getFirst(row, ['wall_side', 'side']), offset: toNumber(getFirst(row, ['offset']), 0), width: toNumber(getFirst(row, ['width']), 1), height: toNumber(getFirst(row, ['height']), 1), sillHeight: toNumber(getFirst(row, ['sill_height']), 1) }))
    .filter((item) => item.roomId && item.wallSide)

  return {
    rooms,
    doors,
    windows,
    wallThickness: Math.max(0.1, parsedWallThickness),
    siteName: getFirst(buildingMeta, ['site_name', 'building_name', 'name']) || getFirst(meta, ['site_name', 'building_name', 'name']),
    boundaryPolygon: parseBoundaryFromBuildingMeta(buildingMeta),
  }
}

const pointInPolygon = (point, polygon) => {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x
    const zi = polygon[i].z
    const xj = polygon[j].x
    const zj = polygon[j].z
    const intersect = zi > point.z !== zj > point.z && point.x < ((xj - xi) * (point.z - zi)) / (zj - zi + 1e-12) + xi
    if (intersect) inside = !inside
  }
  return inside
}

const closestPointOnSegment = (point, a, b) => {
  const abx = b.x - a.x
  const abz = b.z - a.z
  const apx = point.x - a.x
  const apz = point.z - a.z
  const len2 = abx * abx + abz * abz
  if (len2 <= 1e-12) return { x: a.x, z: a.z }
  const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / len2))
  return { x: a.x + t * abx, z: a.z + t * abz }
}

const centroid = (polygon) => {
  const total = polygon.reduce((acc, p) => ({ x: acc.x + p.x, z: acc.z + p.z }), { x: 0, z: 0 })
  return { x: total.x / polygon.length, z: total.z / polygon.length }
}

const correctPointInsideBoundary = (point, boundaryPolygon, inwardOffset = 1.5) => {
  if (!Array.isArray(boundaryPolygon) || boundaryPolygon.length < 3) return { ...point, status: 'inside', shiftM: 0 }
  if (pointInPolygon(point, boundaryPolygon)) return { ...point, status: 'inside', shiftM: 0 }
  let nearest = null
  let minDist2 = Number.POSITIVE_INFINITY
  for (let i = 0; i < boundaryPolygon.length; i += 1) {
    const a = boundaryPolygon[i]
    const b = boundaryPolygon[(i + 1) % boundaryPolygon.length]
    const c = closestPointOnSegment(point, a, b)
    const dx = c.x - point.x
    const dz = c.z - point.z
    const dist2 = dx * dx + dz * dz
    if (dist2 < minDist2) {
      minDist2 = dist2
      nearest = c
    }
  }
  const c = centroid(boundaryPolygon)
  const vx = c.x - nearest.x
  const vz = c.z - nearest.z
  const vlen = Math.hypot(vx, vz) || 1
  const candidate = { x: nearest.x + (vx / vlen) * inwardOffset, z: nearest.z + (vz / vlen) * inwardOffset }
  const shiftM = Math.hypot(candidate.x - point.x, candidate.z - point.z)
  return { ...candidate, status: 'adjusted', shiftM }
}

const EARTH_RADIUS_M = 6371000
const latLonToMetersFromMinRef = (lat, lon, minLat, minLon) => {
  const dLat = (lat - minLat) * (Math.PI / 180)
  const dLon = (lon - minLon) * (Math.PI / 180)
  const x = dLon * Math.cos((minLat * Math.PI) / 180) * EARTH_RADIUS_M
  const z = dLat * EARTH_RADIUS_M
  return { x, z }
}

export const parseLogsWorkbook = async (buffer, boundaryPolygon, selectedFloorId = 'level-1') => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const worksheet = workbook.getWorksheet('Logs') || workbook.worksheets[0]
  if (!worksheet) return { error: 'No sheet found in logs Excel.' }
  const rows = worksheetToRows(worksheet)
  if (rows.length === 0) return { error: 'Logs sheet is empty.' }

  const hasLocalCoords = rows.some((row) => Number.isFinite(Number(getFirst(row, ['x', 'pos_x']))))
  const latLonRows = hasLocalCoords
    ? []
    : rows
        .map((row) => ({
          lat: Number(getFirst(row, ['lat', 'latitude'])),
          lon: Number(getFirst(row, ['lon', 'lng', 'longitude'])),
        }))
        .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon))
  const minLat = latLonRows.length ? Math.min(...latLonRows.map((item) => item.lat)) : 0
  const minLon = latLonRows.length ? Math.min(...latLonRows.map((item) => item.lon)) : 0
  const logRows = rows
    .map((row, index) => {
      let x
      let z
      if (hasLocalCoords) {
        x = Number(getFirst(row, ['x', 'pos_x']))
        z = Number(getFirst(row, ['z', 'pos_z', 'y']))
      } else {
        const lat = Number(getFirst(row, ['lat', 'latitude']))
        const lon = Number(getFirst(row, ['lon', 'lng', 'longitude']))
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
        const local = latLonToMetersFromMinRef(lat, lon, minLat, minLon)
        x = local.x
        z = local.z
      }
      if (!Number.isFinite(x) || !Number.isFinite(z)) return null
      const corrected = hasLocalCoords && boundaryPolygon?.length ? correctPointInsideBoundary({ x, z }, boundaryPolygon, 1.5) : { x, z, status: 'inside', shiftM: 0 }
      return {
        id: String(getFirst(row, ['id']) || `L${index + 1}`),
        floorId: String(getFirst(row, ['floor_id', 'floor']) || selectedFloorId),
        x: corrected.x,
        z: corrected.z,
        rsrp: Number(getFirst(row, ['rsrp', 'RSRP', 'lte_rsrp'])),
        rsrq: Number(getFirst(row, ['rsrq', 'RSRQ', 'lte_rsrq'])),
        sinr: Number(getFirst(row, ['sinr', 'SINR', 'lte_sinr'])),
        status: corrected.status,
        shiftM: corrected.shiftM,
        timestamp: String(getFirst(row, ['timestamp', 'time']) || ''),
      }
    })
    .filter(Boolean)

  return {
    logs: logRows,
    total: logRows.length,
    adjusted: logRows.filter((item) => item.status === 'adjusted').length,
    mode: hasLocalCoords ? 'local_xy' : 'latlon_raw',
  }
}

const parseCsvRows = (text) => {
  const rows = []
  let row = []
  let value = ''
  let i = 0
  let inQuotes = false
  while (i < text.length) {
    const char = text[i]
    const next = text[i + 1]
    if (inQuotes) {
      if (char === '"' && next === '"') {
        value += '"'
        i += 2
        continue
      }
      if (char === '"') {
        inQuotes = false
        i += 1
        continue
      }
      value += char
      i += 1
      continue
    }
    if (char === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (char === ',') {
      row.push(value)
      value = ''
      i += 1
      continue
    }
    if (char === '\n') {
      row.push(value)
      rows.push(row)
      row = []
      value = ''
      i += 1
      continue
    }
    if (char === '\r') {
      i += 1
      continue
    }
    value += char
    i += 1
  }
  if (value.length > 0 || row.length > 0) {
    row.push(value)
    rows.push(row)
  }
  return rows
}

export const parseLogsCsv = (text, boundaryPolygon, selectedFloorId = 'level-1') => {
  const csvRows = parseCsvRows(text)
  if (csvRows.length < 2) return { error: 'CSV is empty.' }
  const headers = csvRows[0].map((h) => String(h || '').trim())
  const rows = csvRows.slice(1).map((values) => {
    const obj = {}
    headers.forEach((header, index) => {
      obj[header] = values[index] ?? ''
    })
    return obj
  })

  const hasLocalCoords = rows.some((row) => Number.isFinite(Number(getFirst(row, ['x', 'pos_x']))))
  const latLonRows = hasLocalCoords
    ? []
    : rows
        .map((row) => ({
          lat: Number(getFirst(row, ['lat', 'latitude'])),
          lon: Number(getFirst(row, ['lon', 'lng', 'longitude'])),
        }))
        .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon))
  const minLat = latLonRows.length ? Math.min(...latLonRows.map((item) => item.lat)) : 0
  const minLon = latLonRows.length ? Math.min(...latLonRows.map((item) => item.lon)) : 0
  const logRows = rows
    .map((row, index) => {
      let x
      let z
      if (hasLocalCoords) {
        x = Number(getFirst(row, ['x', 'pos_x']))
        z = Number(getFirst(row, ['z', 'pos_z', 'y']))
      } else {
        const lat = Number(getFirst(row, ['lat', 'latitude']))
        const lon = Number(getFirst(row, ['lon', 'lng', 'longitude']))
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
        const local = latLonToMetersFromMinRef(lat, lon, minLat, minLon)
        x = local.x
        z = local.z
      }
      if (!Number.isFinite(x) || !Number.isFinite(z)) return null
      const corrected = hasLocalCoords && boundaryPolygon?.length ? correctPointInsideBoundary({ x, z }, boundaryPolygon, 1.5) : { x, z, status: 'inside', shiftM: 0 }
      return {
        id: String(getFirst(row, ['id']) || `L${index + 1}`),
        floorId: String(getFirst(row, ['floor_id', 'floor']) || selectedFloorId),
        x: corrected.x,
        z: corrected.z,
        rsrp: Number(getFirst(row, ['rsrp', 'RSRP', 'lte_rsrp'])),
        rsrq: Number(getFirst(row, ['rsrq', 'RSRQ', 'lte_rsrq'])),
        sinr: Number(getFirst(row, ['sinr', 'SINR', 'lte_sinr'])),
        status: corrected.status,
        shiftM: corrected.shiftM,
        timestamp: String(getFirst(row, ['timestamp', 'time']) || ''),
      }
    })
    .filter(Boolean)

  return {
    logs: logRows,
    total: logRows.length,
    adjusted: logRows.filter((item) => item.status === 'adjusted').length,
    mode: hasLocalCoords ? 'local_xy' : 'latlon_raw',
  }
}
