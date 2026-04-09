import React, { useState, useEffect, useRef } from "react";
import { Loader2, MapPin, X, Plus, Trash2, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "react-toastify";
import { mapViewApi } from "@/api/apiEndpoints";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
// Replace Command imports with standard components
import { Search } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

// MultiSelect Component for Bands/PCIs
const MultiSelect = ({ options, selected, onChange, placeholder, title }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Handle selection toggle
  const handleSelect = (value) => {
    const isSelected = selected.includes(value);
    let newSelected;
    if (isSelected) {
      newSelected = selected.filter((item) => item !== value);
    } else {
      newSelected = [...selected, value];
    }
    onChange(newSelected);
    // Keep open for multi-select
  };

  const filteredOptions = options.filter(opt => 
    String(opt).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-auto min-h-[40px] px-3 py-2 bg-white border-gray-300 hover:bg-gray-50"
        >
          <div className="flex flex-wrap gap-1 items-center bg-white text-gray-900	">
            {selected.length === 0 && (
              <span className="text-gray-900 font-normal">{placeholder}</span>
            )}
            {selected.map((item) => (
              <Badge key={item} variant="secondary" className="mr-1 mb-1 bg-blue-100 text-blue-800 border-blue-200">
                {item}
                <span
                  className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={() => handleSelect(item)}
                >
                  <X className="h-3 w-3 text-blue-800 hover:text-blue-900" />
                </span>
              </Badge>
            ))}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* 
          Using a very high z-index and pointer-events-auto. 
          The portal guarantees it is at body level. 
      */}
      <PopoverContent className="w-[300px] p-0 z-[10000] pointer-events-auto bg-white border border-gray-200 shadow-lg rounded-md" align="start">
        <div className="flex flex-col">
          {/* Search Input */}
          <div className="flex items-center border-b border-gray-100 px-3 py-2">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              className="flex h-8 w-full rounded-md bg-transparent text-sm outline-none placeholder:text-gray-400"
              placeholder={`Search ${title}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          
          {/* Options List */}
          <div className="max-h-64 overflow-y-auto p-1">
            {filteredOptions.length === 0 ? (
               <div className="py-6 text-center text-sm text-gray-500">No {title} found.</div>
            ) : (
              filteredOptions.map((option) => (
                <div
                  key={option}
                  onClick={() => handleSelect(option)}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-gray-100 transition-colors",
                    selected.includes(option) ? "bg-blue-50 text-blue-900" : ""
                  )}
                >
                  <div
                    className={cn(
                      "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                      selected.includes(option)
                        ? "bg-primary text-primary-foreground bg-blue-600 border-blue-600 text-white"
                        : "opacity-50 border-gray-400"
                    )}
                  >
                   {selected.includes(option) && <Check className="h-3 w-3" />}
                  </div>
                  {option}
                </div>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const AddSiteFormDialog = ({ 
  open, 
  onOpenChange, 
  projectId, 
  pickedLatLng, 
  onSuccess,
  availableBands = [],
  availablePcis = [] // PCIs / CellIds from project
}) => {
  // Initial State matching the new JSON structure
  const [form, setForm] = useState({
    projectId: projectId ? Number(projectId) : 0,
    site: "",
    cluster: "", // Site level optional
    bands: [], 
    sectors: [1], 
    azimuths: [0], 
    heights: [30], // NEW: Default height
    mechanicalTilts: [0], // NEW: Default mech tilt
    electricalTilts: [0], // NEW: Default elec tilt
    technologies: [
      { technology: "4G", idValues: [], earfcn: "" } // NEW: earfcn per tech
    ],
    latitude: "",
    longitude: ""
  });

  const [submitting, setSubmitting] = useState(false);

  // Update lat/lng when picked from map
  useEffect(() => {
    if (pickedLatLng) {
      setForm((prev) => ({
        ...prev,
        latitude: pickedLatLng.lat.toFixed(6),
        longitude: pickedLatLng.lng.toFixed(6),
      }));
    }
  }, [pickedLatLng]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setForm({
        projectId: projectId ? Number(projectId) : 0,
        site: "",
        cluster: "",
        bands: [],
        sectors: [1],
        azimuths: [0],
        heights: [30],
        mechanicalTilts: [0],
        electricalTilts: [0],
        technologies: [
          { technology: "4G", idValues: [], earfcn: "" }
        ],
        latitude: pickedLatLng?.lat?.toFixed(6) || "",
        longitude: pickedLatLng?.lng?.toFixed(6) || ""
      });
    }
  }, [open, pickedLatLng, projectId]);

  if (!open) return null;

  // --- Handlers ---

  const handleBasicChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // Sectors & Azimuths Handlers
  const addSector = () => {
    setForm((prev) => {
      const nextSectorNum = prev.sectors.length > 0 
        ? Math.max(...prev.sectors) + 1 
        : 1;
      return {
        ...prev,
        sectors: [...prev.sectors, nextSectorNum],
        azimuths: [...prev.azimuths, 0],
        heights: [...prev.heights, 30],
        mechanicalTilts: [...prev.mechanicalTilts, 0],
        electricalTilts: [...prev.electricalTilts, 0]
      };
    });
  };

  const removeSector = (index) => {
    if (form.sectors.length <= 1) return; // Prevent removing last sector
    setForm((prev) => ({
      ...prev,
      sectors: prev.sectors.filter((_, i) => i !== index),
      azimuths: prev.azimuths.filter((_, i) => i !== index),
      heights: prev.heights.filter((_, i) => i !== index),
      mechanicalTilts: prev.mechanicalTilts.filter((_, i) => i !== index),
      electricalTilts: prev.electricalTilts.filter((_, i) => i !== index)
    }));
  };

  const handleSectorChange = (index, value) => {
    const val = Number(value);
    setForm((prev) => {
      const newSectors = [...prev.sectors];
      newSectors[index] = val;
      return { ...prev, sectors: newSectors };
    });
  };

  const handleSectorAttributeChange = (key, index, value) => {
    const val = Number(value);
    setForm((prev) => {
      const newArray = [...prev[key]];
      newArray[index] = val;
      return { ...prev, [key]: newArray };
    });
  };

  // Technologies Handlers
  const addTechnology = () => {
    setForm((prev) => ({
      ...prev,
      technologies: [...prev.technologies, { technology: "4G", idValues: [], earfcn: "" }]
    }));
  };

  const removeTechnology = (index) => {
    if (form.technologies.length <= 1) return;
    setForm((prev) => ({
      ...prev,
      technologies: prev.technologies.filter((_, i) => i !== index)
    }));
  };

  const handleTechChange = (index, field, value) => {
    setForm((prev) => {
      const newTechs = [...prev.technologies];
      newTechs[index] = { ...newTechs[index], [field]: value };
      return { ...prev, technologies: newTechs };
    });
  };

  // Handle PCI/ID selection via MultiSelect for a specific technology
  const handleTechIdsChange = (index, selectedIds) => {
    setForm((prev) => {
      const newTechs = [...prev.technologies];
      newTechs[index] = { ...newTechs[index], idValues: selectedIds };
      return { ...prev, technologies: newTechs };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const projectIdValue = Number(form.projectId);
    const siteValue = String(form.site || "").trim();
    const latitudeValue = Number.parseFloat(form.latitude);
    const longitudeValue = Number.parseFloat(form.longitude);
    const sectorCount = form.sectors.length;

    if (!Number.isFinite(projectIdValue) || projectIdValue <= 0) {
      toast.error("Project ID is required.");
      return;
    }
    if (!siteValue) {
      toast.error("Site ID is required.");
      return;
    }
    if (!Number.isFinite(latitudeValue) || latitudeValue < -90 || latitudeValue > 90) {
      toast.error("Enter a valid latitude.");
      return;
    }
    if (!Number.isFinite(longitudeValue) || longitudeValue < -180 || longitudeValue > 180) {
      toast.error("Enter a valid longitude.");
      return;
    }
    if (!Array.isArray(form.bands) || form.bands.length === 0) {
      toast.error("Select at least one band.");
      return;
    }
    if (!Array.isArray(form.technologies) || form.technologies.length === 0) {
      toast.error("Add at least one technology.");
      return;
    }
    if (!Array.isArray(form.azimuths) || form.azimuths.length !== sectorCount) {
      toast.error("Azimuths must match sector count.");
      return;
    }
    for (const tech of form.technologies) {
      const techName = String(tech?.technology || "").trim();
      const idValues = Array.isArray(tech?.idValues) ? tech.idValues : [];
      const numericIds = idValues.map((value) => Number(value));
      if (!techName) {
        toast.error("Technology type is required.");
        return;
      }
      if (numericIds.length !== sectorCount || numericIds.some((value) => !Number.isFinite(value))) {
        toast.error(`Select ${sectorCount} valid IDs for ${techName}.`);
        return;
      }
    }

    setSubmitting(true);

    try {
      // Construct payload strictly matching the requirement
      const payload = {
        projectId: Number(form.projectId),
        site: siteValue,
        cluster: String(form.cluster || "").trim(),
        bands: form.bands.map((band) => String(band).trim()).filter(Boolean),
        sectors: form.sectors.map(Number),
        azimuths: form.azimuths.map(Number),
        heights: form.heights.map(Number),
        mechanicalTilts: form.mechanicalTilts.map(Number),
        electricalTilts: form.electricalTilts.map(Number),
        technology: form.technologies[0]?.technology || "4G",
        technologies: form.technologies.map((t) => ({
          technology: String(t.technology || "").trim(),
          idValues: (Array.isArray(t.idValues) ? t.idValues : []).map(Number),
          earfcn: String(t.earfcn || "").trim(),
        })),
        latitude: latitudeValue,
        longitude: longitudeValue,
      };

      console.log("Submitting Payload Details:", JSON.stringify(payload, null, 2));

      await mapViewApi.addSitePrediction(payload);
      toast.success("Site added successfully!");
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Add site error:", error);
      const apiError = error?.response?.data ?? error?.data;
      const errorBag =
        (apiError?.errors && typeof apiError.errors === "object" && apiError.errors) ||
        (apiError?.Errors && typeof apiError.Errors === "object" && apiError.Errors) ||
        null;
      const validationErrors = errorBag
        ? Object.values(errorBag).flat().filter(Boolean)
        : [];
      const firstValidationError =
        validationErrors.length > 0 ? String(validationErrors[0]) : null;
      const message =
        firstValidationError ||
        (typeof apiError === "string"
          ? apiError
          : apiError?.Message || apiError?.message || apiError?.Title || apiError?.title) ||
        error?.message ||
        "Failed to add site";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  // Styles
  const labelStyle = {
    fontSize: "13px",
    fontWeight: 500,
    color: "#334155",
    marginBottom: "4px",
    display: "block"
  };

  const inputClass = "w-full h-9 px-3 rounded-md border border-gray-300 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all";

  const sectionTitle = {
    fontSize: "14px",
    fontWeight: 600,
    color: "#1e293b",
    marginBottom: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between"
  };

  const renderLabel = (text, required = false) => (
    <label style={labelStyle}>
      {text}
      {required && <span className="ml-1 text-red-500">*</span>}
    </label>
  );

  return (
    <>
      <div
        onClick={() => onOpenChange(false)}
        className="fixed inset-0 bg-black/40 z-[9998]"
      />

      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] w-[600px] max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-2xl flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50 sticky top-0 z-10 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="bg-blue-100 p-2 rounded-lg">
              <MapPin className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800">Add New Site</h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <form id="add-site-form" onSubmit={handleSubmit} className="space-y-6">
            
            {/* Top Row: Site & Lat/Lng */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                {renderLabel("Site ID", true)}
                <input
                  value={form.site}
                  onChange={(e) => handleBasicChange("site", e.target.value)}
                  placeholder="e.g. S123"
                  className={inputClass}
                />
              </div>
              <div>
                {renderLabel("Cluster", false)}
                <input
                  value={form.cluster}
                  onChange={(e) => handleBasicChange("cluster", e.target.value)}
                  placeholder="Optional"
                  className={inputClass}
                />
              </div>
              <div>
                {renderLabel("Project ID", true)}
                <input
                  value={form.projectId}
                  disabled
                  className={`${inputClass} bg-slate-50 text-slate-500`}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div>
                {renderLabel("Latitude", true)}
                 <input
                  type="number"
                  step="any"
                  value={form.latitude}
                  onChange={(e) => handleBasicChange("latitude", e.target.value)}
                  className={inputClass}
                 />
               </div>
               <div>
                {renderLabel("Longitude", true)}
                 <input
                  type="number"
                  step="any"
                  value={form.longitude}
                  onChange={(e) => handleBasicChange("longitude", e.target.value)}
                  className={inputClass}
                 />
               </div>
            </div>

            {/* Bands MultiSelect */}
            <div className="space-y-2">
              {renderLabel("Bands", true)}
              <MultiSelect
                title="Bands"
                placeholder="Select bands..."
                options={availableBands} 
                selected={form.bands}
                onChange={(newBands) => handleBasicChange("bands", newBands)}
              />
              <p className="text-xs text-slate-500 mt-1">Select bands from the project list.</p>
            </div>

            <div className="border-t border-gray-100 my-4" />

            {/* Sectors Section */}
            <div>
              <div style={sectionTitle}>
                <span>
                  Sectors & Azimuths
                  <span className="ml-1 text-red-500">*</span>
                </span>
                <Button 
                  type="button" 
                  size="sm" 
                  variant="outline" 
                  onClick={addSector}
                  className="h-7 text-xs flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Sector
                </Button>
              </div>
              
              <div className="bg-slate-50 rounded-lg p-3 space-y-4 border border-slate-200">
                {form.sectors.map((sector, idx) => (
                   <div key={idx} className="relative p-2 border border-slate-100 bg-white rounded-md shadow-sm">
                      <div className="grid grid-cols-3 gap-3 mb-2">
                        <div>
                          <label className="text-xs font-medium text-slate-500 mb-1 block">
                            Sector ID <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            value={sector}
                            onChange={(e) => handleSectorChange(idx, e.target.value)}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-500 mb-1 block">
                            Azimuth (°) <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            value={form.azimuths[idx]}
                            onChange={(e) => handleSectorAttributeChange("azimuths", idx, e.target.value)}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-500 mb-1 block">Height (m)</label>
                          <input
                            type="number"
                            value={form.heights[idx]}
                            onChange={(e) => handleSectorAttributeChange("heights", idx, e.target.value)}
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs font-medium text-slate-500 mb-1 block">M-Tilt (°)</label>
                          <input
                            type="number"
                            value={form.mechanicalTilts[idx]}
                            onChange={(e) => handleSectorAttributeChange("mechanicalTilts", idx, e.target.value)}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-500 mb-1 block">E-Tilt (°)</label>
                          <input
                            type="number"
                            value={form.electricalTilts[idx]}
                            onChange={(e) => handleSectorAttributeChange("electricalTilts", idx, e.target.value)}
                            className={inputClass}
                          />
                        </div>
                         <div className="flex items-end justify-end">
                            {form.sectors.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeSector(idx)}
                                className="h-9 w-9 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                title="Remove Sector"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                         </div>
                      </div>
                   </div>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100 my-4" />

            {/* Technologies Section */}
            <div>
              <div style={sectionTitle}>
                <span>
                  Technologies & Ids
                  <span className="ml-1 text-red-500">*</span>
                </span>
                <Button 
                  type="button" 
                  size="sm" 
                  variant="outline" 
                  onClick={addTechnology}
                  className="h-7 text-xs flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Tech
                </Button>
              </div>

              <div className="space-y-4">
                {form.technologies.map((tech, idx) => (
                  <div key={idx} className="bg-slate-50 rounded-lg p-4 border border-slate-200 relative group">
                    {form.technologies.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTechnology(idx)}
                          className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-white rounded-md shadow-sm"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                      <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block">
                          Type <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={tech.technology}
                          onChange={(e) => handleTechChange(idx, "technology", e.target.value)}
                          className={inputClass}
                        >
                          {["2G", "3G", "4G", "5G"].map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block">EARFCN</label>
                        <input
                          value={tech.earfcn}
                          onChange={(e) => handleTechChange(idx, "earfcn", e.target.value)}
                          placeholder="Optional"
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1 block">
                        PCIs / IDs <span className="text-red-500">*</span>
                      </label>
                      <MultiSelect
                        title="PCIs"
                        placeholder="Select IDs..."
                        options={availablePcis}
                        selected={tech.idValues}
                        onChange={(newIds) => handleTechIdsChange(idx, newIds)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-slate-500">
              <span className="text-red-500">*</span> Required fields
            </p>

          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 sticky bottom-0 z-10 flex justify-end gap-3 rounded-b-xl">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="hover:bg-slate-100 text-slate-600	"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-site-form"
            disabled={submitting}
            className="bg-blue-600 hover:bg-blue-700 text-white min-w-[120px]"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Adding...
              </>
            ) : (
              "Add Site"
            )}
          </Button>
        </div>

      </div>
    </>
  );
};

export default AddSiteFormDialog;
