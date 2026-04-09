export const CHART_COLORS = [
  '#E6194B', // vivid red
  '#3CB44B', // green
  '#0082C8', // strong blue
  '#F58231', // orange
  '#911EB4', // purple
  '#46F0F0', // cyan
  '#F032E6', // magenta
  '#D2F53C', // lime
  '#FABEBE', // light pink
  '#008080', // teal
];

export const NETWORK_COLORS = {
  '5G': '#6F00FF',   // bright violet
  '4G': '#0074D9',   // bold blue
  '3G': '#2ECC40',   // green
  '2G': '#FFDC00',   // yellow
};

export const RSRP_COLORS = {
  EXCELLENT: '#00C851',   // bright green
  GOOD: '#B8E986',        // soft green
  FAIR: '#33B5E5',        // sky blue
  POOR: '#FFBB33',        // amber
  VERY_POOR: '#FF4444',   // strong red
  BAD: '#CC0000',         // deep red
  VERY_BAD: '#800000',    // dark maroon
};

export const METRICS = [
  { 
    value: 'rsrp', 
    label: 'RSRP (dBm)', 
    desc: 'Reference Signal Received Power', 
    icon: '📶',
    unit: 'dBm',
    domain: [-120, -60],
  },
  { 
    value: 'rsrq', 
    label: 'RSRQ (dB)', 
    desc: 'Reference Signal Received Quality', 
    icon: '📊',
    unit: 'dB',
    domain: [-20, -3],
  },
  { 
    value: 'sinr', 
    label: 'SINR (dB)', 
    desc: 'Signal to Interference plus Noise Ratio', 
    icon: '📡',
    unit: 'dB',
    domain: [-5, 30],
  },
  { 
    value: 'mos', 
    label: 'MOS', 
    desc: 'Mean Opinion Score (1-5)', 
    icon: '⭐',
    unit: '',
    domain: [1, 5],
  },
  { 
    value: 'jitter', 
    label: 'Jitter (ms)', 
    desc: 'Variation in packet delay', 
    icon: '⚡',
    unit: 'ms',
    domain: [0, 'auto'],
  },
  { 
    value: 'latency', 
    label: 'Latency (ms)', 
    desc: 'Round-trip time', 
    icon: '⏱️',
    unit: 'ms',
    domain: [0, 'auto'],
  },
  { 
    value: 'packetLoss', 
    label: 'Packet Loss (%)', 
    desc: 'Percentage of lost packets', 
    icon: '📉',
    unit: '%',
    domain: [0, 'auto'],
  },
  { 
    value: 'dlTpt', 
    label: 'DL Throughput (Mbps)', 
    desc: 'Download Speed', 
    icon: '⬇️',
    unit: 'Mbps',
    domain: [0, 'auto'],
  },
  { 
    value: 'ulTpt', 
    label: 'UL Throughput (Mbps)', 
    desc: 'Upload Speed', 
    icon: '⬆️',
    unit: 'Mbps',
    domain: [0, 'auto'],
  },
];

export const TOOLTIP_STYLE = {
  backgroundColor: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '12px',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  color: '#111827'
};
