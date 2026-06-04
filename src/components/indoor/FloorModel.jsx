import { useEffect, useMemo, useRef } from 'react'
import { Grid, Html, Line } from '@react-three/drei'
import { CanvasTexture, Shape } from 'three'
import { normalizeWallSide } from '../../utils/indoor/floorPlan'

const WALL_MATERIALS = {
  drywall: { color: '#d3d3d3', opacity: 1, transparent: false },
  glass: { color: '#7ec1dd', opacity: 0.45, transparent: true },
  wooden: { color: '#b7834f', opacity: 1, transparent: false },
  concrete: { color: '#9ca3af', opacity: 1, transparent: false },
}

const colorToRgb = (input) => {
  const s = String(input || '').trim()
  const rgb = s.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  const hex = s.replace('#', '')
  if (hex.length === 6) return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
  return [128, 128, 128]
}

const wallMaterialFor = (type, selected) => {
  const material = WALL_MATERIALS[type] || WALL_MATERIALS.drywall
  return selected ? { ...material, color: '#f59e0b', opacity: material.transparent ? 0.65 : 1 } : material
}

const getSiteSectors = (site = {}) => {
  if (Array.isArray(site.sectors) && site.sectors.length > 0) return site.sectors
  const baseAzimuth = Number(site.azimuthDeg) || 0
  return [0, 120, 240].map((offset, index) => ({
    id: `sector-${index + 1}`,
    name: `Sector ${index + 1}`,
    azimuthDeg: (baseAzimuth + offset + 360) % 360,
    beamwidthDeg: 120,
    txPowerDbm: Number(site.txPowerDbm) || 30,
    antennaGainDbi: Number(site.antennaGainDbi) || 0,
  }))
}

const findRoomByRef = (rooms, ref) => {
  const key = String(ref ?? '').trim()
  return rooms.find((room) => String(room.id) === key || room.name === key)
}

const getWallPlacement = (room, side, offset) => {
  if (room.shape && room.shape !== 'rectangle') return null
  const clampedOffset = Math.max(0, offset)
  switch (side) {
    case 'north':
      return { x: room.x + Math.min(clampedOffset, room.width), z: room.z, rotationY: 0 }
    case 'south':
      return { x: room.x + Math.min(clampedOffset, room.width), z: room.z + room.depth, rotationY: 0 }
    case 'west':
      return { x: room.x, z: room.z + Math.min(clampedOffset, room.depth), rotationY: Math.PI / 2 }
    case 'east':
      return { x: room.x + room.width, z: room.z + Math.min(clampedOffset, room.depth), rotationY: Math.PI / 2 }
    default:
      return null
  }
}

function OpeningMeshes({ rooms, wallThickness, doors, windows }) {
  return (
    <group>
      {doors.map((door) => {
        const room = findRoomByRef(rooms, door.roomId)
        if (!room) return null
        const placement = getWallPlacement(room, normalizeWallSide(door.wallSide), door.offset)
        if (!placement) return null

        return (
          <mesh key={door.id} position={[placement.x, door.height / 2, placement.z]} rotation={[0, placement.rotationY, 0]}>
            <boxGeometry args={[door.width, door.height, wallThickness * 1.1]} />
            <meshStandardMaterial color="#4f89a1" />
          </mesh>
        )
      })}

      {windows.map((windowItem) => {
        const room = findRoomByRef(rooms, windowItem.roomId)
        if (!room) return null
        const placement = getWallPlacement(room, normalizeWallSide(windowItem.wallSide), windowItem.offset)
        if (!placement) return null

        return (
          <mesh key={windowItem.id} position={[placement.x, windowItem.sillHeight + windowItem.height / 2, placement.z]} rotation={[0, placement.rotationY, 0]}>
            <boxGeometry args={[windowItem.width, windowItem.height, wallThickness * 0.9]} />
            <meshStandardMaterial color="#7ec1dd" transparent opacity={0.75} />
          </mesh>
        )
      })}
    </group>
  )
}

function PredictionHeatmapOverlay({ predictions, rooms, wallThickness = 0.2 }) {
  const overlays = useMemo(() => {
    if (!predictions.length || !rooms.length) return []
    const size = 1024
    const inset = Math.max(0.04, Number(wallThickness || 0.2) / 2)
    const getRoomKey = (room) => `${room.id}:${room.x}:${room.z}:${room.width}:${room.depth}`

    return rooms
      .map((room) => {
        const roomPreds = predictions.filter((p) => String(p.roomKey) === getRoomKey(room) || String(p.roomId) === String(room.id))
        if (!roomPreds.length) return null
        const innerW = Number(room.width) - inset * 2
        const innerD = Number(room.depth) - inset * 2
        if (!Number.isFinite(innerW) || !Number.isFinite(innerD) || innerW <= 0.05 || innerD <= 0.05) return null

        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) return null

        const layer = document.createElement('canvas')
        layer.width = size
        layer.height = size
        const lctx = layer.getContext('2d')
        if (!lctx) return null

        const fieldSize = 384
        const fieldCanvas = document.createElement('canvas')
        fieldCanvas.width = fieldSize
        fieldCanvas.height = fieldSize
        const fctx = fieldCanvas.getContext('2d')
        if (!fctx) return null
        const image = fctx.createImageData(fieldSize, fieldSize)
        const pts = roomPreds.map((p) => ({
          x: Number(p.x),
          z: Number(p.z),
          rgb: colorToRgb(p.color),
        }))
        for (let py = 0; py < fieldSize; py += 1) {
          for (let px = 0; px < fieldSize; px += 1) {
            const ux = px / (fieldSize - 1)
            const uz = 1 - py / (fieldSize - 1)
            const wx = Number(room.x) + inset + ux * innerW
            const wz = Number(room.z) + inset + uz * innerD
            let r = 0
            let g = 0
            let b = 0
            let wSum = 0
            for (let i = 0; i < pts.length; i += 1) {
              const dx = wx - pts[i].x
              const dz = wz - pts[i].z
              const w = 1 / (dx * dx + dz * dz + 0.08)
              r += pts[i].rgb[0] * w
              g += pts[i].rgb[1] * w
              b += pts[i].rgb[2] * w
              wSum += w
            }
            const idx = (py * fieldSize + px) * 4
            image.data[idx] = Math.round(r / wSum)
            image.data[idx + 1] = Math.round(g / wSum)
            image.data[idx + 2] = Math.round(b / wSum)
            image.data[idx + 3] = 255
          }
        }
        fctx.putImageData(image, 0, 0)
        ctx.imageSmoothingEnabled = true
        ctx.filter = 'blur(2px)'
        ctx.drawImage(fieldCanvas, 0, 0, size, size)
        ctx.filter = 'none'

        const tex = new CanvasTexture(canvas)
        tex.needsUpdate = true
        return {
          key: getRoomKey(room),
          texture: tex,
          x: Number(room.x) + Number(room.width) / 2,
          z: Number(room.z) + Number(room.depth) / 2,
          w: innerW,
          d: innerD,
        }
      })
      .filter(Boolean)
  }, [predictions, rooms, wallThickness])

  useEffect(() => {
    return () => overlays.forEach((entry) => entry.texture?.dispose())
  }, [overlays])

  return (
    <group>
      {overlays.map((entry) => (
        <mesh key={entry.key} rotation-x={-Math.PI / 2} position={[entry.x, 0.06, entry.z]}>
          <planeGeometry args={[entry.w, entry.d]} />
          <meshBasicMaterial map={entry.texture} transparent opacity={0.98} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

export function FloorModel({
  rooms,
  wallThickness,
  doors,
  windows,
  logs = [],
  sites = [],
  wifiPoints = [],
  furniture = [],
  draftFurniture = null,
  interiorWalls = [],
  draftInteriorWall = null,
  predictions = [],
  logGridCells = [],
  wallTypes = {},
  selectedWall,
  placementMode,
  viewMode = '2d',
  dragTarget,
  editMode = false,
  onSelectWall,
  onCanvasPoint,
  onCanvasHover,
  onStartDrag,
  onDragMove,
  onEndDrag,
}) {
  const is2dView = viewMode === '2d'
  const visibleFurniture = draftFurniture ? [...furniture, draftFurniture] : furniture

  const getRoomBounds = (room) => {
    if ((room.shape === 'polygon' || room.shape === 'poly') && Array.isArray(room.polygonPoints) && room.polygonPoints.length >= 3) {
      const xs = room.polygonPoints.map((point) => Number(point.x ?? point[0])).filter(Number.isFinite)
      const zs = room.polygonPoints.map((point) => Number(point.z ?? point[1])).filter(Number.isFinite)
      if (xs.length >= 3 && zs.length >= 3) {
        return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
      }
    }

    if (room.shape === 'circle') {
      const radius = Number.isFinite(room.radius) && room.radius > 0 ? room.radius : Math.min(room.width, room.depth) / 2
      const cx = room.x + room.width / 2
      const cz = room.z + room.depth / 2
      return { minX: cx - radius, maxX: cx + radius, minZ: cz - radius, maxZ: cz + radius }
    }

    return { minX: room.x, maxX: room.x + room.width, minZ: room.z, maxZ: room.z + room.depth }
  }

  const bounds = useMemo(() => {
    if (rooms.length === 0) return { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }
    const roomBounds = rooms.map(getRoomBounds)
    const allX = roomBounds.flatMap((room) => [room.minX, room.maxX])
    const allZ = roomBounds.flatMap((room) => [room.minZ, room.maxZ])
    return {
      minX: Math.min(...allX) - 2,
      maxX: Math.max(...allX) + 2,
      minZ: Math.min(...allZ) - 2,
      maxZ: Math.max(...allZ) + 2,
    }
  }, [rooms])

  const handlePlanPointerDown = (event) => {
    if (placementMode) {
      event.stopPropagation()
      onCanvasPoint?.({ x: event.point.x, z: event.point.z })
      return
    }
    if (dragTarget) {
      event.stopPropagation()
      onDragMove?.(dragTarget.type, dragTarget.id, event.point.x, event.point.z)
      return
    }
    onSelectWall?.(null)
  }

  const handlePlanPointerMove = (event) => {
    if (placementMode) {
      event.stopPropagation()
      onCanvasHover?.({ x: event.point.x, z: event.point.z })
      return
    }
    if (!dragTarget) return
    event.stopPropagation()
    onDragMove?.(dragTarget.type, dragTarget.id, event.point.x, event.point.z)
  }

  const handlePlanPointerUp = (event) => {
    if (!dragTarget) return
    event.stopPropagation()
    onEndDrag?.()
  }

  const startDrag = (event, type, id) => {
    if (!editMode) return
    event.stopPropagation()
    onStartDrag?.({ type, id })
  }

  const selectWall = (event, room, side) => {
    event.stopPropagation()
    if (placementMode) {
      onCanvasPoint?.({ x: event.point.x, z: event.point.z })
      return
    }
    onSelectWall?.({ roomId: room.id, roomName: room.name, side })
  }

  const selectInteriorWall = (event, wall) => {
    event.stopPropagation()
    if (placementMode) {
      onCanvasPoint?.({ x: event.point.x, z: event.point.z })
      return
    }
    onSelectWall?.({ wallId: wall.id, roomName: 'Interior', side: 'wall' })
  }

  const renderWall = (room, side, position, geometryArgs) => {
    const key = `${room.id}:${side}`
    const material = wallMaterialFor(wallTypes[key], selectedWall?.roomId === room.id && selectedWall?.side === side)
    return (
      <mesh key={key} position={position} onPointerDown={(event) => selectWall(event, room, side)}>
        <boxGeometry args={geometryArgs} />
        <meshStandardMaterial color={material.color} transparent={material.transparent} opacity={material.opacity} />
      </mesh>
    )
  }

  const renderInteriorWall = (wall, preview = false) => {
    const x1 = Number(wall.x1)
    const z1 = Number(wall.z1)
    const x2 = Number(wall.x2)
    const z2 = Number(wall.z2)
    if (![x1, z1, x2, z2].every(Number.isFinite)) return null
    const length = Math.hypot(x2 - x1, z2 - z1)
    if (length < 0.05) return null

    const height = Math.max(0.5, Number(wall.height) || rooms[0]?.height || 3)
    const material = preview
      ? { color: '#7c3aed', transparent: true, opacity: 0.55 }
      : wallMaterialFor(wallTypes[`interior:${wall.id}`], selectedWall?.wallId === wall.id)
    return (
      <mesh
        key={`interior-wall-${wall.id}`}
        position={[(x1 + x2) / 2, height / 2, (z1 + z2) / 2]}
        rotation={[0, -Math.atan2(z2 - z1, x2 - x1), 0]}
        onPointerDown={preview ? undefined : (event) => selectInteriorWall(event, wall)}
      >
        <boxGeometry args={[length, height, wallThickness]} />
        <meshStandardMaterial color={material.color} transparent={material.transparent} opacity={material.opacity} />
      </mesh>
    )
  }

  const getRoomOutlinePoints = (room) => {
    const roomShape = String(room.shape || 'rectangle').toLowerCase()
    if ((roomShape === 'polygon' || roomShape === 'poly') && Array.isArray(room.polygonPoints) && room.polygonPoints.length >= 3) {
      const points = room.polygonPoints
        .map((point) => {
          const x = Number(point.x ?? point[0])
          const z = Number(point.z ?? point[1])
          return Number.isFinite(x) && Number.isFinite(z) ? [x, 0.14, z] : null
        })
        .filter(Boolean)
      return points.length >= 3 ? [...points, points[0]] : []
    }

    if (roomShape === 'circle') {
      const radius = Number.isFinite(room.radius) && room.radius > 0 ? room.radius : Math.min(room.width, room.depth) / 2
      const cx = room.x + room.width / 2
      const cz = room.z + room.depth / 2
      return Array.from({ length: 65 }, (_, index) => {
        const angle = (index / 64) * Math.PI * 2
        return [cx + Math.cos(angle) * radius, 0.14, cz + Math.sin(angle) * radius]
      })
    }

    return [
      [room.x, 0.14, room.z],
      [room.x + room.width, 0.14, room.z],
      [room.x + room.width, 0.14, room.z + room.depth],
      [room.x, 0.14, room.z + room.depth],
      [room.x, 0.14, room.z],
    ]
  }

  const render2DWallLine = (room, side) => {
    if (String(room.shape || 'rectangle').toLowerCase() !== 'rectangle') return null
    const selected = selectedWall?.roomId === room.id && selectedWall?.side === side
    const material = wallMaterialFor(wallTypes[`${room.id}:${side}`], selected)
    const pointsBySide = {
      north: [[room.x, 0.18, room.z], [room.x + room.width, 0.18, room.z]],
      south: [[room.x, 0.18, room.z + room.depth], [room.x + room.width, 0.18, room.z + room.depth]],
      west: [[room.x, 0.18, room.z], [room.x, 0.18, room.z + room.depth]],
      east: [[room.x + room.width, 0.18, room.z], [room.x + room.width, 0.18, room.z + room.depth]],
    }
    return (
      <Line
        key={`2d-wall-${room.id}-${side}`}
        points={pointsBySide[side]}
        color={material.color}
        lineWidth={selected ? 6 : 4}
        transparent={material.transparent}
        opacity={material.opacity}
        onPointerDown={(event) => selectWall(event, room, side)}
      />
    )
  }

  const render2DOpeningLine = (item, type) => {
    const room = findRoomByRef(rooms, item.roomId)
    if (!room) return null
    const side = normalizeWallSide(item.wallSide)
    const placement = getWallPlacement(room, side, Number(item.offset) || 0)
    if (!placement) return null
    const width = Math.max(0.25, Number(item.width) || 0.8)
    const half = width / 2
    const x = placement.x
    const z = placement.z
    const points = side === 'north' || side === 'south'
      ? [[x - half, 0.22, z], [x + half, 0.22, z]]
      : [[x, 0.22, z - half], [x, 0.22, z + half]]
    return <Line key={`2d-${type}-${item.id}`} points={points} color={type === 'door' ? '#0f766e' : '#0284c7'} lineWidth={5} />
  }

  const render2DInteriorWall = (wall, preview = false) => {
    const x1 = Number(wall.x1)
    const z1 = Number(wall.z1)
    const x2 = Number(wall.x2)
    const z2 = Number(wall.z2)
    if (![x1, z1, x2, z2].every(Number.isFinite)) return null
    const selected = selectedWall?.wallId === wall.id
    const material = preview
      ? { color: '#7c3aed', opacity: 0.55 }
      : wallMaterialFor(wallTypes[`interior:${wall.id}`], selected)
    return (
      <Line
        key={`2d-interior-wall-${wall.id}`}
        points={[[x1, 0.24, z1], [x2, 0.24, z2]]}
        color={material.color}
        lineWidth={selected ? 6 : preview ? 3 : 4}
        transparent
        opacity={material.opacity}
        onPointerDown={preview ? undefined : (event) => selectInteriorWall(event, wall)}
      />
    )
  }

  if (is2dView) {
    return (
      <group onPointerMove={handlePlanPointerMove} onPointerUp={handlePlanPointerUp} onPointerLeave={handlePlanPointerUp}>
        <mesh rotation-x={-Math.PI / 2} position={[(bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2]} onPointerDown={handlePlanPointerDown}>
          <planeGeometry args={[bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>

        {rooms.map((room) => {
          const cx = room.x + room.width / 2
          const cz = room.z + room.depth / 2
          const roomShape = String(room.shape || 'rectangle').toLowerCase()
          const radius = Number.isFinite(room.radius) && room.radius > 0 ? room.radius : Math.min(room.width, room.depth) / 2
          const polygonShape = (roomShape === 'polygon' || roomShape === 'poly') && Array.isArray(room.polygonPoints) && room.polygonPoints.length >= 3
            ? (() => {
                const points = room.polygonPoints
                  .map((point) => {
                    const px = Number(point.x ?? point[0])
                    const pz = Number(point.z ?? point[1])
                    return Number.isFinite(px) && Number.isFinite(pz) ? [px, pz] : null
                  })
                  .filter(Boolean)
                if (points.length < 3) return null
                const shape = new Shape()
                shape.moveTo(points[0][0], points[0][1])
                for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i][0], points[i][1])
                shape.lineTo(points[0][0], points[0][1])
                return shape
              })()
            : null

          return (
            <group key={`2d-room-${room.id}`}>
              {roomShape === 'circle' ? (
                <mesh rotation-x={-Math.PI / 2} position={[cx, 0.04, cz]} onPointerDown={handlePlanPointerDown}>
                  <circleGeometry args={[radius, 64]} />
                  <meshBasicMaterial color="#f8fafc" />
                </mesh>
              ) : polygonShape ? (
                <mesh rotation-x={-Math.PI / 2} position={[0, 0.04, 0]} onPointerDown={handlePlanPointerDown}>
                  <shapeGeometry args={[polygonShape]} />
                  <meshBasicMaterial color="#f8fafc" />
                </mesh>
              ) : (
                <mesh rotation-x={-Math.PI / 2} position={[cx, 0.04, cz]} onPointerDown={handlePlanPointerDown}>
                  <planeGeometry args={[room.width, room.depth]} />
                  <meshBasicMaterial color="#f8fafc" />
                </mesh>
              )}
              <Line points={getRoomOutlinePoints(room)} color="#475569" lineWidth={2} />
              {render2DWallLine(room, 'north')}
              {render2DWallLine(room, 'south')}
              {render2DWallLine(room, 'west')}
              {render2DWallLine(room, 'east')}
              <Html position={[cx, 0.2, cz]} center>
                <div style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid #cbd5e1', borderRadius: 4, padding: '1px 5px', color: '#17303b', fontSize: 10, fontWeight: 600, lineHeight: 1.2, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                  {room.name}
                </div>
              </Html>
            </group>
          )
        })}

        {doors.map((door) => render2DOpeningLine(door, 'door'))}
        {windows.map((windowItem) => render2DOpeningLine(windowItem, 'window'))}
        {interiorWalls.map((wall) => render2DInteriorWall(wall))}
        {draftInteriorWall?.start && draftInteriorWall?.end && render2DInteriorWall({
          id: 'draft',
          x1: draftInteriorWall.start.x,
          z1: draftInteriorWall.start.z,
          x2: draftInteriorWall.end.x,
          z2: draftInteriorWall.end.z,
        }, true)}
        {draftInteriorWall?.start && (
          <mesh position={[draftInteriorWall.start.x, 0.26, draftInteriorWall.start.z]}>
            <circleGeometry args={[0.18, 20]} />
            <meshBasicMaterial color="#7c3aed" />
          </mesh>
        )}

        <PredictionHeatmapOverlay predictions={predictions} rooms={rooms} wallThickness={wallThickness} />
        {logGridCells.map((cell) => (
          <mesh key={`2d-cell-${cell.id}`} rotation-x={-Math.PI / 2} position={[cell.x, 0.08, cell.z]}>
            <planeGeometry args={[cell.width, cell.depth]} />
            <meshBasicMaterial color={cell.color || '#808080'} transparent opacity={0.42} depthWrite={false} toneMapped={false} />
          </mesh>
        ))}
        {logs.map((item) => (
          <mesh key={`2d-log-${item.id}`} rotation-x={-Math.PI / 2} position={[item.x, 0.24, item.z]}>
            <circleGeometry args={[0.12, 16]} />
            <meshBasicMaterial color={item.color || (item.status === 'adjusted' ? '#ff8a00' : '#1f7a3f')} />
          </mesh>
        ))}
        {sites.map((site) => (
          <group key={`2d-site-${site.id}`} position={[site.x, 0.28, site.z]} onPointerDown={(event) => startDrag(event, 'site', site.id)}>
            <mesh rotation-x={-Math.PI / 2}>
              <circleGeometry args={[0.32, 24]} />
              <meshBasicMaterial color="#2563eb" />
            </mesh>
            <Line points={[[0, 0.04, 0], [0.75, 0.04, 0]]} color="#1d4ed8" lineWidth={3} />
            <Html position={[0, 0.18, 0]} center>
              <div style={{ background: 'rgba(239,246,255,0.95)', border: '1px solid #93c5fd', borderRadius: 4, padding: '1px 5px', color: '#1e3a8a', fontSize: 10, fontWeight: 700, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                {site.name}
              </div>
            </Html>
          </group>
        ))}
        {wifiPoints.map((wifi) => (
          <group key={`2d-wifi-${wifi.id}`} position={[wifi.x, 0.28, wifi.z]} onPointerDown={(event) => startDrag(event, 'wifi', wifi.id)}>
            <mesh rotation-x={-Math.PI / 2}>
              <ringGeometry args={[0.18, 0.34, 32]} />
              <meshBasicMaterial color="#06b6d4" />
            </mesh>
            <Html position={[0, 0.18, 0]} center>
              <div style={{ background: 'rgba(236,254,255,0.94)', border: '1px solid #67e8f9', borderRadius: 4, padding: '1px 5px', color: '#155e75', fontSize: 10, fontWeight: 700, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                {wifi.name}
              </div>
            </Html>
          </group>
        ))}
        {visibleFurniture.map((item) => {
          const isDraft = item.id === 'draft'
          const width = Number(item.width) || 2.4
          const depth = Number(item.depth) || 0.9
          const rotationY = ((Number(item.rotationDeg) || 0) * Math.PI) / 180
          const color = item.type === 'bed' ? '#94a3b8' : item.type === 'almirah' ? '#b7834f' : '#475569'
          return (
            <group key={`2d-furniture-${item.id}`} position={[item.x, 0.22, item.z]} rotation={[0, rotationY, 0]} onPointerDown={isDraft ? undefined : (event) => startDrag(event, 'furniture', item.id)}>
              <mesh rotation-x={-Math.PI / 2}>
                <planeGeometry args={[width, depth]} />
                <meshBasicMaterial color={isDraft ? '#7c3aed' : color} transparent opacity={isDraft ? 0.38 : 0.75} />
              </mesh>
              <Line points={[[-width / 2, 0.04, -depth / 2], [width / 2, 0.04, -depth / 2], [width / 2, 0.04, depth / 2], [-width / 2, 0.04, depth / 2], [-width / 2, 0.04, -depth / 2]]} color={isDraft ? '#7c3aed' : '#334155'} lineWidth={isDraft ? 3 : 2} />
            </group>
          )
        })}
        <Grid position={[0, -0.01, 0]} args={[80, 80]} sectionColor="#94a3b8" cellColor="#cbd5e1" sectionSize={5} sectionThickness={1} cellSize={1} cellThickness={0.5} fadeDistance={80} fadeStrength={1} />
      </group>
    )
  }

  return (
    <group onPointerMove={handlePlanPointerMove} onPointerUp={handlePlanPointerUp} onPointerLeave={handlePlanPointerUp}>
      <mesh rotation-x={-Math.PI / 2} position={[(bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2]} onPointerDown={handlePlanPointerDown}>
        <planeGeometry args={[bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ]} />
        <meshStandardMaterial color="#ffffff" roughness={0.92} metalness={0} />
      </mesh>

      {rooms.map((room) => {
        const cx = room.x + room.width / 2
        const cz = room.z + room.depth / 2
        const roomShape = String(room.shape || 'rectangle').toLowerCase()
        const radius = Number.isFinite(room.radius) && room.radius > 0 ? room.radius : Math.min(room.width, room.depth) / 2
        const hasPolygon = (roomShape === 'polygon' || roomShape === 'poly') && Array.isArray(room.polygonPoints) && room.polygonPoints.length >= 3
        const polygonShape = hasPolygon
          ? (() => {
              const points = room.polygonPoints
                .map((point) => {
                  const px = Number(point.x ?? point[0])
                  const pz = Number(point.z ?? point[1])
                  return Number.isFinite(px) && Number.isFinite(pz) ? [px, pz] : null
                })
                .filter(Boolean)
              if (points.length < 3) return null
              const shape = new Shape()
              shape.moveTo(points[0][0], points[0][1])
              for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i][0], points[i][1])
              shape.lineTo(points[0][0], points[0][1])
              return shape
            })()
          : null

        return (
          <group key={room.id}>
            {roomShape === 'circle' ? (
              <>
                <mesh rotation-x={-Math.PI / 2} position={[cx, 0.025, cz]}>
                  <circleGeometry args={[radius, 64]} />
                  <meshStandardMaterial color="#ffffff" roughness={0.92} metalness={0} />
                </mesh>
                <mesh position={[cx, room.height / 2, cz]}>
                  <cylinderGeometry args={[radius, radius, room.height, 64, 1, true]} />
                  <meshStandardMaterial color="#d3d3d3" side={2} />
                </mesh>
              </>
            ) : polygonShape ? (
              <mesh rotation-x={-Math.PI / 2} position={[0, 0.025, 0]}>
                <shapeGeometry args={[polygonShape]} />
                <meshStandardMaterial color="#ffffff" roughness={0.92} metalness={0} />
              </mesh>
            ) : (
              <>
                <mesh position={[cx, 0.025, cz]} onPointerDown={handlePlanPointerDown}>
                  <boxGeometry args={[room.width, 0.05, room.depth]} />
                  <meshStandardMaterial color="#ffffff" roughness={0.92} metalness={0} />
                </mesh>
                {renderWall(room, 'north', [cx, room.height / 2, room.z], [room.width + wallThickness, room.height, wallThickness])}
                {renderWall(room, 'south', [cx, room.height / 2, room.z + room.depth], [room.width + wallThickness, room.height, wallThickness])}
                {renderWall(room, 'west', [room.x, room.height / 2, cz], [wallThickness, room.height, room.depth + wallThickness])}
                {renderWall(room, 'east', [room.x + room.width, room.height / 2, cz], [wallThickness, room.height, room.depth + wallThickness])}
              </>
            )}
            <Html position={is2dView ? [cx, 0.16, cz] : [cx, room.height + 0.2, cz]} center distanceFactor={is2dView ? undefined : 18}>
              <div style={{ background: 'rgba(255,255,255,0.88)', border: '1px solid #c7d8de', borderRadius: 4, padding: '1px 5px', color: '#17303b', fontSize: is2dView ? 10 : 12, fontWeight: 600, lineHeight: 1.2, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                {room.name}
              </div>
            </Html>
          </group>
        )
      })}

      {interiorWalls.map(renderInteriorWall)}
      {draftInteriorWall?.start && draftInteriorWall?.end && renderInteriorWall({
        id: 'draft',
        x1: draftInteriorWall.start.x,
        z1: draftInteriorWall.start.z,
        x2: draftInteriorWall.end.x,
        z2: draftInteriorWall.end.z,
        height: draftInteriorWall.height,
      }, true)}
      {draftInteriorWall?.start && (
        <mesh position={[draftInteriorWall.start.x, 0.09, draftInteriorWall.start.z]}>
          <sphereGeometry args={[0.18, 16, 16]} />
          <meshStandardMaterial color="#7c3aed" />
        </mesh>
      )}

      <OpeningMeshes rooms={rooms} wallThickness={wallThickness} doors={doors} windows={windows} />
      {logGridCells.map((cell) => (
        <mesh key={cell.id} rotation-x={-Math.PI / 2} position={[cell.x, 0.055, cell.z]}>
          <planeGeometry args={[cell.width, cell.depth]} />
          <meshBasicMaterial color={cell.color || '#808080'} transparent opacity={0.45} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      {logs.map((item) => (
        <mesh key={`log-${item.id}`} position={[item.x, 0.12, item.z]}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshStandardMaterial color={item.color || (item.status === 'adjusted' ? '#ff8a00' : '#1f7a3f')} />
        </mesh>
      ))}
      {sites.map((site) => (
        <group key={`site-${site.id}`} position={[site.x, 0.06, site.z]} onPointerDown={(event) => startDrag(event, 'site', site.id)}>
          {(() => {
            const siteHeightM = Math.max(0.5, Math.min(200, Number(site.heightM) || 3))
            const towerHeight = 1.1 + (siteHeightM / 200) * 7.4
            const sectorHeight = towerHeight * 0.86
            const sectors = getSiteSectors(site)
            return (
              <group>
                <mesh position={[0, 0.04, 0]}>
                  <cylinderGeometry args={[0.32, 0.42, 0.08, 6]} />
                  <meshStandardMaterial color="#334155" metalness={0.1} roughness={0.58} />
                </mesh>
                <mesh position={[0, towerHeight / 2, 0]}>
                  <cylinderGeometry args={[0.035, 0.055, towerHeight, 10]} />
                  <meshStandardMaterial color="#475569" metalness={0.45} roughness={0.35} />
                </mesh>
                {sectors.map((sector, index) => {
                  const sectorAzRad = -((Number(sector.azimuthDeg) || 0) * Math.PI) / 180
                  return (
                    <group key={sector.id || sector.name || index} rotation={[0, sectorAzRad, 0]}>
                      <mesh position={[0.28, sectorHeight, 0]}>
                        <boxGeometry args={[0.1, 0.68, 0.08]} />
                        <meshStandardMaterial color={index === 0 ? '#2563eb' : '#1d4ed8'} metalness={0.18} roughness={0.45} />
                      </mesh>
                    </group>
                  )
                })}
                {[0.45, 0.72, 1].map((radius, index) => (
                  <mesh key={`site-wave-${site.id}-${radius}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035 + index * 0.01, 0]}>
                    <ringGeometry args={[radius, radius + 0.025, 48, 1, -0.72, 1.44]} />
                    <meshBasicMaterial color={index === 0 ? '#2563eb' : index === 1 ? '#3b82f6' : '#93c5fd'} transparent opacity={0.88 - index * 0.18} side={2} toneMapped={false} />
                  </mesh>
                ))}
                <Html position={is2dView ? [0, 0.26, 0] : [0, towerHeight + 0.35, 0]} center distanceFactor={is2dView ? undefined : 18}>
                  <div style={{ background: 'rgba(239,246,255,0.95)', border: '1px solid #93c5fd', borderRadius: 4, padding: '1px 5px', color: '#1e3a8a', fontSize: is2dView ? 10 : 11, fontWeight: 700, lineHeight: 1.2, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                    {site.name}
                  </div>
                </Html>
              </group>
            )
          })()}
        </group>
      ))}
      {wifiPoints.map((wifi) => (
        <group key={`wifi-${wifi.id}`} position={[wifi.x, 0.12, wifi.z]} onPointerDown={(event) => startDrag(event, 'wifi', wifi.id)}>
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.34, 0.38, 0.1, 32]} />
            <meshStandardMaterial color="#0e7490" roughness={0.58} />
          </mesh>
          <mesh position={[0, 0.14, 0]}>
            <sphereGeometry args={[0.26, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#22d3ee" transparent opacity={0.9} roughness={0.36} />
          </mesh>
          <mesh position={[0.36, 0.25, 0]} rotation={[0, 0, -0.55]}>
            <cylinderGeometry args={[0.018, 0.018, 0.52, 8]} />
            <meshStandardMaterial color="#155e75" metalness={0.25} roughness={0.42} />
          </mesh>
          <mesh position={[-0.36, 0.25, 0]} rotation={[0, 0, 0.55]}>
            <cylinderGeometry args={[0.018, 0.018, 0.52, 8]} />
            <meshStandardMaterial color="#155e75" metalness={0.25} roughness={0.42} />
          </mesh>
          {[0.42, 0.62, 0.82].map((radius, index) => (
            <mesh key={`wifi-wave-${wifi.id}-${radius}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.17 + index * 0.012, 0]}>
              <ringGeometry args={[radius, radius + 0.022, 48, 1, 0.22, 2.7]} />
              <meshBasicMaterial color={index === 0 ? '#06b6d4' : index === 1 ? '#22d3ee' : '#a5f3fc'} transparent opacity={0.86 - index * 0.18} side={2} toneMapped={false} />
            </mesh>
          ))}
          <Html position={is2dView ? [0, 0.26, 0] : [0, 0.55, 0]} center distanceFactor={is2dView ? undefined : 18}>
            <div style={{ background: 'rgba(236,254,255,0.94)', border: '1px solid #67e8f9', borderRadius: 4, padding: '1px 5px', color: '#155e75', fontSize: is2dView ? 10 : 11, fontWeight: 700, lineHeight: 1.2, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
              {wifi.name}
            </div>
          </Html>
        </group>
      ))}
      {visibleFurniture.map((item) => {
        const isDraft = item.id === 'draft'
        const width = Number(item.width) || 2.4
        const depth = Number(item.depth) || 0.9
        const rotationY = ((Number(item.rotationDeg) || 0) * Math.PI) / 180
        if (item.type === 'almirah') {
          return (
            <group key={`furniture-${item.id}`} position={[item.x, 0.7, item.z]} rotation={[0, rotationY, 0]} onPointerDown={isDraft ? undefined : (event) => startDrag(event, 'furniture', item.id)}>
              <mesh position={[0, 0, 0]}>
                <boxGeometry args={[width, 1.4, depth]} />
                <meshStandardMaterial color={isDraft ? '#7c3aed' : '#8b5a2b'} transparent={isDraft} opacity={isDraft ? 0.45 : 1} roughness={0.74} />
              </mesh>
              <mesh position={[0, 0, depth / 2 + 0.006]}>
                <boxGeometry args={[width * 0.92, 1.22, 0.03]} />
                <meshStandardMaterial color={isDraft ? '#a78bfa' : '#a66a36'} transparent={isDraft} opacity={isDraft ? 0.45 : 1} roughness={0.76} />
              </mesh>
              <mesh position={[0, 0, depth / 2 + 0.03]}>
                <boxGeometry args={[0.025, 0.85, 0.025]} />
                <meshStandardMaterial color="#f8fafc" metalness={0.4} roughness={0.38} />
              </mesh>
            </group>
          )
        }
        if (item.type === 'bed') {
          return (
            <group key={`furniture-${item.id}`} position={[item.x, 0.18, item.z]} rotation={[0, rotationY, 0]} onPointerDown={isDraft ? undefined : (event) => startDrag(event, 'furniture', item.id)}>
              <mesh position={[0, 0.14, 0]}>
                <boxGeometry args={[width, 0.24, depth]} />
                <meshStandardMaterial color={isDraft ? '#7c3aed' : '#94a3b8'} transparent={isDraft} opacity={isDraft ? 0.45 : 1} roughness={0.82} />
              </mesh>
              <mesh position={[0, 0.29, -depth / 2 + 0.08]}>
                <boxGeometry args={[width, 0.3, 0.14]} />
                <meshStandardMaterial color="#64748b" roughness={0.82} />
              </mesh>
              <mesh position={[-width * 0.24, 0.35, depth / 2 - 0.24]}>
                <boxGeometry args={[width * 0.32, 0.08, 0.32]} />
                <meshStandardMaterial color="#e2e8f0" roughness={0.86} />
              </mesh>
              <mesh position={[width * 0.24, 0.35, depth / 2 - 0.24]}>
                <boxGeometry args={[width * 0.32, 0.08, 0.32]} />
                <meshStandardMaterial color="#e2e8f0" roughness={0.86} />
              </mesh>
            </group>
          )
        }
        return (
          <group key={`furniture-${item.id}`} position={[item.x, 0.18, item.z]} rotation={[0, rotationY, 0]} onPointerDown={isDraft ? undefined : (event) => startDrag(event, 'furniture', item.id)}>
            <mesh position={[0, 0.16, 0]}>
              <boxGeometry args={[width, 0.28, depth]} />
              <meshStandardMaterial color={isDraft ? '#7c3aed' : '#475569'} transparent={isDraft} opacity={isDraft ? 0.45 : 1} roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.38, -depth / 2 + 0.08]}>
              <boxGeometry args={[width, 0.36, 0.16]} />
              <meshStandardMaterial color="#334155" roughness={0.8} />
            </mesh>
            <mesh position={[-width / 2 + 0.08, 0.3, 0]}>
              <boxGeometry args={[0.16, 0.28, depth]} />
              <meshStandardMaterial color="#334155" roughness={0.8} />
            </mesh>
            <mesh position={[width / 2 - 0.08, 0.3, 0]}>
              <boxGeometry args={[0.16, 0.28, depth]} />
              <meshStandardMaterial color="#334155" roughness={0.8} />
            </mesh>
          </group>
        )
      })}
      <PredictionHeatmapOverlay predictions={predictions} rooms={rooms} wallThickness={wallThickness} />
      <Grid position={[0, -0.01, 0]} args={[80, 80]} sectionColor="#4b6c7b" cellColor="#9cb5c0" sectionSize={5} sectionThickness={1} cellSize={1} cellThickness={0.5} fadeDistance={80} fadeStrength={1} />
    </group>
  )
}
