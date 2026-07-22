// src/hooks/useFileUpload.js

import { useState } from 'react';
import { toast } from 'react-toastify';
// FIX: Changed import to use the correct API endpoint definition
import { excelApi } from '../api/apiEndpoints';

const UPLOAD_TIMEOUT_LABEL = "2 hours";

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

export const useFileUpload = () => {
  const [loading, setLoading] = useState(false);
  const [errorLog, setErrorLog] = useState("");

  const uploadFile = async (formData, onUploadProgress = null) => {
    setLoading(true);
    setErrorLog("");
    try {
      // FIX: Changed uploadApi.uploadFile to excelApi.uploadFile
      const resp = await excelApi.uploadFile(formData, onUploadProgress);
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
