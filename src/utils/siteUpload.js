const UPLOAD_SITE_COLUMNS = [
  "site",
  "sector",
  "cell_id",
  "longitude",
  "latitude",
  "pci",
  "azimuth",
  "band",
  "earfcn",
  "cluster",
  "technology",
  "m_tilt",
  "e_tilt",
  "height",
  "site_name",
  "tac",
  "bw",
  "maximum_transmission_power_of_resource",
  "real_transmit_power_of_resource",
  "reference_signal_power",
  "frequency",
];

const DEFAULT_SITE_COLUMN_VALUES = {
  technology: "4G",
  m_tilt: "0",
  e_tilt: "0",
  height: "30",
  site_name: "",
  tac: "",
  bw: "",
  maximum_transmission_power_of_resource: "",
  real_transmit_power_of_resource: "",
  reference_signal_power: "",
  frequency: "",
};

// These values are mandatory in the backend's UploadSitePredictionCsv endpoint.
const REQUIRED_SITE_FIELDS = [
  "site", "sector", "cell_id", "longitude", "latitude", "pci",
  "azimuth", "band", "earfcn", "cluster", "technology",
];

const COORDINATE_LIMITS = { latitude: 90, longitude: 180 };
const DECIMAL_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

const SITE_COLUMN_ALIASES = {
  site: [
    "site",
    "siteid",
    "site_id",
    "sitename",
    "site_name",
    "nodeb",
    "enodeb",
    "gnodeb",
  ],
  sector: ["sector", "sectorid", "sector_id", "sectorname", "sector_name"],
  cell_id: [
    "cell_id",
    "cellid",
    "cell",
    "cellname",
    "cell_name",
    "cid",
    "ecgi",
  ],
  longitude: ["longitude", "long", "lon", "lng", "x"],
  latitude: ["latitude", "lat", "y"],
  pci: ["pci", "physicalcellid", "physical_cell_id", "psc"],
  azimuth: ["azimuth", "azimuthdeg", "azimuth_deg", "bearing", "direction"],
  band: ["band", "frequencyband", "frequency_band", "freqband"],
  earfcn: ["earfcn", "dl_earfcn", "arfcn", "uarfcn", "nrarfcn"],
  cluster: ["cluster", "operator", "network", "provider", "circle"],
  technology: ["technology", "tech", "rat", "networktype", "network_type"],
  site_name: ["site_name", "sitename"],
  tac: ["tac", "trackingareacode", "tracking_area_code"],
  bw: ["bw", "bandwidth", "channelbandwidth", "channel_bandwidth"],
  maximum_transmission_power_of_resource: [
    "maximum_transmission_power_of_resource",
    "maximumTransmissionPowerOfResource",
    "tx_power",
    "txPower",
    "transmit power",
    "transmit_power",
  ],
  real_transmit_power_of_resource: [
    "real_transmit_power_of_resource",
    "realTransmitPowerOfResource",
    "real transmit power",
    "real_transmit_power",
  ],
  reference_signal_power: [
    "reference_signal_power",
    "referenceSignalPower",
    "rs_power",
    "rsPower",
  ],
  frequency: ["frequency", "freq", "carrierfrequency", "carrier_frequency"],
  m_tilt: ["m_tilt", "mtilt", "mechanicaltilt", "mechanical_tilt", "m-tilt"],
  e_tilt: ["e_tilt", "etilt", "electricaltilt", "electrical_tilt", "e-tilt"],
  height: ["height", "antennaheight", "antenna_height", "hgt"],
};

const normalizeHeaderToken = (value = "") =>
  String(value)
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const parseCsvLine = (line = "") => {
  const out = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  out.push(current);
  return out;
};

const toCsvField = (value = "") => {
  const str = String(value ?? "");
  if (!/[",\r\n]/.test(str)) return str;
  return `"${str.replace(/"/g, '""')}"`;
};

const getNormalizedAliasMap = () => {
  const normalizedAliasMap = new Map();
  Object.entries(SITE_COLUMN_ALIASES).forEach(([canonical, aliases]) => {
    aliases.forEach((alias) =>
      normalizedAliasMap.set(normalizeHeaderToken(alias), canonical),
    );
  });
  return normalizedAliasMap;
};

const normalizeBandValue = (value = "") => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const match = raw.match(/^(?:band\s*)?([bBnN])?\s*[-_ ]*\s*(\d{1,3})$/);
  if (!match) return raw;
  const prefix = match[1];
  const number = match[2];
  if (prefix?.toLowerCase() === "n") return `n${number}`;
  if (prefix?.toLowerCase() === "b") return `B${number}`;
  return number;
};

const inferTechnology = (rawBand = "", rawEarfcn = "") => {
  const band = String(rawBand ?? "")
    .trim()
    .toLowerCase();
  if (band.startsWith("n") || band.includes("nr") || band === "5g") return "5G";

  const earfcnNum = Number(String(rawEarfcn ?? "").trim());
  if (Number.isFinite(earfcnNum) && earfcnNum >= 100000) return "5G";
  return "4G";
};

const buildNormalizedSiteCsv = (headers, rows) => {
  const normalizedAliasMap = getNormalizedAliasMap();
  const headerIndexByCanonical = new Map();

  headers.forEach((header, index) => {
    const canonical =
      normalizedAliasMap.get(normalizeHeaderToken(header)) ||
      normalizeHeaderToken(header);
    if (!canonical || headerIndexByCanonical.has(canonical)) return;
    headerIndexByCanonical.set(canonical, index);
  });

  const missingColumns = UPLOAD_SITE_COLUMNS.filter(
    (column) =>
      !headerIndexByCanonical.has(column) &&
      DEFAULT_SITE_COLUMN_VALUES[column] === undefined,
  );

  if (missingColumns.length > 0) {
    return { ok: false, missingColumns };
  }

  const missingFields = new Set();
  let invalidRowCount = 0;
  const exampleRows = [];
  const coordinateErrors = Object.fromEntries(
    Object.keys(COORDINATE_LIMITS).map((field) => [field, { count: 0, examples: [] }]),
  );
  const normalizedRows = rows
    .map((rawRow, index) => {
      if (!rawRow.some((cell) => String(cell ?? "").trim() !== "")) return null;
      const valueByCanonical = {};
      UPLOAD_SITE_COLUMNS.forEach((column) => {
        const idx = headerIndexByCanonical.get(column);
        valueByCanonical[column] =
          idx !== undefined ? String(rawRow[idx] ?? "").trim() : "";
      });

      if (!valueByCanonical.technology) {
        valueByCanonical.technology = inferTechnology(
          valueByCanonical.band,
          valueByCanonical.earfcn,
        );
      }

      valueByCanonical.band = normalizeBandValue(valueByCanonical.band);

      Object.entries(DEFAULT_SITE_COLUMN_VALUES).forEach(
        ([column, fallback]) => {
          if (!valueByCanonical[column]) valueByCanonical[column] = fallback;
        },
      );

      const emptyFields = REQUIRED_SITE_FIELDS.filter(
        (field) => !valueByCanonical[field],
      );
      if (emptyFields.length > 0) {
        invalidRowCount += 1;
        emptyFields.forEach((field) => missingFields.add(field));
        if (exampleRows.length < 5) exampleRows.push(index + 2);
      }

      Object.entries(COORDINATE_LIMITS).forEach(([field, limit]) => {
        const value = valueByCanonical[field];
        // Empty coordinates are already reported as missing mandatory values.
        if (!value) return;
        const number = Number(value);
        if (!DECIMAL_NUMBER.test(value) || !Number.isFinite(number) || Math.abs(number) > limit) {
          const error = coordinateErrors[field];
          error.count += 1;
          if (error.examples.length < 3) {
            error.examples.push(`row ${index + 2}: ${value}`);
          }
        }
      });

      return UPLOAD_SITE_COLUMNS.map(
        (column) => valueByCanonical[column] ?? "",
      );
    })
    .filter(Boolean);

  const validationIssues = [];
  if (invalidRowCount > 0) {
    validationIssues.push(
      `Mandatory fields are missing: ${[...missingFields].join(", ")}. ${invalidRowCount.toLocaleString()} data row(s) have empty required values (for example, file rows ${exampleRows.join(", ")}; the header is row 1).`,
    );
  }
  Object.entries(COORDINATE_LIMITS).forEach(([field, limit]) => {
    const error = coordinateErrors[field];
    if (error.count > 0) {
      validationIssues.push(
        `Invalid ${field} in ${error.count.toLocaleString()} data row(s). ${field === "latitude" ? "Latitude" : "Longitude"} must be a number in decimal degrees between -${limit} and ${limit}. Examples (header is row 1): ${error.examples.join("; ")}.`,
      );
    }
  });
  if (validationIssues.length > 0) {
    return {
      ok: false,
      validationMessage: `${validationIssues.join("\n\n")}\n\nPlease correct these details and upload again. No rows have been uploaded.`,
    };
  }
  if (normalizedRows.length === 0) {
    return {
      ok: false,
      validationMessage: "The file has no site data rows. Please add the required details and upload again.",
    };
  }

  return {
    ok: true,
    csv: [
      UPLOAD_SITE_COLUMNS.map((column) => toCsvField(column)).join(","),
      ...normalizedRows.map((row) =>
        row.map((cell) => toCsvField(cell)).join(","),
      ),
    ].join("\n"),
  };
};

const toCsvFile = (csvContent, originalFile) => {
  const baseName = String(originalFile?.name || "site_upload")
    .replace(/\.[^.]+$/, "")
    .trim();
  return new File([csvContent], `${baseName}_normalized.csv`, {
    type: "text/csv",
  });
};

const decodeXmlText = (value = "") =>
  String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

const getColumnIndexFromCellRef = (cellRef = "") => {
  const letters = String(cellRef).match(/[A-Z]+/i)?.[0]?.toUpperCase();
  if (!letters) return null;

  let index = 0;
  for (let i = 0; i < letters.length; i += 1) {
    index = index * 26 + (letters.charCodeAt(i) - 64);
  }
  return index - 1;
};

const parseSimpleXlsxWorksheet = async (buffer) => {
  const zipModule = await import("jszip");
  const JSZip = zipModule?.default ?? zipModule;
  const zip = await JSZip.loadAsync(buffer);

  const sharedStringsFile = zip.file("xl/sharedStrings.xml");
  const sharedStringsXml = sharedStringsFile
    ? await sharedStringsFile.async("string")
    : "";
  const sharedStrings = Array.from(
    sharedStringsXml.matchAll(/<(?:\w+:)?si[\s\S]*?<\/(?:\w+:)?si>/g),
  ).map((match) =>
    Array.from(
      match[0].matchAll(/<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g),
    )
      .map((textMatch) => decodeXmlText(textMatch[1]))
      .join(""),
  );

  const worksheetFile =
    zip.file("xl/worksheets/sheet1.xml") ||
    zip.file(/xl\/worksheets\/sheet\d+\.xml$/i)?.[0];
  if (!worksheetFile) return { headers: [], rows: [] };

  const worksheetXml = await worksheetFile.async("string");
  const parsedRows = [];
  const rowMatches = worksheetXml.matchAll(
    /<(?:\w+:)?row\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?row>/g,
  );

  for (const rowMatch of rowMatches) {
    const cells = [];
    const cellMatches = rowMatch[2].matchAll(
      /<(?:\w+:)?c\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>/g,
    );

    for (const cellMatch of cellMatches) {
      const attrs = cellMatch[1] || "";
      const body = cellMatch[2] || "";
      const cellRef = attrs.match(/\br="([^"]+)"/)?.[1] || "";
      const columnIndex = getColumnIndexFromCellRef(cellRef);
      if (columnIndex === null) continue;

      const type = attrs.match(/\bt="([^"]+)"/)?.[1] || "";
      const valueMatch = body.match(
        /<(?:\w+:)?v[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/,
      );
      const inlineMatch = body.match(
        /<(?:\w+:)?is[^>]*>([\s\S]*?)<\/(?:\w+:)?is>/,
      );
      let value = "";

      if (type === "s" && valueMatch) {
        value = sharedStrings[Number(valueMatch[1])] || "";
      } else if (type === "inlineStr" && inlineMatch) {
        value = Array.from(
          inlineMatch[1].matchAll(
            /<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g,
          ),
        )
          .map((textMatch) => decodeXmlText(textMatch[1]))
          .join("");
      } else if (valueMatch) {
        value = decodeXmlText(valueMatch[1]);
      }

      cells[columnIndex] = String(value).trim();
    }

    parsedRows.push(cells.map((cell) => cell ?? ""));
  }

  return {
    headers: parsedRows[0] || [],
    rows: parsedRows.slice(1),
  };
};

export const normalizeSiteUploadFile = async (file) => {
  const fileName = String(file?.name || "").toLowerCase();
  const fileType = String(file?.type || "").toLowerCase();

  const isCsv = fileName.endsWith(".csv") || fileType.includes("csv");
  const isXlsx =
    fileName.endsWith(".xlsx") ||
    fileType.includes("spreadsheetml") ||
    fileType.includes("excel");

  if (isCsv) {
    const content = await file.text();
    const lines = content.split(/\r?\n/);
    const headers = parseCsvLine(lines[0] || "");
    const rows = lines.slice(1).map((line) => parseCsvLine(line));
    const normalized = buildNormalizedSiteCsv(headers, rows);
    if (!normalized.ok) return normalized;
    return { ok: true, file: toCsvFile(normalized.csv, file) };
  }

  if (isXlsx) {
    const buffer = await file.arrayBuffer();

    let headers = [];
    let rows = [];

    try {
      const excelModule = await import("exceljs");
      const ExcelJS = excelModule?.default ?? excelModule;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const worksheet = workbook.worksheets?.[0];
      if (!worksheet) return { ok: false, missingColumns: ["sheet"] };

      const cellToString = (cellValue) => {
        if (cellValue == null) return "";
        if (typeof cellValue === "object") {
          if (Array.isArray(cellValue.richText)) {
            return cellValue.richText.map((part) => part?.text || "").join("");
          }
          if (cellValue.text != null) return String(cellValue.text);
          if (cellValue.result != null) return String(cellValue.result);
        }
        return String(cellValue);
      };

      const headerRow = worksheet.getRow(1);
      for (let col = 1; col <= headerRow.cellCount; col += 1) {
        headers.push(cellToString(headerRow.getCell(col).value).trim());
      }

      for (let rowNo = 2; rowNo <= worksheet.rowCount; rowNo += 1) {
        const row = worksheet.getRow(rowNo);
        const rowValues = [];
        for (let col = 1; col <= headers.length; col += 1) {
          rowValues.push(cellToString(row.getCell(col).value).trim());
        }
        rows.push(rowValues);
      }
    } catch {
      const parsedWorksheet = await parseSimpleXlsxWorksheet(buffer);
      headers = parsedWorksheet.headers;
      rows = parsedWorksheet.rows;
    }

    if (!headers.length) return { ok: false, missingColumns: ["sheet"] };

    const normalized = buildNormalizedSiteCsv(headers, rows);
    if (!normalized.ok) return normalized;
    return { ok: true, file: toCsvFile(normalized.csv, file) };
  }

  return { ok: false, missingColumns: ["unsupported_file_type"] };
};

export const getSiteUploadValidationMessage = (result) => {
  if (result.ok) return "";
  if (result.validationMessage) return result.validationMessage;
  if (result.missingColumns?.includes("unsupported_file_type")) {
    return "Unsupported file type. Please upload CSV or XLSX.";
  }
  if (result.missingColumns?.includes("sheet")) {
    return "The file has no worksheet with site data. Please add the required details and upload again.";
  }
  return `Mandatory columns are missing: ${result.missingColumns.join(", ")}. Please add these columns, fill in the required details for every row, and upload again. No rows have been uploaded.`;
};
