// src/hooks/useColorForLog.js
import { settingApi } from "@/api/apiEndpoints";
import { useCallback, useEffect, useState } from "react";
import { getLogColor } from "@/utils/colorUtils"; 
import { getPciColor } from "@/utils/metrics";

function useColorForLog() {
    const [parsedData, setParsedData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchThreshold = useCallback(async () => {
        try {
            setLoading(true);
            const res = await settingApi.getThresholdSettings();
            
            if (res.Status === 1) {
                const data = res.Data;
                
                // ✅ Safe parsing with fallback to empty array
                const safeParse = (jsonString) => {
                    try {
                        if (!jsonString) return [];
                        const parsed = typeof jsonString === 'string' 
                            ? JSON.parse(jsonString) 
                            : jsonString;
                        return Array.isArray(parsed) ? parsed : [];
                    } catch (e) {
                        console.error('Parse error:', e);
                        return [];
                    }
                };

                const parsed = {
                    id: data.id,
                    userId: data.user_id,
                    isDefault: data.is_default,
                    coverageHole: data.coveragehole_json ? parseFloat(data.coveragehole_json) : -110,
                    rsrp: safeParse(data.rsrp_json),
                    rsrq: safeParse(data.rsrq_json),
                    sinr: safeParse(data.sinr_json),
                    dl_thpt: safeParse(data.dl_thpt_json),
                    ul_thpt: safeParse(data.ul_thpt_json),
                    delta: safeParse(data.delta_json ?? data.delta),
                    volteCall: safeParse(data.volte_call),
                    lte_bler: safeParse(data.lte_bler_json),
                    mos: safeParse(data.mos_json),
                    num_cells: safeParse(data.num_cells),
                    level: safeParse(data.level),
                    jitter: safeParse(data.jitter),
                    latency: safeParse(data.latency),
                    packet_loss: safeParse(data.packet_loss),
                    tac: safeParse(data.tac),
                    dominance: safeParse(data.dominance),
                    coverage_violation: safeParse(data.coverage_violation),

                };
                
                setParsedData(parsed);
            }
        } catch (err) {
            console.error("Error fetching thresholds:", err);
            setError(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchThreshold();

        if (typeof window === "undefined") return undefined;
        const handleThresholdUpdate = () => {
            fetchThreshold();
        };

        window.addEventListener("thresholds:updated", handleThresholdUpdate);
        return () => {
            window.removeEventListener("thresholds:updated", handleThresholdUpdate);
        };
    }, [fetchThreshold]);

    const getMetricColor = useCallback((value, metric) => {
        const lowerMetric = metric?.toLowerCase();

        // 1. Handle Categorical Coloring (Provider, Technology, Band)
        if (['provider', 'technology', 'band'].includes(lowerMetric)) {
            return getLogColor(lowerMetric, value);
        }

        // 2. Handle PCI specifically (Algorithmic coloring)
        if (lowerMetric === 'pci') {
            return getPciColor(value);
        }

        // 3. Handle Numeric/Threshold Coloring
        // ✅ Validate value early
        if (value === null || value === undefined || value === '' || isNaN(value)) {
            return "#808080";
        }

        const numValue = parseFloat(value);
        if (isNaN(numValue)) {
            return "#808080";
        }

        if (!parsedData) {
            return "#808080";
        }

        const metricKeyMap = {
            'rsrp': 'rsrp',
            'rsrq': 'rsrq',
            'sinr': 'sinr',
            'dl_thpt': 'dl_thpt',
            'dl_tpt': 'dl_thpt',
            'dl_rpt': 'dl_thpt',
            'ul_thpt': 'ul_thpt',
            'ul_tpt': 'ul_thpt',
            'ul_rpt': 'ul_thpt',
            'mos': 'mos',
            'lte_bler': 'lte_bler',
            'volte_call': 'volteCall',
            'coveragehole': 'coverageHole',
            'num_cells': 'num_cells',
            'level': 'level' ,     
            'jitter': 'jitter',
            'latency': 'latency',
            'packet_loss': 'packet_loss',
            'tac': 'tac',
            'delta': 'delta',
            'dominance': 'dominance',
            'coverage_violation': 'coverage_violation'
        };

        const key = metricKeyMap[lowerMetric] || lowerMetric;
        const thresholds = parsedData[key];

        // ✅ Validate thresholds array
        if (!thresholds || !Array.isArray(thresholds) || thresholds.length === 0) {
            return "#808080";
        }

        // ✅ Filter out invalid thresholds
        const validThresholds = thresholds.filter(t => {
            const min = parseFloat(t.min);
            const max = parseFloat(t.max);
            return !isNaN(min) && !isNaN(max) && t.color;
        });

        if (validThresholds.length === 0) {
            return "#808080";
        }

        // ✅ Sort thresholds by min value to ensure correct range matching
        const sortedThresholds = [...validThresholds].sort((a, b) => 
            parseFloat(a.min) - parseFloat(b.min)
        );

        // Find matching threshold
        for (const thres of sortedThresholds) {
            const min = parseFloat(thres.min);
            const max = parseFloat(thres.max);
            
            // Standard range check: min <= value < max
            if (numValue >= min && numValue < max) {
                return thres.color;
            }
        }

        // ✅ Handle edge cases more safely
        const lastThreshold = sortedThresholds[sortedThresholds.length - 1];
        const firstThreshold = sortedThresholds[0];

        // If value is greater than or equal to last threshold's max
        if (lastThreshold && numValue >= parseFloat(lastThreshold.max)) {
            return lastThreshold.color;
        }

        // If value is less than first threshold's min
        if (firstThreshold && numValue < parseFloat(firstThreshold.min)) {
            return firstThreshold.color;
        }

        // If the value falls in a gap between configured ranges,
        // keep it neutral instead of forcing nearest-range color.
        return "#808080";
    }, [parsedData]);

    const getThresholdInfo = useCallback((value, metric) => {
        if (!parsedData || value === null || value === undefined) {
            return null;
        }

        const numValue = parseFloat(value);
        if (isNaN(numValue)) {
            return null;
        }

        const metricKeyMap = {
            'rsrp': 'rsrp',
            'rsrq': 'rsrq',
            'sinr': 'sinr',
            'dl_thpt': 'dl_thpt',
            'dl_tpt': 'dl_thpt',
            'dl_rpt': 'dl_thpt',
            'ul_thpt': 'ul_thpt',
            'ul_tpt': 'ul_thpt',
            'ul_rpt': 'ul_thpt',
            'mos': 'mos',
            'lte_bler': 'lte_bler',
            'num_cells': 'num_cells',
            'level': 'level',
            'jitter': 'jitter',
            'latency': 'latency',
            'packet_loss': 'packet_loss',
            'tac': 'tac',
            'delta': 'delta',
            'dominance': 'dominance',
            'coverage_violation': 'coverage_violation'
        };

        const key = metricKeyMap[metric?.toLowerCase()] || metric?.toLowerCase();
        const thresholds = parsedData[key];

        if (!thresholds || !Array.isArray(thresholds) || thresholds.length === 0) {
            return null;
        }

        // ✅ Find valid matching threshold
        const validThresholds = thresholds.filter(t => {
            const min = parseFloat(t.min);
            const max = parseFloat(t.max);
            return !isNaN(min) && !isNaN(max);
        });

        for (const thres of validThresholds) {
            const min = parseFloat(thres.min);
            const max = parseFloat(thres.max);
            
            if (numValue >= min && numValue < max) {
                return {
                    color: thres.color,
                    label: thres.label || '',
                    range: thres.range || `${min} to ${max}`,
                    min: thres.min,
                    max: thres.max
                };
            }
        }

        // ✅ Return last threshold info if value exceeds all ranges
        const lastValid = validThresholds[validThresholds.length - 1];
        if (lastValid && numValue >= parseFloat(lastValid.max)) {
            return {
                color: lastValid.color,
                label: lastValid.label || '',
                range: lastValid.range || `${lastValid.min}+`,
                min: lastValid.min,
                max: lastValid.max
            };
        }

        return null;
    }, [parsedData]);

    const getThresholdsForMetric = useCallback((metric) => {
        if (!parsedData) return null;

        const metricKeyMap = {
            'rsrp': 'rsrp',
            'rsrq': 'rsrq',
            'sinr': 'sinr',
            'dl_thpt': 'dl_thpt',
            'dl_tpt': 'dl_thpt',
            'dl_rpt': 'dl_thpt',
            'ul_thpt': 'ul_thpt',
            'ul_tpt': 'ul_thpt',
            'ul_rpt': 'ul_thpt',
            'mos': 'mos',
            'lte_bler': 'lte_bler',
            'volte_call': 'volteCall',
            'coveragehole': 'coverageHole',
            'num_cells': 'num_cells',
            'level': 'level',
            'jitter': 'jitter',
            'latency': 'latency',
            'packet_loss': 'packet_loss',
            'tac': 'tac',
            'delta': 'delta',
            'dominance': 'dominance',
            'coverage_violation': 'coverage_violation',
        };

        const key = metricKeyMap[metric?.toLowerCase()] || metric?.toLowerCase();
        const thresholds = parsedData[key];
        
        // ✅ Return valid thresholds only
        if (!thresholds || !Array.isArray(thresholds)) {
            return null;
        }

        return thresholds.filter(t => {
            const min = parseFloat(t.min);
            const max = parseFloat(t.max);
            return !isNaN(min) && !isNaN(max) && t.color;
        });
    }, [parsedData]);

    return {
        getMetricColor,
        getThresholdInfo,
        getThresholdsForMetric,
        thresholds: parsedData,
        loading,
        error,
        isReady: !loading && parsedData !== null,
        refetch: fetchThreshold
    };
}

export default useColorForLog;
