import { RSRP_COLORS } from '@/components/constants/dashboardConstants';

export const getRSRPPointColor = (rsrp) => {
  if (rsrp < -115) return RSRP_COLORS.VERY_BAD;
  if (rsrp <= -105) return RSRP_COLORS.BAD;
  if (rsrp <= -95) return RSRP_COLORS.VERY_POOR;
  if (rsrp <= -90) return RSRP_COLORS.POOR;
  if (rsrp <= -85) return RSRP_COLORS.FAIR;
  if (rsrp <= -75) return RSRP_COLORS.GOOD;
  return RSRP_COLORS.EXCELLENT;
};

export const getRSRQColor = (v) => 
  v < -15 ? '#EF4444' : v < -10 ? '#F59E0B' : v < -8 ? '#3B82F6' : '#10B981';

export const getSINRColor = (v) => 
  v < 0 ? '#EF4444' : v < 10 ? '#F59E0B' : v < 20 ? '#3B82F6' : '#10B981';

export const getMOSColor = (v) => 
  v < 2 ? '#EF4444' : v < 3 ? '#F59E0B' : v < 4 ? '#3B82F6' : '#10B981';

export const getJitterColor = (v) => 
  v > 30 ? '#EF4444' : v > 20 ? '#F59E0B' : v > 10 ? '#3B82F6' : '#10B981';

export const getLatencyColor = (v) => 
  v > 100 ? '#EF4444' : v > 50 ? '#F59E0B' : v > 20 ? '#3B82F6' : '#10B981';

export const getPacketLossColor = (v) => 
  v > 5 ? '#EF4444' : v > 2 ? '#F59E0B' : v > 0.5 ? '#3B82F6' : '#10B981';

export const getThroughputColor = (v, isDownload = true) => {
  const threshold = isDownload ? [10, 50, 100] : [5, 20, 50];
  if (v < threshold[0]) return '#EF4444';
  if (v < threshold[1]) return '#F59E0B';
  if (v < threshold[2]) return '#3B82F6';
  return '#10B981';
};

export const getMetricColorFunction = (metric) => {
  const colorFunctions = {
    rsrp: getRSRPPointColor,
    rsrq: getRSRQColor,
    sinr: getSINRColor,
    mos: getMOSColor,
    jitter: getJitterColor,
    latency: getLatencyColor,
    packetLoss: getPacketLossColor,
    dlTpt: (v) => getThroughputColor(v, true),
    ulTpt: (v) => getThroughputColor(v, false),
  };
  
  return colorFunctions[metric] || getRSRPPointColor;
};

export const formatNumber = (v) => {
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v;
};