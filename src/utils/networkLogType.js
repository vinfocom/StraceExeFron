const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== "";

const hasWifiScanData = (log = {}) => {
  const wifiFields = [
    "wifi_ssid", "wifiSsid", "wifi_bssid", "wifiBssid", "wifi_rssi_dbm",
    "wifiRssiDbm", "wifi_frequency_mhz", "wifiFrequencyMhz", "wifi_capabilities",
  ];
  if (wifiFields.some((key) => hasValue(log[key]))) return true;

  const primaryInfo = String(log.primary_cell_info_1 ?? log.primaryCellInfo1 ?? "");
  return /\b(?:SSID|BSSID)\s*:/i.test(primaryInfo);
};

const hasCellularEvidence = (log = {}) => {
  const primaryInfo = String(log.primary_cell_info_1 ?? log.primaryCellInfo1 ?? "");
  if (/CellInfo(?:Lte|Nr|Wcdma|Gsm|Cdma)|mRegistered\s*=\s*YES/i.test(primaryInfo)) return true;

  const network = [
    log.network, log.Network, log.technology, log.Technology, log.networkType,
    log.NetworkType, log.network_type, log.rat, log.RAT,
  ].filter(hasValue).join(" ");
  if (/\b(?:2G|3G|4G|5G|LTE|NR|WCDMA|UMTS|GSM|CDMA|GERAN|EUTRAN|NGRAN)\b/i.test(network)) return true;

  return [
    "pci", "PCI", "cell_id", "cellId", "CellId", "earfcn", "EARFCN",
    "nrarfcn", "NRARFCN", "arfcn", "ARFCN", "bsic", "BSIC",
  ].some((key) => hasValue(log[key]));
};

export const getNetworkLogType = (log = {}) => {
  // Row data is more specific than the session-level type. A Wi-Fi session can
  // still contain cellular diagnostic rows.
  if (hasWifiScanData(log)) return "wifi";
  if (hasCellularEvidence(log)) return "cellular";

  const declaredType = String(
    log.network_kind ?? log.networkKind ?? log.connection_type ?? log.connectionType ?? log.log_type ?? log.type ?? "",
  ).trim().toLowerCase();
  if (["wifi", "wi-fi"].includes(declaredType) || log.is_wifi === true || log.isWifi === true) {
    return "wifi";
  }
  if (["network", "cellular", "mobile"].includes(declaredType)) return "cellular";
  return "unknown";
};

export const isWifiNetworkLog = (log) => getNetworkLogType(log) === "wifi";
