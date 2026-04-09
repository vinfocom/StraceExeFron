import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter, Layers } from "lucide-react";
import { mapViewApi } from "@/api/apiEndpoints";

const getYesterday = () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  return yesterday;
};

const defaultFilters = {
  startDate: getYesterday(),
  endDate: new Date(),
  provider: "ALL",
  technology: "ALL",
  band: "ALL",
  measureIn: "rsrp",
};

// Keep ONE normalizeProviderName (avoid TDZ/duplicate binding)
const normalizeProviderName = (raw) => {
  if (!raw) return "Unknown User";
  const s = String(raw).trim();

  // Unknowns first
  if (/^\/+$/.test(s)) return "Unknown User";
  if (s.replace(/\s+/g, "") === "404011") return "Unknown User";

  const cleaned = s.toUpperCase().replace(/[\s\-_]/g, "");

  // JIO family
  if (cleaned.includes("JIO") || /^(IND)?JIO(4G|5G|TRUE5G)?$/.test(cleaned)) return "JIO";

  // Airtel family
  if (cleaned.includes("AIRTEL") || /^INDAIRTEL$/.test(cleaned)) return "Airtel";

  // VI family
  if (
    cleaned === "VI" ||
    cleaned.includes("VIINDIA") ||
    cleaned.includes("VODAFONEIN") ||
    cleaned.includes("VODAFONE") ||
    cleaned.includes("IDEA")
  ) return "VI India";

  return s;
};

const MapSidebar = ({
  onApplyFilters,
  onClearFilters,
  onUIChange,
  ui = {},
  initialFilters,
}) => {
  const [filters, setFilters] = useState(defaultFilters);
  const [providers, setProviders] = useState([]);
  const [technologies, setTechnologies] = useState([]);
  const [bands, setBands] = useState([]);
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    if (!initialFilters) return;
    setFilters((prev) => ({ ...prev, ...initialFilters }));
  }, [initialFilters]);

  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const [provRes, techRes, bandsRes, projRes] = await Promise.all([
          mapViewApi.getProviders(),
          mapViewApi.getTechnologies(),
          mapViewApi.getBands(),
          mapViewApi.getProjects?.(),
        ]);

        const provList = Array.isArray(provRes) ? provRes : [];
        const normalizedSet = new Set(
          provList.map((p) => normalizeProviderName(p.name))
        );
        const normalizedProviders = Array.from(normalizedSet).map((name) => ({
          id: name,
          name,
        }));

        setProviders(normalizedProviders);
        setTechnologies(Array.isArray(techRes) ? techRes : []);
        setBands(Array.isArray(bandsRes) ? bandsRes : []);

        const projData = Array.isArray(projRes?.Data)
          ? projRes.Data
          : Array.isArray(projRes)
          ? projRes
          : [];
        const projList = projData.map((p) => ({
          id: p.id,
          name: p.project_name,
        }));
        setProjects(projList);
      } catch (error) {
        console.error("Failed to fetch filter options", error);
      }
    };
    fetchFilterOptions();
  }, []);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="absolute top-4 left-10 h-auto max-h-[90vh] w-80 bg-white rounded-lg border z-10 flex flex-col shadow-lg">
      {/* Header */}
      <div className="flex border-b">
        <button
          className="flex-1 p-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-slate-900"
          disabled
        >
          <Layers size={16} />
          Map Controls
        </button>
      </div>

      {/* Filters body */}
      <div className="flex-grow overflow-y-auto p-4 space-y-4">
        {/* Dates */}
        <div className="grid grid-cols-1 gap-3">
          <div>
            <Label className="p-2">Start Date</Label>
            <DatePicker
              date={filters.startDate}
              setDate={(d) => handleFilterChange("startDate", d)}
            />
          </div>
          <div>
            <Label className="p-2">End Date</Label>
            <DatePicker
              date={filters.endDate}
              setDate={(d) => handleFilterChange("endDate", d)}
            />
          </div>
        </div>

        {/* Provider */}
        <div>
          <Label className="p-2">Provider</Label>
          <Select
            onValueChange={(v) => handleFilterChange("provider", v)}
            value={filters.provider}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select Provider..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">ALL Providers</SelectItem>
              {providers.map((p) => (
                <SelectItem key={p.id} value={p.name}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Technology */}
        <div>
          <Label className="p-2">Technology</Label>
          <Select
            onValueChange={(v) => handleFilterChange("technology", v)}
            value={filters.technology}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select Technology..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">ALL Technologies</SelectItem>
              {technologies.map((t) => (
                <SelectItem key={t.id} value={t.name}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Metric */}
        <div>
          <Label className="p-2">Visualize Metric</Label>
          <Select
            onValueChange={(v) => handleFilterChange("measureIn", v)}
            value={filters.measureIn}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select metric..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rsrp">RSRP</SelectItem>
              <SelectItem value="rsrq">RSRQ</SelectItem>
              <SelectItem value="sinr">SINR</SelectItem>
              <SelectItem value="ul-throughput">UL-Throughput</SelectItem>
              <SelectItem value="dl-throughput">DL-Throughput</SelectItem>
              <SelectItem value="lte-bler">LTE-BLER</SelectItem>
              <SelectItem value="mos">MOS</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Band */}
        <div>
          <Label className="p-2">Band / Frequency</Label>
          <Select
            onValueChange={(v) => handleFilterChange("band", v)}
            value={filters.band}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select Band..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">ALL Bands</SelectItem>
              {bands.map((b) => (
                <SelectItem key={b.id} value={b.name}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Project + Polygons */}
        <div className="grid grid-cols-1 gap-2">
          <Label>Project (Polygons)</Label>
          <Select
            onValueChange={(v) =>
              onUIChange?.({ selectedProjectId: v && v !== "none" ? v : null })
            }
            value={ui.selectedProjectId ?? ""}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select Project..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!ui.showPolygons}
              onChange={(e) => onUIChange?.({ showPolygons: e.target.checked })}
            />
            Show Project Polygons
          </label>
        </div>

        {/* Layers */}
        <div className="pt-2 border-t">
          <div className="text-sm font-medium mb-2">Layers</div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!ui.showSessions}
              onChange={(e) => onUIChange?.({ showSessions: e.target.checked })}
              disabled={Boolean(initialFilters)} // sessions are shown only when no log filters
            />
            Session Markers (when no filters)
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!ui.clusterSessions}
              onChange={(e) => onUIChange?.({ clusterSessions: e.target.checked })}
              disabled={!ui.showSessions}
            />
            Cluster Sessions
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!ui.showLogsCircles}
              onChange={(e) => onUIChange?.({ showLogsCircles: e.target.checked })}
              disabled={!initialFilters}
            />
            Logs as Circles
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!ui.showHeatmap}
              onChange={(e) => onUIChange?.({ showHeatmap: e.target.checked })}
              disabled={!initialFilters}
            />
            Heatmap
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!ui.renderVisibleLogsOnly}
              onChange={(e) =>
                onUIChange?.({ renderVisibleLogsOnly: e.target.checked })
              }
              disabled={!initialFilters}
            />
            Render Visible Logs Only
          </label>
        </div>

        {/* Basemap */}
        <div className="pt-2 border-t">
          <Label>Basemap Style</Label>
          <Select
            onValueChange={(v) => onUIChange?.({ basemapStyle: v })}
            value={ui.basemapStyle || "roadmap"}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select style..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="roadmap">Default (Roadmap)</SelectItem>
              <SelectItem value="satellite">Satellite</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
              <SelectItem value="terrain">Terrain</SelectItem>
              <SelectItem value="clean">Clean (Custom Style)</SelectItem>
              <SelectItem value="night">Night (Custom Style)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 border-t flex gap-2">
        <Button variant="secondary" onClick={onClearFilters} className="flex-1">
          Clear
        </Button>
        <Button onClick={() => onApplyFilters(filters, "logs")} className="flex-1">
          <Filter className="h-4 w-4 mr-2" /> Apply & Fetch Logs
        </Button>
      </div>
    </div>
  );
};

export default MapSidebar; 