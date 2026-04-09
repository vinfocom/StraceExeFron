import React, { memo, useEffect, useMemo, useState } from "react";
import { InfoWindowF, MarkerF } from "@react-google-maps/api";

const formatMetric = (value, suffix = "") => {
  if (value == null || Number.isNaN(value)) return "N/A";
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;
};

const getNormalizedStatus = (statusRaw) => {
  const value = String(statusRaw || "FAILED").toUpperCase();
  if (value === "SUCCESS" || value === "SUCCEEDED" || value === "PASS") return "SUCCESS";
  if (value === "FAILED" || value === "FAIL" || value === "ERROR") return "FAILED";
  return "FAILED";
};

const getMarkerStyle = (statusRaw, isActive = false) => {
  const status = getNormalizedStatus(statusRaw);

  if (isActive) {
    return {
      fillColor: "#38BDF8",
      strokeColor: "#FFFFFF",
      scale: 10,
    };
  }

  if (status === "SUCCESS") {
    return {
      fillColor: "#22C55E",
      strokeColor: "#DCFCE7",
      scale: 7,
    };
  }

  if (status === "FAILED") {
    return {
      fillColor: "#EF4444",
      strokeColor: "#FEE2E2",
      scale: 7,
    };
  }

  return {
    fillColor: "#EF4444",
    strokeColor: "#FEE2E2",
    scale: 7,
  };
};

const formatStatus = (statusRaw) => {
  const status = getNormalizedStatus(statusRaw);
  if (status === "SUCCESS") return "Success";
  return "Failed";
};

const SubSessionMarkers = ({
  markers = [],
  show = false,
  selectedMarkerId = null,
  onMarkerSelect,
}) => {
  const [internalSelectedMarkerId, setInternalSelectedMarkerId] = useState(null);
  const activeMarkerId = selectedMarkerId ?? internalSelectedMarkerId;

  useEffect(() => {
    if (!show) {
      setInternalSelectedMarkerId(null);
    }
  }, [show]);

  useEffect(() => {
    if (!Array.isArray(markers) || markers.length === 0) {
      setInternalSelectedMarkerId(null);
      return;
    }

    const exists = markers.some((item) => item.id === activeMarkerId);
    if (!exists) {
      setInternalSelectedMarkerId(null);
    }
  }, [markers, activeMarkerId]);

  const selectedMarker = useMemo(
    () => markers.find((item) => item.id === activeMarkerId) || null,
    [markers, activeMarkerId],
  );

  if (!show || !Array.isArray(markers) || markers.length === 0) {
    return null;
  }

  return (
    <>
      {markers.map((marker) => (
        <MarkerF
          key={marker.id}
          position={marker.position}
          icon={
            typeof window !== "undefined" && window.google?.maps
              ? {
                path: window.google.maps.SymbolPath.CIRCLE,
                fillOpacity: 1,
                strokeWeight: 2,
                ...getMarkerStyle(marker.resultStatus, marker.id === activeMarkerId),
              }
              : undefined
          }
          title={`Session ${marker.sessionId}${
            marker.subSessionId != null ? ` / Sub ${marker.subSessionId}` : ""
          }`}
          onClick={() => {
            if (selectedMarkerId == null) {
              setInternalSelectedMarkerId(marker.id);
            }
            if (typeof onMarkerSelect === "function") {
              onMarkerSelect(marker);
            }
          }}
        />
      ))}

      {selectedMarker && (
        <InfoWindowF
          position={selectedMarker.position}
          onCloseClick={() => {
            if (selectedMarkerId == null) {
              setInternalSelectedMarkerId(null);
            }
            if (typeof onMarkerSelect === "function") {
              onMarkerSelect(null);
            }
          }}
        >
          <div className="min-w-[230px] text-xs text-slate-800">
            <div className="font-semibold text-sm mb-2">Sub-Session Marker</div>
            <div className="space-y-1">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Session</span>
                <span className="font-medium">{selectedMarker.sessionId ?? "N/A"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Sub Session</span>
                <span className="font-medium">{selectedMarker.subSessionId ?? "N/A"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Status</span>
                <span className="font-medium">{formatStatus(selectedMarker.resultStatus)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Success</span>
                <span className="font-medium">{selectedMarker.metrics?.status_counts?.success ?? 0}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Failed</span>
                <span className="font-medium">{selectedMarker.metrics?.status_counts?.failed ?? 0}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Sub Sessions</span>
                <span className="font-medium">{selectedMarker.subSessionCount ?? "N/A"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Avg Speed</span>
                <span className="font-medium">
                  {formatMetric(
                    selectedMarker.metrics?.avg_speed == null
                      ? null
                      : Number(selectedMarker.metrics.avg_speed) / 1000,
                    " Mbps",
                  )}
                </span>
              </div>
            </div>
          </div>
        </InfoWindowF>
      )}
    </>
  );
};

export default memo(SubSessionMarkers);
