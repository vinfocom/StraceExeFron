const readReliableTotal = (body) => {
  for (const key of ["total_count", "totalCount", "TotalCount", "total_records", "totalRecords"]) {
    if (body?.[key] === null || body?.[key] === undefined || body?.[key] === "") continue;
    const value = Number(body[key]);
    if (Number.isFinite(value) && value >= 0) return { available: true, value };
  }
  return { available: false, value: null };
};

export const extractNetworkLogPage = (response) => {
  let body;
  let rows;
  if (response?.data && typeof response.data === "object" && !Array.isArray(response.data) && response.data.data) {
    body = response.data;
    rows = body.data;
  } else if (Array.isArray(response?.data)) {
    body = response;
    rows = response.data;
  } else if (Array.isArray(response)) {
    body = { data: response };
    rows = response;
  } else {
    body = response?.data || response || {};
    rows = body?.data || body?.Data || body?.logs || body?.result || body?.Result || (Array.isArray(body) ? body : []);
    if (!Array.isArray(rows) && body?.data && typeof body.data === "object") {
      rows = body.data.data || body.data.Data || [];
    }
  }
  if (body?.success === false || Number(body?.Status) === 0) {
    throw new Error(String(body?.Message || body?.message || "The log API returned an unsuccessful response."));
  }
  return { body, rows: Array.isArray(rows) ? rows : [] };
};

export class IncompleteNetworkLogDatasetError extends Error {
  constructor(message, code = "incomplete") {
    super(message);
    this.name = "IncompleteNetworkLogDatasetError";
    this.code = code;
  }
}

const throwIfCancelled = (signal, isCurrent) => {
  if (signal?.aborted || !isCurrent()) {
    const error = new Error("Network log loading was cancelled.");
    error.name = "AbortError";
    throw error;
  }
};

/**
 * Fetches pages sequentially and keeps parsed rows private until all requested
 * pages are accounted for. Progress contains counts only; callers publish the
 * returned rows as a single dataset snapshot after this function resolves.
 */
export const fetchCompleteNetworkLogDataset = async ({
  fetchPage,
  parseRow,
  pageSize = 20000,
  maxPages = 100,
  maxRows = null,
  signal,
  isCurrent = () => true,
  onProgress = () => {},
} = {}) => {
  const rows = [];
  let received = 0;
  let expectedTotal = null;
  let totalPages = null;
  let summary = { app: {}, io: {}, tpt: null };

  for (let page = 1; page <= maxPages; page += 1) {
    throwIfCancelled(signal, isCurrent);
    const response = await fetchPage(page);
    throwIfCancelled(signal, isCurrent);
    const { body, rows: pageRows } = extractNetworkLogPage(response);

    if (page === 1) {
      const total = readReliableTotal(body);
      if (total.available) {
        expectedTotal = total.value;
        totalPages = Math.ceil(total.value / pageSize);
      }
      if (body?.app_summary) summary.app = body.app_summary;
      if (body?.io_summary) summary.io = body.io_summary;
      if (body?.tpt_volume) summary.tpt = body.tpt_volume;
    }

    received += pageRows.length;
    for (const rawRow of pageRows) {
      const parsed = parseRow(rawRow);
      if (parsed) rows.push(parsed);
      if (Number.isFinite(maxRows) && maxRows > 0 && rows.length > maxRows) {
        throw new IncompleteNetworkLogDatasetError(
          `This selection exceeds the ${maxRows.toLocaleString()} row map limit. Narrow the selection and retry.`,
          "row-limit",
        );
      }
    }

    const percent = expectedTotal === null
      ? null
      : expectedTotal === 0 ? 100 : Math.min(100, Math.floor((received / expectedTotal) * 100));
    onProgress({ received, total: expectedTotal, page, totalPages, percent });

    const reachedReportedEnd = expectedTotal !== null && received >= expectedTotal;
    const reachedShortPage = pageRows.length < pageSize;
    const hasAnotherPage = expectedTotal !== null ? !reachedReportedEnd : !reachedShortPage;
    if (reachedReportedEnd || (expectedTotal === null && reachedShortPage)) {
      if (expectedTotal !== null && received !== expectedTotal) {
        throw new IncompleteNetworkLogDatasetError(
          `The log API reported ${expectedTotal.toLocaleString()} rows but ${received.toLocaleString()} arrived. Retry to load the complete dataset.`,
          "total-mismatch",
        );
      }
      return { rows, received, total: expectedTotal, page, totalPages, summary, complete: true };
    }

    if (!hasAnotherPage || pageRows.length === 0) {
      throw new IncompleteNetworkLogDatasetError("The log API stopped before all requested rows arrived. Retry the load.");
    }
    if (page === maxPages) {
      throw new IncompleteNetworkLogDatasetError(
        `The log request reached its ${maxPages} page limit before the dataset was complete. Narrow the selection and retry.`,
        "page-limit",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    throwIfCancelled(signal, isCurrent);
  }

  throw new IncompleteNetworkLogDatasetError("The log request ended before the dataset was complete.");
};

export const isCompleteNetworkLogCacheEntry = (entry) =>
  entry?.cacheSchemaVersion === 3 &&
  entry?.complete === true &&
  ["complete", "empty"].includes(entry?.outcome) &&
  Array.isArray(entry?.locations);

export const createNetworkLogCacheSnapshot = (entry, identity, revision) => {
  if (!isCompleteNetworkLogCacheEntry(entry)) return null;
  return {
    snapshot: createCompleteNetworkLogSnapshot({
      rows: entry.locations,
      identity,
      revision,
      outcome: entry.outcome,
    }),
    appSummary: entry.appSummary || {},
    inpSummary: entry.inpSummary || {},
    tptVolume: entry.tptVolume || {},
  };
};

export const beginNetworkLogSnapshot = (previous, identity, nextRevision) => {
  if (previous?.identity === identity) return { ...previous, loading: true, error: null };
  return {
    rows: [], identity, revision: nextRevision, complete: false, loading: true, outcome: "loading", error: null,
  };
};

export const getVisibleNetworkLogSnapshot = (snapshot, identity, shouldLoad) => {
  if (snapshot?.identity === identity) return snapshot;
  return {
    rows: [], identity, revision: (snapshot?.revision || 0) + 1, complete: false,
    loading: Boolean(shouldLoad), outcome: shouldLoad ? "loading" : "empty", error: null,
  };
};

export const createCompleteNetworkLogSnapshot = ({ rows, identity, revision, outcome }) => ({
  rows,
  identity,
  revision,
  complete: true,
  loading: false,
  outcome,
  error: null,
});
