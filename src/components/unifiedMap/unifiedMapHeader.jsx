import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LogOut,
  Filter,
  ChartBar,
  LayoutGrid,
  Plus,
  Minus,
  UploadCloud,
  ArrowLeft,
} from "lucide-react";
import { useLocation, useSearchParams } from "react-router-dom";
import { mapViewApi, predictionApi } from "@/api/apiEndpoints";
import { toast } from "react-toastify";
import { useMapContext } from "@/context/MapContext";
import Spinner from "@/components/common/Spinner";
import ProjectsDropdown from "../project/ProjectsDropdown";
import DrawingControlsPanel from "../map/layout/DrawingControlsPanel";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import SettingsPage from "@/pages/Setting";
import {
  findProjectInProjectsCache,
  upsertProjectInProjectsCache,
  writeProjectsListCache,
} from "@/utils/projectsCache";

const UPLOAD_SITE_COLUMNS = [
  "site",
  "sector",
  "cell_id",
  "longitude",
  "latitude",
  "pci",
  "azimuth",
  "band",
  "earfcn",
  "cluster",
  "technology",
  "m_tilt",
  "e_tilt",
  "height",
];

const DEFAULT_SITE_COLUMN_VALUES = {
  technology: "4G",
  m_tilt: "0",
  e_tilt: "0",
  height: "30",
};

const SITE_COLUMN_ALIASES = {
  site: [
    "site",
    "siteid",
    "site_id",
    "sitename",
    "site_name",
    "nodeb",
    "enodeb",
    "gnodeb",
  ],
  sector: ["sector", "sectorid", "sector_id", "sectorname", "sector_name"],
  cell_id: [
    "cell_id",
    "cellid",
    "cell",
    "cellname",
    "cell_name",
    "cid",
    "ecgi",
  ],
  longitude: ["longitude", "long", "lon", "lng", "x"],
  latitude: ["latitude", "lat", "y"],
  pci: ["pci", "physicalcellid", "physical_cell_id", "psc"],
  azimuth: ["azimuth", "azimuthdeg", "azimuth_deg", "bearing", "direction"],
  band: ["band", "frequencyband", "frequency_band", "freqband"],
  earfcn: ["earfcn", "dl_earfcn", "arfcn", "uarfcn", "nrarfcn"],
  cluster: ["cluster", "operator", "network", "provider", "circle"],
  technology: ["technology", "tech", "rat", "networktype", "network_type"],
  m_tilt: ["m_tilt", "mtilt", "mechanicaltilt", "mechanical_tilt", "m-tilt"],
  e_tilt: ["e_tilt", "etilt", "electricaltilt", "electrical_tilt", "e-tilt"],
  height: ["height", "antennaheight", "antenna_height", "hgt"],
};

const normalizeHeaderToken = (value = "") =>
  String(value)
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const parseCsvLine = (line = "") => {
  const out = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  out.push(current);
  return out;
};

const toCsvField = (value = "") => {
  const str = String(value ?? "");
  if (!/[",\r\n]/.test(str)) return str;
  return `"${str.replace(/"/g, '""')}"`;
};

const getNormalizedAliasMap = () => {
  const normalizedAliasMap = new Map();
  Object.entries(SITE_COLUMN_ALIASES).forEach(([canonical, aliases]) => {
    aliases.forEach((alias) =>
      normalizedAliasMap.set(normalizeHeaderToken(alias), canonical),
    );
  });
  return normalizedAliasMap;
};

const normalizeBandValue = (value = "") => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const match = raw.match(/(\d+)/);
  return match ? match[1] : raw;
};

const inferTechnology = (rawBand = "", rawEarfcn = "") => {
  const band = String(rawBand ?? "")
    .trim()
    .toLowerCase();
  if (band.startsWith("n") || band.includes("nr") || band === "5g") return "5G";

  const earfcnNum = Number(String(rawEarfcn ?? "").trim());
  if (Number.isFinite(earfcnNum) && earfcnNum >= 100000) return "5G";
  return "4G";
};

const buildNormalizedSiteCsv = (headers, rows) => {
  const normalizedAliasMap = getNormalizedAliasMap();
  const headerIndexByCanonical = new Map();

  headers.forEach((header, index) => {
    const canonical =
      normalizedAliasMap.get(normalizeHeaderToken(header)) ||
      normalizeHeaderToken(header);
    if (!canonical || headerIndexByCanonical.has(canonical)) return;
    headerIndexByCanonical.set(canonical, index);
  });

  const missingColumns = UPLOAD_SITE_COLUMNS.filter(
    (column) =>
      !headerIndexByCanonical.has(column) &&
      DEFAULT_SITE_COLUMN_VALUES[column] === undefined,
  );

  if (missingColumns.length > 0) {
    return { ok: false, missingColumns };
  }

  const normalizedRows = rows
    .map((rawRow) => {
      const valueByCanonical = {};
      UPLOAD_SITE_COLUMNS.forEach((column) => {
        const idx = headerIndexByCanonical.get(column);
        valueByCanonical[column] =
          idx !== undefined ? String(rawRow[idx] ?? "").trim() : "";
      });

      if (!valueByCanonical.technology) {
        valueByCanonical.technology = inferTechnology(
          valueByCanonical.band,
          valueByCanonical.earfcn,
        );
      }

      valueByCanonical.band = normalizeBandValue(valueByCanonical.band);

      Object.entries(DEFAULT_SITE_COLUMN_VALUES).forEach(
        ([column, fallback]) => {
          if (!valueByCanonical[column]) valueByCanonical[column] = fallback;
        },
      );

      return UPLOAD_SITE_COLUMNS.map(
        (column) => valueByCanonical[column] ?? "",
      );
    })
    .filter((row) => row.some((cell) => String(cell).trim() !== ""));

  return {
    ok: true,
    csv: [
      UPLOAD_SITE_COLUMNS.map((column) => toCsvField(column)).join(","),
      ...normalizedRows.map((row) =>
        row.map((cell) => toCsvField(cell)).join(","),
      ),
    ].join("\n"),
  };
};

const toCsvFile = (csvContent, originalFile) => {
  const baseName = String(originalFile?.name || "site_upload")
    .replace(/\.[^.]+$/, "")
    .trim();
  return new File([csvContent], `${baseName}_normalized.csv`, {
    type: "text/csv",
  });
};

const normalizeSiteUploadFile = async (file) => {
  const fileName = String(file?.name || "").toLowerCase();
  const fileType = String(file?.type || "").toLowerCase();

  const isCsv = fileName.endsWith(".csv") || fileType.includes("csv");
  const isXlsx =
    fileName.endsWith(".xlsx") ||
    fileType.includes("spreadsheetml") ||
    fileType.includes("excel");

  if (isCsv) {
    const content = await file.text();
    const lines = content.split(/\r?\n/);
    const nonEmptyLines = lines.filter(
      (line, idx) => idx === 0 || line.trim() !== "",
    );
    const headers = parseCsvLine(nonEmptyLines[0] || "");
    const rows = nonEmptyLines.slice(1).map((line) => parseCsvLine(line));
    const normalized = buildNormalizedSiteCsv(headers, rows);
    if (!normalized.ok) return normalized;
    return { ok: true, file: toCsvFile(normalized.csv, file) };
  }

  if (isXlsx) {
    const excelModule = await import("exceljs");
    const ExcelJS = excelModule?.default ?? excelModule;
    const workbook = new ExcelJS.Workbook();
    const buffer = await file.arrayBuffer();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets?.[0];
    if (!worksheet) return { ok: false, missingColumns: ["sheet"] };

    const cellToString = (cellValue) => {
      if (cellValue == null) return "";
      if (typeof cellValue === "object") {
        if (Array.isArray(cellValue.richText)) {
          return cellValue.richText.map((part) => part?.text || "").join("");
        }
        if (cellValue.text != null) return String(cellValue.text);
        if (cellValue.result != null) return String(cellValue.result);
      }
      return String(cellValue);
    };

    const headerRow = worksheet.getRow(1);
    const headers = [];
    for (let col = 1; col <= headerRow.cellCount; col += 1) {
      headers.push(cellToString(headerRow.getCell(col).value).trim());
    }

    const rows = [];
    for (let rowNo = 2; rowNo <= worksheet.rowCount; rowNo += 1) {
      const row = worksheet.getRow(rowNo);
      const rowValues = [];
      for (let col = 1; col <= headers.length; col += 1) {
        rowValues.push(cellToString(row.getCell(col).value).trim());
      }
      rows.push(rowValues);
    }

    const normalized = buildNormalizedSiteCsv(headers, rows);
    if (!normalized.ok) return normalized;
    return { ok: true, file: toCsvFile(normalized.csv, file) };
  }

  return { ok: false, missingColumns: ["unsupported_file_type"] };
};

function UnifiedHeader({
  onBack,
  onToggleControls,
  isControlsOpen,
  isLeftOpen,
  onLeftToggle,
  showAnalytics,
  projectId,
  sessionIds,
  opacity,
  project,
  setProject,
  setOpacity,
  logRadius = 12,
  setLogRadius,
  neighborLogsAvailable = false,
  neighborSquareSize = 8,
  setNeighborSquareSize,
  onUIChange,
  ui,
  onSettingsSaved,
  onOpenMultiView,
}) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const effectiveProjectId =
    projectId || searchParams.get("project_id") || searchParams.get("project");
  const sessionParam =
    searchParams.get("sessionId") || searchParams.get("session");
  const effectiveSessionIds =
    sessionIds ||
    (sessionParam
      ? sessionParam
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id)
      : []);
  // const [project, setProject] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [activeQuickControl, setActiveQuickControl] = useState(null);
  const [openSettingsDialog, setOpenSettingsDialog] = useState(false);
  const [openImportDialog, setOpenImportDialog] = useState(false);

  // Prediction Prompt State
  const [showPredictionPrompt, setShowPredictionPrompt] = useState(false);
  const [gridValue, setGridValue] = useState(25.0);
  const [radiusM, setRadiusM] = useState(5000.0);
  const [isPredicting, setIsPredicting] = useState(false);

  // Grab polygonContext to send drawn area to API
  const mapContext = useMapContext();
  const polygonStats = mapContext?.polygonStats;

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
  };

  const handleQuickUpload = async () => {
    if (!selectedFile) {
      toast.warn("Please select a file first.");
      return;
    }
    if (!effectiveProjectId) {
      toast.error("ProjectId is missing. Open a project first, then upload.");
      return;
    }

    let uploadFile = selectedFile;
    try {
      const normalizedCsv = await normalizeSiteUploadFile(selectedFile);
      if (!normalizedCsv.ok) {
        const unsupported = normalizedCsv.missingColumns?.includes(
          "unsupported_file_type",
        );
        toast.error(
          unsupported
            ? "Unsupported file type. Please upload CSV or XLSX."
            : `Missing required columns: ${normalizedCsv.missingColumns.join(", ")}`,
        );
        return;
      }
      uploadFile = normalizedCsv.file;
    } catch (e) {
      toast.error("Unable to read file. Please verify CSV/XLSX format.");
      return;
    }

    const formData = new FormData();
    // Send both keys for compatibility with older/newer backend binders.
    formData.append("File", uploadFile);
    formData.append("UploadFile", uploadFile);
    formData.append("ProjectId", String(effectiveProjectId));

    setIsUploading(true);
    try {
      const resp = await mapViewApi.uploadSitePredictionCsv(formData);
      if (resp?.Status === 1 || resp?.status === 1) {
        toast.success("File uploaded successfully!");
        setSelectedFile(null);
        // Open the LTE prediction prompt dialog
        setShowPredictionPrompt(true);
      } else {
        toast.error(resp?.Message || resp?.message || "Upload failed");
      }
    } catch (error) {
      const errorMsg =
        error?.data?.Message ||
        error?.data?.message ||
        error?.response?.data?.Message ||
        error?.response?.data?.message ||
        error?.message ||
        "Upload request failed.";
      toast.error(errorMsg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRunPrediction = async () => {
    if (!effectiveProjectId) {
      toast.error("Project ID is missing.");
      return;
    }
    if (!effectiveSessionIds || effectiveSessionIds.length === 0) {
      toast.error("No active session IDs selected.");
      return;
    }

    let polygonAreaCoords = [];
    if (
      polygonStats?.geometry?.type === "polygon" &&
      polygonStats.geometry.polygon
    ) {
      // Map [{lat, lng}] to [[lng, lat], ...] as commonly expected by PostGIS/Python WKT or GeoJSON
      polygonAreaCoords = polygonStats.geometry.polygon
        .map((pt) => [Number(pt?.lng), Number(pt?.lat)])
        .filter(
          (pair) =>
            Array.isArray(pair) &&
            pair.length === 2 &&
            Number.isFinite(pair[0]) &&
            Number.isFinite(pair[1]),
        );
      // Ensure it's closed (first point == last point) to be a valid coordinate ring
      if (polygonAreaCoords.length >= 3) {
        const first = polygonAreaCoords[0];
        const last = polygonAreaCoords[polygonAreaCoords.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          polygonAreaCoords.push([first[0], first[1]]);
        }
      }
    }

    setIsPredicting(true);
    try {
      const payload = {
        user_id: Number(user?.id) || 0,
        project_id: effectiveProjectId,
        session_ids: effectiveSessionIds,
        grid_value: parseFloat(gridValue) || 25.0,
        radius_m: parseFloat(radiusM) || 5000.0,
        building: true,
      };

      if (polygonAreaCoords.length >= 3) {
        payload.polygon_area = polygonAreaCoords;
      }

      await predictionApi.runLtePrediction(payload);
      toast.success("LTE Prediction started successfully.");
      setShowPredictionPrompt(false);
    } catch (error) {
      toast.error(error.message || "Failed to start LTE prediction");
    } finally {
      setIsPredicting(false);
    }
  };

  useEffect(() => {
    const fetchProject = async () => {
      const cachedProject = findProjectInProjectsCache(effectiveProjectId);
      if (cachedProject) {
        setProject((prev) =>
          prev?.id === cachedProject.id ? prev : cachedProject,
        );
        upsertProjectInProjectsCache(cachedProject);
      }

      try {
        const response = await mapViewApi.getProjects();
        const allProjects = response?.Data || [];

        if (!Array.isArray(allProjects)) {
          return;
        }
        writeProjectsListCache(allProjects);

        const matchedProject = allProjects.find(
          (project) => project.id === Number(effectiveProjectId),
        );

        if (matchedProject) {
          setProject((prev) =>
            prev?.id === matchedProject.id ? prev : matchedProject,
          );
          upsertProjectInProjectsCache(matchedProject);
        }
      } catch (error) {
        console.error("Failed to fetch project info", error);
      }
    };

    if (effectiveProjectId) {
      fetchProject();
    }
  }, [effectiveProjectId]);

  const isMapPage = location.pathname.includes("unified-map");
  const currentOpacityPercent = Math.round((opacity ?? 0.8) * 100);
  const currentLogRadius = Number.isFinite(Number(logRadius))
    ? Number(logRadius)
    : 12;
  const currentNeighborSquareSize = Number.isFinite(Number(neighborSquareSize))
    ? Number(neighborSquareSize)
    : 8;

  const adjustOpacity = (deltaPercent) => {
    const nextPercent = Math.max(
      0,
      Math.min(100, currentOpacityPercent + deltaPercent),
    );
    setOpacity(nextPercent / 100);
  };

  const updateOpacityFromInput = (rawValue) => {
    const nextPercent = Number(rawValue);
    if (!Number.isFinite(nextPercent)) return;
    setOpacity(Math.max(0, Math.min(100, nextPercent)) / 100);
  };

  const adjustLogRadius = (delta) => {
    if (!setLogRadius) return;
    const nextRadius = Math.max(4, Math.min(40, currentLogRadius + delta));
    setLogRadius(nextRadius);
  };

  const updateLogRadiusFromInput = (rawValue) => {
    if (!setLogRadius) return;
    const nextRadius = Number(rawValue);
    if (!Number.isFinite(nextRadius)) return;
    setLogRadius(Math.max(2, Math.min(40, Math.round(nextRadius))));
  };

  const adjustNeighborSquareSize = (delta) => {
    if (!setNeighborSquareSize) return;
    const nextSize = Math.max(
      3,
      Math.min(80, currentNeighborSquareSize + delta),
    );
    setNeighborSquareSize(nextSize);
  };

  const updateNeighborSquareSizeFromInput = (rawValue) => {
    if (!setNeighborSquareSize) return;
    const nextSize = Number(rawValue);
    if (!Number.isFinite(nextSize)) return;
    setNeighborSquareSize(Math.max(3, Math.min(80, Math.round(nextSize))));
  };

  const toggleQuickControl = useCallback((controlKey) => {
    setActiveQuickControl((prev) => (prev === controlKey ? null : controlKey));
  }, []);

  useEffect(() => {
    if (!neighborLogsAvailable && activeQuickControl === "neighbors") {
      setActiveQuickControl(null);
    }
  }, [neighborLogsAvailable, activeQuickControl]);

  useEffect(() => {
    const handleUtilityAction = (event) => {
      const action = event?.detail?.action;
      if (!isMapPage || !action) return;

      if (action === "opacity") {
        toggleQuickControl("opacity");
        return;
      }
      if (action === "log-radius") {
        toggleQuickControl("radius");
        return;
      }
      if (action === "neighbor-radius") {
        if (neighborLogsAvailable) {
          toggleQuickControl("neighbors");
        }
        return;
      }
      if (action === "settings") {
        setOpenSettingsDialog(true);
        return;
      }
      if (action === "import") {
        setOpenImportDialog(true);
      }
    };

    window.addEventListener("stracer:utility-action", handleUtilityAction);
    return () =>
      window.removeEventListener("stracer:utility-action", handleUtilityAction);
  }, [isMapPage, neighborLogsAvailable, toggleQuickControl]);

  return (
    <header className="h-14 bg-gray-800 text-white shadow-sm flex items-center justify-between px-6 flex-shrink-0 relative z-10">
      <div className="flex items-center gap-4">
        {isMapPage && (
          <>
            <Button
              onClick={() => onBack?.()}
              size="sm"
              className="flex gap-1 items-center bg-slate-700 hover:bg-slate-600 text-white border-slate-600"
              title="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>

            <h1 className="text-lg md:text-xl font-semibold">
              {project?.project_name || "Unified Map"}
              <span className="text-sm font-normal text-gray-400 ml-2">
                {effectiveProjectId && `(Project: ${effectiveProjectId})`}
              </span>
            </h1>

            <Button
              onClick={onToggleControls}
              size="sm"
              className={`flex gap-1 items-center bg-blue-600 hover:bg-blue-500
                ${
                  isControlsOpen
                    ? "bg-red-600 hover:bg-red-500"
                    : "bg-blue-600 hover:bg-blue-500"
                }
               text-white`}
            >
              <Filter className="h-4 w-4" />
              {isControlsOpen ? "Hide" : "Filter"}
            </Button>

            <Button
              onClick={onLeftToggle}
              size="sm"
              className={`flex gap-1 items-center ${
                showAnalytics
                  ? "bg-red-600 hover:bg-red-500"
                  : "bg-blue-600 hover:bg-blue-500"
              } text-white`}
            >
              <ChartBar className="h-4 w-4" />
              {showAnalytics ? "Hide" : "Analytics"}
            </Button>

            <Button
              onClick={() => onOpenMultiView?.()}
              size="sm"
              className="flex gap-1 items-center bg-blue-600 hover:bg-blue-500 text-white"
            >
              <LayoutGrid className="h-4 w-4" />
              Multi Map
            </Button>

            {activeQuickControl === "opacity" && (
              <div className="flex items-center gap-2 bg-gray-700/80 rounded-lg px-3 py-1.5 border border-gray-600">
                <span className="text-xs text-gray-300 font-medium">
                  Opacity
                </span>
                <button
                  type="button"
                  onClick={() => adjustOpacity(-5)}
                  className="h-6 w-6 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                  title="Decrease opacity"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={currentOpacityPercent}
                  onChange={(e) => updateOpacityFromInput(e.target.value)}
                  className="h-7 w-14 bg-slate-800 border-slate-600 text-white text-xs text-center px-1"
                />
                <button
                  type="button"
                  onClick={() => adjustOpacity(5)}
                  className="h-6 w-6 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                  title="Increase opacity"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <span className="text-xs text-blue-300 font-medium">%</span>
              </div>
            )}

            {activeQuickControl === "radius" && (
              <div className="flex items-center gap-2 bg-gray-700/80 rounded-lg px-3 py-1.5 border border-gray-600">
                <span className="text-xs text-gray-300 font-medium">
                  Log Radius
                </span>
                <button
                  type="button"
                  onClick={() => adjustLogRadius(-1)}
                  className="h-6 w-6 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                  title="Decrease log radius"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <Input
                  type="number"
                  min={4}
                  max={40}
                  value={currentLogRadius}
                  onChange={(e) => updateLogRadiusFromInput(e.target.value)}
                  className="h-7 w-14 bg-slate-800 border-slate-600 text-white text-xs text-center px-1"
                />
                <button
                  type="button"
                  onClick={() => adjustLogRadius(1)}
                  className="h-6 w-6 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                  title="Increase log radius"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            )}

            {activeQuickControl === "neighbors" && neighborLogsAvailable && (
              <div className="flex items-center gap-2 bg-gray-700/80 rounded-lg px-3 py-1.5 border border-gray-600">
                <span className="text-xs text-gray-300 font-medium">
                  Neighbor Size
                </span>
                <button
                  type="button"
                  onClick={() => adjustNeighborSquareSize(-1)}
                  className="h-6 w-6 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                  title="Decrease neighbor square size"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <Input
                  type="number"
                  min={3}
                  max={80}
                  value={currentNeighborSquareSize}
                  onChange={(e) =>
                    updateNeighborSquareSizeFromInput(e.target.value)
                  }
                  className="h-7 w-14 bg-slate-800 border-slate-600 text-white text-xs text-center px-1"
                />
                <button
                  type="button"
                  onClick={() => adjustNeighborSquareSize(1)}
                  className="h-6 w-6 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                  title="Increase neighbor square size"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div>
        {isMapPage && (
          <DrawingControlsPanel
            position="relative"
            onUIChange={onUIChange}
            ui={ui}
          />
        )}
      </div>

      <div className="flex items-center space-x-4">
        <Dialog open={openImportDialog} onOpenChange={setOpenImportDialog}>
          <DialogContent className="sm:max-w-md bg-gray-800 text-white border-gray-700">
            <div className="p-6 text-center">
              <h2 className="text-lg font-semibold mb-4">
                Quick Upload Session Data
              </h2>
              <div className="flex flex-col items-center gap-4">
                <label className="w-full flex flex-col items-center px-4 py-6 bg-gray-700 rounded-lg border-2 border-dashed border-gray-500 cursor-pointer hover:border-blue-500 transition-colors">
                  <UploadCloud className="h-10 w-10 text-gray-400 mb-2" />
                  <span className="text-sm">
                    {selectedFile ? selectedFile.name : "Select .csv or .xlsx file"}
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleFileChange}
                    accept=".csv,.xlsx,.xls"
                  />
                </label>

                <Button
                  onClick={handleQuickUpload}
                  disabled={isUploading || !selectedFile}
                  className="w-full bg-blue-600 hover:bg-blue-500"
                >
                  {isUploading ? <Spinner /> : "Upload Now"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={openSettingsDialog} onOpenChange={setOpenSettingsDialog}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden p-0">
            <SettingsPage onSaveSuccess={onSettingsSaved} />
          </DialogContent>
        </Dialog>
        

        

        {/* LTE Prediction Prompt Dialog */}
        <Dialog
          open={showPredictionPrompt}
          onOpenChange={setShowPredictionPrompt}
        >
          <DialogContent className="sm:max-w-md bg-gray-800 text-white border-gray-700">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-2">Run LTE Prediction</h2>
              <p className="text-sm text-gray-400 mb-6">
                Do you want to run prediction on the uploaded site data? This
                will use the drawn polygon area if present.
              </p>

              <div className="flex flex-col gap-4 mb-6">
                <div>
                  <label className="text-sm text-gray-300 font-medium block mb-1">
                    Grid Value
                  </label>
                  <input
                    type="number"
                    value={gridValue}
                    onChange={(e) => setGridValue(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    placeholder="e.g. 25.0"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-300 font-medium block mb-1">
                    Radius (m)
                  </label>
                  <input
                    type="number"
                    value={radiusM}
                    onChange={(e) => setRadiusM(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    placeholder="e.g. 5000.0"
                  />
                </div>
                {polygonStats?.geometry?.type === "polygon" &&
                  polygonStats.geometry.polygon?.length > 0 && (
                    <div className="text-xs text-green-400 font-medium mt-1">
                      ✓ Using active drawn polygon area (
                      {polygonStats.geometry.polygon.length} points)
                    </div>
                  )}
              </div>

              <div className="flex gap-3 justify-end">
                <Button
                  variant="ghost"
                  onClick={() => setShowPredictionPrompt(false)}
                  disabled={isPredicting}
                  className="hover:bg-gray-700 hover:text-white"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRunPrediction}
                  disabled={isPredicting}
                  className="bg-blue-600 hover:bg-blue-500"
                >
                  {isPredicting ? <Spinner /> : "Run Prediction"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <ProjectsDropdown currentProjectId={effectiveProjectId} />

        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">
            {user?.name?.charAt(0)?.toUpperCase() || "U"}
          </div>
          <span className="text-sm text-gray-300">
            <span className="font-medium text-white">
              {user?.name || "User"}
            </span>
          </span>
        </div>

        <Button
          onClick={logout}
          variant="default"
          size="sm"
          className="text-white bg-red-600"
        >
          <LogOut className="h-4 w-4 mr-2 text-white" />
          Logout
        </Button>
      </div>
    </header>
  );
}

export default React.memo(UnifiedHeader);
