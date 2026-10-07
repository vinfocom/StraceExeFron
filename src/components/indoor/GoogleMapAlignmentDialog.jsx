import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { GoogleMap, MarkerF, PolygonF, PolylineF, useJsApiLoader } from '@react-google-maps/api'
import MapSearchBox from '@/components/map/MapSearchBox'
import { GOOGLE_MAPS_LOADER_OPTIONS, getGoogleMapsConfigError, getGoogleMapsErrorMessage } from '@/lib/googleMapsLoader'
import { getAlignmentFootprintCoverage, isValidAlignment, isValidLatLng, localToGeographic, rotationFromTwoPoints } from '@/utils/indoor/geographicAlignment'

const roomOutline = (room) => {
  if (Array.isArray(room.polygonPoints) && room.polygonPoints.length >= 3) return room.polygonPoints.map((point) => ({ x: Number(point.x ?? point[0]), z: Number(point.z ?? point[1]) }))
  if (room.shape === 'circle') {
    const radius = Number(room.radius) || Math.min(Number(room.width), Number(room.depth)) / 2
    const cx = Number(room.x) + Number(room.width) / 2
    const cz = Number(room.z) + Number(room.depth) / 2
    return Array.from({ length: 32 }, (_, index) => ({ x: cx + radius * Math.cos(index * Math.PI / 16), z: cz + radius * Math.sin(index * Math.PI / 16) }))
  }
  const x = Number(room.x), z = Number(room.z), width = Number(room.width), depth = Number(room.depth)
  return [{ x, z }, { x: x + width, z }, { x: x + width, z: z + depth }, { x, z: z + depth }]
}

const outerEnvelope = (rooms) => {
  const points = rooms.flatMap(roomOutline).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z))
  if (points.length < 3) return []
  points.sort((a, b) => a.x - b.x || a.z - b.z)
  const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)
  const lower = []
  for (const point of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop()
    lower.push(point)
  }
  const upper = []
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop()
    upper.push(point)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' }
const MAP_OPTIONS = { mapTypeId: 'satellite', streetViewControl: false, fullscreenControl: false, clickableIcons: false }
const FOOTPRINT_OPTIONS = { strokeColor: '#f97316', strokeWeight: 3, fillColor: '#f97316', fillOpacity: 0.12, clickable: false }
const ROOM_OPTIONS = { strokeColor: '#0f766e', strokeWeight: 1, fillColor: '#14b8a6', fillOpacity: 0.08, clickable: false }
const ROUTE_OPTIONS = { strokeColor: '#2563eb', strokeWeight: 3, strokeOpacity: 0.9, clickable: false }
const DIRECTION_OPTIONS = { strokeColor: '#16a34a', strokeWeight: 3, clickable: false }

export default function GoogleMapAlignmentDialog({ floors, rooms, boundaryPolygon, alignment, logs = [], onSave, onCancel }) {
  const { isLoaded, loadError } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS)
  const firstGeoLog = logs.find((log) => isValidLatLng(log.lat, log.lng))
  // GoogleMap's center and zoom are initial values. The map owns subsequent pan
  // and zoom changes; editing rotation or plan coordinates only moves overlays.
  const [initialView] = useState(() => ({
    center: isValidAlignment(alignment) ? { lat: Number(alignment.lat), lng: Number(alignment.lng) } : firstGeoLog ? { lat: Number(firstGeoLog.lat), lng: Number(firstGeoLog.lng) } : { lat: 20.5937, lng: 78.9629 },
    zoom: isValidAlignment(alignment) || firstGeoLog ? 19 : 5,
  }))
  const [draft, setDraft] = useState(() => alignment || {
    lat: null, lng: null, x: 0, z: 0, rotationDeg: 0,
    referenceFloorId: floors[0]?.id || 'level-1', unit: 'm',
  })
  const [showRooms, setShowRooms] = useState(false)
  const [pickMode, setPickMode] = useState('anchor')
  const [directionPoint, setDirectionPoint] = useState(() => ({ x: Number(alignment?.x || 0) + 10, z: Number(alignment?.z || 0) }))
  const [directionLocation, setDirectionLocation] = useState(null)
  const [directionError, setDirectionError] = useState('')
  const referenceRooms = useMemo(() => rooms.filter((room) => (room.floorId || 'level-1') === draft.referenceFloorId), [rooms, draft.referenceFloorId])
  const valid = isValidAlignment(draft) && floors.some((floor) => floor.id === draft.referenceFloorId)
  const footprintLocal = useMemo(() => Array.isArray(boundaryPolygon) && boundaryPolygon.length >= 3 ? boundaryPolygon : outerEnvelope(referenceRooms), [boundaryPolygon, referenceRooms])
  const footprint = useMemo(() => {
    if (!valid) return []
    return footprintLocal.map((point) => localToGeographic({ x: Number(point.x ?? point[0]), z: Number(point.z ?? point[1]) }, draft)).filter(Boolean)
  }, [draft, footprintLocal, valid])
  const outlines = useMemo(() => valid && showRooms ? referenceRooms.map((room) => roomOutline(room).map((point) => localToGeographic(point, draft)).filter(Boolean)).filter((path) => path.length >= 3) : [], [draft, referenceRooms, showRooms, valid])
  const route = useMemo(() => {
    const points = logs.filter((log) => isValidLatLng(log.lat, log.lng))
    const stride = Math.max(1, Math.ceil(points.length / 1500))
    return points.filter((_, index) => index % stride === 0).map((log) => ({ lat: Number(log.lat), lng: Number(log.lng) }))
  }, [logs])
  const directionPreview = valid ? localToGeographic({ x: Number(directionPoint.x), z: Number(directionPoint.z) }, draft) : null
  const coverage = useMemo(() => getAlignmentFootprintCoverage(logs, draft, footprintLocal), [logs, draft, footprintLocal])
  const setField = (field, value) => setDraft((current) => ({ ...current, [field]: value }))
  const setAnchorCoordinate = (field, value) => {
    const delta = Number(value) - Number(draft[field])
    setField(field, value)
    if (Number.isFinite(delta)) setDirectionPoint((current) => ({ ...current, [field]: Number(current[field]) + delta }))
  }
  const handleMapClick = (event) => {
    const point = { lat: event.latLng.lat(), lng: event.latLng.lng() }
    if (pickMode === 'direction') {
      const angle = rotationFromTwoPoints({ x: draft.x, z: draft.z }, directionPoint, draft, point)
      if (angle === null) {
        setDirectionError('Choose a second plan point and map point at least 0.5 m from the anchor.')
        return
      }
      setDraft((current) => ({ ...current, rotationDeg: angle }))
      setDirectionLocation(point)
      setDirectionError('')
      return
    }
    setDraft((current) => ({ ...current, lat: point.lat, lng: point.lng }))
    setDirectionLocation(null)
    setDirectionError('')
    setPickMode('direction')
  }
  const mapError = getGoogleMapsConfigError() || (loadError ? getGoogleMapsErrorMessage(loadError) : null)

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label="Align with Google Map">
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-y-auto overflow-x-hidden rounded-xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div><h2 className="text-lg font-semibold">Align with Google Map</h2><p className="text-sm text-slate-600">Choose a building anchor on the plan and map, then choose a second matching point to set direction. The blue route shows GPS logs; the orange shape shows the building. Adjust rotation if needed.</p></div>
          <button type="button" className="rounded border px-3 py-1" onClick={onCancel}>Close</button>
        </div>
        <div className="mb-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
          <label>Reference floor<select className="w-full rounded border p-1" value={draft.referenceFloorId} onChange={(event) => setField('referenceFloorId', event.target.value)}>{floors.map((floor) => <option value={floor.id} key={floor.id}>{floor.name}</option>)}</select></label>
          <label>Known plan X (m)<input className="w-full rounded border p-1" type="number" step="any" value={draft.x} onChange={(event) => setAnchorCoordinate('x', event.target.value)} /></label>
          <label>Known plan Z (m)<input className="w-full rounded border p-1" type="number" step="any" value={draft.z} onChange={(event) => setAnchorCoordinate('z', event.target.value)} /></label>
          <label>Rotation (degrees)<input className="w-full rounded border p-1" type="number" step="any" value={draft.rotationDeg} onChange={(event) => setField('rotationDeg', event.target.value)} /></label>
          <label className="self-end text-xs text-slate-600">Fine rotation<input className="w-full" type="range" min="-180" max="180" step="1" value={Number(draft.rotationDeg) || 0} onChange={(event) => setField('rotationDeg', event.target.value)} /></label>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2 text-xs">
          <button type="button" className={`rounded border px-2 py-1 ${pickMode === 'anchor' ? 'border-teal-600 bg-teal-50' : 'border-slate-300 bg-white'}`} onClick={() => setPickMode('anchor')}>1. Place anchor</button>
          <span>then</span>
          <button type="button" className={`rounded border px-2 py-1 ${pickMode === 'direction' ? 'border-teal-600 bg-teal-50' : 'border-slate-300 bg-white'}`} onClick={() => setPickMode('direction')}>2. Set direction</button>
          <label>Second plan X (m)<input className="ml-1 w-16 rounded border p-1" type="number" step="any" value={directionPoint.x} onChange={(event) => setDirectionPoint((current) => ({ ...current, x: event.target.value }))} /></label>
          <label>Second plan Z (m)<input className="ml-1 w-16 rounded border p-1" type="number" step="any" value={directionPoint.z} onChange={(event) => setDirectionPoint((current) => ({ ...current, z: event.target.value }))} /></label>
          <span className="text-slate-600">Click the matching second point on the satellite map. North is up.</span>
        </div>
        {directionError && <p className="mb-2 text-xs text-rose-700" role="alert">{directionError}</p>}
        {mapError ? <p className="rounded bg-amber-50 p-4 text-amber-900">{mapError}</p> : isLoaded ? (
          <div className="relative isolate h-[min(55dvh,560px)] min-h-[300px] shrink-0 overflow-hidden rounded-md border border-slate-200">
            <GoogleMap mapContainerStyle={MAP_CONTAINER_STYLE} center={initialView.center} zoom={initialView.zoom} onClick={handleMapClick} options={MAP_OPTIONS}>
              <MapSearchBox />
              {route.length > 1 && <PolylineF path={route} options={ROUTE_OPTIONS} />}
              {valid && <MarkerF position={{ lat: Number(draft.lat), lng: Number(draft.lng) }} draggable onDragEnd={(event) => { setDraft((current) => ({ ...current, lat: event.latLng.lat(), lng: event.latLng.lng() })); setDirectionLocation(null) }} title={`Anchor: plan X ${draft.x} m, Z ${draft.z} m`} />}
              {valid && directionPreview && <PolylineF path={[{ lat: Number(draft.lat), lng: Number(draft.lng) }, directionPreview]} options={DIRECTION_OPTIONS} />}
              {directionPreview && <MarkerF position={directionPreview} title={`Plan direction point X ${directionPoint.x} m, Z ${directionPoint.z} m`} />}
              {directionLocation && <MarkerF position={directionLocation} title={`Direction point: plan X ${directionPoint.x} m, Z ${directionPoint.z} m`} />}
              {footprint.length >= 3 && <PolygonF paths={footprint} options={FOOTPRINT_OPTIONS} />}
              {outlines.map((path, index) => <PolygonF key={index} paths={path} options={ROOM_OPTIONS} />)}
            </GoogleMap>
          </div>
        ) : <p className="p-4">Loading Google Maps…</p>}
        {valid && coverage.total > 0 && <p className="mt-2 text-xs text-slate-700" role="status">{coverage.inside} of {coverage.total} GPS samples fall inside the building footprint. {coverage.medianAccuracyM !== null && `Median reported GPS accuracy: ${coverage.medianAccuracyM.toFixed(1)} m.`}</p>}
        {coverage.medianAccuracyM > 10 && <p className="mt-1 text-xs text-amber-700">Reported GPS uncertainty is larger than many rooms. Point positions cannot reliably identify individual rooms.</p>}
        <div className="relative z-10 mt-3 flex flex-wrap items-center justify-between gap-3 bg-white">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600"><span>Anchor: {valid ? `${Number(draft.lat).toFixed(7)}, ${Number(draft.lng).toFixed(7)}` : 'Choose a location on the map'}</span><span>{boundaryPolygon?.length >= 3 ? 'Building boundary' : 'Approximate outer envelope from rooms'}</span><label className="flex items-center gap-1"><input type="checkbox" checked={showRooms} onChange={(event) => setShowRooms(event.target.checked)} />Show room outlines</label></div>
          <div className="flex gap-2"><button type="button" className="rounded border px-4 py-2" onClick={onCancel}>Cancel</button><button type="button" disabled={!valid} className="rounded bg-teal-700 px-4 py-2 text-white disabled:opacity-40" onClick={() => onSave({ ...draft, lat: Number(draft.lat), lng: Number(draft.lng), x: Number(draft.x), z: Number(draft.z), rotationDeg: Number(draft.rotationDeg), unit: 'm' })}>Save alignment</button></div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
