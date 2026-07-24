import React from "react";
import { NETWORK_FLOW_MODELS } from "@/utils/l3Events/flowModels";

export function FlowModelCatalog() {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/70 overflow-hidden">
      <div className="border-b border-slate-700 bg-slate-800/70 p-3">
        <h3 className="text-sm font-semibold text-white">Network Call Flow Models</h3>
        <p className="text-[11px] text-slate-400">
          Reference L3 flow templates used by the analyzer for access, mobility, registration, IMS voice, and data procedures.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 p-3">
        {NETWORK_FLOW_MODELS.map((model) => (
          <section key={model.id} className="rounded-lg border border-slate-800 bg-slate-950/55 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold text-white">{model.name}</h4>
                  <span className="rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-200">
                    {model.access}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">{model.objective}</p>
              </div>
              <div className="text-right text-[11px] text-slate-300">
                <span className="text-slate-500">Tech:</span> {model.technology}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1.5">
                <div className="text-[10px] uppercase text-slate-500">Nodes</div>
                <div className="mt-1 text-xs text-white">{model.nodes.join(" / ")}</div>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1.5">
                <div className="text-[10px] uppercase text-slate-500">KPIs</div>
                <div className="mt-1 text-xs text-white">{model.kpis.join(", ")}</div>
              </div>
            </div>

            <div className="mt-3 space-y-1.5">
              {model.steps.map((modelStep, index) => (
                <div
                  key={`${model.id}-${modelStep.label}-${index}`}
                  className="grid grid-cols-[44px_1fr] gap-2 rounded-md border border-slate-800 bg-slate-900/45 px-2 py-1.5"
                >
                  <span className="font-mono text-[10px] text-slate-500">#{String(index + 1).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-white" title={modelStep.label}>
                      {modelStep.label}
                    </div>
                    <div className="truncate text-[10px] text-slate-400" title={`${modelStep.from} -> ${modelStep.to}`}>
                      {modelStep.from} {"->"} {modelStep.to}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {model.observation && <p className="mt-3 text-[11px] text-slate-500">{model.observation}</p>}
          </section>
        ))}
      </div>
    </div>
  );
}

export default FlowModelCatalog;
