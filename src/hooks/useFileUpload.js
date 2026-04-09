// src/hooks/useFileUpload.js

import { useState } from 'react';
import { toast } from 'react-toastify';
// FIX: Changed import to use the correct API endpoint definition
import { excelApi } from '../api/apiEndpoints';

const isLikelyBackgroundProcessingError = (message) => {
  const msg = String(message || "").toLowerCase();
  return (
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("no response from server") ||
    msg.includes("network error")
  );
};

export const useFileUpload = () => {
  const [loading, setLoading] = useState(false);
  const [errorLog, setErrorLog] = useState("");

  const uploadFile = async (formData) => {
    setLoading(true);
    setErrorLog("");
    try {
      // FIX: Changed uploadApi.uploadFile to excelApi.uploadFile
      const resp = await excelApi.uploadFile(formData);
      if (resp.Status === 1) {
        return { success: true };
      } else if (resp.Status === 2) {
        const msg = resp.Message || "Upload accepted and still processing.";
        setErrorLog(msg);
        return { success: false, isLikelyProcessing: true, message: msg };
      } else {
        const msg = resp.Message || "Processing failed.";
        setErrorLog(msg);
        toast.error("Upload failed. See error log.");
        return { success: false, isLikelyProcessing: false, message: msg };
      }
    } catch (e) {
      const errorMessage = e.message || "An unknown error occurred during the request.";
      const isLikelyProcessing = isLikelyBackgroundProcessingError(errorMessage);
      setErrorLog(
        isLikelyProcessing
          ? `${errorMessage}\n\nThe server may still be processing this file. Please check Upload History.`
          : errorMessage
      );
      if (isLikelyProcessing) {
        toast.warn("Upload request timed out/no response. Processing may still continue in background.");
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
