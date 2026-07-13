// Extracts L3 signaling and Event CSV files from an uploaded ZIP.
// Matches "L3*.csv" / "*L3*.csv" and "Event*.csv" / "*Event*.csv" (case-insensitive)
// anywhere in the archive, including nested folders.

let jsZipModulePromise = null;
const loadJSZip = async () => {
  if (!jsZipModulePromise) {
    jsZipModulePromise = import("jszip").then((mod) => mod.default || mod);
  }
  return jsZipModulePromise;
};

const isCsv = (name) => /\.csv$/i.test(name);
const isL3File = (name) => /l3/i.test(name);
const isEventFile = (name) => /event/i.test(name);

export async function extractL3AndEventFiles(zipFile) {
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
