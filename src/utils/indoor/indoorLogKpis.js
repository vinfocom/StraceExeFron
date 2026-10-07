const RED = '#dc2626'
const ORANGE = '#f97316'
const YELLOW = '#eab308'
const LIME = '#84cc16'
const GREEN = '#16a34a'

const bands = (edges, colors, unit) => colors.map((color, index) => {
  const min = index === 0 ? -Infinity : edges[index - 1]
  const max = index === edges.length ? Infinity : edges[index]
  const label = (index === 0 ? `< ${max} ${unit}` : index === edges.length ? `≥ ${min} ${unit}` : `${min} to ${max} ${unit}`).trim()
  return { min, max, color, label }
})

const highIsGood = [RED, ORANGE, YELLOW, LIME, GREEN]
const lowIsGood = [...highIsGood].reverse()

export const INDOOR_LOG_KPIS = [
  { key: 'rsrp', label: 'RSRP', unit: 'dBm', columns: ['ssRSRP / RSRP / RSCP', 'RSRP', 'LTE RSRP', 'Disp RSRP (dBm)', 'Disp NR ssRSRP (dBm)', 'csiRsrp'], thresholds: bands([-120, -110, -100, -90], highIsGood, 'dBm') },
  { key: 'rsrq', label: 'RSRQ', unit: 'dB', columns: ['ssRSRQ / RSRQ / EcNo', 'RSRQ', 'LTE RSRQ', 'Disp RSRQ (dB)', 'Disp NR ssRSRQ (dB)', 'csiRsrq'], thresholds: bands([-20, -15, -12, -9], highIsGood, 'dB') },
  { key: 'sinr', label: 'SINR', unit: 'dB', columns: ['NR-SINR / SINR / RxQual', 'SINR', 'LTE SINR', 'Disp RSSNR/SINR (dB)', 'Disp NR ssSINR (dB)', 'csiSinr'], thresholds: bands([0, 5, 10, 20], highIsGood, 'dB') },
  { key: 'rssi', label: 'RSSI', unit: 'dBm', columns: ['RSSI  (2G-RxLEV)', 'RSSI', 'Disp RSSI (dBm)'], thresholds: bands([-100, -90, -80, -70], highIsGood, 'dBm') },
  { key: 'dl_thpt', label: 'DL throughput', unit: 'Mbps', columns: ['DL THPT', 'DL Delivered (Mbps)', 'dl_tpt'], thresholds: bands([1, 5, 20, 50], highIsGood, 'Mbps') },
  { key: 'ul_thpt', label: 'UL throughput', unit: 'Mbps', columns: ['UL THPT', 'UL Delivered (Mbps)', 'ul_tpt'], thresholds: bands([1, 5, 20, 50], highIsGood, 'Mbps') },
  { key: 'mos', label: 'MOS', unit: '', columns: ['MOS'], thresholds: bands([2, 3, 3.5, 4], highIsGood, '') },
  { key: 'jitter', label: 'Jitter', unit: 'ms', columns: ['Jitter'], thresholds: bands([10, 20, 40, 80], lowIsGood, 'ms') },
  { key: 'latency', label: 'Latency', unit: 'ms', columns: ['Latency'], thresholds: bands([50, 100, 200, 400], lowIsGood, 'ms') },
  { key: 'packet_loss', label: 'Packet loss', unit: '%', columns: ['Packet Loss'], thresholds: bands([1, 2, 5, 10], lowIsGood, '%') },
  { key: 'cqi', label: 'CQI', unit: '', columns: ['CQI', 'Disp CQI'], thresholds: bands([4, 7, 10, 13], highIsGood, '') },
  { key: 'level', label: 'Signal level', unit: '', columns: ['Level', 'Disp Overall Level (0-4)', 'Disp Level (0-4)'], thresholds: bands([1, 2, 3, 4], highIsGood, '') },
  { key: 'dl_bler', label: 'DL BLER', unit: '%', columns: ['DL BLER', 'NR DL BLER (%)'], thresholds: bands([1, 2, 5, 10], lowIsGood, '%') },
]

export const normalizeLogColumn = (column) => String(column).replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

export const readLogKpi = (fields, kpi) => {
  for (const column of kpi.columns) {
    const value = fields[normalizeLogColumn(column)]
    if (value === undefined || value === null || String(value).trim() === '') continue
    const number = Number(value)
    if (Number.isFinite(number) && Math.abs(number) !== 2147483647) return number
  }
  return null
}

export const getAvailableLogKpis = (logs) => INDOOR_LOG_KPIS.filter((kpi) => logs.some((log) => {
  const value = log[kpi.key]
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
}))

export const getFallbackLogKpiColor = (value, metric) => {
  const kpi = INDOOR_LOG_KPIS.find((item) => item.key === metric)
  const number = Number(value)
  if (!kpi || value === null || value === undefined || value === '' || !Number.isFinite(number)) return '#808080'
  return kpi.thresholds.find((threshold) => number >= threshold.min && number < threshold.max)?.color || '#808080'
}
