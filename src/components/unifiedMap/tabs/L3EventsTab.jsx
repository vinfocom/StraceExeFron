import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  useDeferredValue,
} from "react";
import { Upload, Loader2, AlertTriangle, X } from "lucide-react";

import { extractL3AndEventFiles } from "@/utils/l3Events/zipParser";
import { parseL3CSV } from "@/utils/l3Events/l3Parser";
import { parseEventCSV } from "@/utils/l3Events/eventParser";
import { mergeTimeline } from "@/utils/l3Events/timelineBuilder";
import { buildCallSummary } from "@/utils/l3Events/callSummaryBuilder";
import { FilterChips } from "./l3Events/FilterChips";
import { TimelineCard } from "./l3Events/TimelineCard";
import { CallSummaryPanel } from "./l3Events/CallSummaryPanel";

const PAGE_SIZE = 150;

export const L3EventsTab = () => {
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [errorMessage, setErrorMessage] = useState("");
  const [warningMessage, setWarningMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const [timeline, setTimeline] = useState([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedCall, setSelectedCall] = useState(null);

  const deferredSearch = useDeferredValue(search);
  const sentinelRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleFile = useCallback(async (file) => {
    if (!file) return;

    setStatus("loading");
    setErrorMessage("");
    setWarningMessage("");
    setFileName(file.name);
    setVisibleCount(PAGE_SIZE);
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

  const categories = useMemo(() => {
    const set = new Set();
    timeline.forEach((item) => {
      if (item.category) set.add(item.category);
      // PS/CS is a second classification axis (packet vs circuit switched
      // domain) surfaced through the same chip row as the content category.
      if (item.domain) set.add(item.domain);
    });
    return Array.from(set).sort();
  }, [timeline]);

  const filteredTimeline = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    const callStart = selectedCall?.startTime?.getTime();
    const callEnd = (selectedCall?.endTime || selectedCall?.startTime)?.getTime();

    return timeline.filter((item) => {
      if (selectedCall) {
        // Drilled into one call: show everything in its time window
        // regardless of category chip, so L3 + other events during the
        // call are visible too.
        const t = item.timestamp?.getTime();
        if (t == null || callStart == null || callEnd == null || t < callStart || t > callEnd) return false;
      } else if (activeCategory !== "All" && item.category !== activeCategory && item.domain !== activeCategory) {
        return false;
      }
      if (!query) return true;
      const haystack = `${item.title} ${item.summary} ${item.category} ${item.domain || ""} ${item.rawMessage}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [timeline, deferredSearch, activeCategory, selectedCall]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [deferredSearch, activeCategory, selectedCall]);

  const handleSelectCall = useCallback((call) => {
    if (!call?.startTime) return;
    setSelectedCall(call);
  }, []);

  // Incremental rendering instead of pulling in a virtualization library:
  // only the first `visibleCount` rows render; a sentinel grows that window
  // as it scrolls into view, keeping DOM size bounded for large timelines.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filteredTimeline.length));
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredTimeline.length]);

  const visibleItems = filteredTimeline.slice(0, visibleCount);
  const callSummary = useMemo(() => buildCallSummary(timeline), [timeline]);

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
        {fileName && <span className="text-xs text-slate-400 truncate max-w-[240px]">{fileName}</span>}
        {status === "loading" && (
          <span className="flex items-center gap-2 text-xs text-blue-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Parsing logs...
          </span>
        )}
      </div>

      {status === "idle" && (
        <div className="text-sm text-slate-400 border border-dashed border-slate-700 rounded-lg p-8 text-center">
          Upload a ZIP file to view Layer 3 signaling and Event logs as a timeline.
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
              <span className="text-blue-300">
                Showing events for the call at{" "}
                {selectedCall.startTime.toLocaleTimeString([], { hour12: false, timeZone: "UTC" })}
                {selectedCall.endTime
                  ? ` – ${selectedCall.endTime.toLocaleTimeString([], { hour12: false, timeZone: "UTC" })}`
                  : ""}{" "}
                ({selectedCall.status})
              </span>
              <button
                type="button"
                onClick={() => setSelectedCall(null)}
                className="flex items-center gap-1 text-blue-300 hover:text-blue-200 shrink-0"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            </div>
          )}

          <div className="space-y-3">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, summary, category, or raw message..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
            {!selectedCall && (
              <FilterChips categories={categories} active={activeCategory} onSelect={setActiveCategory} />
            )}
          </div>

          {filteredTimeline.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-8">No matching events.</div>
          ) : (
            <div className="space-y-2">
              {visibleItems.map((item) => (
                <TimelineCard key={item.id} item={item} />
              ))}
              {visibleCount < filteredTimeline.length && (
                <div ref={sentinelRef} className="py-4 text-center text-xs text-slate-500">
                  Loading more...
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default L3EventsTab;
