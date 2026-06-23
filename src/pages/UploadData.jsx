import React, { useState, useCallback, useEffect } from "react";
import { toast } from "react-toastify";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadCloud, File, X, Download, MapPinned, RefreshCw } from "lucide-react";


import Spinner from "../components/common/Spinner";

import { excelApi, mapViewApi } from "../api/apiEndpoints";
import { useFileUpload } from "../hooks/useFileUpload";
import { useAuth } from "@/context/AuthContext";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 100MB

const FILE_TYPES = [
  "text/csv",
  "application/zip",
  "application/vnd.ms-excel",
  "application/x-zip-compressed",   // ✅ added
  "application/octet-stream",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const toSafeArray = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.Data)) return value.Data;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.data?.Data)) return value.data.Data;
  return [];
};

const normalizeSessionId = (value) => String(value ?? "").trim();

const normalizeSessionIds = (value) => {
  const source = Array.isArray(value) ? value : [];
  return source
    .map(normalizeSessionId)
    .filter(Boolean)
    .filter((id, index, arr) => arr.indexOf(id) === index);
};

const formatSessionCell = (sessionValue) => {
  if (Array.isArray(sessionValue)) {
    const values = sessionValue.map(normalizeSessionId).filter(Boolean);
    return values.length ? values.join(", ") : "N/A";
  }
  const value = normalizeSessionId(sessionValue);
  return value || "N/A";
};

const normalizeStatus = (status) => String(status ?? "").trim().toLowerCase();
const isProcessingStatus = (status) => normalizeStatus(status) === "processing";

const extractResponseData = (response) => response?.data || response;

const resolveCompanyId = (user) => {
  const directCompanyId = Number(user?.company_id ?? user?.CompanyId ?? user?.companyId ?? 0);
  if (Number.isFinite(directCompanyId) && directCompanyId > 0) return directCompanyId;

  if (typeof window === "undefined") return 0;

  try {
    const cachedUser = JSON.parse(sessionStorage.getItem("user") || "null");
    const cachedCompanyId = Number(
      cachedUser?.company_id ?? cachedUser?.CompanyId ?? cachedUser?.companyId ?? 0,
    );
    return Number.isFinite(cachedCompanyId) && cachedCompanyId > 0 ? cachedCompanyId : 0;
  } catch {
    return 0;
  }
};

const closeLinearRing = (ring) => {
  if (!Array.isArray(ring) || ring.length < 3) return ring || [];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first?.[0] === last?.[0] && first?.[1] === last?.[1]) return ring;
  return [...ring, first];
};

const ringToWkt = (ring) =>
  `(${closeLinearRing(ring)
    .map((point) => {
      const lon = Number(point?.[0]);
      const lat = Number(point?.[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        throw new Error("GeoJSON coordinates must be numeric [longitude, latitude] pairs.");
      }
      return `${lon} ${lat}`;
    })
    .join(", ")})`;

const geometryToWkt = (geometry) => {
  const geom = geometry?.type === "Feature" ? geometry.geometry : geometry;
  if (!geom?.type) throw new Error("GeoJSON must contain a Polygon or MultiPolygon geometry.");

  if (geom.type === "Polygon") {
    return `POLYGON(${geom.coordinates.map(ringToWkt).join(", ")})`;
  }

  if (geom.type === "MultiPolygon") {
    return `MULTIPOLYGON(${geom.coordinates
      .map((polygon) => `(${polygon.map(ringToWkt).join(", ")})`)
      .join(", ")})`;
  }

  throw new Error("Only Polygon and MultiPolygon imports are supported.");
};

const parseMapInfoRegionToWkt = (raw) => {
  const lines = String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const polygons = [];

  for (let i = 0; i < lines.length; i++) {
    const regionMatch = lines[i].match(/^Region\s+(\d+)/i);
    if (!regionMatch) continue;

    const ringCount = Number.parseInt(regionMatch[1], 10);
    if (!Number.isInteger(ringCount) || ringCount <= 0) continue;

    const rings = [];
    i++;

    for (let ringIndex = 0; ringIndex < ringCount && i < lines.length; ringIndex++) {
      const pointCount = Number.parseInt(lines[i], 10);
      if (!Number.isInteger(pointCount) || pointCount < 3) {
        throw new Error("Invalid MapInfo MIF Region point count.");
      }

      const ring = [];
      i++;

      for (let pointIndex = 0; pointIndex < pointCount && i < lines.length; pointIndex++, i++) {
        const parts = lines[i].split(/\s+/);
        const lon = Number.parseFloat(parts[0]);
        const lat = Number.parseFloat(parts[1]);

        if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
          throw new Error("Invalid MapInfo MIF coordinate pair.");
        }

        ring.push([lon, lat]);
      }

      rings.push(closeLinearRing(ring));
    }

    i--;
    if (rings.length) polygons.push(rings);
  }

  if (!polygons.length) {
    throw new Error(
      "MapInfo file does not contain inline Region polygon coordinates. For TAB/MID imports, export the layer as MIF/MIFF first if the file only references .DAT/.MAP data.",
    );
  }

  if (polygons.length === 1) {
    return `POLYGON(${polygons[0].map(ringToWkt).join(", ")})`;
  }

  return `MULTIPOLYGON(${polygons
    .map((polygon) => `(${polygon.map(ringToWkt).join(", ")})`)
    .join(", ")})`;
};

const normalizePolygonInput = (raw) => {
  const text = String(raw || "").trim();
  if (!text) throw new Error("Paste a WKT polygon or upload a GeoJSON/WKT/MIF/TAB file.");

  if (/^(POLYGON|MULTIPOLYGON)\s*\(/i.test(text)) return text;
  if (/^Region\s+\d+/im.test(text)) return parseMapInfoRegionToWkt(text);
  if (/^(Version|Charset|Delimiter|CoordSys|Columns|Data|!table|Definition\s+Table|Type\s+NATIVE)\b/im.test(text)) {
    return parseMapInfoRegionToWkt(text);
  }

  const parsed = JSON.parse(text);
  if (parsed?.type === "FeatureCollection") {
    const feature = parsed.features?.find((item) =>
      ["Polygon", "MultiPolygon"].includes(item?.geometry?.type),
    );
    if (!feature) throw new Error("FeatureCollection does not contain a polygon geometry.");
    return geometryToWkt(feature);
  }

  return geometryToWkt(parsed);
};

const parsePolygonSessionIds = (value) =>
  String(value || "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);

const normalizeHistoryItems = (items) =>
  toSafeArray(items).map((item = {}) => ({
    ...item,
    id: item.id ?? item.upload_id ?? `${item.file_name ?? "file"}-${item.uploaded_on ?? "time"}`,
    session_id: item.session_id ?? item.session_ids ?? null,
    file_name: item.file_name ?? item.fileName ?? "N/A",
    uploaded_by: item.uploaded_by ?? item.uploadedBy ?? "Unknown",
    status: item.status ?? "N/A",
    remarks: item.remarks ?? "",
    uploaded_on: item.uploaded_on ?? item.uploadedOn ?? null,
  }));

const UploadDataPage = () => {
  const { user } = useAuth();
  const [sessionFiles, setSessionFiles] = useState([]);
  const [remarks, setRemarks] = useState("");
  const [polygonName, setPolygonName] = useState("");
  const [polygonText, setPolygonText] = useState("");
  const [polygonSessionIdsText, setPolygonSessionIdsText] = useState("");
  const [polygonArea, setPolygonArea] = useState("");
  const [polygonImporting, setPolygonImporting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [activeTab, setActiveTab] = useState("session");
  const [historyLoading, setHistoryLoading] = useState(true);

  const { loading, errorLog, uploadFile, setErrorLog } = useFileUpload();

  // ------------------ FILE UPLOAD LOGIC ------------------
  const handleUpload = async () => {
    const files = toSafeArray(sessionFiles);
    if (!files.length) {
      toast.warn("Please select a main data file.");
      return;
    }

    const formData = new FormData();
    files.forEach((file) => {
      formData.append("UploadFile", file);
    });
    formData.append("UploadFileType", "1");
    formData.append("remarks", remarks);
    formData.append("ProjectName", "");
    formData.append("SessionIds", "");

    const result = await uploadFile(formData);
    if (result.success) {
      toast.success("File uploaded successfully!");
      resetForm();
      fetchUploadedFiles();
      return;
    }

    if (result?.isLikelyProcessing) {
      toast.info("Upload request ended before final response. History will auto-refresh while processing continues.");
      fetchUploadedFiles({ showLoader: false, showError: false });
    }
  };

  const resetForm = () => {
    setSessionFiles([]);
    setRemarks("");
    setErrorLog("");
  };

  const validateFile = (file, allowedTypes) => {
    if (![...allowedTypes, ""].includes(file.type)) {
      toast.error(`File type '${file.type || "unknown"}' not supported.`);
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File is too large. (Max 100MB)");
      return false;
    }
    return true;
  };

  const onDropSession = useCallback((files) => {
    const valid = toSafeArray(files).filter((f) => validateFile(f, FILE_TYPES));
    if (!valid.length) return;
    setSessionFiles((prev) => {
      const next = [...prev];
      valid.forEach((file) => {
        const exists = next.some(
          (item) =>
            item.name === file.name &&
            item.size === file.size &&
            item.lastModified === file.lastModified,
        );
        if (!exists) next.push(file);
      });
      return next;
    });
  }, []);

  const {
    getRootProps: getRootPropsSession,
    getInputProps: getInputPropsSession,
    isDragActive: isDragActiveSession,
  } = useDropzone({ onDrop: onDropSession, multiple: true });

  const removeFile = (type, index = null) => {
    if (type !== "session") return;
    if (index === null) {
      setSessionFiles([]);
      return;
    }
    setSessionFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  // ------------------ UPLOAD HISTORY FETCH ------------------
  const fetchUploadedFiles = useCallback(async ({ showLoader = true, showError = true } = {}) => {
    if (activeTab !== "session") {
      setUploadedFiles([]);
      setHistoryLoading(false);
      return;
    }
    if (showLoader) setHistoryLoading(true);
    try {
      const response = await excelApi.getUploadedFiles(1);
      setUploadedFiles(normalizeHistoryItems(response?.Data ?? response));
    } catch {
      setUploadedFiles([]);
      if (showError) {
        toast.error("Failed to fetch uploaded files.");
      }
    } finally {
      if (showLoader) setHistoryLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchUploadedFiles({ showLoader: true, showError: true });
  }, [fetchUploadedFiles, activeTab]);

  useEffect(() => {
    const hasProcessing = uploadedFiles.some((file) => isProcessingStatus(file?.status));
    if (!hasProcessing) return;

    const intervalId = setInterval(() => {
      fetchUploadedFiles({ showLoader: false, showError: false });
    }, 8000);

    return () => clearInterval(intervalId);
  }, [uploadedFiles, fetchUploadedFiles]);

  const handlePolygonFileChange = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setPolygonText(String(reader.result || ""));
      if (!polygonName.trim()) {
        setPolygonName(file.name.replace(/\.(geojson|json|wkt|txt|mif|miff|mid|tab)$/i, ""));
      }
    };
    reader.onerror = () => toast.error("Failed to read polygon file");
    reader.readAsText(file);
  }, [polygonName]);

  const handlePolygonImport = useCallback(async () => {
    if (!polygonName.trim()) {
      toast.error("Polygon name is required");
      return;
    }

    setPolygonImporting(true);
    try {
      const wkt = normalizePolygonInput(polygonText);
      const sessionIds = parsePolygonSessionIds(polygonSessionIdsText);
      const primarySessionId = sessionIds.length > 0 ? String(sessionIds[0]).trim() : undefined;
      const scopedCompanyId = resolveCompanyId(user);
      const numericArea = polygonArea === "" ? null : Number(polygonArea);

      if (numericArea !== null && !Number.isFinite(numericArea)) {
        throw new Error("Area must be a valid number.");
      }

      const response = await mapViewApi.importPolygon({
        Name: polygonName.trim(),
        WKT: wkt,
        Wkt: wkt,
        SessionIds: sessionIds,
        session_ids: sessionIds,
        session_id: primarySessionId,
        Area: numericArea,
        company_id: scopedCompanyId || undefined,
        CompanyId: scopedCompanyId || undefined,
        CreatedByUserId: user?.id || undefined,
        created_by_user_id: user?.id || undefined,
      });
      const data = extractResponseData(response);

      if (data?.Status === 1 || data?.status === 1 || data?.success === true) {
        toast.success("Polygon imported into map regions");
        setPolygonName("");
        setPolygonText("");
        setPolygonSessionIdsText("");
        setPolygonArea("");
      } else {
        toast.error(data?.Message || data?.message || "Polygon import failed");
      }
    } catch (error) {
      toast.error(error?.message || "Polygon import failed");
    } finally {
      setPolygonImporting(false);
    }
  }, [polygonArea, polygonName, polygonSessionIdsText, polygonText, user]);

  // ------------------ UI HELPERS ------------------
  const renderFileList = (files, type) => {
    const safeFiles = toSafeArray(files);
    return safeFiles.length ? (
      <div className="mt-4 space-y-2">
        {safeFiles.map((file, i) => (
          <div key={i} className="flex items-center justify-between bg-gray-500 rounded px-3 py-2">
            <div className="flex items-center gap-2">
              <File className="h-5 w-5 text-white" />
              <span>{file.name}</span>
              <span className="text-xs text-blue-200">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeFile(type, i);
              }}
              className="text-red-200 hover:text-red-400"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ))}
      </div>
    ) : null;
  };

  const renderFileInput = (getRootProps, getInputProps, isActive, files, type, label) => (
    <div
      {...getRootProps()}
      className={`p-8 border-2 border-dashed rounded-lg cursor-pointer text-center transition-colors ${
        isActive ? "border-gray-800 bg-blue-200" : "border-white bg-gray-400"
      }`}
    >
      <input {...getInputProps()} />
      <UploadCloud className="mx-auto h-10 w-10 text-white" />
      <p className="mt-2 text-sm text-white">{label}</p>
      {renderFileList(files, type)}
    </div>
  );

  return (
    <div className="p-6 flex flex-col items-center bg-gray-700 text-white min-h-screen">
      <div className="max-w-4xl w-full">
        <h1 className="text-2xl font-semibold mb-4 text-center">Upload Data</h1>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-2 bg-gray-700 text-white rounded">
            <TabsTrigger value="session">Upload Session Data</TabsTrigger>
            <TabsTrigger value="polygon">Import Polygon</TabsTrigger>
          </TabsList>

          {/* ---------- SESSION TAB ---------- */}
          <TabsContent value="session" className="space-y-4 mt-4">
            {renderFileInput(
              getRootPropsSession,
              getInputPropsSession,
              isDragActiveSession,
              sessionFiles,
              "session",
              "Session Data Files (.csv or .zip, max 500 MB each)"
            )}
            <Textarea
              placeholder=" Remarks (Required)"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="bg-white text-black placeholder:text-gray-500"
            />
          </TabsContent>

          {/* ---------- POLYGON TAB ---------- */}
          <TabsContent value="polygon" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-4">
              <div>
                <label className="text-sm font-semibold">Polygon Name</label>
                <Input
                  value={polygonName}
                  onChange={(e) => setPolygonName(e.target.value)}
                  placeholder="Region name"
                  className="bg-white text-black placeholder:text-gray-500"
                />
              </div>
              <div>
                <label className="text-sm font-semibold">Area</label>
                <Input
                  type="number"
                  value={polygonArea}
                  onChange={(e) => setPolygonArea(e.target.value)}
                  placeholder="Optional"
                  className="bg-white text-black placeholder:text-gray-500"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold">Polygon Data</label>
              <Textarea
                value={polygonText}
                onChange={(e) => setPolygonText(e.target.value)}
                placeholder="Paste WKT POLYGON/MULTIPOLYGON, GeoJSON Polygon/MultiPolygon, or MapInfo MIF Region data"
                className="min-h-[220px] bg-white text-black placeholder:text-gray-500"
              />
            </div>

            <div>
              <label className="text-sm font-semibold">Session IDs</label>
              <Input
                value={polygonSessionIdsText}
                onChange={(e) => setPolygonSessionIdsText(e.target.value)}
                placeholder="Optional comma-separated session ids"
                className="bg-white text-black placeholder:text-gray-500"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <label className="inline-flex cursor-pointer items-center rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-blue-200">
                <UploadCloud className="mr-2 h-4 w-4" />
                Import File
                <input
                  type="file"
                  accept=".geojson,.json,.wkt,.txt,.mif,.miff,.mid,.tab"
                  onChange={handlePolygonFileChange}
                  className="hidden"
                />
              </label>
              <Button
                onClick={handlePolygonImport}
                disabled={polygonImporting}
                className="bg-white text-gray-700 hover:bg-blue-200"
              >
                {polygonImporting ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <MapPinned className="mr-2 h-4 w-4" />
                    Save Region
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {/* ---------- Error Log Section ---------- */}
        {errorLog && (
          <div className="mt-6 p-4 bg-red-100 border border-red-300 text-red-700 rounded whitespace-pre-wrap max-h-60 overflow-auto">
            <strong>Error Log:</strong>
            <pre>{errorLog}</pre>
          </div>
        )}

        {activeTab === "session" && (
          <div className="mt-8 flex justify-center gap-4">
            <Button
              onClick={handleUpload}
              disabled={loading}
              size="lg"
              className="bg-white text-gray-700 hover:bg-blue-200"
            >
              {loading ? <Spinner /> : "Upload & Process"}
            </Button>
            <Button
              onClick={() => excelApi.downloadTemplate(1)}
              variant="outline"
              size="lg"
              className="bg-white text-gray-700 hover:bg-blue-200"
            >
              <Download className="mr-2 h-4 w-4" />
              Download Template
            </Button>
          </div>
        )}

        {/* ---------- Upload History ---------- */}
        {activeTab === "session" && <div className="mt-10">
          <h2 className="text-xl font-semibold mb-4">
            Upload History for '{activeTab}'
          </h2>
          <div className="border rounded-lg bg-gray-500">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File Name</TableHead>
                  <TableHead>Uploaded By</TableHead>
                  <TableHead>Session ID</TableHead>
                  <TableHead>Uploaded On</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">
                      <Spinner />
                    </TableCell>
                  </TableRow>
                ) : uploadedFiles.length > 0 ? (
                  uploadedFiles.map((file, index) => {
                    const status = normalizeStatus(file.status);
                    const statusClass =
                      status === "success"
                        ? "text-green-200"
                        : status === "processing"
                          ? "text-yellow-200"
                          : "text-red-200";

                    return (
                      <TableRow key={`${file.id}-${index}`}>
                        <TableCell>{file.file_name}</TableCell>
                        <TableCell>{file.uploaded_by}</TableCell>
                        <TableCell>{formatSessionCell(file.session_id)}</TableCell>
                        <TableCell>
                          {file.uploaded_on ? new Date(file.uploaded_on).toLocaleString() : "N/A"}
                        </TableCell>
                        <TableCell className={statusClass}>
                          {file.status}
                        </TableCell>
                        <TableCell>{file.remarks}</TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24">
                      No history found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>}
      </div>
    </div>
  );
};

export default UploadDataPage;
