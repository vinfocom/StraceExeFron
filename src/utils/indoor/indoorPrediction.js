export const OMNI_SIGNAL_LEGEND = [
  { color: '#2563eb', label: 'Very strong, near source' },
  { color: '#16a34a', label: 'Good, 0-20 m' },
  { color: '#facc15', label: 'Medium, 20-35 m' },
  { color: '#f97316', label: 'Weak, 35-50 m' },
  { color: '#dc2626', label: 'Loss zone, 50 m+' },
]

export const buildDefaultSiteSectors = (baseAzimuth = 0) => {
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

export const getOmniSignalLossRatio = ({ distanceM, maxRangeM, penetrationLossDb, directionLossDb }) => {
  const range = Math.max(20, Number(maxRangeM) || 50)
  const distancePenalty = Math.max(0, Number(distanceM) || 0) / range
  const wallPenalty = Math.max(0, Number(penetrationLossDb) || 0) / 45
  const directionPenalty = Math.max(0, Number(directionLossDb) || 0) / 30
  return distancePenalty + wallPenalty + directionPenalty
}

export const getOmniSignalColor = (prediction) => {
  const lossRatio = getOmniSignalLossRatio(prediction || {})

  if (lossRatio <= 0.2) return '#2563eb'
  if (lossRatio <= 0.4) return '#16a34a'
  if (lossRatio <= 0.7) return '#facc15'
  if (lossRatio <= 1) return '#f97316'
  return '#dc2626'
}

const dbmToMw = (dbm) => 10 ** (dbm / 10)
const mwToDbm = (mw) => 10 * Math.log10(Math.max(mw, 1e-15))

const normaliseDeg = (value) => ((Number(value) % 360) + 360) % 360

const angleDeltaDeg = (fromDeg, toDeg) => Math.abs(((normaliseDeg(fromDeg) - normaliseDeg(toDeg) + 540) % 360) - 180)

const getDirectionalLossDb = ({ antennaPattern, bearingDeg, azimuthDeg, beamwidthDeg }) => {
  if (String(antennaPattern || 'omni').toLowerCase() !== 'directional') return 0

  const halfBeam = Math.max(1, Number(beamwidthDeg) || 120) / 2
  const angleDiff = angleDeltaDeg(bearingDeg, azimuthDeg)
  const scaledAngle = Math.min(1, angleDiff / 180)
  const cosinePower = Math.max(0.0003, Math.cos(scaledAngle * (Math.PI / 2)) ** 2)
  const cosineLoss = -10 * Math.log10(cosinePower)

  return angleDiff <= halfBeam ? 0 : Math.min(35, cosineLoss)
}

const expandPredictionSources = (sources) => {
  const transmitters = []

  sources.forEach((source) => {
    const antennaPattern = String(source.antennaPattern || 'omni').toLowerCase()
    if (antennaPattern === 'directional' && Array.isArray(source.sectors) && source.sectors.length > 0) {
      source.sectors.forEach((sector, index) => {
        transmitters.push({
          ...source,
          ...sector,
          id: `${source.id}:${sector.id || index + 1}`,
          parentId: source.id,
          sourceName: `${source.name || source.id} ${sector.name || `Sector ${index + 1}`}`,
          x: source.x,
          z: source.z,
          heightM: source.heightM,
          freqMHz: Number(sector.freqMHz ?? source.freqMHz) || 3500,
          antennaPattern: 'directional',
          omniRangeM: source.omniRangeM,
        })
      })
      return
    }

    transmitters.push({
      ...source,
      parentId: source.id,
      sourceName: source.name,
      beamwidthDeg: antennaPattern === 'directional' ? 120 : 360,
    })
  })

  return transmitters
}

const calculateTransmitterPrediction = ({ transmitter, x, z, rxGainDbi, wallIntersections, getPenetrationLossDb }) => {
  const dx = x - Number(transmitter.x)
  const dz = z - Number(transmitter.z)
  const distM = Math.max(1, Math.hypot(dx, dz))
  const distKm = distM / 1000
  const freqMHz = Math.max(1, Number(transmitter.freqMHz) || 3500)
  const fspl = 32.44 + 20 * Math.log10(freqMHz) + 20 * Math.log10(distKm)
  const walls = wallIntersections(Number(transmitter.x), Number(transmitter.z), x, z)
  const penetrationLoss = getPenetrationLossDb(walls)
  const bearing = (Math.atan2(dz, dx) * 180) / Math.PI
  const directionLoss = getDirectionalLossDb({
    antennaPattern: transmitter.antennaPattern,
    bearingDeg: bearing,
    azimuthDeg: transmitter.azimuthDeg,
    beamwidthDeg: transmitter.beamwidthDeg,
  })
  const txPower = Number(transmitter.txPowerDbm) || 0
  const txGain = Number(transmitter.antennaGainDbi) || 0
  const totalLossDb = fspl + penetrationLoss + directionLoss
  const rssi = txPower + txGain + rxGainDbi - totalLossDb

  return {
    rssi,
    sourceId: transmitter.parentId || transmitter.id,
    sourceName: transmitter.sourceName || transmitter.name,
    sectorId: transmitter.id,
    sectorName: transmitter.name,
    distanceM: distM,
    fsplDb: fspl,
    penetrationLossDb: penetrationLoss,
    directionLossDb: directionLoss,
    totalLossDb,
    maxRangeM: Math.max(20, Math.min(50, Number(transmitter.omniRangeM) || 50)),
  }
}

export const calculateIndoorPredictionPoints = ({
  rooms,
  sources,
  rfConfig,
  logMetric,
  wallIntersections,
  getPenetrationLossDb,
}) => {
  const transmitters = expandPredictionSources(sources)
  if (transmitters.length === 0 || !Array.isArray(rooms) || rooms.length === 0) return []

  const step = Math.max(0.3, Number(rfConfig.gridStepM) || 0.6)
  const rxGainDbi = Number(rfConfig.rxGainDbi) || 0
  const points = []
  let idx = 1

  for (const room of rooms) {
    if (room.shape && room.shape !== 'rectangle') continue
    for (let x = room.x + 0.4; x < room.x + room.width; x += step) {
      for (let z = room.z + 0.4; z < room.z + room.depth; z += step) {
        const transmitterPredictions = transmitters.map((transmitter) =>
          calculateTransmitterPrediction({ transmitter, x, z, rxGainDbi, wallIntersections, getPenetrationLossDb }),
        )
        const bestPrediction = transmitterPredictions.reduce((best, item) => (!best || item.rssi > best.rssi ? item : best), null)
        const combinedMw = transmitterPredictions.reduce((sum, item) => sum + dbmToMw(item.rssi), 0)
        const combinedRssi = mwToDbm(combinedMw)
        const bestRssi = Number.isFinite(combinedRssi) ? combinedRssi : bestPrediction?.rssi ?? -140
        const rsrq = Math.max(-20, Math.min(-3, -3 - ((-60 - bestRssi) * 0.18)))
        const sinr = Math.max(-10, Math.min(30, bestRssi + 110 - 2))
        const rsrpNorm = Math.max(0, Math.min(1, (bestRssi + 140) / 96))
        const rsrqNorm = Math.max(0, Math.min(1, (rsrq + 20) / 17))
        const sinrNorm = Math.max(0, Math.min(1, (sinr + 10) / 40))
        const qualityScore = (rsrpNorm * 0.5 + rsrqNorm * 0.2 + sinrNorm * 0.3) * 100
        const metricValue = logMetric === 'rsrq' ? rsrq : logMetric === 'sinr' ? sinr : bestRssi
        const signalLossRatio = getOmniSignalLossRatio(bestPrediction || {})

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
          color: getOmniSignalColor(bestPrediction || {}),
          signalLossRatio,
          metricValue,
          sourceCount: transmitterPredictions.length,
          sourceId: bestPrediction?.sourceId,
          sourceName: bestPrediction?.sourceName,
          sectorId: bestPrediction?.sectorId,
          sectorName: bestPrediction?.sectorName,
          distanceM: bestPrediction?.distanceM ?? null,
          fsplDb: bestPrediction?.fsplDb ?? null,
          penetrationLossDb: bestPrediction?.penetrationLossDb ?? null,
          directionLossDb: bestPrediction?.directionLossDb ?? null,
          totalLossDb: bestPrediction?.totalLossDb ?? null,
          maxRangeM: bestPrediction?.maxRangeM ?? null,
        })
      }
    }
  }

  return points
}
