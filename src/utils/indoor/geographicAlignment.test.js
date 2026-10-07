import test from 'node:test'
import assert from 'node:assert/strict'
import { geographicToLocal, getFloorElevations, getPlottableLogs, localToGeographic, projectLogs } from './geographicAlignment.js'
import { parseBuildingWorkbook, parseLogsCsv, parseLogsWorkbook } from './excelPlan.js'
import { buildFloorOptions } from './floorPlan.js'
import { getAvailableLogKpis, getFallbackLogKpiColor } from './indoorLogKpis.js'
import { getLogMetricValue } from './indoorPlanningUtils.js'
import { parseProjectPlan, serializePlanningData } from './planningPersistence.js'

const alignment = { lat: 12, lng: 77, x: 10, z: 20, rotationDeg: 0, referenceFloorId: 'floor-1', unit: 'm' }
const near = (actual, expected, tolerance = 0.00001) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`)

test('anchor, X east, Z north, rotation and reverse mapping', () => {
  assert.deepEqual(geographicToLocal({ lat: 12, lng: 77 }, alignment), { x: 10, z: 20 })
  const east = localToGeographic({ x: 20, z: 20 }, alignment)
  const north = localToGeographic({ x: 10, z: 30 }, alignment)
  assert.ok(east.lng > 77)
  near(east.lat, 12)
  assert.ok(north.lat > 12)
  near(north.lng, 77)
  const rotated = { ...alignment, rotationDeg: 90 }
  const rotatedX = localToGeographic({ x: 20, z: 20 }, rotated)
  near(rotatedX.lng, 77)
  assert.ok(rotatedX.lat > 12)
  const point = { x: -17, z: 45 }
  const restored = geographicToLocal(localToGeographic(point, rotated), rotated)
  near(restored.x, point.x)
  near(restored.z, point.z)
})

test('CSV uploads share one origin, retain floors and raw coordinates, and reproject without clamping', () => {
  const first = parseLogsCsv('lat,lon,floor_id,rsrp,timestamp\n12,77,floor-2,-88,now\n12.001,77.001,,,-\n', null, 'floor-1', alignment)
  const second = parseLogsCsv('lat,lon,floor_id\n12.001,77.001,floor-3\n', null, 'floor-1', alignment)
  assert.equal(first.logs[0].floorId, 'floor-2')
  assert.equal(first.logs[1].floorId, 'floor-1')
  assert.equal(first.logs[0].rsrp, -88)
  assert.equal(first.logs[0].timestamp, 'now')
  assert.equal(first.logs[0].lat, 12)
  assert.equal(first.logs[0].lng, 77)
  near(first.logs[1].x, second.logs[0].x)
  near(first.logs[1].z, second.logs[0].z)
  assert.ok(first.logs[1].x > 100 && first.logs[1].z > 100)
  const changed = projectLogs(first.logs, { ...alignment, x: 30, z: 40 })
  near(changed[0].x, 30)
  near(changed[0].z, 40)
  assert.equal(changed[0].floorId, 'floor-2')
  assert.equal(first.logs[0].x, 10)
})

test('local X/Z rows remain local and need no geographic alignment', () => {
  const parsed = parseLogsCsv('x,z,floor_id,rsrq\n0,0,floor-2,-9\n-5,42,,\n,3,floor-4,-7\n', null, 'floor-1')
  assert.equal(parsed.total, 2)
  assert.equal(parsed.rejected, 1)
  assert.deepEqual(parsed.logs.map(({ x, z, floorId }) => ({ x, z, floorId })), [
    { x: 0, z: 0, floorId: 'floor-2' },
    { x: -5, z: 42, floorId: 'floor-1' },
  ])
  assert.equal(parsed.logs[0].rsrq, -9)
  assert.deepEqual(projectLogs(parsed.logs, alignment), parsed.logs)
})

test('log uploads accept common header casing without requiring a matching floor name', () => {
  const parsed = parseLogsCsv('\uFEFFLatitude,Longitude,Floor ID,RSRP\n12,77,Floor_1,-86\n', null, 'floor-2', alignment)
  assert.equal(parsed.total, 1)
  assert.equal(parsed.rejected, 0)
  assert.equal(parsed.logs[0].floorId, 'Floor_1')
  assert.equal(parsed.logs[0].rsrp, -86)
  assert.deepEqual({ x: parsed.logs[0].x, z: parsed.logs[0].z }, { x: 10, z: 20 })

  assert.equal(getPlottableLogs(projectLogs(parsed.logs, alignment)).length, 1)
  assert.deepEqual(getPlottableLogs([
    { floorId: 'other-building', x: '2', z: '3' },
    { floorId: 'floor-1', x: null, z: null },
  ]), [{ floorId: 'other-building', x: 2, z: 3 }])
})

test('latitude and longitude take priority when a log row also has X and Y', () => {
  const parsed = parseLogsCsv('Latitude,Longitude,X,Y,Floor ID,RSRP\n12,77,999,999,unmatched,-90\n', null, 'floor-1', alignment)
  assert.equal(parsed.total, 1)
  assert.equal(parsed.logs[0].x, 10)
  assert.equal(parsed.logs[0].z, 20)
  assert.equal(getPlottableLogs(parsed.logs).length, 1)
})

test('network log CSV maps combined KPI headers and treats Level as signal level', () => {
  const csv = [
    'Timestamp,Latitude,Longitude,ssRSRP / RSRP / RSCP,ssRSRQ / RSRQ / EcNo,NR-SINR / SINR / RxQual,RSSI  (2G-RxLEV),DL THPT,UL THPT,MOS,Jitter,Latency,Packet Loss,Level',
    'Device MODEL : example',
    '# KPI convention: example',
    '2026-10-07 10:31:59,12,77,-60,-11,9,-51,0.06,0.05,4.09,8.99,25.19,0,4',
  ].join('\n')
  const parsed = parseLogsCsv(csv, null, 'floor-1', alignment)
  assert.equal(parsed.total, 1)
  assert.equal(parsed.rejected, 0)
  assert.equal(parsed.logs[0].floorId, 'floor-1')
  assert.deepEqual([parsed.logs[0].rsrp, parsed.logs[0].rsrq, parsed.logs[0].sinr, parsed.logs[0].rssi], [-60, -11, 9, -51])
  assert.deepEqual([parsed.logs[0].dl_thpt, parsed.logs[0].ul_thpt, parsed.logs[0].mos, parsed.logs[0].jitter, parsed.logs[0].latency, parsed.logs[0].packet_loss, parsed.logs[0].level], [0.06, 0.05, 4.09, 8.99, 25.19, 0, 4])
  assert.deepEqual(getAvailableLogKpis(parsed.logs).map((kpi) => kpi.key), ['rsrp', 'rsrq', 'sinr', 'rssi', 'dl_thpt', 'ul_thpt', 'mos', 'jitter', 'latency', 'packet_loss', 'level'])
  assert.notEqual(getFallbackLogKpiColor(getLogMetricValue(parsed.logs[0], 'rsrp'), 'rsrp'), getFallbackLogKpiColor(getLogMetricValue(parsed.logs[0], 'dl_thpt'), 'dl_thpt'))
  assert.ok(Number.isNaN(getLogMetricValue(parsed.logs[0], 'cqi')))
})

test('CSV and XLSX reject invalid coordinates; unaligned geographic rows wait for alignment', async () => {
  const csv = parseLogsCsv('lat,lon,floor\n,77,floor-2\n91,77,floor-2\n12,77,\n', null, 'floor-1')
  assert.equal(csv.rejected, 2)
  assert.equal(csv.pendingAlignment, 1)
  assert.equal(csv.logs[0].x, null)
  assert.equal(csv.logs[0].floorId, 'floor-1')
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Logs')
  sheet.addRow(['latitude', 'longitude', 'floor_id', 'sinr'])
  sheet.addRow([12, 77, 'floor-3', 12])
  sheet.addRow([null, 77, 'floor-2', 10])
  const xlsx = await parseLogsWorkbook(await workbook.xlsx.writeBuffer(), null, 'floor-1', alignment)
  assert.equal(xlsx.total, 1)
  assert.equal(xlsx.rejected, 1)
  assert.equal(xlsx.logs[0].floorId, 'floor-3')
  assert.equal(xlsx.logs[0].sinr, 12)
  assert.equal(xlsx.logs[0].lat, 12)
  assert.equal(xlsx.logs[0].lng, 77)
})

test('floor order and elevations use floor spacing rather than room wall height', () => {
  const rooms = [
    { floorId: 'floor-10', floorName: 'Floor 10', height: 7 },
    { floorId: 'floor-2', floorName: 'Floor 2', height: 2, floorElevationM: 8 },
    { floorId: 'floor-1', floorName: 'Floor 1', height: 5 },
  ]
  const floors = buildFloorOptions(rooms)
  assert.deepEqual(floors.map((floor) => floor.id), ['floor-1', 'floor-2', 'floor-10'])
  const elevations = getFloorElevations(floors, rooms, 3.5)
  assert.equal(elevations.get('floor-1'), 0)
  assert.equal(elevations.get('floor-2'), 8)
  assert.equal(elevations.get('floor-10'), 11.5)
})

test('building workbook converts feet to metres and keeps floor height separate', async () => {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const meta = workbook.addWorksheet('BuildingMeta')
  meta.addRow(['unit', 'floor_height', 'wall_thickness'])
  meta.addRow(['ft', 12, 0.5])
  const floor = workbook.addWorksheet('Floor_1')
  floor.addRow(['room_name', 'x', 'z', 'width', 'depth', 'height'])
  floor.addRow(['Hall', 10, 20, 30, 40, 9])
  const result = await parseBuildingWorkbook(await workbook.xlsx.writeBuffer())
  near(result.rooms[0].x, 3.048)
  near(result.rooms[0].width, 9.144)
  near(result.rooms[0].height, 2.7432)
  near(result.rooms[0].floorHeightM, 3.6576)
  near(result.wallThickness, 0.1524)
})

test('planJson restores alignment and logs; older unaligned plans remain readable', () => {
  const logs = [{ id: 'one', floorId: 'floor-2', lat: 12, lng: 77, x: 10, z: 20 }]
  const restored = parseProjectPlan({ PlanJson: serializePlanningData({ alignment, logs, rooms: [] }) })
  assert.deepEqual(restored.alignment, alignment)
  assert.deepEqual(restored.logs, logs)
  assert.deepEqual(parseProjectPlan({ planJson: '{"rooms":[]}' }), { rooms: [] })
  assert.equal(parseProjectPlan({ planJson: 'invalid json' }), null)
})
