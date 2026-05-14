import React, { useMemo, useState } from "react";
import { OperatorComparisonChart } from "../charts/signal/OperatorComparisonChart";

const toText = (value) => {
  const text = String(value ?? "").trim();
  if (!text || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") return null;
  return text;
};

export const OperatorComparisonTab = ({
  locations,
  chartRefs,
  expanded = false,
  enableSiteToggle = false,
}) => {
  const [siteDetailsOpen, setSiteDetailsOpen] = useState(false);
  const siteSummary = useMemo(() => {
    const nodebSet = new Set();
    const pciSet = new Set();

    for (const loc of Array.isArray(locations) ? locations : []) {
      const nodeb = toText(loc?.nodeb_id ?? loc?.nodebId ?? loc?.nodeb);
      const pci = toText(loc?.pci ?? loc?.PCI ?? loc?.pci_or_psi);
      if (nodeb) nodebSet.add(nodeb);
      if (pci) pciSet.add(pci);
    }

    return {
      nodebCount: nodebSet.size,
      pciCount: pciSet.size,
      nodebList: Array.from(nodebSet).sort((a, b) => a.localeCompare(b)),
      pciList: Array.from(pciSet).sort((a, b) => Number(a) - Number(b)),
    };
  }, [locations]);

  return (
    <div className="grid grid-cols-1 gap-4">
      <OperatorComparisonChart
        ref={chartRefs?.operator}
        locations={locations}
        separateMetricCharts
        showAllMetrics
        individualStatMode
        wrapMetricCharts={expanded}
        highContrastText
      />

      {enableSiteToggle && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
          <button
            type="button"
            onClick={() => setSiteDetailsOpen((prev) => !prev)}
            className="w-full flex items-center justify-between text-left"
          >
            <span className="text-sm font-semibold text-white">Site Details</span>
            <span className="text-xs text-white">
              {siteDetailsOpen ? "Hide" : "Show"} ({siteSummary.nodebCount} NodeB, {siteSummary.pciCount} PCI)
            </span>
          </button>

          {siteDetailsOpen && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-900/50 rounded p-2">
                <div className="text-white mb-1 font-semibold">NodeB IDs ({siteSummary.nodebCount})</div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {siteSummary.nodebList.length > 0 ? (
                    siteSummary.nodebList.map((nodeb) => (
                      <div key={nodeb} className="text-white break-all">{nodeb}</div>
                    ))
                  ) : (
                    <div className="text-white/70">No NodeB IDs</div>
                  )}
                </div>
              </div>

              <div className="bg-slate-900/50 rounded p-2">
                <div className="text-white mb-1 font-semibold">PCIs ({siteSummary.pciCount})</div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {siteSummary.pciList.length > 0 ? (
                    siteSummary.pciList.map((pci) => (
                      <div key={pci} className="text-white break-all">{pci}</div>
                    ))
                  ) : (
                    <div className="text-white/70">No PCI values</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
