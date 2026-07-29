// Extracts L3 signaling and Event data from uploaded CSV files, ZIP archives,
// or Excel workbooks. CSV/ZIP modes match file names containing "L3" / "Event".
// Excel mode matches worksheet names containing "L3" / "Event".

let jsZipModulePromise = null;
const loadJSZip = async () => {
  if (!jsZipModulePromise) {
    jsZipModulePromise = import("jszip").then((mod) => mod.default || mod);
  }
  return jsZipModulePromise;
};

let excelJsModulePromise = null;
const loadExcelJS = async () => {
  if (!excelJsModulePromise) {
    excelJsModulePromise = import("exceljs").then((mod) => mod.default || mod);
  }
  return excelJsModulePromise;
};

const isCsv = (name) => /\.csv$/i.test(name);
const isZip = (name) => /\.zip$/i.test(name);
const isExcel = (name) => /\.xlsx$/i.test(name);
const isL3File = (name) => /l3/i.test(name);
const isEventFile = (name) => /event/i.test(name);

const cellToString = (cellValue) => {
  if (cellValue == null) return "";
  if (typeof cellValue === "object") {
    if (Array.isArray(cellValue.richText)) {
      return cellValue.richText.map((part) => part?.text || "").join("");
    }
    if (cellValue.text != null) return String(cellValue.text);
    if (cellValue.result != null) return String(cellValue.result);
    if (cellValue.formula != null && cellValue.value != null) return String(cellValue.value);
  }
  return String(cellValue);
};

const toCsvCell = (value) => {
  const normalized = String(value ?? "");
  return /[",\n\r]/.test(normalized)
    ? `"${normalized.replace(/"/g, '""')}"`
    : normalized;
};

const worksheetToCsvText = (worksheet) => {
  const maxColumns = Math.max(
    0,
    ...Array.from({ length: worksheet.rowCount }, (_, index) => worksheet.getRow(index + 1).cellCount),
  );

  const lines = [];
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = [];
    for (let col = 1; col <= maxColumns; col += 1) {
      values.push(toCsvCell(cellToString(row.getCell(col).value).trim()));
    }

    if (values.some((value) => value !== "")) {
      lines.push(values.join(","));
    }
  }

  return lines.join("\n");
};

async function extractFromZip(zipFile) {
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(zipFile);

  const l3Files = [];
  const eventFiles = [];

  const entries = Object.values(zip.files).filter((entry) => !entry.dir && isCsv(entry.name));

  for (const entry of entries) {
    const baseName = entry.name.split("/").pop() || entry.name;
    const matchesL3 = isL3File(baseName);
    const matchesEvent = isEventFile(baseName);
    if (!matchesL3 && !matchesEvent) continue;

    const text = await entry.async("string");
    if (matchesL3) l3Files.push({ name: entry.name, text });
    if (matchesEvent) eventFiles.push({ name: entry.name, text });
  }

  return { l3Files, eventFiles };
}

async function extractFromCsv(csvFile) {
  const fileName = String(csvFile?.name || "");
  const text = await csvFile.text();
  const fileRecord = { name: fileName, text };

  return {
    l3Files: isL3File(fileName) ? [fileRecord] : [],
    eventFiles: isEventFile(fileName) ? [fileRecord] : [],
  };
}

async function extractFromExcel(workbookFile) {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  const buffer = await workbookFile.arrayBuffer();
  await workbook.xlsx.load(buffer);

  const l3Files = [];
  const eventFiles = [];

  for (const worksheet of workbook.worksheets) {
    const sheetName = worksheet.name || "Sheet";
    const matchesL3 = isL3File(sheetName);
    const matchesEvent = isEventFile(sheetName);
    if (!matchesL3 && !matchesEvent) continue;

    const text = worksheetToCsvText(worksheet);
    if (!text) continue;

    const fileRecord = { name: `${sheetName}.csv`, text };
    if (matchesL3) l3Files.push(fileRecord);
    if (matchesEvent) eventFiles.push(fileRecord);
  }

  return { l3Files, eventFiles };
}

export async function extractL3AndEventFiles(zipFile) {
  const fileName = String(zipFile?.name || "");

  if (isCsv(fileName)) {
    return extractFromCsv(zipFile);
  }

  if (isZip(fileName)) {
    return extractFromZip(zipFile);
  }

  if (isExcel(fileName)) {
    return extractFromExcel(zipFile);
  }

  throw new Error("Unsupported file type");
}
