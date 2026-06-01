import { useEffect, useMemo, useRef } from 'react'
import { Grid, Html } from '@react-three/drei'
import { CanvasTexture, Shape } from 'three'
import { normalizeWallSide } from '../../utils/indoor/floorPlan'

const colorToRgb = (input) => {
  const s = String(input || '').trim()
  const rgb = s.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  const hex = s.replace('#', '')
  if (hex.length === 6) return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
  return [128, 128, 128]
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

export function FloorModel({ rooms, wallThickness, doors, windows, logs = [], sites = [], predictions = [], logGridCells = [] }) {
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

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[(bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2]}>
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
                <mesh position={[cx, 0.025, cz]}>
                  <boxGeometry args={[room.width, 0.05, room.depth]} />
                  <meshStandardMaterial color="#ffffff" roughness={0.92} metalness={0} />
                </mesh>
                <mesh position={[cx, room.height / 2, room.z]}>
                  <boxGeometry args={[room.width + wallThickness, room.height, wallThickness]} />
                  <meshStandardMaterial color="#d3d3d3" />
                </mesh>
                <mesh position={[cx, room.height / 2, room.z + room.depth]}>
                  <boxGeometry args={[room.width + wallThickness, room.height, wallThickness]} />
                  <meshStandardMaterial color="#d3d3d3" />
                </mesh>
                <mesh position={[room.x, room.height / 2, cz]}>
                  <boxGeometry args={[wallThickness, room.height, room.depth + wallThickness]} />
                  <meshStandardMaterial color="#d3d3d3" />
                </mesh>
                <mesh position={[room.x + room.width, room.height / 2, cz]}>
                  <boxGeometry args={[wallThickness, room.height, room.depth + wallThickness]} />
                  <meshStandardMaterial color="#d3d3d3" />
                </mesh>
              </>
            )}
            <Html position={[cx, room.height + 0.2, cz]} center distanceFactor={18}>
              <div style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid #c7d8de', borderRadius: 4, padding: '2px 6px', color: '#17303b', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                {room.name}
              </div>
            </Html>
          </group>
        )
      })}

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
        <group key={`site-${site.id}`} position={[site.x, 0.12, site.z]}>
          {(() => {
            const azRad = -((Number(site.azimuthDeg) || 0) * Math.PI) / 180
            return (
              <group rotation={[0, azRad, 0]}>
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
                  <circleGeometry args={[0.06, 20]} />
                  <meshBasicMaterial color="#1d4ed8" toneMapped={false} />
                </mesh>
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
                  <ringGeometry args={[0.14, 0.17, 32, 1, -0.65, 1.3]} />
                  <meshBasicMaterial color="#2563eb" side={2} toneMapped={false} />
                </mesh>
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
                  <ringGeometry args={[0.24, 0.27, 36, 1, -0.65, 1.3]} />
                  <meshBasicMaterial color="#3b82f6" side={2} toneMapped={false} />
                </mesh>
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
                  <ringGeometry args={[0.34, 0.37, 40, 1, -0.65, 1.3]} />
                  <meshBasicMaterial color="#60a5fa" side={2} toneMapped={false} />
                </mesh>
                <mesh position={[0.4, 0.01, 0]}>
                  <boxGeometry args={[0.16, 0.02, 0.02]} />
                  <meshBasicMaterial color="#1d4ed8" toneMapped={false} />
                </mesh>
              </group>
            )
          })()}
        </group>
      ))}
      <PredictionHeatmapOverlay predictions={predictions} rooms={rooms} wallThickness={wallThickness} />
      <Grid position={[0, -0.01, 0]} args={[80, 80]} sectionColor="#4b6c7b" cellColor="#9cb5c0" sectionSize={5} sectionThickness={1} cellSize={1} cellThickness={0.5} fadeDistance={80} fadeStrength={1} />
    </group>
  )
}
