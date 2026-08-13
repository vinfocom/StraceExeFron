import { normalizeBandName, normalizeTechName } from "./colorUtils.js";

export const DEFAULT_HANDOVER_MAX_GAP_MS = null;
export const DEFAULT_HANDOVER_GAP_MULTIPLIER = 2.5;
export const DEFAULT_NEIGHBOR_LOOKBACK_MS = 30 * 1000;

const MISSING_SESSION = "__session_missing__";
const INVALID_TEXT_VALUES = new Set(["", "n/a", "na", "null", "undefined", "-"]);

const readValue = (row, keys = []) => {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
};

const readText = (row, keys = []) => {
  const value = readValue(row, keys);
  if (value == null) return null;
  const text = String(value).trim();
  return INVALID_TEXT_VALUES.has(text.toLowerCase()) ? null : text;
};

const readMetric = (row, keys = []) => {
  const value = readValue(row, keys);
  if (value == null) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toEpochMilliseconds = (value) => {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric > 1e11) return Math.trunc(numeric);
    if (numeric > 1e8) return Math.trunc(numeric * 1000);
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

export const getHandoverTimestampMs = (row) =>
  toEpochMilliseconds(
    readValue(row, [
      "timestamp",
      "Timestamp",
      "time_stamp",
      "timeStamp",
      "log_time",
      "logTime",
      "created_at",
      "createdAt",
    ]),
  );

const getSessionKey = (row) => {
  const value = readValue(row, [
    "session_id",
    "sessionId",
    "SessionId",
    "sessionID",
    "session",
    "Session",
  ]);
  const text = String(value ?? "").trim();
  return text || MISSING_SESSION;
};

const getOrderId = (row) => {
  const raw = readText(row, ["id", "Id", "log_id", "logId", "LogId"]);
  const numeric = Number(raw);
  return { raw, numeric: Number.isFinite(numeric) ? numeric : null };
};

const compareNullableNumbers = (a, b) => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
};

export const buildOrderedDriveLogs = (logs = []) =>
  (logs || [])
    .map((loc, originalIndex) => {
      const orderId = getOrderId(loc);
      return {
        loc,
        originalIndex,
        sessionKey: getSessionKey(loc),
        timestampMs: getHandoverTimestampMs(loc),
        logIdRaw: orderId.raw,
        logIdNumber: orderId.numeric,
      };
    })
    .sort((a, b) => {
      const sessionCompare = String(a.sessionKey).localeCompare(String(b.sessionKey), undefined, {
        numeric: true,
        sensitivity: "base",
      });
      if (sessionCompare !== 0) return sessionCompare;

      // RF chronology comes from time. The database ID is only a tie-breaker.
      const timeCompare = compareNullableNumbers(a.timestampMs, b.timestampMs);
      if (timeCompare !== 0) return timeCompare;

      const idCompare = compareNullableNumbers(a.logIdNumber, b.logIdNumber);
      if (idCompare !== 0) return idCompare;

      if (a.logIdRaw && b.logIdRaw && a.logIdRaw !== b.logIdRaw) {
        const rawCompare = a.logIdRaw.localeCompare(b.logIdRaw, undefined, {
          numeric: true,
          sensitivity: "base",
        });
        if (rawCompare !== 0) return rawCompare;
      }
      return a.originalIndex - b.originalIndex;
    });

const getEventText = (row) => {
  const values = [
    row?.event_name,
    row?.eventName,
    row?.EventName,
    row?.event_type,
    row?.eventType,
    row?.handover_type,
    row?.handoverType,
    row?.message,
    row?.Message,
    row?.detail,
    row?.description,
    row?.raw_event?.event_name,
    row?.raw_event?.category,
    row?.raw_event?.detail,
    row?.raw_event?.handover_type,
  ];
  return values.filter((value) => value != null && value !== "").join(" ");
};

const classifyEvent = (entries = []) => {
  const text = entries.map((entry) => getEventText(entry.loc)).join(" ");
  if (/\b(?:cell\s+)?reselection(?:\s+(?:complete|success(?:ful)?))?\b/i.test(text)) {
    return { classification: "cell_reselection", confidence: "high" };
  }
  if (/\b(?:handover|hand\s*over|ho)[\s_:-]*(?:success(?:ful)?|complete(?:d)?|completion)\b/i.test(text)) {
    return { classification: "confirmed_handover", confidence: "high" };
  }
  if (/\b(?:handover|hand\s*over|ho)[\s_:-]*(?:fail(?:ed|ure)?|reject(?:ed)?|abort(?:ed)?)\b/i.test(text)) {
    return { classification: "failed_handover", confidence: "high" };
  }
  return { classification: "inferred_handover", confidence: "medium" };
};

const hasExplicitRegistrationFailure = (row) => {
  const explicit = readValue(row, ["is_registered", "isRegistered", "registered", "mRegistered"]);
  if (explicit === false || explicit === 0 || String(explicit).trim().toLowerCase() === "no") return true;

  const primaryInfo = String(
    readValue(row, ["primary_cell_info_1", "primaryCellInfo1", "primary_cell_info"]) ?? "",
  );
  return /\bmRegistered\s*=\s*(?:NO|FALSE|0)\b/i.test(primaryInfo);
};

const getServingCell = (row) => {
  if (!row || hasExplicitRegistrationFailure(row)) return null;

  // Never substitute Cell ID for PCI: they are different RF identifiers.
  const pci = readText(row, ["pci", "PCI", "Pci", "physical_cell_id", "physicalCellId"]);
  const rawBand = readText(row, ["band", "Band", "primaryBand", "primary_band"]);
  const normalizedBand = normalizeBandName(rawBand);
  const band = normalizedBand && normalizedBand !== "Unknown" ? normalizedBand : null;
  const technology = normalizeTechName(
    readValue(row, ["technology", "Technology", "networkType", "network", "rat", "RAT"]),
    rawBand,
  );
  const state = {
    pci,
    technology: technology && technology !== "Unknown" ? technology : null,
    band,
    frequency: readText(row, [
      "earfcn",
      "EARFCN",
      "Earfcn",
      "nrarfcn",
      "nr_arfcn",
      "NRARFCN",
      "arfcn",
      "ARFCN",
      "bcch",
      "BCCH",
    ]),
    cellId: readText(row, ["cell_id", "cellId", "CellId", "eci", "ECI", "nci", "NCI"]),
  };

  // Technology and band mobility remain detectable when a device omits PCI.
  return Object.values(state).some(Boolean) ? state : null;
};

const sameOptionalValue = (a, b) => !a || !b || String(a) === String(b);

const isSameServingCell = (a, b) =>
  Boolean(a && b) &&
  sameOptionalValue(a.pci, b.pci) &&
  sameOptionalValue(a.technology, b.technology) &&
  (a.frequency && b.frequency
    ? String(a.frequency) === String(b.frequency)
    : sameOptionalValue(a.band, b.band)) &&
  sameOptionalValue(a.cellId, b.cellId);

const isContinuous = (previous, current, maxGapMs) => {
  if (!previous || !current || previous.sessionKey !== current.sessionKey) return false;
  if (previous.timestampMs == null || current.timestampMs == null) return true;
  if (!Number.isFinite(maxGapMs) || maxGapMs <= 0) return true;
  const gap = current.timestampMs - previous.timestampMs;
  return gap >= 0 && gap <= maxGapMs;
};

const getPositiveTimestampGaps = (entries = []) => {
  const gaps = [];
  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1];
    const current = entries[index];
    if (previous?.timestampMs == null || current?.timestampMs == null) continue;
    const gap = current.timestampMs - previous.timestampMs;
    if (Number.isFinite(gap) && gap > 0) gaps.push(gap);
  }
  return gaps;
};

const getPercentileValue = (values = [], percentile = 0.25) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * percentile)),
  );
  return sorted[index];
};

const resolveSessionMaxGapMs = (entries = [], configuredMaxGapMs) => {
  const explicitMaxGap = Number(configuredMaxGapMs);
  if (Number.isFinite(explicitMaxGap) && explicitMaxGap > 0) return explicitMaxGap;

  const typicalGap = getPercentileValue(getPositiveTimestampGaps(entries), 0.25);
  if (!Number.isFinite(typicalGap) || typicalGap <= 0) return null;
  return typicalGap * DEFAULT_HANDOVER_GAP_MULTIPLIER;
};

const getMobilityCategory = (fromCell, toCell) => {
  if (fromCell.technology && toCell.technology && fromCell.technology !== toCell.technology) {
    return "inter-rat";
  }
  if (fromCell.frequency && toCell.frequency && fromCell.frequency !== toCell.frequency) {
    return "inter-frequency";
  }
  return "intra-frequency";
};

const buildRuns = (entries, maxGapMs) => {
  const runs = [];
  let currentRun = null;

  for (const entry of entries) {
    const cell = getServingCell(entry.loc);
    if (!cell?.pci) continue;

    const continuesRun =
      currentRun &&
      isContinuous(currentRun.entries[currentRun.entries.length - 1], entry, maxGapMs) &&
      isSameServingCell(currentRun.cell, cell);

    if (continuesRun) {
      currentRun.entries.push(entry);
      // Prefer later non-missing identity fields without changing the run identity.
      currentRun.cell = {
        pci: currentRun.cell.pci || cell.pci,
        technology: currentRun.cell.technology || cell.technology,
        band: currentRun.cell.band || cell.band,
        frequency: currentRun.cell.frequency || cell.frequency,
        cellId: currentRun.cell.cellId || cell.cellId,
      };
      continue;
    }

    currentRun = { cell, entries: [entry] };
    runs.push(currentRun);
  }

  return runs;
};

const buildFieldRuns = (entries, field, maxGapMs) => {
  const runs = [];
  let currentRun = null;

  for (const entry of entries) {
    const cell = getServingCell(entry.loc);
    const value = cell?.[field];
    if (!value) continue;

    const continuesRun =
      currentRun &&
      isContinuous(currentRun.entries[currentRun.entries.length - 1], entry, maxGapMs) &&
      String(currentRun.value) === String(value);

    if (continuesRun) {
      currentRun.entries.push(entry);
      continue;
    }

    currentRun = { value, cell, entries: [entry] };
    runs.push(currentRun);
  }

  return runs;
};

const findNeighborEvidence = ({ neighborLogs, sourceCell, targetCell, targetEntry, lookbackMs }) => {
  if (!neighborLogs?.length || !targetCell?.pci) return null;
  const targetTime = targetEntry.timestampMs;
  const sessionKey = targetEntry.sessionKey;

  const matches = neighborLogs
    .map((row) => ({ row, timestampMs: getHandoverTimestampMs(row) }))
    .filter(({ row, timestampMs }) => {
      if (getSessionKey(row) !== sessionKey) return false;
      const neighborPci = readText(row, [
        "neighbourPci",
        "neighborPci",
        "neighbour_pci",
        "neighbor_pci",
      ]);
      if (!neighborPci || String(neighborPci) !== String(targetCell.pci)) return false;

      const primaryPci = readText(row, ["primaryPci", "primary_pci", "servingPci", "serving_pci"]);
      if (primaryPci && sourceCell.pci && String(primaryPci) !== String(sourceCell.pci)) return false;

      if (targetTime != null && timestampMs != null) {
        return timestampMs <= targetTime && targetTime - timestampMs <= lookbackMs;
      }
      return true;
    })
    .sort((a, b) => compareNullableNumbers(b.timestampMs, a.timestampMs));

  if (!matches.length) return null;
  const row = matches[0].row;
  return {
    targetSeenAsNeighbor: true,
    targetNeighborTimestamp: readValue(row, ["timestamp", "time_stamp", "timeStamp"]),
    targetNeighborRsrp: readMetric(row, ["neighbourRsrp", "neighborRsrp", "neighbour_rsrp", "neighbor_rsrp"]),
    targetNeighborRsrq: readMetric(row, ["neighbourRsrq", "neighborRsrq", "neighbour_rsrq", "neighbor_rsrq"]),
    targetNeighborSinr: readMetric(row, ["neighbourSinr", "neighborSinr", "neighbour_sinr", "neighbor_sinr"]),
  };
};

const createTransitionMeta = ({
  sourceEntry,
  targetEntry,
  sourceCell,
  targetCell,
  eventStatus,
  neighborEvidence,
  neighborDataAvailable,
}) => {
  const source = sourceEntry.loc;
  const target = targetEntry.loc;
  const lat = Number(target?.lat ?? target?.latitude);
  const lng = Number(target?.lng ?? target?.longitude);
  const fromLat = Number(source?.lat ?? source?.latitude);
  const fromLng = Number(source?.lng ?? source?.longitude);

  return {
    lat,
    lng,
    atIndex: targetEntry.originalIndex,
    sequenceLogId: targetEntry.logIdRaw,
    sequenceTimestamp: targetEntry.timestampMs,
    sessionGroup: targetEntry.sessionKey,
    timestamp: readValue(target, ["timestamp", "time_stamp", "timeStamp", "log_time", "logTime"]),
    session_id: readValue(target, ["session_id", "sessionId", "SessionId"]),
    previousSequenceLogId: sourceEntry.logIdRaw,
    previousSequenceTimestamp: sourceEntry.timestampMs,
    fromLat: Number.isFinite(fromLat) ? fromLat : undefined,
    fromLng: Number.isFinite(fromLng) ? fromLng : undefined,
    toLat: lat,
    toLng: lng,
    rsrp: readMetric(source, ["rsrp", "RSRP", "Rsrp", "lte_rsrp", "nr_rsrp"]),
    nextRsrp: readMetric(target, ["rsrp", "RSRP", "Rsrp", "lte_rsrp", "nr_rsrp"]),
    rsrq: readMetric(source, ["rsrq", "RSRQ", "Rsrq", "lte_rsrq", "nr_rsrq"]),
    nextRsrq: readMetric(target, ["rsrq", "RSRQ", "Rsrq", "lte_rsrq", "nr_rsrq"]),
    sinr: readMetric(source, ["sinr", "SINR", "Sinr", "snr", "SNR", "lte_sinr", "nr_sinr"]),
    nextSinr: readMetric(target, ["sinr", "SINR", "Sinr", "snr", "SNR", "lte_sinr", "nr_sinr"]),
    pci: sourceCell.pci,
    nextPci: targetCell.pci,
    fromCellId: sourceCell.cellId,
    toCellId: targetCell.cellId,
    fromNodebId: readText(source, [
      "nodeb_id",
      "nodebId",
      "NodebId",
      "NodeBId",
      "enodeb_id",
      "enodebId",
      "eNodeBId",
      "gnodeb_id",
      "gnodebId",
      "gNodeBId",
    ]),
    toNodebId: readText(target, [
      "nodeb_id",
      "nodebId",
      "NodebId",
      "NodeBId",
      "enodeb_id",
      "enodebId",
      "eNodeBId",
      "gnodeb_id",
      "gnodebId",
      "gNodeBId",
    ]),
    fromFrequency: sourceCell.frequency,
    toFrequency: targetCell.frequency,
    fromTechnology: sourceCell.technology,
    toTechnology: targetCell.technology,
    fromBand: sourceCell.band,
    toBand: targetCell.band,
    mobilityCategory: getMobilityCategory(sourceCell, targetCell),
    samePciCellChange:
      sourceCell.pci && targetCell.pci
        ? String(sourceCell.pci) === String(targetCell.pci)
        : null,
    classification: eventStatus.classification,
    confidence: eventStatus.confidence,
    targetSeenAsNeighbor: neighborDataAvailable ? false : null,
    ...neighborEvidence,
  };
};

const buildFieldTransitions = ({
  entries,
  field,
  type,
  neighborLogs,
  maxGapMs,
  neighborLookbackMs,
  minTargetSamples,
}) => {
  const transitions = [];
  const runs = buildFieldRuns(entries, field, maxGapMs);
  let stableRun = runs[0] || null;

  for (let index = 1; index < runs.length && stableRun; index += 1) {
    const candidateRun = runs[index];
    const sourceEntry = stableRun.entries[stableRun.entries.length - 1];
    const targetEntry = candidateRun.entries[0];

    if (!isContinuous(sourceEntry, targetEntry, maxGapMs)) {
      stableRun = candidateRun;
      continue;
    }

    const eventStatus = classifyEvent(candidateRun.entries);
    const hasExplicitOutcome = eventStatus.classification !== "inferred_handover";
    if (candidateRun.entries.length < Math.max(1, minTargetSamples) && !hasExplicitOutcome) {
      continue;
    }
    if (String(stableRun.value) === String(candidateRun.value)) continue;

    const sourceCell = getServingCell(sourceEntry.loc) || stableRun.cell;
    const targetCell = getServingCell(targetEntry.loc) || candidateRun.cell;
    const neighborEvidence = findNeighborEvidence({
      neighborLogs,
      sourceCell,
      targetCell,
      targetEntry,
      lookbackMs: neighborLookbackMs,
    });
    const meta = createTransitionMeta({
      sourceEntry,
      targetEntry,
      sourceCell,
      targetCell,
      eventStatus,
      neighborEvidence,
      neighborDataAvailable: neighborLogs.length > 0,
    });

    if (Number.isFinite(meta.lat) && Number.isFinite(meta.lng)) {
      transitions.push({
        from: String(stableRun.value),
        to: String(candidateRun.value),
        ...meta,
        type,
      });
    }
    stableRun = candidateRun;
  }

  return transitions;
};

export const buildHandoverTransitions = (
  logs = [],
  {
    neighborLogs = [],
    maxGapMs = DEFAULT_HANDOVER_MAX_GAP_MS,
    neighborLookbackMs = DEFAULT_NEIGHBOR_LOOKBACK_MS,
    minTargetSamples = 2,
  } = {},
) => {
  const ordered = buildOrderedDriveLogs(logs);
  const technologyTransitions = [];
  const bandTransitions = [];
  const pciTransitions = [];
  if (ordered.length < 2) return { technologyTransitions, bandTransitions, pciTransitions };

  const sessions = new Map();
  ordered.forEach((entry) => {
    if (!sessions.has(entry.sessionKey)) sessions.set(entry.sessionKey, []);
    sessions.get(entry.sessionKey).push(entry);
  });

  sessions.forEach((entries) => {
    const sessionMaxGapMs = resolveSessionMaxGapMs(entries, maxGapMs);

    technologyTransitions.push(
      ...buildFieldTransitions({
        entries,
        field: "technology",
        type: "technology",
        neighborLogs,
        maxGapMs: sessionMaxGapMs,
        neighborLookbackMs,
        minTargetSamples,
      }),
    );
    bandTransitions.push(
      ...buildFieldTransitions({
        entries,
        field: "band",
        type: "band",
        neighborLogs,
        maxGapMs: sessionMaxGapMs,
        neighborLookbackMs,
        minTargetSamples,
      }),
    );

    const runs = buildRuns(entries, sessionMaxGapMs);
    let stableRun = runs[0] || null;

    for (let index = 1; index < runs.length && stableRun; index += 1) {
      const candidateRun = runs[index];
      const sourceEntry = stableRun.entries[stableRun.entries.length - 1];
      const targetEntry = candidateRun.entries[0];

      if (!isContinuous(sourceEntry, targetEntry, sessionMaxGapMs)) {
        stableRun = candidateRun;
        continue;
      }

      const eventStatus = classifyEvent(candidateRun.entries);
      const hasExplicitOutcome = eventStatus.classification !== "inferred_handover";
      if (candidateRun.entries.length < Math.max(1, minTargetSamples) && !hasExplicitOutcome) {
        continue;
      }

      // A one-sample excursion that returns to the stable cell is RF/log noise, not a handover.
      if (isSameServingCell(stableRun.cell, candidateRun.cell)) continue;

      const neighborEvidence = findNeighborEvidence({
        neighborLogs,
        sourceCell: stableRun.cell,
        targetCell: candidateRun.cell,
        targetEntry,
        lookbackMs: neighborLookbackMs,
      });
      const meta = createTransitionMeta({
        sourceEntry,
        targetEntry,
        sourceCell: stableRun.cell,
        targetCell: candidateRun.cell,
        eventStatus,
        neighborEvidence,
        neighborDataAvailable: neighborLogs.length > 0,
      });

      if (!Number.isFinite(meta.lat) || !Number.isFinite(meta.lng)) {
        stableRun = candidateRun;
        continue;
      }

      pciTransitions.push({
        from: stableRun.cell.pci,
        to: candidateRun.cell.pci,
        ...meta,
        type: "pci",
      });
      stableRun = candidateRun;
    }
  });

  return { technologyTransitions, bandTransitions, pciTransitions };
};
