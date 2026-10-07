import JSZip from 'jszip'
import { parseCsvRows, parseLogsCsv } from './excelPlan.js'
import { INDOOR_LOG_KPIS } from './indoorLogKpis.js'

const MAX_NETWORK_CSV_BYTES = 20 * 1024 * 1024
const MAX_COLOR_CSV_BYTES = 1024 * 1024
const KPI_KEYS = new Set(INDOOR_LOG_KPIS.map((kpi) => kpi.key))

const csvEntry = (zip, pattern) => Object.values(zip.files).find((entry) => !entry.dir && pattern.test(entry.name.split('/').pop()))

const webColor = (value) => {
  const color = String(value || '').trim()
  if (/^#[0-9a-f]{8}$/i.test(color)) return `#${color.slice(3)}`
  return /^#[0-9a-f]{6}$/i.test(color) ? color : null
}

export const parseZipColorSettings = (csv) => {
  const rows = parseCsvRows(csv)
  if (rows.length < 2) return {}
  const headers = rows[0].map((value) => String(value || '').trim().toLowerCase())
  const result = {}
  for (const values of rows.slice(1)) {
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]))
    const key = String(row.metric || '').trim().toLowerCase()
    const min = Number(row.min)
    const max = Number(row.max)
    const color = webColor(row.color)
    if (!KPI_KEYS.has(key) || String(row.type || '').trim().toUpperCase() !== 'RANGE' || !Number.isFinite(min) || !Number.isFinite(max) || max <= min || !color) continue
    if (!result[key]) result[key] = []
    result[key].push({ min, max, color, label: String(row.label || '').trim() })
  }
  Object.values(result).forEach((ranges) => ranges.sort((a, b) => a.min - b.min))
  return result
}

export const parseIndoorLogZip = async (buffer, selectedFloorId, alignment) => {
  const zip = await JSZip.loadAsync(buffer)
  const networkEntry = csvEntry(zip, /^NetworkLog_.*\.csv$/i)
  if (!networkEntry) return { error: 'ZIP has no NetworkLog_*.csv file.' }
  if (networkEntry._data?.uncompressedSize > MAX_NETWORK_CSV_BYTES) return { error: 'Network log CSV in ZIP is too large.' }
  const networkCsv = await networkEntry.async('string')
  if (networkCsv.length > MAX_NETWORK_CSV_BYTES) return { error: 'Network log CSV in ZIP is too large.' }
  const parsed = parseLogsCsv(networkCsv, null, selectedFloorId, alignment)
  if (parsed.error) return parsed
  const colorEntry = csvEntry(zip, /^ColorSettings_.*\.csv$/i)
  let zipThresholds = {}
  if (colorEntry && colorEntry._data?.uncompressedSize <= MAX_COLOR_CSV_BYTES) {
    const colorCsv = await colorEntry.async('string')
    if (colorCsv.length <= MAX_COLOR_CSV_BYTES) zipThresholds = parseZipColorSettings(colorCsv)
  }
  return { ...parsed, sourceName: networkEntry.name.split('/').pop(), zipThresholds }
}
