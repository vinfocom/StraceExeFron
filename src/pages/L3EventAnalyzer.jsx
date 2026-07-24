import React from "react";
import { Radio } from "lucide-react";
import L3EventsTab from "@/components/unifiedMap/tabs/L3EventsTab";

export default function L3EventAnalyzer() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-[1800px] px-4 py-4 sm:px-6 lg:px-8">
        <div className="mb-4 rounded-lg border border-slate-800 bg-slate-900/80 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/10">
              <Radio className="h-5 w-5 text-blue-300" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">L3 Event Analyzer</h1>
              <p className="text-xs text-slate-400">
                Upload a ZIP to inspect protocol procedures, all L3 messages, and all Event rows from the files.
              </p>
            </div>
          </div>
        </div>

        <L3EventsTab />
      </div>
    </div>
  );
}
