// src/hooks/useColorForLog.js
import { settingApi } from "@/api/apiEndpoints";
import { useCallback, useEffect, useMemo, useState } from "react";
import { applyTechnologyColorSettings, getLogColor } from "@/utils/colorUtils"; 
import { getPciColor } from "@/utils/metrics";
import {
    createEmptyScalarBuckets,
    createEmptyThresholdBuckets,
    parseBucketedRangeValue,
    parseBucketedScalarValue,
    pickThresholdBucketValue,
    resolveSelectedTechnologyBucket,
} from "@/utils/thresholdBuckets";

const EMPTY_THRESHOLD_STATE = {
    id: null,
    userId: null,
    isDefault: false,
    coverageHole: -110,
    rsrp: [],
    rsrq: [],
    sinr: [],
    dl_thpt: [],
    ul_thpt: [],
    delta: [],
    volteCall: [],
    lte_bler: [],
    mos: [],
    mac_dl: [],
    mac_dl_delivered: [],
    mac_ul: [],
    mac_ul_delivered: [],
    mac_bler: [],
    mac_bler_init: [],
    mac_mcs: [],
    mac_retx: [],
    mac_rb: [],
    mac_grants: [],
    mac_tx_power: [],
    mac_modulation_pct: [],
    num_cells: [],
    level: [],
    jitter: [],
    latency: [],
    packet_loss: [],
    tac: [],
    dominance: [],
    coverage_violation: [],
    cell_id: [],
    technologyColorSettings: {
        twoG: [],
        threeG: [],
        fourG: [],
        fiveG: [],
    },
};

const EMPTY_BUCKETED_THRESHOLDS = {
    coverageHole: createEmptyScalarBuckets(-110),
    rsrp: createEmptyThresholdBuckets(),
    rsrq: createEmptyThresholdBuckets(),
    sinr: createEmptyThresholdBuckets(),
    dl_thpt: createEmptyThresholdBuckets(),
    ul_thpt: createEmptyThresholdBuckets(),
    delta: createEmptyThresholdBuckets(),
    volteCall: createEmptyThresholdBuckets(),
    lte_bler: createEmptyThresholdBuckets(),
    mos: createEmptyThresholdBuckets(),
    mac_dl: createEmptyThresholdBuckets(),
    mac_dl_delivered: createEmptyThresholdBuckets(),
    mac_ul: createEmptyThresholdBuckets(),
    mac_ul_delivered: createEmptyThresholdBuckets(),
    mac_bler: createEmptyThresholdBuckets(),
    mac_bler_init: createEmptyThresholdBuckets(),
    mac_mcs: createEmptyThresholdBuckets(),
    mac_retx: createEmptyThresholdBuckets(),
    mac_rb: createEmptyThresholdBuckets(),
    mac_grants: createEmptyThresholdBuckets(),
    mac_tx_power: createEmptyThresholdBuckets(),
    mac_modulation_pct: createEmptyThresholdBuckets(),
    num_cells: createEmptyThresholdBuckets(),
    level: createEmptyThresholdBuckets(),
    jitter: createEmptyThresholdBuckets(),
    latency: createEmptyThresholdBuckets(),
    packet_loss: createEmptyThresholdBuckets(),
    tac: createEmptyThresholdBuckets(),
    dominance: createEmptyThresholdBuckets(),
    coverage_violation: createEmptyThresholdBuckets(),
};

const buildEffectiveThresholdState = (source, selectedTechnologies) => {
    const selectedBucket = resolveSelectedTechnologyBucket(selectedTechnologies);
    const bucketed = source?.bucketed || EMPTY_BUCKETED_THRESHOLDS;

    return {
        id: source?.id ?? null,
        userId: source?.userId ?? null,
        isDefault: source?.isDefault ?? false,
        coverageHole: pickThresholdBucketValue(bucketed.coverageHole, selectedBucket, -110),
        rsrp: pickThresholdBucketValue(bucketed.rsrp, selectedBucket, []),
        rsrq: pickThresholdBucketValue(bucketed.rsrq, selectedBucket, []),
        sinr: pickThresholdBucketValue(bucketed.sinr, selectedBucket, []),
        dl_thpt: pickThresholdBucketValue(bucketed.dl_thpt, selectedBucket, []),
        ul_thpt: pickThresholdBucketValue(bucketed.ul_thpt, selectedBucket, []),
        delta: pickThresholdBucketValue(bucketed.delta, selectedBucket, []),
        volteCall: pickThresholdBucketValue(bucketed.volteCall, selectedBucket, []),
        lte_bler: pickThresholdBucketValue(bucketed.lte_bler, selectedBucket, []),
        mos: pickThresholdBucketValue(bucketed.mos, selectedBucket, []),
        mac_dl: pickThresholdBucketValue(bucketed.mac_dl, selectedBucket, []),
        mac_dl_delivered: pickThresholdBucketValue(bucketed.mac_dl_delivered, selectedBucket, []),
        mac_ul: pickThresholdBucketValue(bucketed.mac_ul, selectedBucket, []),
        mac_ul_delivered: pickThresholdBucketValue(bucketed.mac_ul_delivered, selectedBucket, []),
        mac_bler: pickThresholdBucketValue(bucketed.mac_bler, selectedBucket, []),
        mac_bler_init: pickThresholdBucketValue(bucketed.mac_bler_init, selectedBucket, []),
        mac_mcs: pickThresholdBucketValue(bucketed.mac_mcs, selectedBucket, []),
        mac_retx: pickThresholdBucketValue(bucketed.mac_retx, selectedBucket, []),
        mac_rb: pickThresholdBucketValue(bucketed.mac_rb, selectedBucket, []),
        mac_grants: pickThresholdBucketValue(bucketed.mac_grants, selectedBucket, []),
        mac_tx_power: pickThresholdBucketValue(bucketed.mac_tx_power, selectedBucket, []),
        mac_modulation_pct: pickThresholdBucketValue(bucketed.mac_modulation_pct, selectedBucket, []),
        num_cells: pickThresholdBucketValue(bucketed.num_cells, selectedBucket, []),
        level: pickThresholdBucketValue(bucketed.level, selectedBucket, []),
        jitter: pickThresholdBucketValue(bucketed.jitter, selectedBucket, []),
        latency: pickThresholdBucketValue(bucketed.latency, selectedBucket, []),
        packet_loss: pickThresholdBucketValue(bucketed.packet_loss, selectedBucket, []),
        tac: pickThresholdBucketValue(bucketed.tac, selectedBucket, []),
        dominance: pickThresholdBucketValue(bucketed.dominance, selectedBucket, []),
        coverage_violation: pickThresholdBucketValue(bucketed.coverage_violation, selectedBucket, []),
        technologyColorSettings: source?.technologyColorSettings || EMPTY_THRESHOLD_STATE.technologyColorSettings,
        __bucketed: bucketed,
        __selectedTechnologyBucket: selectedBucket,
    };
};

const withTimeout = (promise, timeoutMs = 8000) =>
    Promise.race([
        promise,
        new Promise((_, reject) => {
            const timer = setTimeout(
                () => reject(new Error("Threshold settings request timed out")),
                timeoutMs,
            );
            if (typeof timer?.unref === "function") timer.unref();
        }),
    ]);

function useColorForLog() {
    const [thresholdSource, setThresholdSource] = useState({
        id: null,
        userId: null,
        isDefault: false,
        technologyColorSettings: EMPTY_THRESHOLD_STATE.technologyColorSettings,
        bucketed: EMPTY_BUCKETED_THRESHOLDS,
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const parsedData = useMemo(
        () => buildEffectiveThresholdState(thresholdSource, []),
        [thresholdSource],
    );

    const fetchThreshold = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await withTimeout(settingApi.getThresholdSettings());
            const payload = res?.data || res;

            if (payload?.Status === 1 && payload?.Data) {
                const data = payload.Data;
                
                const technologyColorSettings = {
                    twoG: Array.isArray(data?.technologyColorSettings?.twoG)
                        ? data.technologyColorSettings.twoG
                        : [],
                    threeG: Array.isArray(data?.technologyColorSettings?.threeG)
                        ? data.technologyColorSettings.threeG
                        : [],
                    fourG: Array.isArray(data?.technologyColorSettings?.fourG)
                        ? data.technologyColorSettings.fourG
                        : [],
                    fiveG: Array.isArray(data?.technologyColorSettings?.fiveG)
                        ? data.technologyColorSettings.fiveG
                        : [],
                    };

                const rsrpBuckets = parseBucketedRangeValue(data.rsrp_json);
                const rsrqBuckets = parseBucketedRangeValue(data.rsrq_json);
                const sinrBuckets = parseBucketedRangeValue(data.sinr_json);
                const dlBuckets = parseBucketedRangeValue(data.dl_thpt_json);
                const ulBuckets = parseBucketedRangeValue(data.ul_thpt_json);
                const deltaBuckets = parseBucketedRangeValue(data.delta_json ?? data.delta);
                const volteBuckets = parseBucketedRangeValue(data.volte_call);
                const blerBuckets = parseBucketedRangeValue(data.lte_bler_json);
                const mosBuckets = parseBucketedRangeValue(data.mos_json);
                const macDlBuckets = parseBucketedRangeValue(data.mac_dl_json);
                const macDlDeliveredBuckets = parseBucketedRangeValue(data.mac_dl_delivered_json);
                const macUlBuckets = parseBucketedRangeValue(data.mac_ul_json);
                const macUlDeliveredBuckets = parseBucketedRangeValue(data.mac_ul_delivered_json);
                const macBlerBuckets = parseBucketedRangeValue(data.mac_bler_json);
                const macBlerInitBuckets = parseBucketedRangeValue(data.mac_bler_init_json);
                const macMcsBuckets = parseBucketedRangeValue(data.mac_mcs_json);
                const macRetxBuckets = parseBucketedRangeValue(data.mac_retx_json);
                const macRbBuckets = parseBucketedRangeValue(data.mac_rb_json);
                const macGrantsBuckets = parseBucketedRangeValue(data.mac_grants_json);
                const macTxPowerBuckets = parseBucketedRangeValue(data.mac_tx_power_json);
                const macModulationPctBuckets = parseBucketedRangeValue(data.mac_modulation_pct_json);
                const numCellsBuckets = parseBucketedRangeValue(data.num_cells);
                const levelBuckets = parseBucketedRangeValue(data.level);
                const jitterBuckets = parseBucketedRangeValue(data.jitter);
                const latencyBuckets = parseBucketedRangeValue(data.latency);
                const packetLossBuckets = parseBucketedRangeValue(data.packet_loss);
                const tacBuckets = parseBucketedRangeValue(data.tac);
                const dominanceBuckets = parseBucketedRangeValue(data.dominance);
                const coverageViolationBuckets = parseBucketedRangeValue(data.coverage_violation);
                const coverageHoleBuckets = parseBucketedScalarValue(data.coveragehole_json, -110);

                const bucketed = {
                    coverageHole: coverageHoleBuckets,
                    rsrp: rsrpBuckets,
                    rsrq: rsrqBuckets,
                    sinr: sinrBuckets,
                    dl_thpt: dlBuckets,
                    ul_thpt: ulBuckets,
                    delta: deltaBuckets,
                    volteCall: volteBuckets,
                    lte_bler: blerBuckets,
                    mos: mosBuckets,
                    mac_dl: macDlBuckets,
                    mac_dl_delivered: macDlDeliveredBuckets,
                    mac_ul: macUlBuckets,
                    mac_ul_delivered: macUlDeliveredBuckets,
                    mac_bler: macBlerBuckets,
                    mac_bler_init: macBlerInitBuckets,
                    mac_mcs: macMcsBuckets,
                    mac_retx: macRetxBuckets,
                    mac_rb: macRbBuckets,
                    mac_grants: macGrantsBuckets,
                    mac_tx_power: macTxPowerBuckets,
                    mac_modulation_pct: macModulationPctBuckets,
                    num_cells: numCellsBuckets,
                    level: levelBuckets,
                    jitter: jitterBuckets,
                    latency: latencyBuckets,
                    packet_loss: packetLossBuckets,
                    tac: tacBuckets,
                    dominance: dominanceBuckets,
                    coverage_violation: coverageViolationBuckets,
                };

                const parsed = {
                    id: data.id,
                    userId: data.user_id,
                    isDefault: data.is_default,
                    technologyColorSettings,
                    bucketed,
                };
                
                applyTechnologyColorSettings(technologyColorSettings);
                setThresholdSource(parsed);
            } else {
                applyTechnologyColorSettings({});
                setThresholdSource({
                    id: null,
                    userId: null,
                    isDefault: false,
                    technologyColorSettings: EMPTY_THRESHOLD_STATE.technologyColorSettings,
                    bucketed: EMPTY_BUCKETED_THRESHOLDS,
                });
            }
        } catch (err) {
            console.error("Error fetching thresholds:", err);
            setError(err);
            applyTechnologyColorSettings({});
            setThresholdSource({
                id: null,
                userId: null,
                isDefault: false,
                technologyColorSettings: EMPTY_THRESHOLD_STATE.technologyColorSettings,
                bucketed: EMPTY_BUCKETED_THRESHOLDS,
            });
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

    const resolveThresholdsForTechnologies = useCallback(
        (selectedTechnologies) => buildEffectiveThresholdState(thresholdSource, selectedTechnologies),
        [thresholdSource],
    );

    const getMetricColor = useCallback((value, metric, selectedTechnologies = []) => {
        const lowerMetric = metric?.toLowerCase();
        const effectiveParsedData = selectedTechnologies?.length
            ? resolveThresholdsForTechnologies(selectedTechnologies)
            : parsedData;

        // 1. Handle Categorical Coloring (Provider, Technology, Band)
        if (['provider', 'technology', 'band', 'nodebid', 'cell_id', 'earfcn'].includes(lowerMetric)) {
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

        if (!effectiveParsedData) {
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
            'mac_dl': 'mac_dl',
            'mac_dl_delivered': 'mac_dl_delivered',
            'mac_ul': 'mac_ul',
            'mac_ul_delivered': 'mac_ul_delivered',
            'mac_bler': 'mac_bler',
            'mac_bler_init': 'mac_bler_init',
            'mac_mcs': 'mac_mcs',
            'mac_retx': 'mac_retx',
            'mac_rb': 'mac_rb',
            'mac_grants': 'mac_grants',
            'mac_tx_power': 'mac_tx_power',
            'mac_modulation_pct': 'mac_modulation_pct',
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
        const thresholds = effectiveParsedData[key];

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
    }, [parsedData, resolveThresholdsForTechnologies]);

    const getThresholdInfo = useCallback((value, metric, selectedTechnologies = []) => {
        const effectiveParsedData = selectedTechnologies?.length
            ? resolveThresholdsForTechnologies(selectedTechnologies)
            : parsedData;

        if (!effectiveParsedData || value === null || value === undefined) {
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
            'mac_dl': 'mac_dl',
            'mac_dl_delivered': 'mac_dl_delivered',
            'mac_ul': 'mac_ul',
            'mac_ul_delivered': 'mac_ul_delivered',
            'mac_bler': 'mac_bler',
            'mac_bler_init': 'mac_bler_init',
            'mac_mcs': 'mac_mcs',
            'mac_retx': 'mac_retx',
            'mac_rb': 'mac_rb',
            'mac_grants': 'mac_grants',
            'mac_tx_power': 'mac_tx_power',
            'mac_modulation_pct': 'mac_modulation_pct',
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
        const thresholds = effectiveParsedData[key];

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
    }, [parsedData, resolveThresholdsForTechnologies]);

    const getThresholdsForMetric = useCallback((metric, selectedTechnologies = []) => {
        const effectiveParsedData = selectedTechnologies?.length
            ? resolveThresholdsForTechnologies(selectedTechnologies)
            : parsedData;

        if (!effectiveParsedData) return null;

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
            'mac_dl': 'mac_dl',
            'mac_dl_delivered': 'mac_dl_delivered',
            'mac_ul': 'mac_ul',
            'mac_ul_delivered': 'mac_ul_delivered',
            'mac_bler': 'mac_bler',
            'mac_bler_init': 'mac_bler_init',
            'mac_mcs': 'mac_mcs',
            'mac_retx': 'mac_retx',
            'mac_rb': 'mac_rb',
            'mac_grants': 'mac_grants',
            'mac_tx_power': 'mac_tx_power',
            'mac_modulation_pct': 'mac_modulation_pct',
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
        const thresholds = effectiveParsedData[key];
        
        // ✅ Return valid thresholds only
        if (!thresholds || !Array.isArray(thresholds)) {
            return null;
        }

        return thresholds.filter(t => {
            const min = parseFloat(t.min);
            const max = parseFloat(t.max);
            return !isNaN(min) && !isNaN(max) && t.color;
        });
    }, [parsedData, resolveThresholdsForTechnologies]);

    return {
        getMetricColor,
        getThresholdInfo,
        getThresholdsForMetric,
        thresholds: parsedData,
        resolveThresholdsForTechnologies,
        loading,
        error,
        isReady: !loading,
        refetch: fetchThreshold
    };
}

export default useColorForLog;
