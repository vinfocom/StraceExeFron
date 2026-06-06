import React, { memo, useEffect, useMemo, useState } from "react";
import { InfoWindowF, MarkerF } from "@react-google-maps/api";

const formatMetric = (value, suffix = "") => {
  if (value == null || Number.isNaN(value)) return "N/A";
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;
};

const getNormalizedStatus = (statusRaw) => {
  const numeric = Number(statusRaw);
  if (Number.isFinite(numeric)) {
    if (numeric === 1) return "success";
    if (numeric === 2) return "failed";
  }

  const value = String(statusRaw ?? "").trim().toLowerCase().replace(/[_\s-]+/g, " ");
  if (["success", "succeeded", "pass", "passed", "connected"].includes(value)) return "success";
  if (["failed", "fail", "error", "not connected", "disconnected"].includes(value)) return "failed";
  return "failed";
};



const formatStatus = (statusRaw) => {
  const status = getNormalizedStatus(statusRaw);

  if (status === "success") {
    return {
      status: "Success",
      color: "#22C55E",
    };
  }

  return {
    status: "Failed",
    color: "#EF4444",
  };
};

const DIAMOND_PATH = "M 0,-10 10,0 0,10 -10,0 z";
const HEXAGON_PATH = "M 0,-10 8.66,-5 8.66,5 0,10 -8.66,5 -8.66,-5 z";

const formatSubSessionType = (subSessionType) => {
  const value = String(subSessionType ?? "").trim();
  if (value === "1") return "PS";
  if (value === "2") return "CS";
  return value || "N/A";
};

const formatSubSessionStatus = (statusRaw, subSessionType) => {
  const status = getNormalizedStatus(statusRaw);
  const type = formatSubSessionType(subSessionType);

  if (status === "success") {
    return type === "CS" ? "Connected" : "Success";
  }

  return type === "CS" ? "Not Connected" : "Failed";
};

const getSubSessionMarkerPath = (subSessionType) => {
  const value = String(subSessionType ?? "").trim();
  if (value === "2") return HEXAGON_PATH;
  return DIAMOND_PATH;
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
      {markers.map((marker, index) => (
        <MarkerF
          key={`${marker.id ?? "sub"}-${marker.sessionId ?? "na"}-${marker.subSessionId ?? "na"}-${index}`}
          position={marker.position}
          icon={{
            path: getSubSessionMarkerPath(marker.subSessionType),
            fillColor: formatStatus(marker.resultStatus).color,
            fillOpacity: 1,
            strokeColor: "#f7f8f8",
            strokeWeight: 2,
            scale: 1,
          }}
          title={`Session ${marker.sessionId}${marker.subSessionId != null ? ` / Sub ${marker.subSessionId}` : ""
            } / ${formatSubSessionType(marker.subSessionType)}`}
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
                <span className="text-slate-500">Type</span>
                <span className="font-medium">{formatSubSessionType(selectedMarker.subSessionType)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Status</span>
                <span className="font-medium">
                  {formatSubSessionStatus(selectedMarker.resultStatus, selectedMarker.subSessionType)}
                </span>
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
