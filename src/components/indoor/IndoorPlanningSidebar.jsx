import { Download } from "lucide-react"

function IndoorPlanningSidebar({
  buttonClass,
  dangerButtonClass,
  inputClass,
  downloadTemplate,
  handleExcelUpload,
  uploadMessage,
  handleImageUpload,
  isParsingImage,
  imageMessage,
  handleLogsUpload,
  logsMessage,
  showLogs,
  setShowLogs,
  showLogGrid,
  setShowLogGrid,
  logGridSizeM,
  setLogGridSizeM,
  logGridAggregation,
  setLogGridAggregation,
  detectedPlan,
  updateDetectedRoom,
  removeDetectedRoom,
  applyDetectedPlan,
  downloadReviewedDetectedExcel,
  setDetectedPlan,
  siteName,
  setSiteName,
  selectedFloor,
  selectedFloorId,
  setSelectedFloorId,
  floors,
  wallThickness,
  setWallThickness,
  visibleRooms,
  totalArea,
  removeRoom,
  overlapWarnings,
}) {
  return (
    <aside className="order-2 overflow-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between p-1">
        <h1 className="font-bold">Floor Planner</h1>
        <button className={buttonClass} type="button" onClick={downloadTemplate}><Download /></button>
      </div>

      <section className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <h2>Uploaded Logs Grid</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className={buttonClass} type="button" onClick={() => setShowLogs((prev) => !prev)}>Logs: {showLogs ? "ON" : "OFF"}</button>
          <button className={buttonClass} type="button" onClick={() => setShowLogGrid((prev) => !prev)}>Log Grid: {showLogGrid ? "ON" : "OFF"}</button>
        </div>
        <label className="mb-3 mt-2 grid gap-1.5 text-sm">
          Grid Size (m)
          <input className={inputClass} type="number" step="0.5" min="1" value={logGridSizeM} onChange={(e) => setLogGridSizeM(Math.max(1, Number(e.target.value) || 1))} />
        </label>
        <label className="mb-1 grid gap-1.5 text-sm">
          Aggregate Method
          <select className={inputClass} value={logGridAggregation} onChange={(e) => setLogGridAggregation(e.target.value)}>
            <option value="mean">Mean</option>
            <option value="median">Median</option>
            <option value="min">Min</option>
            <option value="max">Max</option>
          </select>
        </label>
      </section>

      {detectedPlan && (
        <section className="mb-4 mt-2 rounded-lg border border-slate-300 bg-slate-50 p-2.5">
          <h2>Detected Rooms Review</h2>
        
          {detectedPlan.rooms.map((room) => (
            <div key={room.id} className="mb-1.5 grid grid-cols-[1.9fr_repeat(5,0.9fr)_1fr] items-center gap-1.5">
              <input className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" value={room.name} onChange={(event) => updateDetectedRoom(room.id, "name", event.target.value)} />
              <input className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" type="number" step="0.1" value={room.x} onChange={(event) => updateDetectedRoom(room.id, "x", event.target.value)} />
              <input className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" type="number" step="0.1" value={room.z} onChange={(event) => updateDetectedRoom(room.id, "z", event.target.value)} />
              <input className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" type="number" step="0.1" min="1" value={room.width} onChange={(event) => updateDetectedRoom(room.id, "width", event.target.value)} />
              <input className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" type="number" step="0.1" min="1" value={room.depth} onChange={(event) => updateDetectedRoom(room.id, "depth", event.target.value)} />
              <input className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" type="number" step="0.1" min="2" value={room.height} onChange={(event) => updateDetectedRoom(room.id, "height", event.target.value)} />
              <button type="button" className={dangerButtonClass} onClick={() => removeDetectedRoom(room.id)}>Remove</button>
            </div>
          ))}
          <div className="mt-2 flex flex-wrap gap-2">
            <button className={buttonClass} type="button" onClick={applyDetectedPlan}>Apply</button>
            <button className={buttonClass} type="button" onClick={downloadReviewedDetectedExcel}>Download Reviewed Excel</button>
            <button type="button" className={dangerButtonClass} onClick={() => setDetectedPlan(null)}>Discard</button>
          </div>
        </section>
      )}

      <label className="mb-3 grid gap-1.5 text-sm">
        Site Name
        <input className={inputClass} value={siteName} onChange={(event) => setSiteName(event.target.value)} />
      </label>
      <label className="mb-3 grid gap-1.5 text-sm">
        View Floor
        <select className={inputClass} value={selectedFloorId} onChange={(event) => setSelectedFloorId(event.target.value)}>
          {floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}
        </select>
      </label>
      <label className="mb-3 grid gap-1.5 text-sm">
        Wall Thickness (m)
        <input className={inputClass} type="number" step="0.05" min="0.1" max="0.5" value={wallThickness} onChange={(event) => setWallThickness(Number(event.target.value) || 0.2)} />
      </label>

      <section className="mt-4">
        <h2>{selectedFloor.name} Rooms ({visibleRooms.length})</h2>
        <p>Total Area: {totalArea} m2</p>
        {visibleRooms.map((room) => (
          <article key={room.id} className="mb-2 flex items-center justify-between rounded-lg border border-slate-200 p-2">
            <div>
              <strong>{room.name}</strong>
              <p className="mt-0.5 text-xs text-slate-600">{room.width}m x {room.depth}m x {room.height}m</p>
            </div>
            <button className={dangerButtonClass} type="button" onClick={() => removeRoom(room.id)}>Remove</button>
          </article>
        ))}
      </section>

      {overlapWarnings.length > 0 && (
        <section className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <h2>Overlap Warnings</h2>
          {overlapWarnings.map((warning) => <p className="mb-1 text-xs text-amber-800" key={warning}>{warning}</p>)}
        </section>
      )}
    </aside>
  )
}

export default IndoorPlanningSidebar
