import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { Upload, Loader2, AlertTriangle, X } from "lucide-react";
import { extractL3AndEventFiles } from "@/utils/l3Events/zipParser";
import { parseL3CSV } from "@/utils/l3Events/l3Parser";
import { parseEventCSV } from "@/utils/l3Events/eventParser";
import { mergeTimeline } from "@/utils/l3Events/timelineBuilder";
import { buildCallSummary } from "@/utils/l3Events/callSummaryBuilder";
import { buildProtocolAnalysis } from "@/utils/l3Events/protocolAnalyzer";
import { CallSummaryPanel } from "./l3Events/CallSummaryPanel";
import { ProtocolAnalyzerView } from "./l3Events/ProtocolAnalyzerView";

export const L3EventsTab = () => {
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [errorMessage, setErrorMessage] = useState("");
  const [warningMessage, setWarningMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const [timeline, setTimeline] = useState([]);
  const [selectedCall, setSelectedCall] = useState(null);

  const fileInputRef = useRef(null);

 

const handleFile = useCallback(async (file) => {
  if (!file) return;

  setStatus("loading");
  setErrorMessage("");
  setWarningMessage("");
  setFileName(file.name);
  setSelectedCall(null);

  try {
    const { l3Files, eventFiles } = await extractL3AndEventFiles(file);

    if (!l3Files.length && !eventFiles.length) {
      setTimeline([]);
      setStatus("error");
      setErrorMessage("This ZIP does not contain supported Layer 3 or Event logs.");
      return;
    }

    const l3Rows = l3Files.flatMap((f) => parseL3CSV(f.text, f.name));
    const eventRows = eventFiles.flatMap((f) => parseEventCSV(f.text, f.name));
    const merged = mergeTimeline(l3Rows, eventRows);

    let warning = "";
    if (!l3Files.length) warning = "No Layer 3 logs found.";
    else if (!eventFiles.length) warning = "No Event logs found.";

    setTimeline(merged);
    setWarningMessage(warning);
    setStatus("ready");
  } catch (error) {
    setTimeline([]);
    setStatus("error");
    setErrorMessage("Failed to read this ZIP file. Please confirm it is a valid archive.");
  }
}, []);

  const onInputChange = (event) => {
    const file = event.target.files?.[0];
    handleFile(file);
    event.target.value = "";
  };

  const filteredProtocolTimeline = useMemo(() => {
    const callStart = selectedCall?.startTime?.getTime();
    const callEnd = (selectedCall?.endTime || selectedCall?.startTime)?.getTime();

    return timeline.filter((item) => {
      if (selectedCall) {
        const t = item.timestamp?.getTime();
        if (t == null || callStart == null || callEnd == null || t < callStart || t > callEnd) return false;
      }
      return true;
    });
  }, [timeline, selectedCall]);

  const handleSelectCall = useCallback((call) => {
    if (!call?.startTime) return;
    setSelectedCall(call);
  }, []);

  const callSummary = useMemo(() => buildCallSummary(timeline), [timeline]);
  const protocolAnalysis = useMemo(() => buildProtocolAnalysis(filteredProtocolTimeline), [filteredProtocolTimeline]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 bg-slate-800/60 border border-slate-700 rounded-lg p-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
        >
          <Upload className="h-4 w-4" />
          {fileName ? "Change ZIP" : "Upload ZIP"}
        </button>
        <input ref={fileInputRef} type="file" accept=".zip" className="hidden" onChange={onInputChange} />
        {fileName && <span className="text-xs text-white truncate max-w-[240px]">{fileName}</span>}
        {status === "loading" && (
          <span className="flex items-center gap-2 text-xs text-blue-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Parsing logs...
          </span>
        )}
      </div>

      {status === "idle" && (
        <div className="text-sm text-white border border-dashed border-slate-700 rounded-lg p-8 text-center">
          Upload a ZIP file to build a standards-based Layer 3 and Event protocol analyzer.
        </div>
      )}

      {status === "error" && (
        <div className="flex items-center gap-2 text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {errorMessage}
        </div>
      )}

      {status === "ready" && (
        <>
          {warningMessage && (
            <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              {warningMessage}
            </div>
          )}

          <CallSummaryPanel
            summary={callSummary}
            selectedCallId={selectedCall?.id}
            onSelectCall={handleSelectCall}
          />

          {selectedCall && (
            <div className="flex items-center justify-between gap-2 text-xs bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2">
              <span className="text-blue-300 truncate">
                Analyzer scoped to {selectedCall.id} starting at{" "}
                {selectedCall.startTime.toLocaleTimeString([], { hour12: false, timeZone: "UTC" })}
              </span>
              <button
                type="button"
                onClick={() => setSelectedCall(null)}
                className="flex items-center gap-1 text-blue-300 hover:text-blue-200 shrink-0 font-medium"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            </div>
          )}

          <ProtocolAnalyzerView analysis={protocolAnalysis} />
        </>
      )}
    </div>
  );
};

export default L3EventsTab;
