import { useEffect, useMemo, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import { FloorModel } from '@/components/indoor/FloorModel'
import IndoorPlanningSidebar from '@/components/indoor/IndoorPlanningSidebar'
import { ALLOWED_EXCEL_TYPES, ALLOWED_IMAGE_TYPES, initialRooms, MAX_EXCEL_BYTES, MAX_IMAGE_BYTES } from '@/config/indoor/floorPlannerConfig'
import { createStoryBuildingTemplateWorkbook } from '@/templates/indoor/buildingTemplate'
import { createReviewedDetectedWorkbook, downloadWorkbook, parseBuildingWorkbook, parseLogsWorkbook, parseLogsCsv } from '@/utils/indoor/excelPlan'
import { buildFloorOptions, getOverlapWarnings, getVisiblePlan, hasAllowedExtension, normalizeParsedPlan, toNumber } from '@/utils/indoor/floorPlan'
import { buildAggregatedLogGridCells, getLogMetricValue } from '@/utils/indoor/indoorPlanningUtils'
import { pythonApi } from '@/api/pythonApiService'
import { indoorPlanningApi } from '@/api/apiEndpoints'
import useColorForLog from '@/hooks/useColorForLog'

const WALL_TYPE_OPTIONS = [
  { value: 'drywall', label: 'Drywall / Plasterboard' },
  { value: 'glass', label: 'Glass' },
  { value: 'wooden', label: 'Wooden' },
  { value: 'concrete', label: 'Concrete' },
]

const WALL_LOSS_BY_TYPE = {
  drywall: 4,
  glass: 4,
  wooden: 6,
  concrete: 25,
}

const FURNITURE_CONFIG = {
  sofa: { label: 'Sofa', width: 2.4, depth: 0.9 },
  almirah: { label: 'Almirah', width: 1.2, depth: 0.55 },
  bed: { label: 'Bed', width: 2.1, depth: 1.6 },
}

const KPI_META = {
  rsrp: { label: 'RSRP', unit: 'dBm' },
  rsrq: { label: 'RSRQ', unit: 'dB' },
  sinr: { label: 'SINR', unit: 'dB' },
}

const formatKpiRange = (item, unit) => {
  if (item?.range) return item.range
  const min = Number(item?.min)
  const max = Number(item?.max)
  if (Number.isFinite(min) && Number.isFinite(max)) return `${min} to ${max} ${unit}`
  if (Number.isFinite(min)) return `${min}+ ${unit}`
  if (Number.isFinite(max)) return `< ${max} ${unit}`
  return unit
}

const buildDefaultSiteSectors = (baseAzimuth = 0) => {
  const base = Number(baseAzimuth) || 0
  return [0, 120, 240].map((offset, index) => ({
    id: `sector-${index + 1}`,
    name: `Sector ${index + 1}`,
    azimuthDeg: (base + offset + 360) % 360,
    beamwidthDeg: 120,
    txPowerDbm: 30,
    antennaGainDbi: 0,
  }))
}

const getProjectName = (project) => project?.name || project?.Name || project?.projectName || project?.ProjectName
const getProjectPlanJson = (project) => project?.planJson || project?.PlanJson || project?.plan_json

const parseProjectPlan = (project) => {
  const value = getProjectPlanJson(project)
  if (!value) return null
  if (typeof value === 'object') return value
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function IndoorPlaning() {
  const { projectId } = useParams()
  const location = useLocation()
  const [siteName, setSiteName] = useState('Network C - Block A')
  const [selectedFloorId, setSelectedFloorId] = useState('level-1')
  const [wallThickness, setWallThickness] = useState(0.2)
  const [newRoom, setNewRoom] = useState({ name: '', width: 6, depth: 4, height: 3, x: 0, z: 0 })
  const [rooms, setRooms] = useState(initialRooms)
  const [doors, setDoors] = useState([])
  const [windows, setWindows] = useState([])
  const [logs, setLogs] = useState([])
  const [showLogs, setShowLogs] = useState(true)
  const [showLogGrid, setShowLogGrid] = useState(false)
  const [logGridSizeM, setLogGridSizeM] = useState(1)
  const [logGridAggregation, setLogGridAggregation] = useState('mean')
  const [showAddRoomPanel, setShowAddRoomPanel] = useState(false)
  const [showIndoorPlanningPanel, setShowIndoorPlanningPanel] = useState(false)
  const [boundaryPolygon, setBoundaryPolygon] = useState(null)
  const [uploadMessage, setUploadMessage] = useState('Upload BuildingMeta + Floor_1/Floor_2 sheets with shape columns (rectangle/circle/polygon), or FloorMeta + Rooms.')
  const [logsMessage, setLogsMessage] = useState('Upload logs file (.xlsx or .csv) after building upload. ')
  const [imageMessage, setImageMessage] = useState('Upload floorplan image to auto-extract room data from ML backend.')
  const [isParsingImage, setIsParsingImage] = useState(false)
  const [detectedPlan, setDetectedPlan] = useState(null)
  const [sites, setSites] = useState([])
  const [wifiPoints, setWifiPoints] = useState([])
  const [furniture, setFurniture] = useState([])
  const [interiorWalls, setInteriorWalls] = useState([])
  const [draftWallStart, setDraftWallStart] = useState(null)
  const [drawHoverPoint, setDrawHoverPoint] = useState(null)
  const [snapToGrid, setSnapToGrid] = useState(true)
  const [placementMode, setPlacementMode] = useState(null)
  const [viewMode, setViewMode] = useState('2d')
  const [showDrawMenu, setShowDrawMenu] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [selectedWall, setSelectedWall] = useState(null)
  const [wallTypes, setWallTypes] = useState({})
  const [dragTarget, setDragTarget] = useState(null)
  const [predictions, setPredictions] = useState([])
  const [siteForm, setSiteForm] = useState({ name: 'Site-1', technology: '4G', antennaPattern: 'omni', x: 2, z: 2, heightM: 3, coneHeightM: '', txPowerDbm: 30, freqMHz: 3500, antennaGainDbi: 0, azimuthDeg: 0 })
  const [wifiForm, setWifiForm] = useState({ name: 'Wi-Fi 1', antennaPattern: 'omni', x: 3, z: 3, heightM: 2.6, txPowerDbm: 20, freqMHz: 2400, antennaGainDbi: 2, azimuthDeg: 0 })
  const [rfConfig, setRfConfig] = useState({ wallLossDb: 20, doorLossDb: 10, gridStepM: 1.2, rxGainDbi: 0 })
  const [logMetric, setLogMetric] = useState('rsrp')
  const inputClass = 'rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm'
  const buttonClass = 'cursor-pointer rounded-lg bg-white   px-3 py-1 text-black border  border-black-500'
  const dangerButtonClass = 'cursor-pointer rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs text-white'
  const { getMetricColor, getThresholdsForMetric } = useColorForLog()
  const thresholdLegend = useMemo(() => {
    const rows = getThresholdsForMetric(logMetric) || []
    return [...rows].sort((a, b) => Number(a.min) - Number(b.min))
  }, [getThresholdsForMetric, logMetric])

  const snapPoint = (point) => {
    const step = 0.5
    if (!snapToGrid) return point
    return {
      x: Math.round(Number(point.x) / step) * step,
      z: Math.round(Number(point.z) / step) * step,
    }
  }

  useEffect(() => {
    let cancelled = false

    const applyProject = (project) => {
      if (!project || cancelled) return

      const name = getProjectName(project)
      if (name) setSiteName(name)

      const plan = parseProjectPlan(project)
      if (!plan) return

      if (plan.siteName || plan.site_name) setSiteName(String(plan.siteName || plan.site_name))
      if (Array.isArray(plan.rooms) && plan.rooms.length > 0) setRooms(plan.rooms)
      if (Array.isArray(plan.doors)) setDoors(plan.doors)
      if (Array.isArray(plan.windows)) setWindows(plan.windows)
      if (Array.isArray(plan.sites)) setSites(plan.sites)
      if (Array.isArray(plan.wifiPoints)) setWifiPoints(plan.wifiPoints)
      if (Array.isArray(plan.furniture)) setFurniture(plan.furniture)
      if (Array.isArray(plan.interiorWalls)) setInteriorWalls(plan.interiorWalls)
      if (plan.wallTypes && typeof plan.wallTypes === 'object') setWallTypes(plan.wallTypes)
      if (Number.isFinite(Number(plan.wallThickness ?? plan.wall_thickness))) setWallThickness(Number(plan.wallThickness ?? plan.wall_thickness))
      if (plan.selectedFloorId || plan.selected_floor_id) setSelectedFloorId(String(plan.selectedFloorId || plan.selected_floor_id))
    }

    const routeProject = location.state?.indoorProject
    applyProject(routeProject)

    if (!projectId) return () => {
      cancelled = true
    }

    const loadProject = async () => {
      try {
        const project = await indoorPlanningApi.getProject(projectId)
        applyProject(project?.project || project)
      } catch (err) {
        if (!cancelled) setImageMessage(err?.message || 'Could not load indoor planning project.')
      }
    }

    loadProject()
    return () => {
      cancelled = true
    }
  }, [location.state, projectId])

  const floors = useMemo(() => buildFloorOptions(rooms), [rooms])
  const selectedFloor = useMemo(() => floors.find((floor) => floor.id === selectedFloorId) || floors[0] || { id: 'level-1', name: 'Level 1' }, [floors, selectedFloorId])
  const { visibleRooms, visibleDoors, visibleWindows } = useMemo(() => getVisiblePlan({ rooms, doors, windows, selectedFloor }), [rooms, doors, windows, selectedFloor])
  const visibleLogs = useMemo(() => logs.filter((item) => (item.floorId || 'level-1') === selectedFloor.id), [logs, selectedFloor])
  const floorBoundsById = useMemo(() => {
    const byFloor = new Map()
    rooms.forEach((room) => {
      const floorId = room.floorId || 'level-1'
      const current = byFloor.get(floorId) || { minX: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, minZ: Number.POSITIVE_INFINITY, maxZ: Number.NEGATIVE_INFINITY }
      const minX = Number(room.x)
      const minZ = Number(room.z)
      const maxX = Number(room.x) + Number(room.width)
      const maxZ = Number(room.z) + Number(room.depth)
      if (!Number.isFinite(minX) || !Number.isFinite(minZ) || !Number.isFinite(maxX) || !Number.isFinite(maxZ)) return
      byFloor.set(floorId, {
        minX: Math.min(current.minX, minX),
        maxX: Math.max(current.maxX, maxX),
        minZ: Math.min(current.minZ, minZ),
        maxZ: Math.max(current.maxZ, maxZ),
      })
    })
    return byFloor
  }, [rooms])

  const bringLogsInsideMesh = (parsedLogs) => {
    const inset = Math.max(0.05, Number(wallThickness || 0.2) / 2)
    let adjustedCount = 0
    const logsInside = parsedLogs.map((item) => {
      const floorId = item.floorId || selectedFloor.id
      const bounds = floorBoundsById.get(floorId) || floorBoundsById.get(selectedFloor.id)
      if (!bounds) return item
      const minX = bounds.minX + inset
      const maxX = bounds.maxX - inset
      const minZ = bounds.minZ + inset
      const maxZ = bounds.maxZ - inset
      const clampedX = Math.min(maxX, Math.max(minX, Number(item.x)))
      const clampedZ = Math.min(maxZ, Math.max(minZ, Number(item.z)))
      const moved = Math.abs(clampedX - Number(item.x)) > 1e-9 || Math.abs(clampedZ - Number(item.z)) > 1e-9
      if (!moved) return item
      adjustedCount += 1
      return {
        ...item,
        x: clampedX,
        z: clampedZ,
        status: 'adjusted',
        shiftM: Math.hypot(clampedX - Number(item.x), clampedZ - Number(item.z)),
      }
    })
    return { logsInside, adjustedCount }
  }
  const coloredVisibleLogs = useMemo(() => {
    return visibleLogs.map((item) => {
      const metricValue = getLogMetricValue(item, logMetric)
      const color = Number.isFinite(metricValue) ? getMetricColor(metricValue, logMetric) : '#808080'
      return { ...item, color }
    })
  }, [visibleLogs, logMetric, getMetricColor])
  const aggregatedLogGridCells = useMemo(() => {
    return buildAggregatedLogGridCells({
      enabled: showLogGrid,
      showLogs,
      logs: coloredVisibleLogs,
      rooms: visibleRooms,
      gridSizeM: logGridSizeM,
      aggregationMethod: logGridAggregation,
      metric: logMetric,
      getMetricColor,
    })
  }, [showLogGrid, showLogs, coloredVisibleLogs, visibleRooms, logGridSizeM, logGridAggregation, logMetric, getMetricColor])
  const gridCoverageSummary = useMemo(() => {
    const size = Math.max(1, Number(logGridSizeM) || 1)
    const rectangularRooms = visibleRooms.filter((room) => String(room.shape || 'rectangle').toLowerCase() === 'rectangle')
    const totalCells = rectangularRooms.reduce((sum, room) => {
      const cols = Math.max(0, Math.ceil(Number(room.width) / size))
      const rows = Math.max(0, Math.ceil(Number(room.depth) / size))
      return sum + cols * rows
    }, 0)
    const coveredCells = aggregatedLogGridCells.length
    const emptyCells = Math.max(0, totalCells - coveredCells)
    return {
      totalCells,
      coveredCells,
      emptyCells,
      coveredArea: coveredCells * size * size,
      emptyArea: emptyCells * size * size,
    }
  }, [visibleRooms, logGridSizeM, aggregatedLogGridCells])
  const totalArea = useMemo(() => visibleRooms.reduce((sum, room) => sum + room.width * room.depth, 0).toFixed(2), [visibleRooms])
  const overlapWarnings = useMemo(() => getOverlapWarnings(visibleRooms), [visibleRooms])
  const simSummary = useMemo(() => {
    if (predictions.length === 0) return null
    const vals = predictions.map((p) => p.rssiDbm)
    const rsrqVals = predictions.map((p) => p.rsrqDb)
    const sinrVals = predictions.map((p) => p.sinrDb)
    const qualityVals = predictions.map((p) => p.qualityScore)
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length
    const avgRsrq = rsrqVals.reduce((a, b) => a + b, 0) / rsrqVals.length
    const avgSinr = sinrVals.reduce((a, b) => a + b, 0) / sinrVals.length
    const avgQuality = qualityVals.reduce((a, b) => a + b, 0) / qualityVals.length
    return {
      min: Math.min(...vals).toFixed(1),
      max: Math.max(...vals).toFixed(1),
      avg: avg.toFixed(1),
      avgRsrq: avgRsrq.toFixed(1),
      avgSinr: avgSinr.toFixed(1),
      avgQuality: avgQuality.toFixed(1),
    }
  }, [predictions])

  const getDoorOnWall = (room, wallSide, offsetM) =>
    visibleDoors.some((door) => {
      if (String(door.roomId) !== String(room.id)) return false
      if (String(door.wallSide || '').toLowerCase() !== wallSide) return false
      const minOffset = Number(door.offset || 0)
      const maxOffset = minOffset + Number(door.width || 1)
      return offsetM >= minOffset && offsetM <= maxOffset
    })

  const getWallType = (roomId, side) => wallTypes[`${roomId}:${side}`]

  const getSelectedWallTypeKey = () => {
    if (!selectedWall) return null
    if (selectedWall.wallId) return `interior:${selectedWall.wallId}`
    return `${selectedWall.roomId}:${selectedWall.side}`
  }

  const selectedWallType = selectedWall ? wallTypes[getSelectedWallTypeKey()] || 'drywall' : 'drywall'

  const setSelectedWallType = (wallType) => {
    if (!selectedWall) return
    const key = getSelectedWallTypeKey()
    if (!key) return
    setWallTypes((current) => ({ ...current, [key]: wallType }))
  }

  const removeSelectedInteriorWall = () => {
    if (!selectedWall?.wallId) return
    setInteriorWalls((current) => current.filter((wall) => wall.id !== selectedWall.wallId))
    setWallTypes((current) => {
      const next = { ...current }
      delete next[`interior:${selectedWall.wallId}`]
      return next
    })
    setSelectedWall(null)
  }

  const segmentsIntersect = (a, b, c, d) => {
    const cross = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x)
    const abC = cross(a, b, c)
    const abD = cross(a, b, d)
    const cdA = cross(c, d, a)
    const cdB = cross(c, d, b)
    return abC * abD < 0 && cdA * cdB < 0
  }

  const wallIntersections = (sx, sz, tx, tz) => {
    const crossed = []
    visibleRooms.forEach((room) => {
      if (room.shape && room.shape !== 'rectangle') return
      const x1 = room.x
      const x2 = room.x + room.width
      const z1 = room.z
      const z2 = room.z + room.depth
      const dx = tx - sx
      const dz = tz - sz
      const eps = 1e-9
      if (Math.abs(dx) > eps) {
        const tWest = (x1 - sx) / dx
        const zWest = sz + tWest * dz
        if (tWest > 0 && tWest < 1 && zWest >= z1 && zWest <= z2) crossed.push({ room, side: 'west', offset: zWest - z1 })
        const tEast = (x2 - sx) / dx
        const zEast = sz + tEast * dz
        if (tEast > 0 && tEast < 1 && zEast >= z1 && zEast <= z2) crossed.push({ room, side: 'east', offset: zEast - z1 })
      }
      if (Math.abs(dz) > eps) {
        const tNorth = (z1 - sz) / dz
        const xNorth = sx + tNorth * dx
        if (tNorth > 0 && tNorth < 1 && xNorth >= x1 && xNorth <= x2) crossed.push({ room, side: 'north', offset: xNorth - x1 })
        const tSouth = (z2 - sz) / dz
        const xSouth = sx + tSouth * dx
        if (tSouth > 0 && tSouth < 1 && xSouth >= x1 && xSouth <= x2) crossed.push({ room, side: 'south', offset: xSouth - x1 })
      }
    })
    interiorWalls
      .filter((wall) => (wall.floorId || selectedFloor.id) === selectedFloor.id)
      .forEach((wall) => {
        const source = { x: sx, z: sz }
        const target = { x: tx, z: tz }
        const start = { x: Number(wall.x1), z: Number(wall.z1) }
        const end = { x: Number(wall.x2), z: Number(wall.z2) }
        if ([start.x, start.z, end.x, end.z].every(Number.isFinite) && segmentsIntersect(source, target, start, end)) {
          crossed.push({ interiorWallId: wall.id })
        }
      })
    return crossed
  }

  const runIndoorPrediction = () => {
    const predictionSources = [...sites, ...wifiPoints]
    if (predictionSources.length === 0 || visibleRooms.length === 0) return
    const step = Math.max(0.6, Number(rfConfig.gridStepM) || 1.2)
    const wallLoss = Math.max(0, Number(rfConfig.wallLossDb) || 8)
    const doorLoss = Math.max(0, Number(rfConfig.doorLossDb) || 2.5)
    const points = []
    let idx = 1
    for (const room of visibleRooms) {
      if (room.shape && room.shape !== 'rectangle') continue
      for (let x = room.x + 0.4; x < room.x + room.width; x += step) {
        for (let z = room.z + 0.4; z < room.z + room.depth; z += step) {
          let bestRssi = -140
          for (const site of predictionSources) {
            const dx = x - site.x
            const dz = z - site.z
            const distM = Math.max(1, Math.hypot(dx, dz))
            const distKm = distM / 1000
            const fspl = 32.44 + 20 * Math.log10(site.freqMHz) + 20 * Math.log10(distKm)
            const walls = wallIntersections(site.x, site.z, x, z)
            const penetrationLoss = walls.reduce((sum, w) => {
              const hasDoor = getDoorOnWall(w.room, w.side, w.offset)
              const explicitWallType = w.interiorWallId ? wallTypes[`interior:${w.interiorWallId}`] : getWallType(w.room.id, w.side)
              const typedWallLoss = explicitWallType ? WALL_LOSS_BY_TYPE[explicitWallType] ?? wallLoss : wallLoss
              return sum + (hasDoor ? doorLoss : typedWallLoss)
            }, 0)
            const txGain = Number(site.antennaGainDbi) || 0
            const rxGain = Number(rfConfig.rxGainDbi) || 0
            const antennaPattern = String(site.antennaPattern || 'omni').toLowerCase()
            const az = Number(site.azimuthDeg) || 0
            const bearing = (Math.atan2(dz, dx) * 180) / Math.PI
            const normBearing = ((bearing % 360) + 360) % 360
            const normAz = ((az % 360) + 360) % 360
            const angleDiff = Math.abs(((normBearing - normAz + 540) % 360) - 180)
            const directionLoss = antennaPattern === 'directional' ? (angleDiff <= 60 ? 0 : (angleDiff - 60) * 0.12) : 0
            const rssi = site.txPowerDbm + txGain + rxGain - fspl - penetrationLoss - directionLoss
            if (rssi > bestRssi) bestRssi = rssi
          }
          const rsrq = Math.max(-20, Math.min(-3, -3 - ((-60 - bestRssi) * 0.18)))
          const sinr = Math.max(-10, Math.min(30, bestRssi + 110 - 2))
          const rsrpNorm = Math.max(0, Math.min(1, (bestRssi + 140) / 96))
          const rsrqNorm = Math.max(0, Math.min(1, (rsrq + 20) / 17))
          const sinrNorm = Math.max(0, Math.min(1, (sinr + 10) / 40))
          const qualityScore = (rsrpNorm * 0.5 + rsrqNorm * 0.2 + sinrNorm * 0.3) * 100
          const metricValue = logMetric === 'rsrq' ? rsrq : logMetric === 'sinr' ? sinr : bestRssi
          const color = getMetricColor(metricValue, logMetric)
          points.push({
            id: idx++,
            roomId: room.id,
            roomKey: `${room.id}:${room.x}:${room.z}:${room.width}:${room.depth}`,
            x,
            z,
            rssiDbm: bestRssi,
            rsrqDb: rsrq,
            sinrDb: sinr,
            qualityScore,
            color,
            metricValue,
          })
        }
      }
    }
    setPredictions(points)
  }

  const applyPlanToScene = (plan, sourceLabel) => {
    if (!plan || plan.rooms.length === 0) {
      setImageMessage(`No valid rooms returned from ${sourceLabel}.`)
      return
    }
    setRooms(plan.rooms)
    setDoors(plan.doors)
    setWindows(plan.windows)
    setFurniture([])
    setWifiPoints([])
    setInteriorWalls([])
    setDraftWallStart(null)
    setWallTypes({})
    setSelectedWall(null)
    setWallThickness(plan.wallThickness)
    if (plan.siteName) setSiteName(String(plan.siteName))
    setSelectedFloorId(plan.rooms[0].floorId || 'level-1')
    setImageMessage(`Applied ${plan.rooms.length} rooms from ${sourceLabel}.`)
  }

  const addRoom = (event) => {
    event?.preventDefault?.()
    const nextName = newRoom.name.trim() || `Room-${visibleRooms.length + 1}`
    setRooms((current) => [
      ...current,
      {
        id: `R${current.length + 1}`,
        floorId: selectedFloor.id,
        floorName: selectedFloor.name,
        ...newRoom,
        name: nextName,
      },
    ])
    setNewRoom((current) => ({ ...current, name: '' }))
  }

  const removeRoom = (id) => setRooms((current) => current.filter((room) => room.id !== id))
  const addSite = (event, position = {}) => {
    event?.preventDefault?.()
    const item = {
      id: `S${sites.length + 1}`,
      name: siteForm.name.trim() || `Site-${sites.length + 1}`,
      technology: String(siteForm.technology || '').trim() || '4G',
      antennaPattern: siteForm.antennaPattern === 'directional' ? 'directional' : 'omni',
      x: Number.isFinite(Number(position.x)) ? Number(position.x) : Number(siteForm.x) || 0,
      z: Number.isFinite(Number(position.z)) ? Number(position.z) : Number(siteForm.z) || 0,
      heightM: Math.max(0.5, Math.min(200, Number(siteForm.heightM) || 3)),
      coneHeightM: Number.isFinite(Number(siteForm.coneHeightM)) && Number(siteForm.coneHeightM) > 0 ? Number(siteForm.coneHeightM) : null,
      txPowerDbm: Number(siteForm.txPowerDbm) || 30,
      freqMHz: Number(siteForm.freqMHz) || 3500,
      antennaGainDbi: Number(siteForm.antennaGainDbi) || 0,
      azimuthDeg: Number(siteForm.azimuthDeg) || 0,
      sectors: buildDefaultSiteSectors(siteForm.azimuthDeg).map((sector) => ({
        ...sector,
        technology: String(siteForm.technology || '').trim() || '4G',
        txPowerDbm: Number(siteForm.txPowerDbm) || 30,
        antennaGainDbi: Number(siteForm.antennaGainDbi) || 0,
      })),
    }
    setSites((prev) => [...prev, item])
    setSiteForm((prev) => ({ ...prev, name: `Site-${sites.length + 2}` }))
  }
  const removeSite = (id) => setSites((prev) => prev.filter((s) => s.id !== id))
  const updateSite = (id, key, value) => {
    setSites((prev) =>
      prev.map((site) => {
        if (site.id !== id) return site
        if (key === 'name' || key === 'technology' || key === 'antennaPattern') return { ...site, [key]: value }
        if (key === 'coneHeightM') {
          const n = Number(value)
          return { ...site, [key]: Number.isFinite(n) && n > 0 ? n : null }
        }
        if (key === 'heightM') {
          const n = Number(value)
          return { ...site, [key]: Number.isFinite(n) ? Math.max(0.5, Math.min(200, n)) : site.heightM }
        }
        return { ...site, [key]: Number(value) || 0 }
      }),
    )
  }

  const addWifiPoint = (x = Number(wifiForm.x) || 0, z = Number(wifiForm.z) || 0) => {
    const nextIndex = wifiPoints.length + 1
    setWifiPoints((prev) => [
      ...prev,
      {
        id: `WIFI${nextIndex}`,
        name: wifiForm.name.trim() || `Wi-Fi ${nextIndex}`,
        antennaPattern: wifiForm.antennaPattern === 'directional' ? 'directional' : 'omni',
        x,
        z,
        heightM: Math.max(0.5, Number(wifiForm.heightM) || 2.6),
        txPowerDbm: Number(wifiForm.txPowerDbm) || 20,
        freqMHz: Number(wifiForm.freqMHz) || 2400,
        antennaGainDbi: Number(wifiForm.antennaGainDbi) || 0,
        azimuthDeg: Number(wifiForm.azimuthDeg) || 0,
      },
    ])
    setWifiForm((prev) => ({ ...prev, name: `Wi-Fi ${wifiPoints.length + 2}` }))
  }

  const removeWifiPoint = (id) => setWifiPoints((prev) => prev.filter((wifi) => wifi.id !== id))

  const updateWifiPoint = (id, key, value) => {
    setWifiPoints((prev) =>
      prev.map((wifi) => {
        if (wifi.id !== id) return wifi
        if (key === 'name' || key === 'antennaPattern') return { ...wifi, [key]: value }
        return { ...wifi, [key]: Number(value) || 0 }
      }),
    )
  }

  const addFurniture = (type, x, z, options = {}) => {
    const nextIndex = furniture.length + 1
    const furnitureConfig = FURNITURE_CONFIG[type] || { label: 'Furniture', width: 1.2, depth: 1.2 }
    setFurniture((prev) => [
      ...prev,
      {
        id: `F${nextIndex}`,
        type,
        name: `${furnitureConfig.label} ${nextIndex}`,
        x,
        z,
        width: Number(options.width) || furnitureConfig.width,
        depth: Number(options.depth) || furnitureConfig.depth,
        rotationDeg: Number(options.rotationDeg) || 0,
      },
    ])
  }

  const removeFurniture = (id) => setFurniture((prev) => prev.filter((item) => item.id !== id))

  const movePlannerItem = (type, id, x, z) => {
    const update = (item) => (item.id === id ? { ...item, x, z } : item)
    if (type === 'site') setSites((prev) => prev.map(update))
    if (type === 'wifi') setWifiPoints((prev) => prev.map(update))
    if (type === 'furniture') setFurniture((prev) => prev.map(update))
  }

  const handleCanvasPoint = ({ x, z }) => {
    if (!placementMode) return
    const point = snapPoint({ x, z })
    x = point.x
    z = point.z
    if (['sofa', 'almirah', 'bed'].includes(placementMode)) {
      if (!draftWallStart) {
        setDraftWallStart({ x, z })
        setDrawHoverPoint({ x, z })
        return
      }

      const dx = x - draftWallStart.x
      const dz = z - draftWallStart.z
      const length = Math.hypot(dx, dz)
      const furnitureConfig = FURNITURE_CONFIG[placementMode] || { depth: 1.2 }
      if (length >= 0.25) {
        addFurniture(placementMode, (draftWallStart.x + x) / 2, (draftWallStart.z + z) / 2, {
          width: Math.max(0.5, length),
          depth: furnitureConfig.depth,
          rotationDeg: (Math.atan2(dz, dx) * 180) / Math.PI,
        })
      }
      setDraftWallStart(null)
      setDrawHoverPoint(null)
      setPlacementMode(null)
      return
    }
    if (placementMode === 'site') addSite({ preventDefault: () => {} }, { x, z })
    if (placementMode === 'wifi') addWifiPoint(x, z)
    if (placementMode === 'interior-wall') {
      if (!draftWallStart) {
        setDraftWallStart({ x, z })
        setDrawHoverPoint({ x, z })
        return
      }
      const length = Math.hypot(x - draftWallStart.x, z - draftWallStart.z)
      if (length >= 0.25) {
        const id = `IW${Date.now()}`
        setInteriorWalls((prev) => [
          ...prev,
          {
            id,
            floorId: selectedFloor.id,
            floorName: selectedFloor.name,
            x1: draftWallStart.x,
            z1: draftWallStart.z,
            x2: x,
            z2: z,
            height: Math.max(2, Number(newRoom.height) || 3),
          },
        ])
        setSelectedWall({ wallId: id, roomName: 'Interior', side: 'wall' })
      }
      setDraftWallStart(null)
      setDrawHoverPoint(null)
      setPlacementMode(null)
      return
    }
    setDrawHoverPoint(null)
    setPlacementMode(null)
  }

  const handleCanvasHover = (point) => {
    if (!placementMode) return
    setDrawHoverPoint(snapPoint(point))
  }

  const startFurniturePlacement = (type) => {
    setPlacementMode(type)
    setDraftWallStart(null)
    setDrawHoverPoint(null)
    setShowDrawMenu(false)
    setEditMode(false)
  }

  const cancelDrawing = () => {
    setPlacementMode(null)
    setDraftWallStart(null)
    setDrawHoverPoint(null)
    setShowDrawMenu(false)
  }

  const updateDetectedRoom = (id, key, value) => {
    setDetectedPlan((current) => {
      if (!current) return current
      return {
        ...current,
        rooms: current.rooms.map((room) => (room.id === id ? { ...room, [key]: key === 'name' ? value : toNumber(value, room[key]) } : room)),
      }
    })
  }

  const removeDetectedRoom = (id) => {
    setDetectedPlan((current) => {
      if (!current) return current
      return { ...current, rooms: current.rooms.filter((room) => room.id !== id) }
    })
  }

  const applyDetectedPlan = () => {
    if (!detectedPlan) return
    applyPlanToScene(detectedPlan, 'reviewed detection')
    setDetectedPlan(null)
  }

  const downloadReviewedDetectedExcel = async () => {
    if (!detectedPlan || detectedPlan.rooms.length === 0) return
    await downloadWorkbook(createReviewedDetectedWorkbook(detectedPlan, selectedFloor), 'detected_floorplan_review.xlsx')
  }

  const downloadTemplate = async () => {
    await downloadWorkbook(createStoryBuildingTemplateWorkbook(34), '34_story_building_template.xlsx')
  }

  const handleExcelUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!ALLOWED_EXCEL_TYPES.has(file.type) || !hasAllowedExtension(file.name, ['.xlsx', '.xls'])) {
      setUploadMessage('Only .xlsx or .xls files are supported.')
      event.target.value = ''
      return
    }

    if (file.size > MAX_EXCEL_BYTES) {
      setUploadMessage('Excel file is too large. Keep uploads under 2 MB.')
      event.target.value = ''
      return
    }

    try {
      const parsed = await parseBuildingWorkbook(await file.arrayBuffer())
      if (parsed.error) {
        setUploadMessage(parsed.error)
        return
      }

      setRooms(parsed.rooms)
      setDoors(parsed.doors)
      setWindows(parsed.windows)
      setLogs([])
      setFurniture([])
      setWifiPoints([])
      setInteriorWalls([])
      setDraftWallStart(null)
      setWallTypes({})
      setSelectedWall(null)
      setWallThickness(parsed.wallThickness)
      setBoundaryPolygon(parsed.boundaryPolygon || null)
      if (parsed.siteName) setSiteName(String(parsed.siteName))
      setSelectedFloorId(parsed.rooms[0]?.floorId || 'level-1')
      setUploadMessage(`Loaded ${parsed.rooms.length} rooms across ${new Set(parsed.rooms.map((room) => room.floorId)).size} floors from ${file.name}`)
    } catch {
      setUploadMessage('Could not parse Excel file. Please verify format and try again.')
    } finally {
      event.target.value = ''
    }
  }

  const handleLogsUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const isExcel = hasAllowedExtension(file.name, ['.xlsx', '.xls']) && ALLOWED_EXCEL_TYPES.has(file.type)
    const isCsv = hasAllowedExtension(file.name, ['.csv']) || file.type === 'text/csv'
    if (!isExcel && !isCsv) {
      setLogsMessage('Only .xlsx, .xls, or .csv logs files are supported.')
      event.target.value = ''
      return
    }
    if (file.size > MAX_EXCEL_BYTES) {
      setLogsMessage('Logs file is too large. Keep uploads under 2 MB.')
      event.target.value = ''
      return
    }
    try {
      const parsed = isCsv
        ? parseLogsCsv(await file.text(), boundaryPolygon, selectedFloor.id)
        : await parseLogsWorkbook(await file.arrayBuffer(), boundaryPolygon, selectedFloor.id)
      if (parsed.error) {
        setLogsMessage(parsed.error)
        return
      }
      const { logsInside, adjustedCount } = bringLogsInsideMesh(parsed.logs)
      setLogs(logsInside)
      setLogsMessage(`Loaded ${parsed.total} logs (${adjustedCount} adjusted inside mesh) from ${file.name}.`)
    } catch {
      setLogsMessage('Could not parse logs file. Check columns and try again.')
    } finally {
      event.target.value = ''
    }
  }

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!ALLOWED_IMAGE_TYPES.has(file.type) || !hasAllowedExtension(file.name, ['.png', '.jpg', '.jpeg', '.webp'])) {
      setImageMessage('Only PNG, JPG, JPEG and WebP images are supported.')
      event.target.value = ''
      return
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setImageMessage('Image file is too large. Keep uploads under 8 MB.')
      event.target.value = ''
      return
    }

    setIsParsingImage(true)
    setImageMessage(`Parsing ${file.name}...`)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await pythonApi.post('/api/indoor/parse-floorplan', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      })
      const data = response?.data || response
      if (data.error) {
        setImageMessage(data.error)
        return
      }

      const parsed = normalizeParsedPlan(data, selectedFloor)
      if (parsed.rooms.length === 0) {
        const warning = parsed.warnings[0] ? ` ${parsed.warnings[0]}` : ''
        setImageMessage(`No valid rooms returned from ${file.name}.${warning}`)
        return
      }
      setDetectedPlan(parsed)
      setImageMessage(`Detected ${parsed.rooms.length} rooms. Review and apply below.${parsed.warnings[0] ? ` ${parsed.warnings[0]}` : ''}`)
    } catch {
      try {
        const retryFormData = new FormData()
        retryFormData.append('file', file)
        const retryResponse = await pythonApi.post('/api/indoor/parse-floorplan', retryFormData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000,
        })
        const data = retryResponse?.data || retryResponse
        if (data.error) {
          setImageMessage(data.error)
          return
        }
        const parsed = normalizeParsedPlan(data, selectedFloor)
        if (parsed.rooms.length === 0) {
          const warning = parsed.warnings[0] ? ` ${parsed.warnings[0]}` : ''
          setImageMessage(`No valid rooms returned from ${file.name}.${warning}`)
          return
        }
        setDetectedPlan(parsed)
        setImageMessage(`Detected ${parsed.rooms.length} rooms. Review and apply below.${parsed.warnings[0] ? ` ${parsed.warnings[0]}` : ''}`)
      } catch {
        setImageMessage('Cannot connect to ML parser API. Start ML backend and try again.')
      }
    } finally {
      setIsParsingImage(false)
      event.target.value = ''
    }
  }

  return (
    <div>
      <main className="grid h-[calc(100vh-5rem)] grid-cols-[1fr_360px] gap-4 overflow-hidden p-3 max-[980px]:h-auto max-[980px]:grid-cols-1">
        <IndoorPlanningSidebar
          buttonClass={buttonClass}
          dangerButtonClass={dangerButtonClass}
          inputClass={inputClass}
          downloadTemplate={downloadTemplate}
          handleExcelUpload={handleExcelUpload}
          uploadMessage={uploadMessage}
          handleImageUpload={handleImageUpload}
          isParsingImage={isParsingImage}
          imageMessage={imageMessage}
          handleLogsUpload={handleLogsUpload}
          logsMessage={logsMessage}
          showLogs={showLogs}
          setShowLogs={setShowLogs}
          showLogGrid={showLogGrid}
          setShowLogGrid={setShowLogGrid}
          logGridSizeM={logGridSizeM}
          setLogGridSizeM={setLogGridSizeM}
          logGridAggregation={logGridAggregation}
          setLogGridAggregation={setLogGridAggregation}
          showAddRoomPanel={showAddRoomPanel}
          setShowAddRoomPanel={setShowAddRoomPanel}
          showIndoorPlanningPanel={showIndoorPlanningPanel}
          setShowIndoorPlanningPanel={setShowIndoorPlanningPanel}
          detectedPlan={detectedPlan}
          updateDetectedRoom={updateDetectedRoom}
          removeDetectedRoom={removeDetectedRoom}
          applyDetectedPlan={applyDetectedPlan}
          downloadReviewedDetectedExcel={downloadReviewedDetectedExcel}
          setDetectedPlan={setDetectedPlan}
          siteName={siteName}
          setSiteName={setSiteName}
          selectedFloor={selectedFloor}
          selectedFloorId={selectedFloor.id}
          setSelectedFloorId={setSelectedFloorId}
          floors={floors}
          wallThickness={wallThickness}
          setWallThickness={setWallThickness}
          addRoom={addRoom}
          newRoom={newRoom}
          setNewRoom={setNewRoom}
          visibleRooms={visibleRooms}
          totalArea={totalArea}
          removeRoom={removeRoom}
          addSite={addSite}
          siteForm={siteForm}
          setSiteForm={setSiteForm}
          addWifiPoint={addWifiPoint}
          wifiForm={wifiForm}
          setWifiForm={setWifiForm}
          rfConfig={rfConfig}
          setRfConfig={setRfConfig}
          logMetric={logMetric}
          setLogMetric={setLogMetric}
          runIndoorPrediction={runIndoorPrediction}
          setPredictions={setPredictions}
          simSummary={simSummary}
          thresholdLegend={thresholdLegend}
          sites={sites}
          updateSite={updateSite}
          removeSite={removeSite}
          wifiPoints={wifiPoints}
          updateWifiPoint={updateWifiPoint}
          removeWifiPoint={removeWifiPoint}
          furniture={furniture}
          removeFurniture={removeFurniture}
          overlapWarnings={overlapWarnings}
        />

        <section className="relative order-1 grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm max-[980px]:min-h-[60vh]">
          <header className="border-b border-slate-200 px-4 py-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1">
                <h2 className="text-lg font-semibold">{siteName || 'Untitled Site'} - {selectedFloor.name}</h2>
                <p className="mt-1 text-sm text-slate-600">{viewMode === '2d' ? 'Pan and zoom while drawing.' : 'Drag to rotate, scroll to zoom.'}</p>
              </div>
              <div className="grid min-w-[600px] flex-[2] grid-cols-[repeat(5,minmax(110px,1fr))] items-end gap-2 max-[900px]:min-w-full max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
                <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                  Building File
                  <input className="min-w-0 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700" type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} />
                </label>
                <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                  Floorplan Image
                  <input className="min-w-0 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700" type="file" accept=".png,.jpg,.jpeg,.webp" onChange={handleImageUpload} disabled={isParsingImage} />
                </label>
                <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                  Logs
                  <input className="min-w-0 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700" type="file" accept=".xlsx,.xls,.csv,text/csv" onChange={handleLogsUpload} />
                </label>
                <button className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700" type="button" onClick={() => setShowLogs((prev) => !prev)}>Logs: {showLogs ? 'ON' : 'OFF'}</button>
                <button className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700" type="button" onClick={() => setShowLogGrid((prev) => !prev)}>Log Grid: {showLogGrid ? 'ON' : 'OFF'}</button>
              </div>
            </div>
          </header>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
            <button
              className={`rounded-md border px-3 py-1.5 text-sm ${viewMode === '3d' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}
              type="button"
              onClick={() => setViewMode((mode) => (mode === '3d' ? '2d' : '3d'))}
            >
              {viewMode === '3d' ? 'Exit' : '3D'}
            </button>
            <div className="relative">
              <button className={`rounded-md px-3 py-1.5 text-sm font-medium text-white ${placementMode && ['sofa', 'almirah', 'bed'].includes(placementMode) ? 'bg-indigo-700' : 'bg-violet-600'}`} type="button" onClick={() => setShowDrawMenu((value) => !value)}>Draw</button>
              {showDrawMenu && (
                <div className="absolute left-0 top-full z-50 mt-1 w-36 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                  <button className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={() => startFurniturePlacement('sofa')}>Sofa</button>
                  <button className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={() => startFurniturePlacement('almirah')}>Almirah</button>
                  <button className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={() => startFurniturePlacement('bed')}>Bed</button>
                  <button className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={() => startFurniturePlacement('interior-wall')}>Interior Wall</button>
                </div>
              )}
            </div>
            <button className={`rounded-md border px-3 py-1.5 text-sm ${editMode ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white text-slate-700'}`} type="button" onClick={() => { setEditMode((value) => !value); setPlacementMode(null); setShowDrawMenu(false) }}>Edit</button>
            <button className={`rounded-md border px-3 py-1.5 text-sm ${placementMode === 'site' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-700'}`} type="button" onClick={() => { setPlacementMode((mode) => (mode === 'site' ? null : 'site')); setEditMode(false); setShowDrawMenu(false) }}>Add Site</button>
            <button className={`rounded-md border px-3 py-1.5 text-sm ${placementMode === 'wifi' ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-slate-300 bg-white text-slate-700'}`} type="button" onClick={() => { setPlacementMode((mode) => (mode === 'wifi' ? null : 'wifi')); setEditMode(false); setShowDrawMenu(false) }}>Add Wi-Fi</button>
            <button className={`rounded-md border px-3 py-1.5 text-sm ${placementMode === 'interior-wall' ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-300 bg-white text-slate-700'}`} type="button" onClick={() => startFurniturePlacement('interior-wall')}>Wall</button>
            <button className={`rounded-md border px-3 py-1.5 text-sm ${snapToGrid ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white text-slate-700'}`} type="button" onClick={() => setSnapToGrid((value) => !value)}>Snap</button>
            <select className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700" value={selectedWallType} onChange={(event) => setSelectedWallType(event.target.value)} disabled={!selectedWall}>
              {WALL_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            {selectedWall && (
              <span className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600">
                {selectedWall.roomName} {selectedWall.side} wall
              </span>
            )}
            {selectedWall?.wallId && (
              <button className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm text-rose-600" type="button" onClick={removeSelectedInteriorWall}>Remove Wall</button>
            )}
            {placementMode === 'interior-wall' && (
              <span className="rounded-md border border-violet-200 bg-violet-50 px-2 py-1.5 text-xs text-violet-700">
                {draftWallStart ? 'Click wall end' : 'Click wall start'}
              </span>
            )}
            {['sofa', 'almirah', 'bed'].includes(placementMode) && (
              <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-xs text-indigo-700">
                {draftWallStart ? 'Click furniture end' : 'Click furniture start'}
              </span>
            )}
            {placementMode && (
              <button className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700" type="button" onClick={cancelDrawing}>Cancel</button>
            )}
            <button className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm text-rose-600" type="button" onClick={() => { setFurniture([]); setWifiPoints([]); setSites([]); setInteriorWalls([]); setDraftWallStart(null); setPredictions([]); setSelectedWall(null); setWallTypes({}) }}>Clear All</button>
            {showLogGrid && (
              <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">
                  Covered: {gridCoverageSummary.coveredCells} cells ({gridCoverageSummary.coveredArea.toFixed(1)} m2)
                </span>
                <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">
                  Uncovered: {gridCoverageSummary.emptyCells} cells ({gridCoverageSummary.emptyArea.toFixed(1)} m2)
                </span>
              </div>
            )}
          </div>
          <div className="relative min-h-0">
            <div className="pointer-events-none absolute right-3 top-3 z-20 w-44 rounded-lg border border-slate-200 bg-white/95 p-2.5 text-xs shadow-md backdrop-blur">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-800">{KPI_META[logMetric]?.label || String(logMetric).toUpperCase()}</span>
                <span className="text-[10px] font-medium uppercase text-slate-500">{KPI_META[logMetric]?.unit || ''}</span>
              </div>
              <div className="grid gap-1.5">
                {thresholdLegend.length > 0 ? thresholdLegend.map((item, index) => (
                  <div key={`${logMetric}-legend-${item.min}-${item.max}-${index}`} className="flex min-w-0 items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-sm border border-black/10" style={{ backgroundColor: item.color }} />
                    <span className="min-w-0 truncate text-slate-700">{item.label || formatKpiRange(item, KPI_META[logMetric]?.unit || '')}</span>
                  </div>
                )) : (
                  <div className="flex min-w-0 items-center gap-2 text-slate-500">
                    <span className="h-3 w-3 shrink-0 rounded-sm border border-black/10 bg-slate-400" />
                    <span>No KPI thresholds</span>
                  </div>
                )}
              </div>
            </div>
            <Canvas className="h-full w-full">
              {viewMode === '2d' ? (
                <OrthographicCamera makeDefault position={[10, 60, 6]} zoom={34} near={0.1} far={1000} />
              ) : (
                <PerspectiveCamera makeDefault position={[18, 22, 18]} fov={45} near={0.1} far={1000} />
              )}
              <color attach="background" args={['#f4f8fa']} />
              <ambientLight intensity={0.85} />
              <directionalLight intensity={1.05} position={[8, 12, 6]} />
              <FloorModel
                rooms={visibleRooms}
                wallThickness={wallThickness}
                doors={visibleDoors}
                windows={visibleWindows}
                logs={showLogs ? coloredVisibleLogs : []}
                sites={sites}
                wifiPoints={wifiPoints}
                furniture={furniture}
                draftFurniture={draftWallStart && ['sofa', 'almirah', 'bed'].includes(placementMode) && drawHoverPoint ? {
                  id: 'draft',
                  type: placementMode,
                  name: FURNITURE_CONFIG[placementMode]?.label || 'Furniture',
                  x: (draftWallStart.x + drawHoverPoint.x) / 2,
                  z: (draftWallStart.z + drawHoverPoint.z) / 2,
                  width: Math.max(0.5, Math.hypot(drawHoverPoint.x - draftWallStart.x, drawHoverPoint.z - draftWallStart.z)),
                  depth: FURNITURE_CONFIG[placementMode]?.depth || 1.2,
                  rotationDeg: (Math.atan2(drawHoverPoint.z - draftWallStart.z, drawHoverPoint.x - draftWallStart.x) * 180) / Math.PI,
                } : null}
                interiorWalls={interiorWalls.filter((wall) => (wall.floorId || selectedFloor.id) === selectedFloor.id)}
                draftInteriorWall={draftWallStart ? { start: draftWallStart, end: drawHoverPoint, height: Math.max(2, Number(newRoom.height) || 3), floorId: selectedFloor.id } : null}
                predictions={predictions}
                logGridCells={aggregatedLogGridCells}
                wallTypes={wallTypes}
                selectedWall={selectedWall}
                placementMode={placementMode}
                viewMode={viewMode}
                dragTarget={dragTarget}
                editMode={editMode}
                onSelectWall={setSelectedWall}
                onCanvasPoint={handleCanvasPoint}
                onCanvasHover={handleCanvasHover}
                onStartDrag={setDragTarget}
                onDragMove={movePlannerItem}
                onEndDrag={() => setDragTarget(null)}
              />
              <OrbitControls
                makeDefault
                enabled={!editMode && !dragTarget}
                target={[10, 0, 6]}
                enableRotate
                enablePan
                minPolarAngle={viewMode === '2d' ? 0.18 : 0.15}
                maxPolarAngle={viewMode === '2d' ? 0.18 : Math.PI / 2.2}
              />
            </Canvas>
          </div>
        </section>
      </main>
    </div>
  )
}

export default IndoorPlaning
