// src/hooks/useFileUpload.js

import { useState } from 'react';
import { toast } from 'react-toastify';
// FIX: Changed import to use the correct API endpoint definition
import { excelApi } from '../api/apiEndpoints';

const UPLOAD_TIMEOUT_LABEL = "2 hours";
const CHUNKED_UPLOAD_THRESHOLD_BYTES = 100 * 1024 * 1024;
const CHUNK_SIZE_BYTES = 10 * 1024 * 1024;
const CHUNK_STATUS_POLL_MS = 5000;
const CHUNK_STATUS_MAX_POLLS = 12;

const isLikelyBackgroundProcessingError = (message) => {
  const msg = String(message || "").toLowerCase();
  return (
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("no response from server") ||
    msg.includes("network error")
  );
};

const isSizeLimitError = (message) => {
  const msg = String(message || "").toLowerCase();
  return (
    msg.includes("size limit") ||
    msg.includes("file size") ||
    msg.includes("exceeds the allowed") ||
    msg.includes("too large") ||
    msg.includes("extracted size")
  );
};

const getFormFiles = (formData, key) => {
  try {
    return formData
      .getAll(key)
      .filter((value) => value instanceof File)
      .map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type || "(empty content-type)",
        lastModified: file.lastModified,
      }));
  } catch {
    return [];
  }
};

const getFormValue = (formData, key) => {
  try {
    const value = formData.get(key);
    return value instanceof File ? value.name : value;
  } catch {
    return undefined;
  }
};

const appendIfPresent = (formData, key, value) => {
  if (value !== undefined && value !== null && value !== "") {
    formData.append(key, value);
  }
};

const valueOf = (payload, ...keys) => {
  for (const key of keys) {
    if (payload?.[key] !== undefined && payload?.[key] !== null) return payload[key];
  }

  const nested = payload?.Data ?? payload?.data;
  if (nested && nested !== payload) return valueOf(nested, ...keys);
  return undefined;
};

const normalizeChunkStatus = (payload) => {
  const statusValue = valueOf(payload, "Status", "status");
  const statusText = String(valueOf(payload, "UploadStatus", "uploadStatus", "State", "state", "StatusText", "statusText") ?? "").toLowerCase();

  if (statusValue === 1 || ["success", "completed", "complete", "processed"].includes(statusText)) return "success";
  if (statusValue === 0 || ["failed", "failure", "error"].includes(statusText)) return "error";
  if (statusValue === 2 || ["processing", "merging", "uploaded", "queued", "started"].includes(statusText)) return "processing";
  return "processing";
};

const getChunkPayloadMessage = (payload, fallback = "") =>
  valueOf(payload, "Message", "message", "ErrorMessage", "errorMessage") || fallback;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldUseChunkUpload = (formData) => {
  const mainFile = formData.get("UploadFile");
  return mainFile instanceof File && mainFile.size >= CHUNKED_UPLOAD_THRESHOLD_BYTES;
};

const extractFailureReasons = (payload) => {
  const failures = Array.isArray(payload?.Failures)
    ? payload.Failures
    : Array.isArray(payload?.failures)
      ? payload.failures
      : [];

  return failures.map((failure) => ({
    fileName: failure.FileName ?? failure.fileName ?? failure.file_name ?? "Unknown file",
    uploadHistoryId: failure.UploadHistoryId ?? failure.uploadHistoryId ?? failure.upload_history_id ?? null,
    errorMessage:
      failure.ErrorMessage ??
      failure.errorMessage ??
      failure.error_message ??
      "Processing failed without a detailed error message.",
  }));
};

const getFailureMessage = (response, fallback) => {
  const failureReasons = extractFailureReasons(response);
  const detailedReasons = failureReasons
    .map((failure) => {
      const file = failure.fileName || "File";
      return `${file}: ${failure.errorMessage}`;
    })
    .filter(Boolean);

  return detailedReasons.length ? detailedReasons.join("\n") : fallback;
};

const getDisplayFailureMessage = (message) => {
  if (!isSizeLimitError(message)) return message;
  return `Size limit exceeded.\n${message}`;
};

const logUploadFailure = ({ formData, response, error, message }) => {
  const failureReasons = extractFailureReasons(response);
  const payload = {
    message,
    files: getFormFiles(formData, "UploadFile"),
    noteFiles: getFormFiles(formData, "UploadNoteFile"),
    form: {
      UploadFileType: getFormValue(formData, "UploadFileType"),
      remarks: getFormValue(formData, "remarks"),
      ProjectName: getFormValue(formData, "ProjectName"),
      SessionIds: getFormValue(formData, "SessionIds"),
    },
    failureReasons,
    serverResponse: response ?? null,
    error: error
      ? {
          name: error.name,
          message: error.message,
          status: error.status,
          data: error.data,
        }
      : null,
  };

  console.groupCollapsed("[UploadData] Upload failed details");
  console.error(message);
  if (failureReasons.length) console.table(failureReasons);
  console.log(payload);
  console.groupEnd();
};

const buildChunkUploadMetadata = (sourceFormData, file, totalChunks, uploadId = null) => {
  const metadata = new FormData();
  appendIfPresent(metadata, "UploadId", uploadId);
  appendIfPresent(metadata, "FileName", file.name);
  appendIfPresent(metadata, "OriginalFileName", file.name);
  appendIfPresent(metadata, "FileSize", file.size);
  appendIfPresent(metadata, "TotalSize", file.size);
  appendIfPresent(metadata, "ChunkSize", CHUNK_SIZE_BYTES);
  appendIfPresent(metadata, "TotalChunks", totalChunks);
  appendIfPresent(metadata, "UploadFileType", getFormValue(sourceFormData, "UploadFileType"));
  appendIfPresent(metadata, "remarks", getFormValue(sourceFormData, "remarks"));
  appendIfPresent(metadata, "ProjectName", getFormValue(sourceFormData, "ProjectName"));
  appendIfPresent(metadata, "SessionIds", getFormValue(sourceFormData, "SessionIds"));
  return metadata;
};

const uploadFileInChunks = async (formData, onUploadProgress = null) => {
  const file = formData.get("UploadFile");
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE_BYTES);
  const startResponse = await excelApi.startChunkUpload(
    buildChunkUploadMetadata(formData, file, totalChunks),
  );
  const uploadId = valueOf(
    startResponse,
    "UploadId",
    "uploadId",
    "UploadSessionId",
    "uploadSessionId",
    "SessionUploadId",
    "sessionUploadId",
    "Id",
    "id",
  );

  if (!uploadId) {
    throw new Error(getChunkPayloadMessage(startResponse, "Chunk upload session was not created."));
  }

  let uploadedBytes = 0;
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const start = chunkIndex * CHUNK_SIZE_BYTES;
    const end = Math.min(start + CHUNK_SIZE_BYTES, file.size);
    const chunk = file.slice(start, end);
    const chunkFormData = new FormData();
    chunkFormData.append("Chunk", chunk, file.name);
    chunkFormData.append("UploadId", uploadId);
    chunkFormData.append("ChunkIndex", chunkIndex);
    chunkFormData.append("ChunkNumber", chunkIndex + 1);
    chunkFormData.append("TotalChunks", totalChunks);
    chunkFormData.append("FileName", file.name);

    await excelApi.uploadChunk(chunkFormData, (progressEvent) => {
      if (!onUploadProgress) return;
      const chunkLoaded = Math.min(Number(progressEvent?.loaded || 0), chunk.size);
      onUploadProgress({
        loaded: uploadedBytes + chunkLoaded,
        total: file.size,
      });
    });

    uploadedBytes = end;
    if (onUploadProgress) {
      onUploadProgress({ loaded: uploadedBytes, total: file.size });
    }
  }

  const completeResponse = await excelApi.completeChunkUpload(
    buildChunkUploadMetadata(formData, file, totalChunks, uploadId),
  );

  const completeUploadId = valueOf(
    completeResponse,
    "UploadId",
    "uploadId",
    "UploadSessionId",
    "uploadSessionId",
    "Id",
    "id",
  ) || uploadId;

  const completeStatus = normalizeChunkStatus(completeResponse);
  if (completeStatus === "error") {
    throw new Error(getChunkPayloadMessage(completeResponse, "Chunk upload processing failed."));
  }

  for (let attempt = 0; attempt < CHUNK_STATUS_MAX_POLLS; attempt += 1) {
    const statusResponse = await excelApi.getChunkUploadStatus(completeUploadId);
    const status = normalizeChunkStatus(statusResponse);
    const message = getChunkPayloadMessage(statusResponse, getChunkPayloadMessage(completeResponse));

    if (status === "success") {
      return {
        Status: 1,
        Message: message || "File uploaded successfully.",
        UploadId: valueOf(statusResponse, "UploadId", "uploadId", "UploadHistoryId", "uploadHistoryId") ?? completeUploadId,
        UploadIds: [valueOf(statusResponse, "UploadId", "uploadId", "UploadHistoryId", "uploadHistoryId") ?? completeUploadId],
      };
    }

    if (status === "error") {
      return {
        Status: 0,
        Message: message || "Chunk upload failed.",
        UploadId: valueOf(statusResponse, "UploadId", "uploadId", "UploadHistoryId", "uploadHistoryId") ?? completeUploadId,
      };
    }

    await wait(CHUNK_STATUS_POLL_MS);
  }

  return {
    Status: 2,
    Message: getChunkPayloadMessage(completeResponse, "File uploaded. Processing is running in the background."),
    UploadId: valueOf(completeResponse, "UploadHistoryId", "uploadHistoryId", "UploadId", "uploadId") ?? completeUploadId,
    UploadIds: [valueOf(completeResponse, "UploadHistoryId", "uploadHistoryId", "UploadId", "uploadId") ?? completeUploadId],
  };
};

export const useFileUpload = () => {
  const [loading, setLoading] = useState(false);
  const [errorLog, setErrorLog] = useState("");

  const uploadFile = async (formData, onUploadProgress = null) => {
    setLoading(true);
    setErrorLog("");
    try {
      const resp = shouldUseChunkUpload(formData)
        ? await uploadFileInChunks(formData, onUploadProgress)
        : await excelApi.uploadFile(formData, onUploadProgress);
      if (resp.Status === 1) {
        return {
          success: true,
          message: resp.Message || "",
          uploadId: resp.UploadId ?? resp.uploadId ?? null,
          uploadIds: resp.UploadIds ?? resp.uploadIds ?? [],
        };
      } else if (resp.Status === 2) {
        const msg = resp.Message || "Upload accepted and still processing.";
        return {
          success: true,
          isProcessing: true,
          isLikelyProcessing: true,
          message: msg,
          uploadId: resp.UploadId ?? resp.uploadId ?? null,
          uploadIds: resp.UploadIds ?? resp.uploadIds ?? [],
        };
      } else {
        const rawMessage = getFailureMessage(resp, resp.Message || "Processing failed.");
        const msg = getDisplayFailureMessage(rawMessage);
        setErrorLog(msg);
        logUploadFailure({ formData, response: resp, message: msg });
        toast.error(isSizeLimitError(rawMessage) ? "Size limit exceeded. See error log." : "Upload failed. See error log.");
        return { success: false, isLikelyProcessing: false, message: msg };
      }
    } catch (e) {
      const rawErrorMessage = e.message || "An unknown error occurred during the request.";
      const errorMessage = getDisplayFailureMessage(rawErrorMessage);
      const isLikelyProcessing = isLikelyBackgroundProcessingError(errorMessage);
      setErrorLog(
        isLikelyProcessing
          ? `${errorMessage}\n\nThe upload request waited up to ${UPLOAD_TIMEOUT_LABEL}. The server may still be processing this file. Please check Upload History.`
          : errorMessage
      );
      logUploadFailure({ formData, error: e, message: errorMessage });
      if (isLikelyProcessing) {
        toast.warn(`Upload request timed out/no response after waiting up to ${UPLOAD_TIMEOUT_LABEL}. Processing may still continue in background.`);
      } else if (isSizeLimitError(rawErrorMessage)) {
        toast.error("Size limit exceeded. See error log.");
      } else {
        toast.error("Upload request failed.");
      }
      return { success: false, isLikelyProcessing, message: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  return { loading, errorLog, uploadFile, setErrorLog };
};
