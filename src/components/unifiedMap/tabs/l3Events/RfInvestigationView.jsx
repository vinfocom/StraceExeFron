import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { getRfTimestamp, getRfWindow, matchRfMeasurement, nearestRfRow, normalizeRfTimestamp, resolveRfHover, RF_MATCH_TOLERANCE_MS } from "@/utils/l3Events/rfInvestigation.js";
import { getMapEventMarker, L3EventsMapView } from "@/components/unifiedMap/tabs/L3EventsTab.jsx";

const fmtTime = (ms) => Number.isFinite(ms) ? new Date(ms).toISOString().replace("T", " ") : "Unavailable";
const read = (row, ...keys) => {
  for (const key of keys) {
    const pascal = key[0]?.toUpperCase() + key.slice(1);
    if (row?.[key] !== null && row?.[key] !== undefined) return row[key];
    if (row?.[pascal] !== null && row?.[pascal] !== undefined) return row[pascal];
  }
  return null;
};
const rowTitle = (row) => row?.title || row?.message || row?.officialName || row?.summary || row?.name || "Untitled row";
const timestampOf = (row) => row?.timestampMs ?? getRfTimestamp(row) ?? normalizeRfTimestamp(row?.startTime);
const SERIES = [
  { metric: "RSRP", unit: "dBm", color: "#38bdf8" },
  { metric: "RSRQ", unit: "dB", color: "#a78bfa" },
  { metric: "SINR", unit: "dB", color: "#34d399" },
  { metric: "Downlink throughput", unit: null, color: "#fbbf24" },
  { metric: "Uplink throughput", unit: null, color: "#fb7185" },
];

function Chart({ metric, samples, markers, window, cursor, selectedTime, onHover, onLeave, onClick }) {
  const width = 1000;
  const height = 116;
  const values = samples.flatMap((sample) => sample.metrics.filter((entry) => entry.metric === metric).map((entry) => entry.value));
  if (!values.length) return null;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;
  const xFor = (time) => ((time - window.startMs) / (window.endMs - window.startMs)) * width;
  const yFor = (value) => 12 + ((maxValue - value) / range) * (height - 30);
  const stride = Math.max(1, Math.ceil(samples.length / 3000));
  const displaySamples = stride > 1 ? samples.filter((_, index) => index % stride === 0 || index === samples.length - 1) : samples;
  const points = displaySamples.flatMap((sample) => sample.metrics.filter((entry) => entry.metric === metric).map((entry) => ({ sample, entry })));
  const groups = new Map();
  for (const point of points) {
    const key = `${point.entry.technology}|${point.entry.unit}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(point);
  }
  const color = SERIES.find((series) => series.metric === metric)?.color || "#f8fafc";
  const selectedX = Number.isFinite(selectedTime) ? xFor(selectedTime) : null;
  const cursorX = Number.isFinite(cursor) ? xFor(cursor) : null;
  const cursorPoint = points.reduce((best, point) => !best || Math.abs(point.sample.timestampMs - cursor) < Math.abs(best.sample.timestampMs - cursor) ? point : best, null);
  return <section className="rounded border border-slate-700 bg-slate-950/60 p-2" aria-label={`${metric} timeline`}>
    <div className="mb-1 flex items-center justify-between text-xs"><span className="font-semibold">{metric}</span><span className="text-slate-400">{[...groups.keys()].join(" · ")}{metric.includes("throughput") ? " (source units)" : ` · ${SERIES.find((item) => item.metric === metric)?.unit}`}</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[90px] w-full touch-none" role="img" aria-label={`${metric} aligned measurements`} onPointerMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); const ratio = (event.clientX - rect.left) / rect.width; onHover(window.startMs + Math.max(0, Math.min(1, ratio)) * (window.endMs - window.startMs)); }} onPointerLeave={onLeave} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); onClick(window.startMs + ((event.clientX - rect.left) / rect.width) * (window.endMs - window.startMs)); }}>
      {[0.25, 0.5, 0.75].map((fraction) => <line key={fraction} x1="0" x2={width} y1={12 + fraction * 75} y2={12 + fraction * 75} stroke="#334155" strokeDasharray="3 6" />)}
      {Number.isFinite(selectedX) && <line x1={selectedX} x2={selectedX} y1="6" y2={height - 8} stroke="#f97316" strokeWidth="2" />}
      {Number.isFinite(cursorX) && <line x1={cursorX} x2={cursorX} y1="3" y2={height - 5} stroke="#f8fafc" strokeDasharray="4 3" />}
      {markers.map((marker) => <line key={marker.id} x1={xFor(marker.timestampMs)} x2={xFor(marker.timestampMs)} y1="2" y2="9" stroke={marker.markerColor || "#94a3b8"} strokeWidth="2"><title>{`${marker.markerLabel || marker.sourceType || "Message"}: ${rowTitle(marker)}`}</title></line>)}
      {[...groups].map(([key, group]) => {
        const technology = key.split("|")[0];
        let path = "";
        let previous = null;
        const segments = [];
        for (const point of group) {
          if (previous && point.sample.timestampMs - previous.sample.timestampMs <= 2 * RF_MATCH_TOLERANCE_MS) {
            path += ` L ${xFor(point.sample.timestampMs)} ${yFor(point.entry.value)}`;
          } else {
            if (path) segments.push(path);
            path = `M ${xFor(point.sample.timestampMs)} ${yFor(point.entry.value)}`;
          }
          previous = point;
        }
        if (path) segments.push(path);
        return <g key={key} data-technology={technology}>{segments.map((segment, index) => <path key={index} d={segment} fill="none" stroke={color} strokeWidth="2" opacity="0.85" />)}{group.map(({ sample, entry }) => <circle key={`${sample.id}:${entry.sourceName}`} cx={xFor(sample.timestampMs)} cy={yFor(entry.value)} r="3" fill={color}><title>{`${fmtTime(sample.timestampMs)} · ${technology} ${metric}: ${entry.sourceValue} ${entry.unit} · row ${sample.rowId}`}</title></circle>)}</g>;
      })}
      {cursorPoint && Number.isFinite(cursor) && <circle cx={xFor(cursorPoint.sample.timestampMs)} cy={yFor(cursorPoint.entry.value)} r="5" fill="white" stroke="#0f172a" strokeWidth="2" />}
    </svg>
    <div className="flex justify-between text-[10px] text-slate-500"><span>{fmtTime(window.startMs)}</span><span>{fmtTime(window.endMs)}</span></div>
  </section>;
}

export function RfInvestigationView({ datasetId, timeline = [], calls = [], procedures = [], sessionIds = [], completeness = "unknown", completenessNotice = "", loading, error, onRetry, networkData }) {
  const [query, setQuery] = useState("");
  const [margin, setMargin] = useState(10);
  const [tolerance, setTolerance] = useState(RF_MATCH_TOLERANCE_MS);
  const [selectionId, setSelectionId] = useState("");
  const [cursor, setCursor] = useState(null);
  const [pinnedTime, setPinnedTime] = useState(null);
  const [messageScroll, setMessageScroll] = useState(0);
  const messageListRef = useRef(null);
  const options = useMemo(() => [
    ...calls.map((call, index) => ({ id: `call:${call.id || index}`, kind: "Call", label: `${call.id || `Call ${index + 1}`} · ${call.startTime?.toLocaleString?.() || "time unavailable"}`, startTime: call.startTime, endTime: call.endTime || call.terminationTime, source: call })),
    ...procedures.map((procedure, index) => ({ id: `procedure:${procedure.id || procedure.name || index}`, kind: "Procedure", label: `${procedure.name || procedure.title || procedure.procedure || `Procedure ${index + 1}`} · ${procedure.startTime || procedure.start || ""}`, startTime: procedure.startTime || procedure.start, endTime: procedure.endTime || procedure.end, source: procedure })),
    ...timeline.map((row) => ({ id: `row:${row.id}`, kind: row.type === "l3" ? "L3" : "Event", label: `${row.timestampLabel || row.timestamp?.toLocaleString?.() || "Time unavailable"} · ${rowTitle(row)}`, timestampMs: row.timestampMs, source: row })),
  ], [calls, procedures, timeline]);
  const activeOption = options.find((option) => option.id === selectionId) || options.find((option) => option.kind === "Event") || options[0] || null;
  const selection = activeOption ? { ...activeOption.source, ...activeOption, timestampMs: activeOption.timestampMs ?? timestampOf(activeOption.source) } : null;
  const window = useMemo(() => getRfWindow(selection, margin), [activeOption, margin]);
  const samples = useMemo(() => networkData?.samples || [], [networkData]);
  const messages = useMemo(() => (networkData?.messages || timeline).filter((message) => !window || (message.timestampMs ?? timestampOf(message)) >= window.startMs && (message.timestampMs ?? timestampOf(message)) <= window.endMs), [networkData, timeline, window]);
  const markers = useMemo(() => messages.map((message) => ({ ...message, ...getMapEventMarker(message) })).filter((message) => message.markerType), [messages]);
  const visibleSamples = useMemo(() => window ? samples.filter((sample) => sample.timestampMs >= window.startMs && sample.timestampMs <= window.endMs) : [], [samples, window]);
  const activeCursor = pinnedTime ?? cursor;
  const selectedMessage = selection?.kind === "L3" || selection?.kind === "Event" ? selection.source : nearestRfRow(messages, timestampOf(selection || {}));
  useEffect(() => {
    if (!selectedMessage || !messages.length) return;
    const index = messages.findIndex((row) => row.id === selectedMessage.id);
    if (index >= 0) {
      setMessageScroll(index);
      if (messageListRef.current) messageListRef.current.scrollTop = index * 44;
    }
  }, [messages, selectedMessage]);
  const match = selectedMessage ? matchRfMeasurement(selectedMessage, samples, { sessionIds, toleranceMs: tolerance }) : { status: "unmatched" };
  const hoverResolution = resolveRfHover(activeCursor, messages, samples, { sessionIds, toleranceMs: tolerance });
  const hoverMessage = hoverResolution.message;
  const hoverMatch = hoverResolution.match;
  const mapPoint = hoverResolution.mapPosition ? { ...hoverResolution.mapPosition, id: hoverResolution.mapPosition.sourceId } : null;
  const metrics = new Set(visibleSamples.flatMap((sample) => sample.metrics.map((entry) => entry.metric)));
  const filteredOptions = options.filter((option) => !query || `${option.kind} ${option.label}`.toLowerCase().includes(query.toLowerCase())).slice(0, 30);
  const messageStart = Math.min(messageScroll, Math.max(0, messages.length - 40));
  const shownMessages = messages.slice(messageStart, messageStart + 40);
  const selectedRaw = selectedMessage?.rawMessage || selectedMessage?.rawText || selectedMessage?.summary || selectedMessage?.message || selectedMessage?.raw || "No original message text was returned.";
  if (!window) return <div className="m-4 rounded border border-amber-500/40 bg-amber-950/30 p-4 text-sm text-amber-200"><p>This row has no full date-time, so it cannot be aligned safely with measurements.</p>{selection && <section className="mt-3 rounded border border-slate-700 bg-slate-950 p-3 text-slate-200"><div>{activeOption.kind}: {rowTitle(activeOption.source)}</div><div className="text-xs text-slate-400">Source timestamp: {read(activeOption.source, "timestampLabel", "timestampText", "timestamp") || "Unavailable"} · Row: {activeOption.source?.sourceIndex ?? activeOption.source?.id ?? "—"}</div><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">{String(activeOption.source?.rawMessage || activeOption.source?.rawText || activeOption.source?.summary || "No original message text was returned.")}</pre></section>}</div>;
  return <div className="flex h-full min-h-0 flex-col overflow-auto bg-slate-950 p-3 text-white">
    <div className="mb-3 flex flex-wrap items-end gap-3 rounded border border-slate-700 bg-slate-900 p-3">
      <label className="min-w-[16rem] flex-1 text-xs text-slate-300">Search calls, procedures, and events<input aria-label="Search investigation selections" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search current dataset..." className="mt-1 block w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-white" /></label>
      <select aria-label="Investigation selection" value={activeOption?.id || ""} onChange={(event) => { setSelectionId(event.target.value); setPinnedTime(null); }} className="max-w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-xs">{filteredOptions.map((option) => <option key={option.id} value={option.id}>{option.kind}: {option.label}</option>)}</select>
      <label className="text-xs text-slate-300">Window margin<select value={margin} onChange={(event) => setMargin(Number(event.target.value))} className="ml-2 rounded border border-slate-700 bg-slate-950 px-2 py-2"><option value="5">±5 sec</option><option value="10">±10 sec</option><option value="30">±30 sec</option><option value="60">±60 sec</option></select></label>
      <label className="text-xs text-slate-300">Match tolerance<select aria-label="Measurement match tolerance" value={tolerance} onChange={(event) => setTolerance(Number(event.target.value))} className="ml-2 rounded border border-slate-700 bg-slate-950 px-2 py-2"><option value="250">±250 ms</option><option value="500">±500 ms</option><option value="1000">±1 sec</option><option value="2000">±2 sec</option><option value="5000">±5 sec</option></select></label>
      <span className="text-xs text-slate-400">{completeness === "complete" ? "Dataset marked complete" : `Dataset completeness: ${completeness}`}</span>
    </div>
    {loading && <div className="mb-3 flex items-center gap-2 text-sm text-blue-200"><Loader2 className="h-4 w-4 animate-spin" />Loading RF measurements…</div>}
    {completenessNotice && <div role="status" className="mb-3 rounded border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-200">{completenessNotice}</div>}
    {error && <div role="alert" className="mb-3 rounded border border-amber-500/40 bg-amber-950/30 p-3 text-sm text-amber-200">{error}{onRetry && <button type="button" onClick={onRetry} className="ml-3 underline">Retry</button>}</div>}
    {!loading && !error && networkData?.unavailable && <div role="status" className="mb-3 rounded border border-amber-500/40 bg-amber-950/30 p-3 text-sm text-amber-200">RF measurements are unavailable for this dataset. The existing endpoint requires session IDs; the upload summary exposes no documented network measurement retrieval by upload ID.</div>}
    {!loading && !error && !networkData?.unavailable && !samples.length && <div role="status" className="mb-3 rounded border border-slate-700 p-3 text-sm text-slate-300">No timestamped RF measurement rows were returned for this session scope.</div>}
    <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
      <div className="min-h-0 space-y-2 overflow-auto">
        {SERIES.filter((series) => metrics.has(series.metric)).map((series) => <Chart key={series.metric} metric={series.metric} samples={visibleSamples} markers={markers} window={window} cursor={activeCursor} selectedTime={timestampOf(selection || {})} onHover={setCursor} onLeave={() => setCursor(null)} onClick={(time) => setPinnedTime(time)} />)}
        {!metrics.size && !loading && <div className="rounded border border-slate-700 p-6 text-center text-sm text-slate-400">This response did not contain RSRP, RSRQ, SINR, or throughput values with known units.</div>}
        <div className="rounded border border-slate-700 bg-slate-900 p-2"><div className="mb-2 flex items-center justify-between text-xs"><strong>Nearby L3 and event rows</strong><span>{messages.length.toLocaleString()} rows · showing up to 40</span></div><div ref={messageListRef} onScroll={(event) => setMessageScroll(Math.floor(event.currentTarget.scrollTop / 44))} className="max-h-72 overflow-auto" style={{ height: Math.min(288, Math.max(88, messages.length * 44)) }}>{messages.length > 40 && <div style={{ height: messageStart * 44 }} />}{shownMessages.map((row) => <button key={row.id} type="button" onMouseEnter={() => setCursor(timestampOf(row))} onClick={() => { setSelectionId(`row:${row.id}`); setPinnedTime(timestampOf(row)); }} className={`block h-11 w-full truncate border-b border-slate-800 px-2 text-left text-xs ${row.id === selectedMessage?.id ? "bg-orange-500/20 text-orange-100" : row.id === hoverMessage?.id ? "bg-blue-500/20 text-blue-100" : "text-slate-300 hover:bg-slate-800"}`}>{fmtTime(timestampOf(row))} · {rowTitle(row)}</button>)}{messages.length > messageStart + shownMessages.length && <div style={{ height: (messages.length - messageStart - shownMessages.length) * 44 }} />}</div></div>
      </div>
      <aside className="min-h-0 space-y-2 overflow-auto rounded border border-slate-700 bg-slate-900 p-3 text-xs">
        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Evidence</h3><button type="button" onClick={() => { setPinnedTime(null); setCursor(null); }} className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1"><X className="h-3 w-3" />Clear selection</button></div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-slate-300"><dt>Measurement time (UTC)</dt><dd>{match.sample ? fmtTime(match.sample.timestampMs) : "No match"}</dd><dt>Event time (UTC)</dt><dd>{selectedMessage ? fmtTime(timestampOf(selectedMessage)) : "Unavailable"}</dd><dt>Source timestamps</dt><dd>{String(match.sample?.timestamp ?? "—")} / {String(read(selectedMessage, "timestampLabel", "timestampText", "timestamp") ?? "—")}</dd><dt>Match</dt><dd>{match.status}{match.differenceMs != null ? ` · ${match.differenceMs > 0 ? "+" : ""}${match.differenceMs} ms` : ""}{match.status === "ambiguous" ? ` · candidates ${match.candidates.map((sample) => sample.rowId).join(", ")}` : ""}</dd><dt>Source row</dt><dd>{match.sample?.rowId || "—"}</dd><dt>Event row</dt><dd>{selectedMessage?.sourceIndex ?? selectedMessage?.id ?? "—"}</dd><dt>Session / device</dt><dd>{selectedMessage?.sessionId || match.sample?.sessionId || "—"} / {selectedMessage?.deviceId || match.sample?.deviceId || "—"}</dd><dt>Cell / frequency</dt><dd>{match.sample ? `${match.sample.cell ?? "—"} / ${match.sample.frequency ?? "—"}` : "—"}</dd></dl>
        <div><div className="mb-1 font-semibold text-slate-200">Original message</div><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-950 p-2 text-[11px] text-slate-300">{String(selectedRaw)}</pre></div>
        <div><div className="mb-1 font-semibold text-slate-200">Matched measurements</div>{match.sample?.metrics.length ? <ul className="space-y-1">{match.sample.metrics.map((item, index) => <li key={`${item.sourceName}:${index}`}>{item.technology} {item.metric}: {item.sourceValue} {item.unit} <span className="text-slate-500">({item.sourceName})</span></li>)}</ul> : <p className="text-slate-400">No matched sample inside ±{tolerance} ms for the same session and device/SIM identity.</p>}</div>
        <div className="rounded border border-slate-700 p-2 text-slate-400">Observed facts only. No root-cause assessment is generated.</div>
        {mapPoint && <div className="rounded border border-slate-700 p-2"><strong>Map position</strong><div>{Number(mapPoint.latitude).toFixed(6)}, {Number(mapPoint.longitude).toFixed(6)}</div><div className="mt-1 h-64 overflow-hidden rounded"><L3EventsMapView points={[{ id: String(mapPoint.id || mapPoint.rowId || "rf-map-point"), lat: Number(mapPoint.latitude), lng: Number(mapPoint.longitude), title: rowTitle(hoverMessage || selectedMessage), timestampLabel: fmtTime(activeCursor ?? timestampOf(hoverMessage || selectedMessage || {})), state: "RF Investigation", markerSymbol: "RF", markerLabel: "RF selection", markerColor: "#f97316" }]} active={false} datasetKey={`${datasetId}:rf-preview`} autoCenter={false} /></div><div className="mt-1 text-slate-400">Position source: {mapPoint.id || mapPoint.rowId || "matched network row"}. Map center stays fixed while hovering.</div></div>}
        {Number.isFinite(activeCursor) && <div className="border-t border-slate-700 pt-2 text-slate-400">Shared cursor: {fmtTime(activeCursor)} · nearest row {hoverMessage?.id || "none"}{pinnedTime != null ? " · pinned" : ""}</div>}
        {Number.isFinite(activeCursor) && <div className="rounded border border-blue-500/30 bg-blue-950/20 p-2"><strong>Shared hover evidence</strong><div>Message: {fmtTime(hoverMessage ? timestampOf(hoverMessage) : NaN)} · measurement: {fmtTime(hoverMatch?.sample?.timestampMs)}</div><div>Δ time: {hoverMatch?.differenceMs == null ? "unmatched" : `${hoverMatch.differenceMs > 0 ? "+" : ""}${hoverMatch.differenceMs} ms`} · message row: {hoverMessage?.sourceIndex ?? hoverMessage?.id ?? "—"} · sample row: {hoverMatch?.sample?.rowId || "—"}</div></div>}
      </aside>
    </div>
  </div>;
}

