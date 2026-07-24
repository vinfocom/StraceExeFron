// Minimal RFC4180-style CSV parser with dynamic header detection.
// Handles quoted fields (with embedded commas/newlines/escaped quotes) without
// pulling in an external dependency.

export function parseCSV(text) {
  if (!text) return { headers: [], rows: [] };

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\r") {
      // ignore, newline is handled by \n
    } else if (char === "\n") {
      pushField();
      pushRow();
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }

  const nonEmptyRows = rows.filter((cells) => cells.some((cell) => String(cell).trim() !== ""));
  if (nonEmptyRows.length === 0) return { headers: [], rows: [] };

  const headers = nonEmptyRows[0].map((header) => String(header ?? "").trim());
  const dataRows = nonEmptyRows.slice(1).map((cells) => {
    const alignedCells = alignOverflowCells(headers, cells);
    const record = {};
    headers.forEach((header, idx) => {
      record[header] = alignedCells[idx] !== undefined ? String(alignedCells[idx]).trim() : "";
    });
    return record;
  });

  return { headers, rows: dataRows };
}

function alignOverflowCells(headers, cells) {
  if (cells.length <= headers.length) return cells;

  const detailIndex = headers.findIndex((header, index) => (
    index > 1 && /^(detail|details|decode|decoded|description|info|value|data|content|text)$/i.test(header)
  ));

  if (detailIndex === -1) return cells;

  const trailingCount = headers.length - detailIndex - 1;
  const tailStart = cells.length - trailingCount;
  if (tailStart <= detailIndex) return cells;

  return [
    ...cells.slice(0, detailIndex),
    cells.slice(detailIndex, tailStart).join(","),
    ...cells.slice(tailStart),
  ];
}

// Finds the header name matching one of the given aliases (case-insensitive,
// exact match preferred, falling back to substring match) instead of relying
// on fixed column indexes/names.
export function findColumn(headers = [], patterns = []) {
  const lowerHeaders = headers.map((header) => header.toLowerCase());

  for (const pattern of patterns) {
    const needle = pattern.toLowerCase();
    const exactIndex = lowerHeaders.findIndex((header) => header === needle);
    if (exactIndex !== -1) return headers[exactIndex];
  }

  for (const pattern of patterns) {
    const needle = pattern.toLowerCase();
    const partialIndex = lowerHeaders.findIndex((header) => header.includes(needle));
    if (partialIndex !== -1) return headers[partialIndex];
  }

  return null;
}

export function getField(row, headers, patterns) {
  const column = findColumn(headers, patterns);
  return column ? String(row[column] ?? "").trim() : "";
}
