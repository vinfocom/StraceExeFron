import React, { useState, useEffect, useMemo, useRef } from 'react';
import { toast } from 'react-toastify';
import {
  Box,
  TextField,
  Typography,
  Grid,
  Chip,
  Fade,
  ToggleButton,
  ToggleButtonGroup,
  alpha,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  SignalCellularAlt,
  SignalCellular4Bar,
  Circle,
} from '@mui/icons-material';
import ChartCard from '../ChartCard';
import { useCoverageRanking, useQualityRanking } from '@/hooks/useDashboardData.js';
import { formatNumber } from '@/utils/chartUtils';

const OPERATOR_COLORS = {
  jio: { primary: '#0a3d91', light: '#e3f2fd', dark: '#0d47a1' },
  airtel: { primary: '#E40000', light: '#ffebee', dark: '#b71c1c' },
  vi: { primary: '#FFB800', light: '#fff8e1', dark: '#f57f17' },
  vodafone: { primary: '#e60000', light: '#ffebee', dark: '#c62828' },
  yas: { primary: '#7b1fa2', light: '#f3e5f5', dark: '#4a148c' },
  bsnl: { primary: '#00A651', light: '#e8f5e9', dark: '#1b5e20' },
};

const getOperatorConfig = (name) => {
  if (!name) return { primary: '#607D8B', light: '#ECEFF1', dark: '#455A64' };
  
  const nameLower = name.toLowerCase();
  
  if (nameLower.includes('jio')) return OPERATOR_COLORS.jio;
  if (nameLower.includes('airtel') || nameLower.includes('bharti')) return OPERATOR_COLORS.airtel;
  if (nameLower.includes('yas')) return OPERATOR_COLORS.yas;
  if (nameLower.includes('vi') || nameLower.includes('vodafone') || nameLower.includes('idea')) return OPERATOR_COLORS.vi;
  if (nameLower.includes('bsnl')) return OPERATOR_COLORS.bsnl;
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  
  return { 
    primary: `hsl(${hue}, 70%, 45%)`, 
    light: `hsl(${hue}, 70%, 95%)`, 
    dark: `hsl(${hue}, 70%, 30%)` 
  };
};

const isValidOperatorName = (name) => {
  if (!name || typeof name !== 'string') return false;
  const cleanName = name.toLowerCase().trim();
  return (
    cleanName !== '' &&
    cleanName !== 'unknown' &&
    cleanName !== 'null' &&
    cleanName !== 'undefined' &&
    cleanName !== 'n/a' &&
    cleanName !== 'na' &&
    cleanName !== '-' &&
    cleanName !== '000 000' &&
    cleanName !== '000000' &&
    !/^0+[\s]*0*$/.test(cleanName) &&
    !/^[\s0\-]+$/.test(cleanName) &&
    !cleanName.includes('unknown') &&
    cleanName.length > 1
  );
};

const OperatorRankingChart = ({ chartFilters, onChartFiltersChange }) => {
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const isMediumDown = useMediaQuery(theme.breakpoints.down('md'));

  const [chartType, setChartType] = useState('coverage');
  const [hoveredOperator, setHoveredOperator] = useState(null);
  const gaugeHostRef = useRef(null);
  const [gaugeHostWidth, setGaugeHostWidth] = useState(260);

  const [coverageSettings, setCoverageSettings] = useState({ rsrpMin: -95, rsrpMax: 0 });
  const [qualitySettings, setQualitySettings] = useState({ rsrqMin: -10, rsrqMax: 0 });

  const [coverageDraft, setCoverageDraft] = useState({ rsrpMin: '-95', rsrpMax: '0' });
  const [qualityDraft, setQualityDraft] = useState({ rsrqMin: '-10', rsrqMax: '0' });

  const { data: coverageData, isLoading: coverageLoading } = useCoverageRanking(
    coverageSettings.rsrpMin,
    coverageSettings.rsrpMax,
    chartFilters || {}
  );

  const { data: qualityData, isLoading: qualityLoading } = useQualityRanking(
    qualitySettings.rsrqMin,
    qualitySettings.rsrqMax,
    chartFilters || {}
  );

  const currentData = chartType === 'coverage' ? coverageData : qualityData;
  const isLoading = chartType === 'coverage' ? coverageLoading : qualityLoading;

  const chartData = useMemo(() => {
    if (!currentData || currentData.length === 0) return [];

    const filteredData = currentData.filter((item) => isValidOperatorName(item.name));

    const total = filteredData.reduce((sum, item) => sum + (item.value || 0), 0);

    return filteredData
      .sort((a, b) => b.value - a.value)
      .map((item, index) => {
        const config = getOperatorConfig(item.name);
        return {
          id: index,
          value: item.value,
          label: item.name,
          percentage: total > 0 ? parseFloat(((item.value / total) * 100).toFixed(1)) : 0,
          color: config.primary,
          lightColor: config.light,
          darkColor: config.dark,
          rank: index + 1,
        };
      });
  }, [currentData]);

  const stats = useMemo(() => {
    if (chartData.length === 0) return { total: 0, average: 0 };
    const total = chartData.reduce((sum, item) => sum + item.value, 0);
    const average = total / chartData.length;
    return { total, average };
  }, [chartData]);

  useEffect(() => {
    setCoverageDraft({
      rsrpMin: String(coverageSettings.rsrpMin),
      rsrpMax: String(coverageSettings.rsrpMax),
    });
  }, [coverageSettings]);

  useEffect(() => {
    setQualityDraft({
      rsrqMin: String(qualitySettings.rsrqMin),
      rsrqMax: String(qualitySettings.rsrqMax),
    });
  }, [qualitySettings]);

  const applyCoverageSettings = () => {
    const rsrpMin = Number(coverageDraft.rsrpMin);
    const rsrpMax = Number(coverageDraft.rsrpMax);
    if (isNaN(rsrpMin) || isNaN(rsrpMax)) {
      return toast.warn('Please enter valid numbers for RSRP range');
    }
    if (rsrpMin > rsrpMax) {
      return toast.warn('RSRP: Min cannot be greater than Max');
    }
    setCoverageSettings({ rsrpMin, rsrpMax });
  };

  const applyQualitySettings = () => {
    const rsrqMin = Number(qualityDraft.rsrqMin);
    const rsrqMax = Number(qualityDraft.rsrqMax);
    if (isNaN(rsrqMin) || isNaN(rsrqMax)) {
      return toast.warn('Please enter valid numbers for RSRQ range');
    }
    if (rsrqMin > rsrqMax) {
      return toast.warn('RSRQ: Min cannot be greater than Max');
    }
    setQualitySettings({ rsrqMin, rsrqMax });
  };

  const handleChartTypeChange = (event, newType) => {
    if (newType !== null) {
      setChartType(newType);
    }
  };

  useEffect(() => {
    const host = gaugeHostRef.current;
    if (!host) return undefined;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setGaugeHostWidth(Math.max(150, Math.floor(entry.contentRect.width)));
    });

    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const getTitle = () => {
    if (isMediumDown) {
      return chartType === 'coverage' ? 'Coverage Ranking' : 'Quality Ranking';
    }
    if (chartType === 'coverage') {
      return `Coverage Ranking (RSRP ${coverageSettings.rsrpMin} to ${coverageSettings.rsrpMax} dBm)`;
    }
    return `Quality Ranking (RSRQ ${qualitySettings.rsrqMin} to ${qualitySettings.rsrqMax} dB)`;
  };

  const renderSettings = () => (
    <Box sx={{ p: 2 }}>
      {chartType === 'coverage' ? (
        <Fade in>
          <Box>
            <Typography variant="subtitle2" fontWeight="700" gutterBottom color="primary">
              RSRP Range (dBm)
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Min"
                  value={coverageDraft.rsrpMin}
                  onChange={(e) => setCoverageDraft((s) => ({ ...s, rsrpMin: e.target.value }))}
                  size="small"
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Max"
                  value={coverageDraft.rsrpMax}
                  onChange={(e) => setCoverageDraft((s) => ({ ...s, rsrpMax: e.target.value }))}
                  size="small"
                />
              </Grid>
            </Grid>
          </Box>
        </Fade>
      ) : (
        <Fade in>
          <Box>
            <Typography variant="subtitle2" fontWeight="700" gutterBottom sx={{ color: '#f57c00' }}>
              RSRQ Range (dB)
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Min"
                  value={qualityDraft.rsrqMin}
                  onChange={(e) => setQualityDraft((s) => ({ ...s, rsrqMin: e.target.value }))}
                  size="small"
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Max"
                  value={qualityDraft.rsrqMax}
                  onChange={(e) => setQualityDraft((s) => ({ ...s, rsrqMax: e.target.value }))}
                  size="small"
                />
              </Grid>
            </Grid>
          </Box>
        </Fade>
      )}
    </Box>
  );

  const HeaderToggleButtons = () => (
    <ToggleButtonGroup
      value={chartType}
      exclusive
      onChange={handleChartTypeChange}
      size="small"
      sx={{
        '& .MuiToggleButton-root': {
          fontSize: isSmallScreen ? '10px' : '11px',
          py: isSmallScreen ? 0.25 : 0.4,
          px: isSmallScreen ? 0.6 : 1.2,
          textTransform: 'none',
          fontWeight: 600,
          border: '1px solid #ddd',
          '&.Mui-selected': {
            color: '#fff',
          },
        },
      }}
    >
      <ToggleButton
        value="coverage"
        sx={{
          '&.Mui-selected': {
            background: 'linear-gradient(135deg, #1565c0, #42a5f5)',
          },
        }}
      >
        <SignalCellular4Bar sx={{ fontSize: 14, mr: isSmallScreen ? 0.3 : 0.5 }} />
        {isSmallScreen ? 'Cov' : 'Coverage'}
      </ToggleButton>
      <ToggleButton
        value="quality"
        sx={{
          '&.Mui-selected': {
            background: 'linear-gradient(135deg, #ef6c00, #ffb74d)',
          },
        }}
      >
        <SignalCellularAlt sx={{ fontSize: 14, mr: isSmallScreen ? 0.3 : 0.5 }} />
        {isSmallScreen ? 'Qual' : 'Quality'}
      </ToggleButton>
    </ToggleButtonGroup>
  );

  const gaugeSize = useMemo(() => {
    const max = isSmallScreen ? 220 : 290;
    const min = isSmallScreen ? 150 : 180;
    return Math.min(max, Math.max(min, gaugeHostWidth - 20));
  }, [gaugeHostWidth, isSmallScreen]);

  const MultiRingGauge = ({ size }) => {
    const centerX = size / 2;
    const centerY = size / 2;
    const maxRings = Math.min(chartData.length, 12);
    const innerMinRadius = Math.max(20, Math.floor(size * 0.11));
    const outerPadding = Math.max(10, Math.floor(size * 0.07));
    const availableSpan = Math.max(1, (size / 2) - outerPadding - innerMinRadius);
    const ringStep = maxRings > 1 ? availableSpan / (maxRings - 1) : availableSpan;
    const ringWidth = Math.max(4, Math.min(12, ringStep * 0.72));
    const gap = Math.max(1, ringStep - ringWidth);
    const ringsToRender = chartData.slice(0, maxRings);
    const startAngle = -135;
    const endAngle = 135;
    const totalAngle = endAngle - startAngle;

    const getArcPath = (radius, percentage) => {
      const angle = (percentage / 100) * totalAngle;
      const startRad = (startAngle * Math.PI) / 180;
      const endRad = ((startAngle + angle) * Math.PI) / 180;

      const x1 = centerX + radius * Math.cos(startRad);
      const y1 = centerY + radius * Math.sin(startRad);
      const x2 = centerX + radius * Math.cos(endRad);
      const y2 = centerY + radius * Math.sin(endRad);

      const largeArc = angle > 180 ? 1 : 0;

      return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
    };

    const getBackgroundArcPath = (radius) => {
      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;

      const x1 = centerX + radius * Math.cos(startRad);
      const y1 = centerY + radius * Math.sin(startRad);
      const x2 = centerX + radius * Math.cos(endRad);
      const y2 = centerY + radius * Math.sin(endRad);

      return `M ${x1} ${y1} A ${radius} ${radius} 0 1 1 ${x2} ${y2}`;
    };

    return (
      <Box sx={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size}>
          {ringsToRender.map((item, index) => {
            const radius = (size / 2) - outerPadding - index * (ringWidth + gap);
            const isHovered = hoveredOperator === item.id;

            if (radius < innerMinRadius) return null;

            return (
              <g
                key={item.id}
                onMouseEnter={() => setHoveredOperator(item.id)}
                onMouseLeave={() => setHoveredOperator(null)}
                style={{ cursor: 'pointer' }}
              >
                <path
                  d={getBackgroundArcPath(radius)}
                  fill="none"
                  stroke={alpha(item.color, 0.15)}
                  strokeWidth={ringWidth}
                  strokeLinecap="round"
                />
                <path
                  d={getArcPath(radius, item.percentage)}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={isHovered ? ringWidth + 3 : ringWidth}
                  strokeLinecap="round"
                  style={{
                    filter: isHovered ? `drop-shadow(0 0 6px ${item.color})` : 'none',
                    transition: 'all 0.3s ease',
                  }}
                />
              </g>
            );
          })}
        </svg>

        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          {hoveredOperator !== null ? (
            <Fade in>
              <Box>
                <Typography
                  fontWeight="900"
                  sx={{ color: chartData[hoveredOperator]?.color, lineHeight: 1, fontSize: isSmallScreen ? '13px' : '16px' }}
                >
                  {chartData[hoveredOperator]?.percentage}%
                </Typography>
                <Typography
                  fontWeight="700"
                  sx={{ color: chartData[hoveredOperator]?.darkColor, fontSize: isSmallScreen ? '8px' : '9px' }}
                >
                  {chartData[hoveredOperator]?.label}
                </Typography>
                <Typography sx={{ color: '#888', fontSize: isSmallScreen ? '7px' : '8px' }}>
                  {formatNumber(chartData[hoveredOperator]?.value)}
                </Typography>
              </Box>
            </Fade>
          ) : (
            <Box>
              <Typography
                fontWeight="900"
                sx={{
                  fontSize: isSmallScreen ? '12px' : '14px',
                  background: chartType === 'coverage'
                    ? 'linear-gradient(135deg, #1565c0, #42a5f5)'
                    : 'linear-gradient(135deg, #ef6c00, #ffb74d)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  lineHeight: 1,
                }}
              >
                {formatNumber(stats.total)}
              </Typography>
              <Typography sx={{ color: '#666', fontSize: isSmallScreen ? '7px' : '8px' }}>
                Total Samples
              </Typography>
              <Typography sx={{ color: '#999', fontSize: isSmallScreen ? '6px' : '7px' }}>
                {chartData.length} Operators
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    );
  };

  const CompactLegend = () => (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 0.5,
        justifyContent: 'center',
        width: '100%',
      }}
    >
      {chartData.map((item) => (
        <Chip
          key={item.id}
          size="small"
          icon={<Circle sx={{ fontSize: '6px !important', color: `${item.color} !important` }} />}
          label={`${item.label}: ${item.percentage}%`}
          onMouseEnter={() => setHoveredOperator(item.id)}
          onMouseLeave={() => setHoveredOperator(null)}
          sx={{
            height: isSmallScreen ? 22 : 20,
            fontSize: isSmallScreen ? '10px' : '9px',
            fontWeight: 600,
            backgroundColor: hoveredOperator === item.id ? alpha(item.color, 0.15) : '#f5f5f5',
            border: '1px solid',
            borderColor: hoveredOperator === item.id ? item.color : 'transparent',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            maxWidth: isSmallScreen ? '100%' : '180px',
            '& .MuiChip-icon': { ml: 0.5 },
            '& .MuiChip-label': {
              px: 0.5,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: isSmallScreen ? 'calc(100vw - 80px)' : '150px',
            },
          }}
        />
      ))}
    </Box>
  );

  return (
    <ChartCard
      title={getTitle()}
      dataset={chartData}
      exportFileName={chartType === 'coverage' ? 'coverage_rank' : 'quality_rank'}
      isLoading={isLoading}
      showChartFilters={true}
      chartFilters={chartFilters}
      onChartFiltersChange={onChartFiltersChange}
      operators={[]}
      networks={[]}
      headerActions={<HeaderToggleButtons />}
      settings={{
        title: `${chartType === 'coverage' ? 'RSRP' : 'RSRQ'} Settings`,
        render: renderSettings,
        onApply: chartType === 'coverage' ? applyCoverageSettings : applyQualitySettings,
      }}
    >
      <Box
        sx={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          p: { xs: 0.75, sm: 1.5 },
          boxSizing: 'border-box',
          overflow: 'hidden',
          gap: { xs: 0.75, sm: 1.5 },
        }}
      >
        <Box
          ref={gaugeHostRef}
          sx={{
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <MultiRingGauge size={gaugeSize} />
        </Box>
        <Box sx={{ width: '100%', flex: 1, minHeight: 0, overflowY: 'auto', pr: 0.5 }}>
          <CompactLegend />
        </Box>
      </Box>
    </ChartCard>
  );
};

export default OperatorRankingChart;
