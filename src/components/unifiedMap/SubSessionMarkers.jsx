import React, { memo, useEffect, useMemo, useState } from "react";
import { InfoWindowF, MarkerF } from "@react-google-maps/api";

const formatMetric = (value, suffix = "") => {
  if (value == null || Number.isNaN(value)) return "N/A";
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;
};

const formatDuration = (value) => {
  if (value == null || Number.isNaN(Number(value))) return "N/A";
  const totalSeconds = Math.floor(Number(value) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
};

const formatText = (value) => {
  const text = String(value ?? "").trim();
  return text || "N/A";
};

const getNormalizedStatus = (statusRaw) => {
  const numeric = Number(statusRaw);
  if (Number.isFinite(numeric)) {
    if (numeric === 1) return "success";
    if (numeric === 2) return "failed";
  }

  const value = String(statusRaw ?? "").trim().toLowerCase().replace(/[_\s-]+/g, " ");
  if (["drop", "dropped", "drop call", "dropped call", "call drop", "call dropped"].includes(value)) return "drop";
  if (["success", "succeeded", "pass", "passed", "connected"].includes(value)) return "success";
  if (["failed", "fail", "error", "not connected", "disconnected"].includes(value)) return "failed";
  return "failed";
};



const formatStatus = (statusRaw) => {
  const status = getNormalizedStatus(statusRaw);

  if (status === "success" || status === "drop") {
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

  if (type === "CS" && status === "drop") return "Drop";

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
  selectedMarkerIds = [],
  onMarkerSelect,
}) => {
  const [internalSelectedMarkerId, setInternalSelectedMarkerId] = useState(null);
  const activeMarkerId = selectedMarkerId ?? internalSelectedMarkerId;
  const highlightedMarkerIdSet = useMemo(() => {
    const values = Array.isArray(selectedMarkerIds) ? selectedMarkerIds : [];
    return new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean));
  }, [selectedMarkerIds]);

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
        (() => {
          const markerKey = String(marker.id ?? "");
          const isHighlighted = highlightedMarkerIdSet.has(markerKey);

          return (
            <MarkerF
              key={`${marker.id ?? "sub"}-${marker.sessionId ?? "na"}-${marker.subSessionId ?? "na"}-${index}`}
              position={marker.position}
              icon={{
                path: getSubSessionMarkerPath(marker.subSessionType),
                fillColor: formatStatus(marker.resultStatus).color,
                fillOpacity: 1,
                strokeColor: isHighlighted ? "#22d3ee" : "#f7f8f8",
                strokeWeight: isHighlighted ? 4 : 2,
                scale: isHighlighted ? 1.2 : 1,
              }}
              zIndex={isHighlighted ? 1000 : undefined}
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
          );
        })()
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
                  {formatSubSessionStatus(
                    selectedMarker.resultStatusRaw ?? selectedMarker.resultStatus,
                    selectedMarker.subSessionType,
                  )}
                </span>
              </div>
              {formatSubSessionType(selectedMarker.subSessionType) === "CS" && (
                <>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">Number</span>
                    <span className="font-medium">{formatText(selectedMarker.number)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">Direction</span>
                    <span className="font-medium capitalize">{formatText(selectedMarker.direction)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">Duration</span>
                    <span className="font-medium">{formatDuration(selectedMarker.duration)}</span>
                  </div>
                </>
              )}
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
