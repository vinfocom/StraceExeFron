import React, { useState, useCallback, useEffect } from "react";
import { toast } from "react-toastify";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadCloud, File, X, Download } from "lucide-react";
import { Label } from "@/components/ui/label";


import Spinner from "../components/common/Spinner";

import { excelApi } from "../api/apiEndpoints";
import { useFileUpload } from "../hooks/useFileUpload";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 100MB

const FILE_TYPES = [
  "text/csv",
  "application/zip",
  "application/vnd.ms-excel",
  "application/x-zip-compressed",   // ✅ added
  "application/octet-stream",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const POLYGON_TYPES = [
  "application/zip",
  "application/geo+json",
  "application/x-zip-compressed",   // ✅ added
  "application/octet-stream",
  "application/json",
  "text/csv",
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
  const [sessionFiles, setSessionFiles] = useState([]);
  const [predictionFiles, setPredictionFiles] = useState([]);
  const [polygonFile, setPolygonFile] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [projectName, setProjectName] = useState("");
  const [selectedSessions, setSelectedSessions] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [activeTab, setActiveTab] = useState("session");
  const [historyLoading, setHistoryLoading] = useState(true);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sessionsInRange, setSessionsInRange] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const { loading, errorLog, uploadFile, setErrorLog } = useFileUpload();

  // ------------------ FILE UPLOAD LOGIC ------------------
  const handleUpload = async () => {
    const files = toSafeArray(activeTab === "session" ? sessionFiles : predictionFiles);
    if (!files.length) {
      toast.warn("Please select a main data file.");
      return;
    }

    if (activeTab === "prediction") {
      if (!projectName.trim()) {
        toast.warn("Please enter a project name.");
        return;
      }
      if (!polygonFile) {
        toast.warn("Please upload a polygon file.");
        return;
      }
    }

    const formData = new FormData();
    formData.append("UploadFile", files[0]);
    if (polygonFile) formData.append("UploadNoteFile", polygonFile);
    formData.append("UploadFileType", activeTab === "session" ? "1" : "2");
    formData.append("remarks", remarks);
    formData.append("ProjectName", projectName);
    formData.append("SessionIds", normalizeSessionIds(selectedSessions).join(","));

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
    setPredictionFiles([]);
    setPolygonFile(null);
    setProjectName("");
    setRemarks("");
    setSelectedSessions([]);
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
    if (valid.length) setSessionFiles(valid);
  }, []);

  const onDropPrediction = useCallback((files) => {
    const valid = toSafeArray(files).filter((f) => validateFile(f, FILE_TYPES));
    if (valid.length) setPredictionFiles(valid);
  }, []);

  const onDropPolygon = useCallback((files) => {
    const valid = toSafeArray(files).filter((f) => validateFile(f, POLYGON_TYPES));
    if (valid.length) setPolygonFile(valid[0]);
  }, []);

  const {
    getRootProps: getRootPropsSession,
    getInputProps: getInputPropsSession,
    isDragActive: isDragActiveSession,
  } = useDropzone({ onDrop: onDropSession, multiple: false });

  const {
    getRootProps: getRootPropsPrediction,
    getInputProps: getInputPropsPrediction,
    isDragActive: isDragActivePrediction,
  } = useDropzone({ onDrop: onDropPrediction, multiple: false });

  const {
    getRootProps: getRootPropsPolygon,
    getInputProps: getInputPropsPolygon,
    isDragActive: isDragActivePolygon,
  } = useDropzone({ onDrop: onDropPolygon, multiple: false });

  const removeFile = (type) => {
    if (type === "session") setSessionFiles([]);
    else if (type === "prediction") setPredictionFiles([]);
    else if (type === "polygon") setPolygonFile(null);
  };

  // ------------------ UPLOAD HISTORY FETCH ------------------
  const fetchUploadedFiles = useCallback(async ({ showLoader = true, showError = true } = {}) => {
    if (showLoader) setHistoryLoading(true);
    try {
      const response = await excelApi.getUploadedFiles(activeTab === "session" ? 1 : 2);
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

  // ------------------ FETCH SESSIONS BUTTON ------------------
  const handleFetchSessions = async () => {
      if (!startDate || !endDate) {
        toast.warn("Please select both start and end dates.");
        return;
      }
      if (new Date(startDate) > new Date(endDate)) {
        toast.error("Start date cannot be after end date.");
        return;
      }
  
      setSessionsLoading(true);
      setSelectedSessions([]);
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      try {
        const response = await excelApi.getSessions(start, end);
        const fetched = toSafeArray(response?.Data ?? response);
       
        setSessionsInRange(
          fetched.map((s) => ({
            value: normalizeSessionId(s?.id ?? s?.session_id ?? s?.value),
            label:
              s?.label ||
              s?.name ||
              `Session ${normalizeSessionId(s?.id ?? s?.session_id ?? s?.value)}`,
          }))
        );
       
        if (fetched.length === 0) toast.info("No sessions found.");
      } catch {
        toast.error("Failed to fetch sessions.");
      } finally {
        setSessionsLoading(false);
      }
    };

    // Simple multi-select dropdown component
const SessionMultiDropdown = ({ sessions, selectedSessions, setSelectedSessions }) => {
  const toggle = (id) => {
    const normalizedId = normalizeSessionId(id);
    if (!normalizedId) return;

    setSelectedSessions((prev) => {
      const safePrev = normalizeSessionIds(prev);
      return safePrev.includes(normalizedId)
        ? safePrev.filter((s) => s !== normalizedId)
        : [...safePrev, normalizedId];
    });
  };

  const safeSessions = toSafeArray(sessions);
  const safeSelected = normalizeSessionIds(selectedSessions);

  if (!safeSessions.length) {
    return <p className="text-gray-200 mt-2">No sessions loaded yet.</p>;
  }

  return (
    <div className="max-h-60 overflow-y-auto bg-gray-700 rounded p-3 space-y-1">
      {safeSessions.map((s, index) => {
        const value = normalizeSessionId(s?.value);
        if (!value) return null;
        return (
        <label
          key={`${value}-${index}`}
          className="flex items-center space-x-2 cursor-pointer hover:bg-gray-600 rounded px-2 py-1"
        >
          <input
            type="checkbox"
            checked={safeSelected.includes(value)}
            onChange={() => toggle(value)}
          />
          <span className="text-white text-sm">{s?.label || `Session ${value}`}</span>
        </label>
      );
      })}
    </div>
  );
};
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
                removeFile(type);
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
            <TabsTrigger value="prediction">Upload Prediction Data</TabsTrigger>
          </TabsList>

          {/* ---------- SESSION TAB ---------- */}
          <TabsContent value="session" className="space-y-4 mt-4">
            {renderFileInput(
              getRootPropsSession,
              getInputPropsSession,
              isDragActiveSession,
              sessionFiles,
              "session",
              "Session Data File (.csv or .zip, max 500 MB)"
            )}
            <Textarea
              placeholder=" Remarks (Required)"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </TabsContent>

          {/* ---------- PREDICTION TAB ---------- */}
          <TabsContent value="prediction" className="space-y-4 mt-4">
            {renderFileInput(
              getRootPropsPrediction,
              getInputPropsPrediction,
              isDragActivePrediction,
              predictionFiles,
              "prediction",
              "Prediction Data File (.csv or .zip, max 200 MB)"
            )}

            <label className="font-semibold">Inbound Polygon File (Required)</label>
            {renderFileInput(
              getRootPropsPolygon,
              getInputPropsPolygon,
              isDragActivePolygon,
              polygonFile ? [polygonFile] : [],
              "polygon",
              "Polygon File (.zip, .geojson, .json)"
            )}

            <Input
              placeholder="Project Name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />

            {/* --- Date range + Fetch button --- */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <label className="text-sm font-semibold">Start Date</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-semibold">End Date</label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <Button
                onClick={handleFetchSessions}
                disabled={sessionsLoading}
                className="bg-white text-gray-700 hover:bg-blue-200"
              >
                {sessionsLoading ? <Spinner /> : "Fetch Sessions"}
              </Button>
            </div>

            {/* --- SessionSelector with fetched list --- */}
            <div >
                <Label>Select Sessions</Label>
                <SessionMultiDropdown
                  sessions={sessionsInRange}
                  selectedSessions={selectedSessions}
                  setSelectedSessions={setSelectedSessions}
                />
              </div>

            <Textarea
              placeholder="Remarks (Optional)"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </TabsContent>
        </Tabs>

        {/* ---------- Error Log Section ---------- */}
        {errorLog && (
          <div className="mt-6 p-4 bg-red-100 border border-red-300 text-red-700 rounded whitespace-pre-wrap max-h-60 overflow-auto">
            <strong>Error Log:</strong>
            <pre>{errorLog}</pre>
          </div>
        )}

        {/* ---------- Upload Buttons ---------- */}
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

        {/* ---------- Upload History ---------- */}
        <div className="mt-10">
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
        </div>
      </div>
    </div>
  );
};

export default UploadDataPage;
