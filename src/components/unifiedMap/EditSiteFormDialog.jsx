import React, { useMemo } from "react";
import { Loader2, MapPin, X } from "lucide-react";

const PREFERRED_FIELD_ORDER = [
  "id",
  "site",
  "site_name",
  "sector",
  "cell_id",
  "sec_id",
  "node_id",
  "nodeb_id",
  "pci",
  "cluster",
  "network",
  "Technology",
  "technology",
  "band",
  "azimuth",
  "bw",
  "height",
  "m_tilt",
  "e_tilt",
  "earfcn",
  "latitude",
  "longitude",
];

function toLabel(field) {
  return String(field || "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const inputClass =
  "w-full h-9 px-3 rounded-md border border-gray-300 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all";

const EditSiteFormDialog = ({
  open,
  onOpenChange,
  formValues = {},
  onFieldChange,
  onSave,
  submitting = false,
}) => {
  const orderedFields = useMemo(() => {
    const keys = Object.keys(formValues || {});
    const preferred = PREFERRED_FIELD_ORDER.filter((key) => keys.includes(key));
    const extras = keys.filter((key) => !PREFERRED_FIELD_ORDER.includes(key)).sort((a, b) => a.localeCompare(b));
    return [...preferred, ...extras];
  }, [formValues]);

  if (!open) return null;

  return (
    <>
      <div
        onClick={() => onOpenChange(false)}
        className="fixed inset-0 bg-black/40 z-[9998]"
      />
      <div className="fixed top-1/2 left-1/2 z-[9999] w-[860px] max-w-[95vw] max-h-[92vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-gray-50/90 px-6 py-4 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-blue-100 p-2">
              <MapPin className="h-5 w-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800">Edit Site</h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {orderedFields.map((field) => {
              const value = formValues[field];
              const readOnly = field === "id";
              const isBooleanString = value === "true" || value === "false";

              return (
                <label key={field} className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">
                    {toLabel(field)}
                    {readOnly ? " (read only)" : ""}
                  </span>
                  {isBooleanString && !readOnly ? (
                    <select
                      value={value}
                      onChange={(e) => onFieldChange(field, e.target.value)}
                      className={inputClass}
                    >
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </select>
                  ) : (
                    <input
                      value={value ?? ""}
                      onChange={(e) => onFieldChange(field, e.target.value)}
                      className={`${inputClass} ${readOnly ? "bg-slate-100 text-slate-500" : ""}`}
                      readOnly={readOnly}
                    />
                  )}
                </label>
              );
            })}
          </div>
        </div>

        <div className="sticky bottom-0 z-10 flex justify-end gap-3 rounded-b-xl border-t border-gray-200 bg-gray-50 px-6 py-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={submitting}
            className="min-w-[120px] rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Saving...
              </span>
            ) : (
              "Save Changes"
            )}
          </button>
        </div>
      </div>
    </>
  );
};

export default EditSiteFormDialog;
