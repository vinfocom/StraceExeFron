import React, { useState } from "react";
import { formatDurationMs } from "@/utils/l3Events/callSummaryBuilder";
import { X, ArrowUpRight, ArrowDownLeft, Table as TableIcon, Trello, Activity } from "lucide-react";

export const CallDetailPanel = ({ call, onClose }) => {
  const [activeSubTab, setActiveSubTab] = useState("table"); // table | msc | ladder

  if (!call) return null;

  const eventsList = call.events || [];
  const l3Count = eventsList.filter((e) => e.type === "l3").length;
  const eventCount = eventsList.filter((e) => e.type === "event").length;

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-700 rounded-xl overflow-hidden text-white shadow-xl">
      {/* Top Heading Panel Summary Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800/80">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            Selected Call Overview
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                call.status === "Connected"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : call.status === "Dropped"
                  ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                  : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
              }`}
            >
              {call.status}
            </span>
          </h3>
          <p className="text-xs text-white mt-0.5">
            Duration: {formatDurationMs(call.durationMs)} | Messages: {l3Count} L3, {eventCount} Events
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-700 rounded-lg text-white hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Sub-Tab Navigation Header Options */}
      <div className="flex bg-slate-800 border-b border-slate-700 px-2 pt-2 gap-1">
        <button
          onClick={() => setActiveSubTab("table")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors border-t border-x ${
            activeSubTab === "table"
              ? "bg-slate-950 text-blue-400 border-slate-700"
              : "bg-transparent text-white hover:text-white border-transparent"
          }`}
        >
          <TableIcon className="h-3.5 w-3.5" /> Chronological Table
        </button>
        <button
          onClick={() => setActiveSubTab("msc")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors border-t border-x ${
            activeSubTab === "msc"
              ? "bg-slate-950 text-blue-400 border-slate-700"
              : "bg-transparent text-white hover:text-white border-transparent"
          }`}
        >
          <Trello className="h-3.5 w-3.5" /> Message Sequence Chart
        </button>
        <button
          onClick={() => setActiveSubTab("ladder")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors border-t border-x ${
            activeSubTab === "ladder"
              ? "bg-slate-950 text-blue-400 border-slate-700"
              : "bg-transparent text-white hover:text-white border-transparent"
          }`}
        >
          <Activity className="h-3.5 w-3.5" /> Ladder Diagram
        </button>
      </div>

      {/* Dynamic Diagnostic Rendering Views */}
      <div className="flex-1 overflow-auto p-4 bg-slate-950">
        {activeSubTab === "table" && renderTableView(eventsList)}
        {activeSubTab === "msc" && renderMessageSequenceChart(eventsList)}
        {activeSubTab === "ladder" && renderLadderDiagram(eventsList)}
      </div>
    </div>
  );
};

// ======================= VIEW RENDERERS =======================

function renderTableView(eventsList) {
  return (
    <div className="w-full border border-slate-700/80 rounded-lg overflow-hidden bg-slate-950">
      <table className="w-full text-left border-collapse table-fixed">
        <thead>
          <tr className="bg-slate-800/60 text-white text-[11px] font-semibold uppercase tracking-wider border-b border-slate-700">
            <th className="px-3 py-2 w-[95px]">Timestamp</th>
            <th className="px-3 py-2 w-[90px]">Layer/Chan</th>
            <th className="px-3 py-2 w-[38%] border-r border-slate-800 bg-blue-950/20 text-blue-400 text-center">
              Uplink Flow (UE → NW)
            </th>
            <th className="px-3 py-2 w-[38%] bg-emerald-950/20 text-emerald-400 text-center">
              Downlink Flow (NW → UE)
            </th>
            <th className="px-3 py-2 w-[65px] text-right">Source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 text-xs">
          {eventsList.length === 0 ? (
            <tr>
              <td colSpan="5" className="text-center py-8 text-white font-medium">
                No chronological signaling sequence records found.
              </td>
            </tr>
          ) : (
            eventsList.map((item) => {
              // Extract direction using the message syntax logic
              const isUplink =
                String(item.rawMessage || "").includes(">") ||
                String(item.title || "").includes("Request") ||
                String(item.message || "").toLowerCase().includes("initiated");

              return (
                <tr key={item.id} className="hover:bg-slate-900/40 transition-colors group">
                  {/* Timestamp track */}
                  <td className="px-3 py-2.5 font-mono text-white whitespace-nowrap align-top">
                    {item.timestamp
                      ? item.timestamp.toLocaleTimeString([], { hour12: false, timeZone: "UTC" })
                      : "N/A"}
                  </td>

                  {/* Layer indicator badge */}
                  <td className="px-3 py-2.5 align-top">
                    <span
                      className={`inline-block font-semibold px-1.5 py-0.5 rounded text-[10px] truncate max-w-[80px] ${
                        item.category === "NAS"
                          ? "bg-violet-500/10 text-violet-400 border border-violet-500/20"
                          : item.category?.includes("RRC")
                          ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                          : "bg-slate-800 text-white"
                      }`}
                    >
                      {item.category || item.domain || "RRC"}
                    </span>
                  </td>

                  {/* UPLINK FLOW COLUMN TRACK */}
                  <td className="px-3 py-2.5 border-r border-slate-800/80 align-top bg-blue-950/5">
                    {isUplink ? (
                      <div className="space-y-1">
                        <div className="font-semibold text-blue-400 flex items-center gap-1">
                          <span>{item.title}</span>
                          <span className="text-[20px] text-blue-500/70 font-mono font-normal">⬆</span>
                        </div>
                        {item.summary && (
                          <div className="text-white font-normal leading-relaxed text-[11px]">
                            {item.summary}
                          </div>
                        )}
                        {item.rawMessage && (
                          <pre className="text-[10px] font-mono bg-slate-900/60 text-white p-1.5 border border-slate-800/40 rounded overflow-x-auto whitespace-pre-wrap max-h-20">
                            {item.rawMessage}
                          </pre>
                        )}
                      </div>
                    ) : (
                      <span className="text-white font-mono text-[10px] select-none">—</span>
                    )}
                  </td>

                  {/* DOWNLINK FLOW COLUMN TRACK */}
                  <td className="px-3 py-2.5 align-top bg-emerald-950/5">
                    {!isUplink ? (
                      <div className="space-y-1">
                        <div className="font-semibold text-emerald-400 flex items-center gap-1">
                          <span>{item.title}</span>
                          <span className="text-[20px] text-emerald-500/70 font-mono font-normal">⬇</span>
                        </div>
                        {item.summary && (
                          <div className="text-white font-normal leading-relaxed text-[11px]">
                            {item.summary}
                          </div>
                        )}
                        {item.rawMessage && (
                          <pre className="text-[10px] font-mono bg-slate-900/60 text-white p-1.5 border border-slate-800/40 rounded overflow-x-auto whitespace-pre-wrap max-h-20">
                            {item.rawMessage}
                          </pre>
                        )}
                      </div>
                    ) : (
                      <span className="text-white font-mono text-[10px] select-none">—</span>
                    )}
                  </td>

                  {/* Log Type Source (L3/Event) */}
                  <td className="px-3 py-2.5 text-right uppercase text-[10px] font-bold text-white align-top whitespace-nowrap">
                    <span className={item.type === "l3" ? "text-cyan-500/70" : "text-amber-500/70"}>
                      {item.type}
                    </span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

// 2. MESSAGE SEQUENCE CHART RENDERER
function renderMessageSequenceChart(eventsList) {
  if (eventsList.length === 0) return <div className="text-center py-8 text-white text-xs">No entries.</div>;

  return (
    <div className="space-y-3 font-mono text-xs max-w-2xl mx-auto">
      <div className="flex justify-between border-b border-slate-700 pb-2 text-white font-bold text-center">
        <div className="w-[30%]">DEVICE (UE)</div>
        <div className="w-[40%] text-blue-400">SIGNALING ROUTE FLOW</div>
        <div className="w-[30%]">NETWORK (NW)</div>
      </div>
      <div className="space-y-4 pt-2">
        {eventsList.map((item, idx) => {
          const isUplink = String(item.rawMessage || "").includes(">") || String(item.title || "").includes("Request");
          return (
            <div key={idx} className="flex flex-col border border-slate-800 bg-slate-900/30 p-2 rounded-lg hover:border-slate-700">
              <div className="text-[10px] text-white mb-1 flex justify-between">
                <span>{item.timestamp ? item.timestamp.toLocaleTimeString([], { hour12: false, timeZone: "UTC" }) : ""}</span>
                <span className="text-cyan-400 font-bold">{item.category || "RRC"}</span>
              </div>
              <div className="flex items-center justify-between text-center relative py-1">
                {/* Visual Signaling Arrows layout mapping */}
                <div className="w-[25%] h-2 border-b-2 border-slate-700 relative"></div>
                <div className="w-[50%] px-2 relative flex flex-col items-center">
                  <span className="text-xs font-semibold text-white z-10 bg-slate-950 px-2 rounded">{item.title}</span>
                  <div className="w-full absolute top-[50%] left-0 transform -translate-y-1/2 flex items-center justify-center">
                    <div className="w-full border-t border-dashed border-blue-500"></div>
                    <span className={`absolute ${isUplink ? "right-0 text-blue-400" : "left-0 text-emerald-400"} font-bold text-sm`}>
                      {isUplink ? "▶" : "◀"}
                    </span>
                  </div>
                </div>
                <div className="w-[25%] h-2 border-b-2 border-slate-700 relative"></div>
              </div>
              {item.summary && <div className="text-[11px] text-white mt-1.5 pl-2 border-l border-slate-700 bg-slate-900/40 p-1 rounded">{item.summary}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 3. LADDER DIAGRAM RENDERER (Multi-vertical structural node bars layout)
function renderLadderDiagram(eventsList) {
  if (eventsList.length === 0) return <div className="text-center py-8 text-white text-xs">No entries.</div>;

  return (
    <div className="overflow-x-auto min-w-full p-4 font-mono text-xs">
      <div className="relative min-w-[500px]" style={{ height: `${eventsList.length * 60 + 40}px` }}>
        {/* Dynamic Lifelines for protocols/domains */}
        <div className="absolute top-0 bottom-0 left-[20%] w-0.5 bg-slate-700 flex flex-col items-center"><span className="absolute -top-4 bg-slate-800 px-2 py-0.5 rounded text-[10px] font-bold">UE</span></div>
        <div className="absolute top-0 bottom-0 left-[50%] w-0.5 bg-slate-700 flex flex-col items-center"><span className="absolute -top-4 bg-violet-600 px-2 py-0.5 rounded text-[10px] font-bold">NAS</span></div>
        <div className="absolute top-0 bottom-0 left-[80%] w-0.5 bg-slate-700 flex flex-col items-center"><span className="absolute -top-4 bg-cyan-600 px-2 py-0.5 rounded text-[10px] font-bold">RRC</span></div>

        {/* Message Rungs / Horizontal steps */}
        {eventsList.map((item, idx) => {
          const topPos = idx * 60 + 40;
          const isL3 = item.type === "l3";
          const isUplink = String(item.rawMessage || "").includes(">") || String(item.title || "").includes("Request");
          
          // Compute ladder trajectory positions based on category context
          const startX = "20%";
          const endX = item.category === "NAS" ? "50%" : "80%";

          return (
            <div key={idx} className="absolute left-0 right-0 group transition-colors" style={{ top: `${topPos}px` }}>
              <div className="absolute left-2 text-[10px] text-white font-mono">
                {item.timestamp ? item.timestamp.toLocaleTimeString([], { hour12: false, timeZone: "UTC" }) : ""}
              </div>
              
              <svg className="w-full h-8 overflow-visible absolute top-2">
                <line 
                  x1={isUplink ? startX : endX} 
                  y1="4" 
                  x2={isUplink ? endX : startX} 
                  y2="4" 
                  stroke={isL3 ? "#22d3ee" : "#fbbf24"} 
                  strokeWidth="2"
                  strokeDasharray={isL3 ? "0" : "4 2"}
                />
                <polygon 
                  points={isUplink ? "5,0 0,4 5,8" : "-5,0 0,4 -5,8"}
                  transform={`translate(${isUplink ? `radialPosition` : `radialPosition`})`}
                  fill={isL3 ? "#22d3ee" : "#fbbf24"}
                  style={{ transform: `translateX(${isUplink ? endX : startX}) scale(${isUplink ? 1 : -1})` }}
                />
              </svg>
              
              <div 
                className="absolute text-[11px] bg-slate-900 border border-slate-800 text-white px-2 py-0.5 rounded shadow group-hover:border-slate-600 whitespace-nowrap z-10"
                style={{ left: "35%", transform: "translateX(-20%)" }}
                title={item.summary || item.title}
              >
                {item.title}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}