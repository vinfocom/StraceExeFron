export const getInsightValue = (row, ...keys) => {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null) return row[key];
  }
  return null;
};

export const extractInsightRows = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.Data)) return payload.Data;
  return [];
};

export const getInsightCoordinates = (insight) => {
  const rawLatitude = getInsightValue(insight, "latitude", "Latitude");
  const rawLongitude = getInsightValue(insight, "longitude", "Longitude");

  if (
    rawLatitude === null ||
    rawLatitude === undefined ||
    String(rawLatitude).trim() === "" ||
    rawLongitude === null ||
    rawLongitude === undefined ||
    String(rawLongitude).trim() === ""
  ) {
    return null;
  }

  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { lat: latitude, lng: longitude };
};

export const getInsightSeverity = (insight) =>
  String(getInsightValue(insight, "severity", "Severity") || "UNKNOWN").toUpperCase();

export const getInsightSeverityColor = (severity) => {
  const colors = {
    HIGH: "#dc2626",
    CRITICAL: "#dc2626",
    MEDIUM: "#eab308",
    WARNING: "#eab308",
    LOW: "#16a34a",
  };
  return colors[String(severity || "").toUpperCase()] || "#64748b";
};

export const formatInsightDetails = (details) => {
  if (details === null || details === undefined || details === "") {
    return "No additional details";
  }
  if (typeof details === "object") return JSON.stringify(details, null, 2);

  try {
    return JSON.stringify(JSON.parse(details), null, 2);
  } catch {
    return String(details);
  }
};
