import { Download } from "lucide-react"

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

function TinyInput({ label, className, ...props }) {
  return (
    <label className="grid min-w-0 gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
      {label}
      <input className={`min-w-0 w-full ${className}`} {...props} />
    </label>
  )
}

function TinySelect({ label, className, children, ...props }) {
  return (
    <label className="grid min-w-0 gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
      {label}
      <select className={`min-w-0 w-full ${className}`} {...props}>
        {children}
      </select>
    </label>
  )
}

function IndoorPlanningSidebar({
  buttonClass,
  dangerButtonClass,
  inputClass,
  downloadTemplate,
  showLogs,
  setShowLogs,
  showLogGrid,
  setShowLogGrid,
  logGridSizeM,
  setLogGridSizeM,
  logGridAggregation,
  setLogGridAggregation,
  showAddRoomPanel,
  setShowAddRoomPanel,
  showIndoorPlanningPanel,
  setShowIndoorPlanningPanel,
  addRoom,
  newRoom,
  setNewRoom,
  addSite,
  siteForm,
  setSiteForm,
  addWifiPoint,
  wifiForm,
  setWifiForm,
  rfConfig,
  setRfConfig,
  runIndoorPrediction,
  setPredictions,
  simSummary,
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
  sites = [],
  updateSite,
  removeSite,
  wifiPoints = [],
  updateWifiPoint,
  removeWifiPoint,
  furniture = [],
  removeFurniture,
  overlapWarnings,
}) {
  return (
    <aside className="order-2 overflow-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between p-1">
        <h1 className="font-bold">Indoor planing</h1>
        <button className={buttonClass} type="button" onClick={downloadTemplate}><Download /></button>
      </div>

      <section className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <h2>Planning Tools</h2>
        <div className="mt-2 grid gap-2">
          <button className={buttonClass} type="button" onClick={() => { setShowAddRoomPanel?.((value) => !value); setShowIndoorPlanningPanel?.(false) }}>Add Room</button>
          <button className={buttonClass} type="button" onClick={() => { setShowIndoorPlanningPanel?.((value) => !value); setShowAddRoomPanel?.(false) }}>Omni Signal Planning</button>
        </div>
        {showAddRoomPanel && (
          <div className="mt-3 rounded-lg border border-indigo-100 bg-white p-2.5">
            <div className="grid grid-cols-2 gap-2">
              <TinyInput label="Name" className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" value={newRoom.name} onChange={(event) => setNewRoom?.((current) => ({ ...current, name: event.target.value }))} />
              <TinyInput label="Width" className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" type="number" min="1" step="0.5" value={newRoom.width} onChange={(event) => setNewRoom?.((current) => ({ ...current, width: Number(event.target.value) || 1 }))} />
              <TinyInput label="Depth" className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" type="number" min="1" step="0.5" value={newRoom.depth} onChange={(event) => setNewRoom?.((current) => ({ ...current, depth: Number(event.target.value) || 1 }))} />
              <TinyInput label="Height" className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" type="number" min="2" step="0.1" value={newRoom.height} onChange={(event) => setNewRoom?.((current) => ({ ...current, height: Number(event.target.value) || 2.8 }))} />
              <TinyInput label="X" className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" type="number" step="0.5" value={newRoom.x} onChange={(event) => setNewRoom?.((current) => ({ ...current, x: Number(event.target.value) || 0 }))} />
              <TinyInput label="Z" className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" type="number" step="0.5" value={newRoom.z} onChange={(event) => setNewRoom?.((current) => ({ ...current, z: Number(event.target.value) || 0 }))} />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className={buttonClass} type="button" onClick={addRoom}>Add Room</button>
              <button className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600" type="button" onClick={() => setShowAddRoomPanel?.(false)}>X</button>
            </div>
          </div>
        )}
        {showIndoorPlanningPanel && (
          <div className="mt-3 grid gap-3 rounded-lg border border-indigo-100 bg-white p-2.5">
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-600">Omni Signal Source</div>
              <div className="grid grid-cols-2 gap-2">
                <TinyInput label="Name" className="rounded-md border border-blue-200 bg-white px-2 py-1.5 text-xs" value={siteForm.name} onChange={(event) => setSiteForm?.((current) => ({ ...current, name: event.target.value }))} />
                <TinyInput label="Technology" className="rounded-md border border-blue-200 bg-white px-2 py-1.5 text-xs" value={siteForm.technology || ""} onChange={(event) => setSiteForm?.((current) => ({ ...current, technology: event.target.value }))} />
                <TinySelect label="Antenna" className="rounded-md border border-blue-200 bg-white px-2 py-1.5 text-xs" value={siteForm.antennaPattern || "omni"} onChange={(event) => setSiteForm?.((current) => ({ ...current, antennaPattern: event.target.value }))}>
                  <option value="omni">Omni</option>
                  <option value="directional">Directional</option>
                </TinySelect>
                <TinyInput label="X" className="rounded-md border border-blue-200 bg-white px-2 py-1.5 text-xs" type="number" step="0.5" value={siteForm.x} onChange={(event) => setSiteForm?.((current) => ({ ...current, x: event.target.value }))} />
                <TinyInput label="Z" className="rounded-md border border-blue-200 bg-white px-2 py-1.5 text-xs" type="number" step="0.5" value={siteForm.z} onChange={(event) => setSiteForm?.((current) => ({ ...current, z: event.target.value }))} />
                <TinyInput label="Height" className="rounded-md border border-blue-200 bg-white px-2 py-1.5 text-xs" type="number" step="1" min="0.5" max="200" value={siteForm.heightM} onChange={(event) => setSiteForm?.((current) => ({ ...current, heightM: event.target.value }))} />
                <TinyInput label="Tx" className="rounded-md border border-blue-200 bg-white px-2 py-1.5 text-xs" type="number" step="1" value={siteForm.txPowerDbm} onChange={(event) => setSiteForm?.((current) => ({ ...current, txPowerDbm: event.target.value }))} />
                <TinyInput label="Freq" className="rounded-md border border-blue-200 bg-white px-2 py-1.5 text-xs" type="number" step="100" value={siteForm.freqMHz} onChange={(event) => setSiteForm?.((current) => ({ ...current, freqMHz: event.target.value }))} />
                <TinyInput label="Gain" className="rounded-md border border-blue-200 bg-white px-2 py-1.5 text-xs" type="number" step="1" value={siteForm.antennaGainDbi} onChange={(event) => setSiteForm?.((current) => ({ ...current, antennaGainDbi: event.target.value }))} />
                <TinyInput label="Azimuth" className="rounded-md border border-blue-200 bg-white px-2 py-1.5 text-xs" type="number" step="1" value={siteForm.azimuthDeg} onChange={(event) => setSiteForm?.((current) => ({ ...current, azimuthDeg: event.target.value }))} />
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-600">Wi-Fi Access Point</div>
              <div className="grid grid-cols-2 gap-2">
                <TinyInput label="Name" className="rounded-md border border-cyan-200 bg-white px-2 py-1.5 text-xs" value={wifiForm.name} onChange={(event) => setWifiForm?.((current) => ({ ...current, name: event.target.value }))} />
                <TinySelect label="Antenna" className="rounded-md border border-cyan-200 bg-white px-2 py-1.5 text-xs" value={wifiForm.antennaPattern || "omni"} onChange={(event) => setWifiForm?.((current) => ({ ...current, antennaPattern: event.target.value }))}>
                  <option value="omni">Omni</option>
                  <option value="directional">Directional</option>
                </TinySelect>
                <TinyInput label="X" className="rounded-md border border-cyan-200 bg-white px-2 py-1.5 text-xs" type="number" step="0.5" value={wifiForm.x} onChange={(event) => setWifiForm?.((current) => ({ ...current, x: event.target.value }))} />
                <TinyInput label="Z" className="rounded-md border border-cyan-200 bg-white px-2 py-1.5 text-xs" type="number" step="0.5" value={wifiForm.z} onChange={(event) => setWifiForm?.((current) => ({ ...current, z: event.target.value }))} />
                <TinyInput label="Height" className="rounded-md border border-cyan-200 bg-white px-2 py-1.5 text-xs" type="number" step="0.5" value={wifiForm.heightM} onChange={(event) => setWifiForm?.((current) => ({ ...current, heightM: event.target.value }))} />
                <TinyInput label="Tx" className="rounded-md border border-cyan-200 bg-white px-2 py-1.5 text-xs" type="number" step="1" value={wifiForm.txPowerDbm} onChange={(event) => setWifiForm?.((current) => ({ ...current, txPowerDbm: event.target.value }))} />
                <TinyInput label="Freq" className="rounded-md border border-cyan-200 bg-white px-2 py-1.5 text-xs" type="number" step="100" value={wifiForm.freqMHz} onChange={(event) => setWifiForm?.((current) => ({ ...current, freqMHz: event.target.value }))} />
                <TinyInput label="Gain" className="rounded-md border border-cyan-200 bg-white px-2 py-1.5 text-xs" type="number" step="1" value={wifiForm.antennaGainDbi} onChange={(event) => setWifiForm?.((current) => ({ ...current, antennaGainDbi: event.target.value }))} />
                <TinyInput label="Azimuth" className="rounded-md border border-cyan-200 bg-white px-2 py-1.5 text-xs" type="number" step="1" value={wifiForm.azimuthDeg} onChange={(event) => setWifiForm?.((current) => ({ ...current, azimuthDeg: event.target.value }))} />
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-600">RF Config</div>
              <div className="grid grid-cols-2 gap-2">
                <TinyInput label="Wall Loss" className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" type="number" step="0.5" value={rfConfig.wallLossDb} onChange={(event) => setRfConfig?.((current) => ({ ...current, wallLossDb: event.target.value }))} />
                <TinyInput label="Door Loss" className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" type="number" step="0.5" value={rfConfig.doorLossDb} onChange={(event) => setRfConfig?.((current) => ({ ...current, doorLossDb: event.target.value }))} />
                <TinyInput label="RX Gain" className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" type="number" step="0.5" value={rfConfig.rxGainDbi} onChange={(event) => setRfConfig?.((current) => ({ ...current, rxGainDbi: event.target.value }))} />
                <TinyInput label="Omni Range" className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" type="number" step="1" min="20" max="50" value={rfConfig.omniRangeM ?? 50} onChange={(event) => setRfConfig?.((current) => ({ ...current, omniRangeM: Math.max(20, Math.min(50, Number(event.target.value) || 50)) }))} />
                <TinyInput label="Grid Step" className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" type="number" step="0.2" min="0.3" value={rfConfig.gridStepM} onChange={(event) => setRfConfig?.((current) => ({ ...current, gridStepM: event.target.value }))} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={buttonClass} type="button" onClick={addSite}>Add Omni Signal</button>
              <button className={buttonClass} type="button" onClick={() => addWifiPoint?.()}>Add Wi-Fi</button>
              <button className={buttonClass} type="button" onClick={runIndoorPrediction}>Run Prediction</button>
              <button type="button" className={dangerButtonClass} onClick={() => setPredictions?.([])}>Clear</button>
              <button className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600" type="button" onClick={() => setShowIndoorPlanningPanel?.(false)}>X</button>
            </div>
            {simSummary && (
              <div className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                <span>Avg Rx: {simSummary.avg} dBm</span>
                <span>Avg Loss: {simSummary.avgLoss} dB</span>
                <span>Max distance: {simSummary.maxDistance} m</span>
                <span>Quality: {simSummary.avgQuality}%</span>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <h2>Log Grid Settings</h2>
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
        Omni Site Signal Name
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

      <section className="mt-4">
        <h2>Network Points</h2>
        {sites.map((site) => (
          <article key={site.id} className="mb-2 rounded-lg border border-blue-100 bg-blue-50 p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <TinyInput label="Name" className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs" value={site.name} onChange={(event) => updateSite?.(site.id, "name", event.target.value)} />
              </div>
              <button className={dangerButtonClass} type="button" onClick={() => removeSite?.(site.id)}>Remove</button>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(96px,1fr))] gap-1.5">
              <TinyInput label="Technology" className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs" value={site.technology || ""} onChange={(event) => updateSite?.(site.id, "technology", event.target.value)} />
              <TinySelect label="Antenna" className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs" value={site.antennaPattern || "omni"} onChange={(event) => updateSite?.(site.id, "antennaPattern", event.target.value)}>
                <option value="omni">Omni</option>
                <option value="directional">Directional</option>
              </TinySelect>
              <TinyInput label="X" className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs" type="number" step="0.1" value={site.x} onChange={(event) => updateSite?.(site.id, "x", event.target.value)} />
              <TinyInput label="Z" className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs" type="number" step="0.1" value={site.z} onChange={(event) => updateSite?.(site.id, "z", event.target.value)} />
              <TinyInput label="Height" className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs" type="number" step="1" min="0.5" max="200" value={site.heightM} onChange={(event) => updateSite?.(site.id, "heightM", event.target.value)} />
              <TinyInput label="Tx" className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs" type="number" step="1" value={site.txPowerDbm} onChange={(event) => updateSite?.(site.id, "txPowerDbm", event.target.value)} />
              <TinyInput label="Freq" className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs" type="number" step="100" value={site.freqMHz} onChange={(event) => updateSite?.(site.id, "freqMHz", event.target.value)} />
              <TinyInput label="Gain" className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs" type="number" step="1" value={site.antennaGainDbi} onChange={(event) => updateSite?.(site.id, "antennaGainDbi", event.target.value)} />
            </div>
            <div className="mt-2 grid gap-1">
              {getSiteSectors(site).map((sector) => (
                <div key={sector.id || sector.name} className="rounded-md border border-blue-200 bg-white px-2 py-1 text-[11px] text-blue-900">
                  <span className="font-semibold">{sector.name}</span>
                  <span> | Az {Number(sector.azimuthDeg || 0).toFixed(0)} deg</span>
                  <span> | BW {Number(sector.beamwidthDeg || 120).toFixed(0)} deg</span>
                  <span> | Tx {Number(sector.txPowerDbm ?? site.txPowerDbm ?? 0).toFixed(0)} dBm</span>
                  <span> | Gain {Number(sector.antennaGainDbi ?? site.antennaGainDbi ?? 0).toFixed(0)} dBi</span>
                </div>
              ))}
            </div>
          </article>
        ))}
        {wifiPoints.map((wifi) => (
          <article key={wifi.id} className="mb-2 rounded-lg border border-cyan-100 bg-cyan-50 p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <TinyInput label="Name" className="rounded-md border border-cyan-200 bg-white px-2 py-1 text-xs" value={wifi.name} onChange={(event) => updateWifiPoint?.(wifi.id, "name", event.target.value)} />
              </div>
              <button className={dangerButtonClass} type="button" onClick={() => removeWifiPoint?.(wifi.id)}>Remove</button>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(96px,1fr))] gap-1.5">
              <TinySelect label="Antenna" className="rounded-md border border-cyan-200 bg-white px-2 py-1 text-xs" value={wifi.antennaPattern || "omni"} onChange={(event) => updateWifiPoint?.(wifi.id, "antennaPattern", event.target.value)}>
                <option value="omni">Omni</option>
                <option value="directional">Directional</option>
              </TinySelect>
              <TinyInput label="X" className="rounded-md border border-cyan-200 bg-white px-2 py-1 text-xs" type="number" step="0.1" value={wifi.x} onChange={(event) => updateWifiPoint?.(wifi.id, "x", event.target.value)} />
              <TinyInput label="Z" className="rounded-md border border-cyan-200 bg-white px-2 py-1 text-xs" type="number" step="0.1" value={wifi.z} onChange={(event) => updateWifiPoint?.(wifi.id, "z", event.target.value)} />
              <TinyInput label="Height" className="rounded-md border border-cyan-200 bg-white px-2 py-1 text-xs" type="number" step="0.5" value={wifi.heightM} onChange={(event) => updateWifiPoint?.(wifi.id, "heightM", event.target.value)} />
              <TinyInput label="Tx" className="rounded-md border border-cyan-200 bg-white px-2 py-1 text-xs" type="number" step="1" value={wifi.txPowerDbm} onChange={(event) => updateWifiPoint?.(wifi.id, "txPowerDbm", event.target.value)} />
              <TinyInput label="Freq" className="rounded-md border border-cyan-200 bg-white px-2 py-1 text-xs" type="number" step="100" value={wifi.freqMHz} onChange={(event) => updateWifiPoint?.(wifi.id, "freqMHz", event.target.value)} />
              <TinyInput label="Gain" className="rounded-md border border-cyan-200 bg-white px-2 py-1 text-xs" type="number" step="1" value={wifi.antennaGainDbi} onChange={(event) => updateWifiPoint?.(wifi.id, "antennaGainDbi", event.target.value)} />
            </div>
          </article>
        ))}
      </section>

      {furniture.length > 0 && (
        <section className="mt-4">
          <h2>Furniture</h2>
          {furniture.map((item) => (
            <article key={item.id} className="mb-2 flex items-center justify-between rounded-lg border border-slate-200 p-2">
              <div>
                <strong>{item.name}</strong>
                <p className="mt-0.5 text-xs text-slate-600">x {Number(item.x).toFixed(1)}, z {Number(item.z).toFixed(1)}</p>
              </div>
              <button className={dangerButtonClass} type="button" onClick={() => removeFurniture?.(item.id)}>Remove</button>
            </article>
          ))}
        </section>
      )}

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
