import { useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { FloorModel } from '@/components/indoor/FloorModel'
import IndoorPlanningSidebar from '@/components/indoor/IndoorPlanningSidebar'
import { ALLOWED_EXCEL_TYPES, ALLOWED_IMAGE_TYPES, initialRooms, MAX_EXCEL_BYTES, MAX_IMAGE_BYTES } from '@/config/indoor/floorPlannerConfig'
import { createStoryBuildingTemplateWorkbook } from '@/templates/indoor/buildingTemplate'
import { createReviewedDetectedWorkbook, downloadWorkbook, parseBuildingWorkbook, parseLogsWorkbook, parseLogsCsv } from '@/utils/indoor/excelPlan'
import { buildFloorOptions, getOverlapWarnings, getVisiblePlan, hasAllowedExtension, normalizeParsedPlan, toNumber } from '@/utils/indoor/floorPlan'
import { buildAggregatedLogGridCells, getLogMetricValue } from '@/utils/indoor/indoorPlanningUtils'
import { pythonApi } from '@/api/pythonApiService'
import useColorForLog from '@/hooks/useColorForLog'

function IndoorPlaning() {
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
  const [predictions, setPredictions] = useState([])
  const [siteForm, setSiteForm] = useState({ name: 'Site-1', x: 2, z: 2, heightM: 3, coneHeightM: '', txPowerDbm: 30, freqMHz: 3500, antennaGainDbi: 0, azimuthDeg: 0 })
  const [rfConfig, setRfConfig] = useState({ wallLossDb: 8, doorLossDb: 2.5, gridStepM: 1.2, rxGainDbi: 0 })
  const [logMetric, setLogMetric] = useState('rsrp')
  const inputClass = 'rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm'
  const buttonClass = 'cursor-pointer rounded-lg bg-white   px-3 py-1 text-black border  border-black-500'
  const dangerButtonClass = 'cursor-pointer rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs text-white'
  const { getMetricColor, getThresholdsForMetric } = useColorForLog()
  const thresholdLegend = useMemo(() => {
    const rows = getThresholdsForMetric(logMetric) || []
    return [...rows].sort((a, b) => Number(a.min) - Number(b.min))
  }, [getThresholdsForMetric, logMetric])

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
    return crossed
  }

  const runIndoorPrediction = () => {
    if (sites.length === 0 || visibleRooms.length === 0) return
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
          for (const site of sites) {
            const dx = x - site.x
            const dz = z - site.z
            const distM = Math.max(1, Math.hypot(dx, dz))
            const distKm = distM / 1000
            const fspl = 32.44 + 20 * Math.log10(site.freqMHz) + 20 * Math.log10(distKm)
            const walls = wallIntersections(site.x, site.z, x, z)
            const penetrationLoss = walls.reduce((sum, w) => {
              const hasDoor = getDoorOnWall(w.room, w.side, w.offset)
              return sum + (hasDoor ? doorLoss : wallLoss)
            }, 0)
            const txGain = Number(site.antennaGainDbi) || 0
            const rxGain = Number(rfConfig.rxGainDbi) || 0
            const az = Number(site.azimuthDeg) || 0
            const bearing = (Math.atan2(dz, dx) * 180) / Math.PI
            const normBearing = ((bearing % 360) + 360) % 360
            const normAz = ((az % 360) + 360) % 360
            const angleDiff = Math.abs(((normBearing - normAz + 540) % 360) - 180)
            const directionLoss = angleDiff <= 60 ? 0 : (angleDiff - 60) * 0.12
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
  const addSite = (event) => {
    event?.preventDefault?.()
    const item = {
      id: `S${sites.length + 1}`,
      name: siteForm.name.trim() || `Site-${sites.length + 1}`,
      x: Number(siteForm.x) || 0,
      z: Number(siteForm.z) || 0,
      heightM: Math.max(0.5, Number(siteForm.heightM) || 3),
      coneHeightM: Number.isFinite(Number(siteForm.coneHeightM)) && Number(siteForm.coneHeightM) > 0 ? Number(siteForm.coneHeightM) : null,
      txPowerDbm: Number(siteForm.txPowerDbm) || 30,
      freqMHz: Number(siteForm.freqMHz) || 3500,
      antennaGainDbi: Number(siteForm.antennaGainDbi) || 0,
      azimuthDeg: Number(siteForm.azimuthDeg) || 0,
    }
    setSites((prev) => [...prev, item])
    setSiteForm((prev) => ({ ...prev, name: `Site-${sites.length + 2}` }))
  }
  const removeSite = (id) => setSites((prev) => prev.filter((s) => s.id !== id))
  const updateSite = (id, key, value) => {
    setSites((prev) =>
      prev.map((site) => {
        if (site.id !== id) return site
        if (key === 'name') return { ...site, [key]: value }
        if (key === 'coneHeightM') {
          const n = Number(value)
          return { ...site, [key]: Number.isFinite(n) && n > 0 ? n : null }
        }
        return { ...site, [key]: Number(value) || 0 }
      }),
    )
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
          overlapWarnings={overlapWarnings}
        />

        <section className="relative order-1 grid min-h-0 grid-rows-[auto_auto_1fr] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm max-[980px]:min-h-[60vh]">
          <header className="border-b border-slate-200 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{siteName || 'Untitled Site'} - {selectedFloor.name}</h2>
                <p className="mt-1 text-sm text-slate-600">Drag to rotate, scroll to zoom.</p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label className="grid gap-1 text-xs text-slate-600">
                  Building File
                  <input className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700" type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} />
                </label>
                <label className="grid gap-1 text-xs text-slate-600">
                  Floorplan Image
                  <input className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700" type="file" accept=".png,.jpg,.jpeg,.webp" onChange={handleImageUpload} disabled={isParsingImage} />
                </label>
                <label className="grid gap-1 text-xs text-slate-600">
                  Logs
                  <input className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700" type="file" accept=".xlsx,.xls,.csv,text/csv" onChange={handleLogsUpload} />
                </label>
              </div>
            </div>
          </header>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
            <button className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white">Draw</button>
            <button className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700">Edit</button>
            <button className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700" onClick={() => setShowAddRoomPanel((v) => !v)}>Add Room</button>
            <button className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700" onClick={() => setShowIndoorPlanningPanel((v) => !v)}>Indoor Network Planning</button>
            <select className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700">
              <option>Interior Wall</option>
            </select>
            <select className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700">
              <option>Drywall / Plasterboard</option>
            </select>
            <button className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm text-rose-600">Clear All</button>
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
          {showAddRoomPanel && (
            <div className="absolute left-3 right-3 top-[132px] z-40 rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-xl">
              <div className="grid grid-cols-6 gap-2">
                <input className={inputClass} value={newRoom.name} placeholder="Room Name" onChange={(event) => setNewRoom((c) => ({ ...c, name: event.target.value }))} />
                <input className={inputClass} type="number" min="1" step="0.5" value={newRoom.width} onChange={(event) => setNewRoom((c) => ({ ...c, width: Number(event.target.value) || 1 }))} placeholder="Width" />
                <input className={inputClass} type="number" min="1" step="0.5" value={newRoom.depth} onChange={(event) => setNewRoom((c) => ({ ...c, depth: Number(event.target.value) || 1 }))} placeholder="Depth" />
                <input className={inputClass} type="number" min="2" step="0.1" value={newRoom.height} onChange={(event) => setNewRoom((c) => ({ ...c, height: Number(event.target.value) || 2.8 }))} placeholder="Height" />
                <input className={inputClass} type="number" step="0.5" value={newRoom.x} onChange={(event) => setNewRoom((c) => ({ ...c, x: Number(event.target.value) || 0 }))} placeholder="X" />
                <input className={inputClass} type="number" step="0.5" value={newRoom.z} onChange={(event) => setNewRoom((c) => ({ ...c, z: Number(event.target.value) || 0 }))} placeholder="Z" />
              </div>
              <div className="mt-2">
                <button className={buttonClass} type="button" onClick={addRoom}>Add Room</button>
              </div>
            </div>
          )}
          {showIndoorPlanningPanel && (
            <div className="absolute left-3 right-3 top-[132px] z-40 rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-xl">
              <div className="grid grid-cols-9 gap-2">
                <input className={inputClass} value={siteForm.name} onChange={(e) => setSiteForm((c) => ({ ...c, name: e.target.value }))} placeholder="Site Name" />
                <input className={inputClass} type="number" step="0.5" value={siteForm.x} onChange={(e) => setSiteForm((c) => ({ ...c, x: e.target.value }))} placeholder="X (m)" />
                <input className={inputClass} type="number" step="0.5" value={siteForm.z} onChange={(e) => setSiteForm((c) => ({ ...c, z: e.target.value }))} placeholder="Z (m)" />
                <input className={inputClass} type="number" step="1" value={siteForm.txPowerDbm} onChange={(e) => setSiteForm((c) => ({ ...c, txPowerDbm: e.target.value }))} placeholder="Tx Power" />
                <input className={inputClass} type="number" step="100" value={siteForm.freqMHz} onChange={(e) => setSiteForm((c) => ({ ...c, freqMHz: e.target.value }))} placeholder="Freq MHz" />
                <input className={inputClass} type="number" step="1" value={siteForm.azimuthDeg} onChange={(e) => setSiteForm((c) => ({ ...c, azimuthDeg: e.target.value }))} placeholder="Azimuth" />
                <input className={inputClass} type="number" step="0.5" value={rfConfig.wallLossDb} onChange={(e) => setRfConfig((c) => ({ ...c, wallLossDb: e.target.value }))} placeholder="Wall Loss" />
                <input className={inputClass} type="number" step="0.5" value={rfConfig.doorLossDb} onChange={(e) => setRfConfig((c) => ({ ...c, doorLossDb: e.target.value }))} placeholder="Door Loss" />
                <input className={inputClass} type="number" step="0.5" value={rfConfig.rxGainDbi} onChange={(e) => setRfConfig((c) => ({ ...c, rxGainDbi: e.target.value }))} placeholder="RX Gain" />
                <input className={inputClass} type="number" step="0.2" min="0.6" value={rfConfig.gridStepM} onChange={(e) => setRfConfig((c) => ({ ...c, gridStepM: e.target.value }))} placeholder="Grid Step" />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button className={buttonClass} type="button" onClick={addSite}>Add Site</button>
                <button className={buttonClass} type="button" onClick={runIndoorPrediction}>Run Indoor Prediction</button>
                <button type="button" className={dangerButtonClass} onClick={() => setPredictions([])}>Clear Prediction</button>
              </div>
            </div>
          )}

          <Canvas camera={{ position: [0, 40, 0.01], fov: 35 }}>
            <color attach="background" args={['#f4f8fa']} />
            <ambientLight intensity={0.85} />
            <directionalLight intensity={1.05} position={[8, 12, 6]} />
            <FloorModel rooms={visibleRooms} wallThickness={wallThickness} doors={visibleDoors} windows={visibleWindows} logs={showLogs ? coloredVisibleLogs : []} sites={sites} predictions={predictions} logGridCells={aggregatedLogGridCells} />
            <OrbitControls makeDefault target={[10, 0, 6]} minPolarAngle={0} maxPolarAngle={Math.PI / 2.2} />
          </Canvas>
        </section>
      </main>
    </div>
  )
}

export default IndoorPlaning
