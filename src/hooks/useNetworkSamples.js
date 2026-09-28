import { getTechnologyMetricValue, is2GTechnology } from "@/utils/technologyMetricLabels";
// src/hooks/useNetworkSamples.js
import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'react-toastify';
import { mapViewApi } from '@/api/apiEndpoints'; 
import { isCancelledError } from '@/api/apiService';
import { useRequestGeneration } from '@/features/unified-map/data/useRequestGeneration.js';
import { getPolygonRequestIdentity } from '@/features/unified-map/data/mapRequestIdentity.js';
import { normalizeTechName, normalizeProviderName } from '@/utils/colorUtils';
import {
  makeProjectCacheKey,
  readProjectSessionCache,
  writeProjectSessionCache,
} from '@/utils/projectSessionCache';
import {
  readIndexedDbCache,
  writeIndexedDbCache,
} from '@/utils/indexedDbCache';
import {
  beginNetworkLogSnapshot,
  createCompleteNetworkLogSnapshot,
  createNetworkLogCacheSnapshot,
  fetchCompleteNetworkLogDataset,
  getVisibleNetworkLogSnapshot,
} from '@/features/unified-map/data/networkLogDataset.js';

const NETWORK_SAMPLES_TIMEOUT_MS = 120000;

const withTimeout = (promise, timeoutMs = NETWORK_SAMPLES_TIMEOUT_MS, signal) =>
  new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanUp();
      reject(new Error("Network samples request timed out"));
    }, timeoutMs);
    const cleanUp = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanUp();
      reject(new DOMException("Request cancelled", "AbortError"));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanUp();
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        cleanUp();
        reject(error);
      },
    );
  });


function indout(value) {

const rlt = value.split("(")[0].trim();

return rlt;
    
 }

const isPointInPolygon = (point, polygon) => {
  const path = polygon?.paths?.[0];
  if (!path?.length) return false;
  const lat = point.lat ?? point.latitude;
  const lng = point.lng ?? point.longitude;
  if (lat == null || lng == null) return false;

  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const { lng: xi, lat: yi } = path[i];
    const { lng: xj, lat: yj } = path[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
};

const parseExtraJsonObject = (rawExtraJson) => {
  if (!rawExtraJson || typeof rawExtraJson !== 'string') return null;
  try {
    const parsed = JSON.parse(rawExtraJson);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const isMacAddress = (value) =>
  /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(String(value || "").trim());

const cleanDisplayName = (value) => {
  const text = String(value ?? "").trim().replace(/^["']+|["']+$/g, "");
  if (!text || isMacAddress(text)) return null;
  return text;
};

const isWifiLog = (log) => {
  const type = String(
    log?.connection_type ??
      log?.connectionType ??
      log?.log_type ??
      log?.type ??
      ""
  ).trim().toLowerCase();

  if (type === "wifi" || type === "wi-fi") return true;

  const primaryInfo = String(log?.primary_cell_info_1 ?? log?.primaryCellInfo1 ?? "");
  return primaryInfo.includes("SSID:") || primaryInfo.includes("BSSID:");
};

const firstFiniteNumber = (...values) => {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const normalizeLogId = (value) => {
  const raw = String(value ?? "").trim();
  return raw || null;
};

const getLogId = (log) =>
  normalizeLogId(log?.id ?? log?.Id ?? log?.log_id ?? log?.LogId);

const merge2GCiAnalysis = (logs = [], ciRows = []) => {
  if (!Array.isArray(logs) || logs.length === 0 || !Array.isArray(ciRows) || ciRows.length === 0) {
    return logs;
  }

  const ciByLogId = new Map();
  ciRows.forEach((row) => {
    const id = getLogId(row);
    if (id) ciByLogId.set(id, row);
  });

  if (ciByLogId.size === 0) return logs;

  let changed = false;
  const mergedLogs = logs.map((log) => {
    const row = ciByLogId.get(getLogId(log));
    if (!row) return log;

    const ciDb = firstFiniteNumber(row.ci_db, row.ciDb, row.CI_DB, row.ci, row.CI);
    const nextCiDb = ciDb ?? firstFiniteNumber(log.ci_db, log.ci);
    if (nextCiDb === null && row.quality == null && row.Quality == null) return log;

    changed = true;
    return {
      ...log,
      ci_db: nextCiDb,
      ci: nextCiDb,
      ci_quality: row.quality ?? row.Quality ?? log.ci_quality ?? null,
      serving_cell_id: row.serving_cell_id ?? row.servingCellId ?? log.serving_cell_id ?? log.cell_id,
      serving_pci: row.serving_pci ?? row.servingPci ?? log.serving_pci ?? log.pci,
      serving_rssi_dbm: firstFiniteNumber(row.serving_rssi_dbm, row.servingRssiDbm, log.serving_rssi_dbm),
      neighbour_count: firstFiniteNumber(row.neighbour_count, row.neighbor_count, log.neighbour_count),
      strongest_neighbour_rssi_dbm: firstFiniteNumber(
        row.strongest_neighbour_rssi_dbm,
        row.strongest_neighbor_rssi_dbm,
        log.strongest_neighbour_rssi_dbm,
      ),
      total_interference_dbm: firstFiniteNumber(
        row.total_interference_dbm,
        row.totalInterferenceDbm,
        log.total_interference_dbm,
      ),
    };
  });

  return changed ? mergedLogs : logs;
};

const getNormalizedTechnology = (log, band = null) => {
  const candidates = [
    log?.network,
    log?.Network,
    log?.rat,
    log?.RAT,
    log?.radio_access_technology,
    log?.RadioAccessTechnology,
    log?.technology,
    log?.Technology,
    log?.networkType,
    log?.NetworkType,
    log?.network_type,
  ];

  for (const candidate of candidates) {
    if (!String(candidate ?? "").trim()) continue;
    const normalized = normalizeTechName(candidate, band);
    if (normalized && normalized !== "Unknown") {
      return normalized;
    }
  }

  return normalizeTechName(null, band);
};



const parseLogEntry = (log, sessionId) => {
  if (!log || typeof log !== 'object') return null;
  const lat = parseFloat(log.lat ?? log.latitude ?? log.Lat ?? log.Latitude);
  const lng = parseFloat(log.lon ?? log.lng ?? log.longitude ?? log.Lng ?? log.Longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const parseNum = (val) => {
    if (val === null || val === undefined || val === '') return null;
    const num = parseFloat(val);
    return Number.isFinite(num) ? num : null;
  };

  const parseNumFromKeys = (keys = []) => {
    for (const key of keys) {
      const parsed = parseNum(log?.[key]);
      if (parsed !== null) return parsed;
    }
    return null;
  };

  
  const normalizeSignalToDbm = (value) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return null;
    if (value === 99) return null;
    if (value >= 0 && value <= 31) return -113 + (2 * value);
    return value;
  };

  const dlThroughput = parseNumFromKeys([
    "dl_thpt",
    "DL_THPT",
    "dl_tpt",
    "DL_TPT",
    "dl_rpt",
    "DL_RPT",
    "dl_throughput",
    "throughput_dl",
    "throughput_DL",
    "download",
  ]);
  const ulThroughput = parseNumFromKeys([
    "ul_thpt",
    "UL_THPT",
    "ul_tpt",
    "UL_TPT",
    "ul_rpt",
    "UL_RPT",
    "ul_throughput",
    "throughput_ul",
    "throughput_UL",
    "upload",
  ]);

  const parsedRsrpRaw = parseNumFromKeys([
    "rsrp",
    "RSRP",
    "Rsrp",
    "lte_rsrp",
    "LTE_RSRP",
    "nr_rsrp",
  ]);

  const parsedRssiRaw = parseNumFromKeys([
    "rssi",
    "RSSI",
    "Rssi",
    "lte_rssi",
    "nr_rssi",
    "rssi_dbm",
    "rssiDbm",
    "RSSI_DBM",
    "gsm_rssi",
    "GSM_RSSI",
    "level",
    "Level",
    "signal_strength",
    "signalStrength",
    "SignalStrength",
    "rxlev",
    "RxLev",
    "RXLEV",
  ]);

  const parsedRxlev = parseNumFromKeys([
    "rxlev",
    "RxLev",
    "RXLEV",
    "rx_level",
    "rxLevel",
    "gsm_rxlev",
    "GSM_RXLEV",
  ]);
  const parsedRxqual = parseNumFromKeys([
    "rxqual",
    "RxQual",
    "RXQUAL",
    "rx_qual",
    "rxQual",
    "gsm_rxqual",
    "GSM_RXQUAL",
  ]);
  const parsedCqi = parseNumFromKeys(["cqi", "CQI", "Cqi", "lte_cqi", "nr_cqi"]);
  const parsedRscp = parseNumFromKeys([
    "rscp",
    "RSCP",
    "Rscp",
    "wcdma_rscp",
    "WCDMA_RSCP",
    "umts_rscp",
    "UMTS_RSCP",
    "rscp_dbm",
    "rscpDbm",
  ]);
  const parsedEcno = parseNumFromKeys([
    "ecno",
    "EcNo",
    "ECNO",
    "ec_no",
    "ecNo",
    "ecno_db",
    "wcdma_ecno",
    "WCDMA_ECNO",
    "umts_ecno",
    "UMTS_ECNO",
  ]);
  const parsedNrRsrp = parseNumFromKeys([
    "nr_rsrp",
    "NR_RSRP",
    "nrRsrp",
    "NRRSRP",
  ]);
  const parsedNrRsrq = parseNumFromKeys([
    "nr_rsrq",
    "NR_RSRQ",
    "nrRsrq",
    "NRRSRQ",
  ]);
  const parsedNrSinr = parseNumFromKeys([
    "nr_sinr",
    "NR_SINR",
    "nrSinr",
    "NRSINR",
  ]);

  const wifiLog = log?.is_wifi === true || isWifiLog(log);
  const parsedRsrp = wifiLog ? null : normalizeSignalToDbm(parsedRsrpRaw);
  const parsedRssi = normalizeSignalToDbm(parsedRssiRaw);
  const signalValue = wifiLog ? parsedRssi : (parsedRsrp ?? parsedRssi);
  const canonicalProvider = cleanDisplayName(log.provider ?? log.Provider);
  const provider = wifiLog
    ? (
        canonicalProvider ||
        cleanDisplayName(log.m_alpha_short) ||
        cleanDisplayName(log.m_alpha_long) ||
        "Unknown"
      )
    : (
        normalizeProviderName(canonicalProvider) ||
        normalizeProviderName(log.m_alpha_short) ||
        normalizeProviderName(log.m_alpha_long) ||
        "Unknown"
      );
  const band =
    log.band ??
    log.Band ??
    log.primaryBand ??
    log.primary_band ??
    log.neighbourBand ??
    "";
  const technology = getNormalizedTechnology(log, band);
  const eventName =
    log.event_name ??
    log.eventName ??
    log.EventName ??
    log.message ??
    log.Message ??
    log.event ??
    log.Event ??
    "";
  const eventCategory =
    log.category ??
    log.Category ??
    log.event_type ??
    log.eventType ??
    log.EventType ??
    "";
  const eventDetail =
    log.detail ??
    log.Detail ??
    log.description ??
    log.Description ??
    log.value ??
    log.Value ??
    "";

  return {
    id: log.id ?? log.Id ?? log.log_id ?? log.LogId ?? null,
    session_id: sessionId ?? log.session_id,
    lat, lng, latitude: lat, longitude: lng,
    radius: 18,
    timestamp:
      log.timestamp ??
      log.Timestamp ??
      log.time_stamp ??
      log.timeStamp ??
      log.log_time ??
      log.logTime ??
      null,
    rsrp: wifiLog ? null : signalValue,
    rssi: parsedRssi,
    signal_value: signalValue,
    signal_metric: wifiLog ? "rssi" : "rsrp",
    signal_label: wifiLog ? "RSSI" : "RSRP",
    rsrq: parseNumFromKeys(["rsrq", "RSRQ", "Rsrq", "lte_rsrq", "nr_rsrq"]),
    sinr: parseNumFromKeys(["sinr", "SINR", "Sinr", "snr", "SNR", "lte_sinr", "nr_sinr"]),
    rxlev: parsedRxlev,
    rxqual: parsedRxqual,
    cqi: parsedCqi,
    rscp: parsedRscp,
    ecno: parsedEcno,
    nr_rsrp: parsedNrRsrp,
    nrRsrp: parsedNrRsrp,
    nr_rsrq: parsedNrRsrq,
    nrRsrq: parsedNrRsrq,
    nr_sinr: parsedNrSinr,
    nrSinr: parsedNrSinr,
    ci_db: parseNumFromKeys(["ci_db", "ciDb", "CI_DB", "ci", "CI", "c_i", "C_I"]),
    ci: parseNumFromKeys(["ci_db", "ciDb", "CI_DB", "ci", "CI", "c_i", "C_I"]),
    dl_tpt: dlThroughput,
    dl_thpt: dlThroughput,
    dl_rpt: dlThroughput,
    ul_tpt: ulThroughput,
    ul_thpt: ulThroughput,
    ul_rpt: ulThroughput,
    mos: parseNum(log.mos),
    level: parseNum(log.level),
    jitter: parseNum(log.jitter),
    latency: parseNum(log.latency),
    tac: parseNum(log.tac),
    packet_loss: parseNum(log.packet_loss),
    provider,
    event_name: eventName,
    eventName,
    event_category: eventCategory,
    event_type: eventCategory,
    event_detail: eventDetail,
    message: log.message ?? log.Message ?? eventName,
    detail: eventDetail,
    data_activity: log.data_activity ?? log.dataActivity ?? log.mDataActivity ?? "",
    call_state: log.call_state ?? log.callState ?? log.CallState ?? log.mPreciseCallState ?? "",
    raw_event: {
      event_name: eventName,
      category: eventCategory,
      detail: eventDetail,
      data_activity: log.data_activity ?? log.dataActivity ?? log.mDataActivity ?? "",
      call_state: log.call_state ?? log.callState ?? log.CallState ?? log.mPreciseCallState ?? "",
      handover_type: log.handover_type ?? log.handoverType ?? "",
    },
    log_type: wifiLog ? "wifi" : "network",
    connection_type: wifiLog ? "wifi" : "network",
    is_wifi: wifiLog,
    ssid: wifiLog ? provider : "",
    wifi_rssi: wifiLog ? parsedRssi : null,
    wifi_frequency: wifiLog ? (log.band || "") : "",
    technology,
    networkType: technology,
    network: log.network || technology,
    band,
    pci: is2GTechnology(technology) ? getTechnologyMetricValue({ ...log, technology }, 'pci') ?? '' : log.pci ?? log.Pci ?? log.PCI ?? '',
    earfcn: is2GTechnology(technology) ? getTechnologyMetricValue({ ...log, technology }, 'earfcn') ?? '' : log.earfcn ?? log.EARFCN ?? log.Earfcn ?? '',
    nrarfcn: log.nrarfcn ?? log.nr_arfcn ?? log.NRARFCN ?? '',
    arfcn: log.arfcn ?? log.ARFCN ?? '',
    nodeb_id: log.nodeb_id ?? log.nodebId ?? log.nodebid ?? log.nodeb ?? log.NodeBId ?? log.NodeB ?? log.nodeB ?? '',
    nodebId: log.nodeb_id ?? log.nodebId ?? log.nodebid ?? log.nodeb ?? log.NodeBId ?? log.NodeB ?? log.nodeB ?? '',
    bcch: log.bcch ?? log.BCCH ?? log.bcch_id ?? log.bcchId ?? log.Bcch ?? log.bcch_number ?? '',
    cell_id:
      log.cell_id ??
      log.cellId ??
      log.CellId ??
      log.CELL_ID ??
      log['Cell ID'] ??
      log['cell id'] ??
      '',
    primary_cell_info_1:
      log.primary_cell_info_1 ?? log.primaryCellInfo1 ?? log.primary_cell_info ?? '',
    is_registered:
      log.is_registered ?? log.isRegistered ?? log.registered ?? log.mRegistered ?? null,
    num_cells: parseInt(log.num_cells) || null,
    speed: parseNum(log.Speed),
    battery: parseInt(log.battery) || null,
    indoor_outdoor: indout(log.indoor_outdoor) || null,
    apps: log.apps || '',
    image_path: log.image_path || '',
    extra_json: log.extra_json || '',
    extra_fields: parseExtraJsonObject(log.extra_json) || {},
  };
};

export const useNetworkSamples = (
  sessionIds,
  enabled = true,
  filterEnabled = false,
  polygons = [],
  maxRows = 2000000,
  projectId = null,
) => {
  const [datasetSnapshot, setDatasetSnapshot] = useState({
    rows: [], identity: null, revision: 0, complete: false, loading: false, outcome: 'empty', error: null,
  });
  const datasetRevisionRef = useRef(0);
  const [appSummary, setAppSummary] = useState({});
  const [inpSummary, setInpSummary] = useState({});
  const [tptVolume, setTptVolume] = useState({});
  const [progress, setProgress] = useState({ identity: null, current: 0, total: null, page: 0, totalPages: null, percent: null });
  const lastFetchedKeyRef = useRef(null);

  const safeMaxRows =
    Number.isFinite(Number(maxRows)) && Number(maxRows) > 0
      ? Math.floor(Number(maxRows))
      : null;
  const canUsePersistentCache = !filterEnabled || polygons?.length === 0;
  const cacheKey = makeProjectCacheKey({
    resource: 'unified-network-samples',
    sessionIds: sessionIds || [],
    variant: `typed-network-wifi-v15-atomic-ci:${safeMaxRows ? `max-${safeMaxRows}` : 'all'}:project-${projectId || 'none'}`,
  });
  const requestIdentity = JSON.stringify({
    cacheKey,
    sessionIds: sessionIds ? [...sessionIds].map(String).sort() : [],
    projectId: projectId ?? null,
    enabled: Boolean(enabled),
    filterEnabled: Boolean(filterEnabled),
    polygons: getPolygonRequestIdentity(polygons),
    maxRows: safeMaxRows,
  });
  const requestGeneration = useRequestGeneration(requestIdentity);

  const fetchData = useCallback(async (forceRefresh = false) => {
    const lease = requestGeneration.begin({ force: forceRefresh });
    if (!lease.started) return;
    const { request } = lease;
    const isCurrent = () => requestGeneration.isCurrent(request);
    const signal = request.controller.signal;

    if (requestIdentity !== lastFetchedKeyRef.current) {
      lastFetchedKeyRef.current = null;
      setAppSummary({});
      setInpSummary({});
      setTptVolume({});
    }

    if (!sessionIds?.length || !enabled) {
      const revision = ++datasetRevisionRef.current;
      setDatasetSnapshot({ rows: [], identity: requestIdentity, revision, complete: false, loading: false, outcome: 'empty', error: null });
      setAppSummary({});
      setInpSummary({});
      setTptVolume({});
      setProgress({ identity: requestIdentity, current: 0, total: null, page: 0, totalPages: null, percent: null });
      lastFetchedKeyRef.current = requestIdentity;
      requestGeneration.finish(request);
      return;
    }

    if (!forceRefresh && requestIdentity === lastFetchedKeyRef.current) {
      requestGeneration.finish(request);
      return;
    }

    setDatasetSnapshot((previous) => {
      const revision = previous.identity === requestIdentity ? previous.revision : ++datasetRevisionRef.current;
      return beginNetworkLogSnapshot(previous, requestIdentity, revision);
    });
    setProgress({ identity: requestIdentity, current: 0, total: null, page: 0, totalPages: null, percent: null });

    if (!forceRefresh && canUsePersistentCache) {
      let cached = null;
      try {
        cached = await readIndexedDbCache(cacheKey);
      } catch {
        cached = null;
      }
      if (!isCurrent()) return;
      if (!cached) {
        try {
          cached = readProjectSessionCache(cacheKey);
        } catch {
          cached = null;
        }
      }
      if (!isCurrent()) return;
      const cachedDataset = createNetworkLogCacheSnapshot(cached, requestIdentity, datasetRevisionRef.current + 1);
      if (cachedDataset) {
        const revision = ++datasetRevisionRef.current;
        setDatasetSnapshot({ ...cachedDataset.snapshot, revision });
        setAppSummary(cachedDataset.appSummary);
        setInpSummary(cachedDataset.inpSummary);
        setTptVolume(cachedDataset.tptVolume);
        setProgress({ identity: requestIdentity, current: cached.locations.length, total: cached.locations.length, page: 1, totalPages: 1, percent: 100 });
        lastFetchedKeyRef.current = requestIdentity;
        requestGeneration.finish(request);
        return;
      }
    }

    const PAGE_SIZE = 20000;
    const MAX_PAGES = 100; // Bound a request to at most two million source rows.
    const startTime = performance.now();

    try {
      const loadedDataset = await fetchCompleteNetworkLogDataset({
        fetchPage: (page) => withTimeout(
          mapViewApi.getNetworkLog({
            session_ids: sessionIds,
            project_id: projectId,
            page,
            limit: PAGE_SIZE,
            force_refresh: forceRefresh,
            signal,
          }),
          NETWORK_SAMPLES_TIMEOUT_MS,
          signal,
        ),
        parseRow: (row) => parseLogEntry(row, row.session_id),
        pageSize: PAGE_SIZE,
        maxPages: MAX_PAGES,
        maxRows: safeMaxRows,
        signal,
        isCurrent,
        onProgress: (pageProgress) => {
          if (!isCurrent()) return;
          setProgress({
            identity: requestIdentity,
            current: pageProgress.received,
            total: pageProgress.total,
            page: pageProgress.page,
            totalPages: pageProgress.totalPages,
            percent: pageProgress.percent,
          });
        },
      });
      const allParsedLogs = loadedDataset.rows;
      const summaryData = loadedDataset.summary;
      setProgress({
        identity: requestIdentity,
        current: loadedDataset.received,
        total: loadedDataset.total,
        page: loadedDataset.page,
        totalPages: loadedDataset.totalPages,
        percent: loadedDataset.total === null ? null : 100,
      });

      let finalLogs = allParsedLogs;

      if (filterEnabled && polygons?.length > 0) {
        finalLogs = allParsedLogs.filter(log =>
          polygons.some(poly => isPointInPolygon(log, poly))
        );
      }

      if (finalLogs.some((log) => String(log?.network ?? log?.technology ?? "").toUpperCase().includes("2G"))) {
        try {
          const ciResponse = await withTimeout(
            mapViewApi.get2GCiAnalysis({
              sessionIds,
              signal,
            }),
            NETWORK_SAMPLES_TIMEOUT_MS,
            signal,
          );
          if (!isCurrent()) return;
          const ciRows =
            ciResponse?.data ||
            ciResponse?.Data ||
            ciResponse?.result ||
            ciResponse?.Result ||
            [];
          finalLogs = merge2GCiAnalysis(finalLogs, Array.isArray(ciRows) ? ciRows : []);
        } catch (ciErr) {
          if (isCancelledError(ciErr) || signal.aborted || !isCurrent()) return;
          console.warn("2G C/I analysis unavailable:", ciErr);
        }
      }

      if (!isCurrent()) return;
      const fetchTime = ((performance.now() - startTime) / 1000).toFixed(2);
      const resultOutcome = finalLogs.length > 0 ? 'complete' : 'empty';
      const revision = ++datasetRevisionRef.current;
      setDatasetSnapshot(createCompleteNetworkLogSnapshot({
        rows: finalLogs, identity: requestIdentity, revision, outcome: resultOutcome,
      }));
      setAppSummary(summaryData.app);
      setInpSummary(summaryData.io);
      setTptVolume(summaryData.tpt);
      lastFetchedKeyRef.current = requestIdentity;
      if (canUsePersistentCache) {
        const cachePayload = {
          cacheSchemaVersion: 3,
          outcome: resultOutcome,
          complete: true,
          locations: finalLogs,
          appSummary: summaryData.app,
          inpSummary: summaryData.io,
          tptVolume: summaryData.tpt,
        };
        // Large sample datasets belong in IndexedDB. Avoid serializing every
        // row only for the small localStorage cache to reject the payload.
        if (finalLogs.length <= 500) writeProjectSessionCache(cacheKey, cachePayload);
        void writeIndexedDbCache(cacheKey, cachePayload);
      }


      if (allParsedLogs.length > 0) {
        const cappedSuffix =
          safeMaxRows && allParsedLogs.length >= safeMaxRows
            ? ` (capped at ${safeMaxRows.toLocaleString()})`
            : "";
        toast.success(
          `${allParsedLogs.length.toLocaleString()} points loaded in ${fetchTime}s${cappedSuffix}`,
        );
      } else {
        toast.warn('No valid log data found');
      }



    } catch (err) {
      if (isCancelledError(err) || err?.name === 'AbortError' || signal.aborted || !isCurrent()) return;
      if (isCurrent()) {
        setDatasetSnapshot((previous) => {
          const preserveCompleted = previous.identity === requestIdentity && previous.complete;
          const revision = preserveCompleted ? previous.revision : ++datasetRevisionRef.current;
          return {
            rows: preserveCompleted ? previous.rows : [],
            identity: requestIdentity,
            revision,
            complete: preserveCompleted,
            loading: false,
            outcome: preserveCompleted ? previous.outcome : 'failed',
            error: err.message || 'Unable to load the complete network log dataset.',
          };
        });
        toast.error(`Network log load failed: ${err.message || 'Unknown error'}. Retry to load the complete dataset.`);
      }
    } finally {
      if (isCurrent()) {
        setDatasetSnapshot((previous) => previous.identity === requestIdentity && previous.loading
          ? { ...previous, loading: false }
          : previous);
        requestGeneration.finish(request);
      }
    }
  }, [
    sessionIds,
    enabled,
    filterEnabled,
    polygons,
    safeMaxRows,
    projectId,
    canUsePersistentCache,
    cacheKey,
    requestIdentity,
    requestGeneration,
  ]);

  useEffect(() => {
    const timeoutId = setTimeout(() => fetchData(), 50);
    return () => clearTimeout(timeoutId);
  }, [fetchData]);

  const hasRequestedDataset = Boolean(enabled && sessionIds?.length);
  const visibleSnapshot = getVisibleNetworkLogSnapshot(datasetSnapshot, requestIdentity, hasRequestedDataset);
  const visibleProgress = progress.identity === requestIdentity
    ? progress
    : { identity: requestIdentity, current: 0, total: null, page: 0, totalPages: null, percent: null };

  return {
    locations: visibleSnapshot.rows,
    dataset: visibleSnapshot,
    appSummary,
    inpSummary,
    tptVolume,
    loading: visibleSnapshot.loading,
    error: visibleSnapshot.error,
    progress: visibleProgress,
    outcome: visibleSnapshot.outcome,
    complete: visibleSnapshot.complete,
    refetch: useCallback(() => {
      fetchData(true);
    }, [fetchData]),
  };
};
