import { MAX_SHEET_ROWS } from '../../config/indoor/floorPlannerConfig.js'
import { floorSheetNumber, getFirst, getFloorIdentity, toNumber } from './floorPlan.js'
import { geographicToLocal, isValidLatLng } from './geographicAlignment.js'

const loadExcelJS = async () => {
  const module = await import('exceljs')
  return module.default || module
}

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

export const createReviewedDetectedWorkbook = async (detectedPlan, selectedFloor) => {
  const ExcelJS = await loadExcelJS()
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
  const ExcelJS = await loadExcelJS()
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
  const unit = String(getFirst(buildingMeta, ['unit']) || getFirst(meta, ['unit']) || 'm').trim().toLowerCase()
  const unitScale = { m: 1, metre: 1, metres: 1, meter: 1, meters: 1, ft: 0.3048, feet: 0.3048, foot: 0.3048, cm: 0.01, mm: 0.001 }
  const metresPerUnit = unitScale[unit]
  if (!metresPerUnit) return { error: `Unsupported building unit "${unit}". Use m, ft, cm or mm.` }
  const metaByFloorId = new Map(metaRows.map((row, index) => {
    const identity = getFloorIdentity(row, `level-${index + 1}`, `Level ${index + 1}`)
    return [identity.floorId, { ...row, ...identity }]
  }))
  const defaultHeight = toNumber(getFirst(meta, ['ceiling_height', 'height']) ?? getFirst(buildingMeta, ['ceiling_height', 'height']), 3)
  const parsedWallThickness = toNumber(getFirst(meta, ['wall_thickness', 'wall']) ?? getFirst(buildingMeta, ['wall_thickness', 'wall']), 0.2)

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
        floorElevationM: getFirst(floorMeta || {}, ['floor_elevation_m', 'elevation_m']) !== undefined
          ? toNumber(getFirst(floorMeta || {}, ['floor_elevation_m', 'elevation_m']), NaN)
          : toNumber(getFirst(floorMeta || {}, ['floor_elevation', 'elevation']), NaN) * metresPerUnit,
        floorHeightM: toNumber(getFirst(floorMeta || {}, ['floor_height', 'floor_to_floor_height']) ?? getFirst(buildingMeta, ['floor_height', 'floor_to_floor_height']), NaN) * metresPerUnit,
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
    rooms: rooms.map((room) => ({ ...room, x: room.x * metresPerUnit, z: room.z * metresPerUnit, width: room.width * metresPerUnit, depth: room.depth * metresPerUnit, height: room.height * metresPerUnit, radius: room.radius === undefined ? undefined : room.radius * metresPerUnit, polygonPoints: room.polygonPoints?.map((point) => ({ x: point.x * metresPerUnit, z: point.z * metresPerUnit })) })),
    doors: doors.map((door) => ({ ...door, offset: door.offset * metresPerUnit, width: door.width * metresPerUnit, height: door.height * metresPerUnit })),
    windows: windows.map((windowItem) => ({ ...windowItem, offset: windowItem.offset * metresPerUnit, width: windowItem.width * metresPerUnit, height: windowItem.height * metresPerUnit, sillHeight: windowItem.sillHeight * metresPerUnit })),
    wallThickness: Math.max(0.03, parsedWallThickness * metresPerUnit),
    siteName: getFirst(buildingMeta, ['site_name', 'building_name', 'name']) || getFirst(meta, ['site_name', 'building_name', 'name']),
    boundaryPolygon: parseBoundaryFromBuildingMeta(buildingMeta)?.map((point) => ({ x: point.x * metresPerUnit, z: point.z * metresPerUnit })) || null,
  }
}

const coordinate = (row, keys) => {
  const value = getFirst(row, keys)
  if (value === undefined || value === null || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export const parseLogRows = (rows, selectedFloorId = 'level-1', alignment = null) => {
  let rejected = 0
  const logs = rows.map((row, index) => {
    const localX = coordinate(row, ['x', 'pos_x'])
    const localZ = coordinate(row, ['z', 'pos_z', 'y'])
    const lat = coordinate(row, ['lat', 'latitude'])
    const lng = coordinate(row, ['lon', 'lng', 'longitude'])
    const geographic = localX === null && localZ === null
    if (geographic ? !isValidLatLng(lat, lng) : localX === null || localZ === null) {
      rejected += 1
      return null
    }
    const position = geographic ? geographicToLocal({ lat, lng }, alignment) : { x: localX, z: localZ }
    const metric = (keys) => coordinate(row, keys)
    return {
      id: String(getFirst(row, ['id']) || `L${index + 1}`),
      floorId: String(getFirst(row, ['floor_id', 'floor']) || selectedFloorId),
      x: position?.x ?? null,
      z: position?.z ?? null,
      ...(geographic ? { lat, lng } : {}),
      rsrp: metric(['rsrp', 'RSRP', 'lte_rsrp']),
      rsrq: metric(['rsrq', 'RSRQ', 'lte_rsrq']),
      sinr: metric(['sinr', 'SINR', 'lte_sinr']),
      timestamp: String(getFirst(row, ['timestamp', 'time']) || ''),
    }
  }).filter(Boolean)
  return { logs, total: logs.length, rejected, pendingAlignment: logs.filter((log) => log.lat !== undefined && log.x === null).length }
}

export const parseLogsWorkbook = async (buffer, _boundaryPolygon, selectedFloorId = 'level-1', alignment = null) => {
  const ExcelJS = await loadExcelJS()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const worksheet = workbook.getWorksheet('Logs') || workbook.worksheets[0]
  if (!worksheet) return { error: 'No sheet found in logs Excel.' }
  const rows = worksheetToRows(worksheet)
  if (rows.length === 0) return { error: 'Logs sheet is empty.' }
  return parseLogRows(rows, selectedFloorId, alignment)
}

const parseCsvRows = (text) => {
  const rows = []
  let row = []
  let value = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') { value += '"'; i += 1 } else inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      row.push(value); value = ''
    } else if (char === '\n' && !inQuotes) {
      row.push(value); rows.push(row); row = []; value = ''
    } else if (char !== '\r' || inQuotes) value += char
  }
  if (value || row.length) { row.push(value); rows.push(row) }
  return rows
}

export const parseLogsCsv = (text, _boundaryPolygon, selectedFloorId = 'level-1', alignment = null) => {
  const csvRows = parseCsvRows(text)
  if (csvRows.length < 2) return { error: 'CSV is empty.' }
  const headers = csvRows[0].map((header) => String(header || '').trim())
  const rows = csvRows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])))
  return parseLogRows(rows, selectedFloorId, alignment)
}
