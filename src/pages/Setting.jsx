import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { toast } from 'react-toastify';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import Spinner from '../components/common/Spinner';
import { X, Plus, Save, RefreshCw, ArrowUpDown } from 'lucide-react';
import { settingApi } from '../api/apiEndpoints';
import { useAuth } from '@/context/AuthContext';

const PARAMETERS = {
    rsrp: "RSRP",
    rsrq: "RSRQ",
    sinr: "SINR",
    dl_thpt: "DL Throughput",
    ul_thpt: "UL Throughput",
    delta: "Delta",
    lte_bler: "LTE BLER",
    mos: "MOS",
    coveragehole: "Coverage Hole",
    num_cells: "Pilot pollution",
    level: "SSI",
    jitter: "Jitter",
    latency: "Latency",
    packet_loss: "Packet Loss",
    tac: "TAC",
    dominance: "Dominance",
    coverage_violation: "Coverage Violation"
};

const SPECIAL_FIELDS = {
    volte_call: "VoLTE Call"
};

const DEFAULT_COVERAGE_HOLE = -110;

const generateId = () => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

const generateRangeString = (min, max) => {
    if (min === undefined || max === undefined || min === null || max === null) {
        return '';
    }
    return `${min} to ${max}`;
};

const parseNumber = (value) => {
    if (value === '' || value === '-' || value === null || value === undefined) {
        return 0;
    }
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
};

const normalizeRow = (row) => {
    const min = parseNumber(row.min);
    const max = parseNumber(row.max);
    
    return {
        id: row.id || generateId(),
        min,
        max,
        color: row.color || '#00ff00',
        label: row.label || '',
        range: generateRangeString(min, max),
    };
};

const createNewRow = () => ({
    id: generateId(),
    min: 0,
    max: 0,
    color: '#00ff00',
    label: '',
    range: '0 to 0'
});

const extractResponseData = (response) => {
    return response?.data || response;
};

const ThresholdRow = memo(({ row, index, onChange, onDelete }) => {
    const [minStr, setMinStr] = useState(String(row.min ?? 0));
    const [maxStr, setMaxStr] = useState(String(row.max ?? 0));
    const [color, setColor] = useState(row.color || '#00ff00');
    const [label, setLabel] = useState(row.label || '');

    useEffect(() => {
        setMinStr(String(row.min ?? 0));
        setMaxStr(String(row.max ?? 0));
        setColor(row.color || '#00ff00');
        setLabel(row.label || '');
    }, [row.id, row.min, row.max, row.color, row.label]);

    const syncToParent = useCallback((updates = {}) => {
        const currentMin = updates.min !== undefined ? updates.min : parseNumber(minStr);
        const currentMax = updates.max !== undefined ? updates.max : parseNumber(maxStr);
        const currentColor = updates.color !== undefined ? updates.color : color;
        const currentLabel = updates.label !== undefined ? updates.label : label;

        onChange(index, { 
            id: row.id,
            min: currentMin, 
            max: currentMax, 
            color: currentColor, 
            label: currentLabel,
            range: generateRangeString(currentMin, currentMax) 
        });
    }, [index, row.id, minStr, maxStr, color, label, onChange]);

    const handleMinBlur = useCallback(() => {
        const num = parseNumber(minStr);
        setMinStr(String(num));
        syncToParent({ min: num });
    }, [minStr, syncToParent]);

    const handleMaxBlur = useCallback(() => {
        const num = parseNumber(maxStr);
        setMaxStr(String(num));
        syncToParent({ max: num });
    }, [maxStr, syncToParent]);

    const currentMin = parseNumber(minStr);
    const currentMax = parseNumber(maxStr);

    return (
        <div className="grid grid-cols-12 gap-2 items-center p-3 bg-slate-700/50 rounded-lg hover:bg-slate-700/70 transition-colors">
            <div className="col-span-2">
                <label className="text-xs text-gray-400 block mb-1">Min</label>
                <Input
                    className="text-white bg-slate-800 border-slate-600 focus:border-blue-500"
                    type="number"
                    step="any"
                    value={minStr}
                    onChange={e => {
                        const next = e.target.value;
                        setMinStr(next);
                        syncToParent({ min: parseNumber(next) });
                    }}
                    onBlur={handleMinBlur}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            handleMinBlur();
                        }
                    }}
                />
            </div>

            <div className="col-span-2">
                <label className="text-xs text-gray-400 block mb-1">Max</label>
                <Input
                    className="text-white bg-slate-800 border-slate-600 focus:border-blue-500"
                    type="number"
                    step="any"
                    value={maxStr}
                    onChange={e => {
                        const next = e.target.value;
                        setMaxStr(next);
                        syncToParent({ max: parseNumber(next) });
                    }}
                    onBlur={handleMaxBlur}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            handleMaxBlur();
                        }
                    }}
                />
            </div>

            <div className="col-span-3">
                <label className="text-xs text-gray-400 block mb-1">Color</label>
                <div className="flex items-center gap-2">
                    <Input
                        type="color"
                        value={color}
                        onChange={e => {
                            setColor(e.target.value);
                            syncToParent({ color: e.target.value });
                        }}
                        className="w-10 h-9 p-1 cursor-pointer rounded border-slate-600"
                    />
                    <Input
                        className="text-white bg-slate-800 border-slate-600 flex-1 text-xs"
                        placeholder="#00ff00"
                        value={color}
                        onChange={e => {
                            const next = e.target.value;
                            setColor(next);
                            syncToParent({ color: next });
                        }}
                        onBlur={e => syncToParent({ color: e.target.value })}
                    />
                </div>
            </div>

            <div className="col-span-3">
                <label className="text-xs text-gray-400 block mb-1">Label</label>
                <Input
                    className="text-white bg-slate-800 border-slate-600 focus:border-blue-500"
                    placeholder="e.g., Good, Poor"
                    value={label}
                    onChange={e => {
                        const next = e.target.value;
                        setLabel(next);
                        syncToParent({ label: next });
                    }}
                    onBlur={() => syncToParent({ label })}
                />
            </div>

            <div className="col-span-2 flex items-end gap-2">
                <div className="flex-1">
                    <label className="text-xs text-gray-400 block mb-1">Range</label>
                    <div 
                        className="text-xs px-2 py-2 rounded text-center font-medium truncate"
                        style={{ backgroundColor: color + '40', color: color }}
                    >
                        {generateRangeString(currentMin, currentMax) || 'N/A'}
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(index)}
                    className="h-9 w-9 text-red-400 hover:text-red-300 hover:bg-red-900/30"
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
});

ThresholdRow.displayName = 'ThresholdRow';

const ThresholdForm = memo(({ paramKey, paramName, initialData, onUpdate, onClose }) => {
    const [localData, setLocalData] = useState([]);
    const isInitialMount = useRef(true);
    const pendingUpdate = useRef(false);

    useEffect(() => {
        const normalized = (initialData || []).map(row => normalizeRow(row));
        setLocalData(normalized);
        isInitialMount.current = false;
        pendingUpdate.current = false;
    }, [paramKey]);

    const handleChange = useCallback((index, updatedRow) => {
        pendingUpdate.current = true;
        setLocalData(prev => {
            const updated = [...prev];
            updated[index] = normalizeRow(updatedRow);
            return updated;
        });
    }, []);

    const addRow = useCallback(() => {
        pendingUpdate.current = true;
        setLocalData(prev => [...prev, createNewRow()]);
    }, []);

    const deleteRow = useCallback((index) => {
        pendingUpdate.current = true;
        setLocalData(prev => prev.filter((_, i) => i !== index));
    }, []);

    const sortByMin = useCallback(() => {
        pendingUpdate.current = true;
        setLocalData(prev => [...prev].sort((a, b) => a.min - b.min));
    }, []);

    useEffect(() => {
        if (isInitialMount.current) return;
        if (!pendingUpdate.current) return;
        onUpdate(localData);
        pendingUpdate.current = false;
    }, [localData, onUpdate]);

    return (
        <div className="mt-4 p-4 border border-slate-600 rounded-lg bg-slate-800">
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h3 className="text-lg font-semibold text-white">{paramName}</h3>
                    <p className="text-xs text-gray-400 mt-1">
                        {localData.length} threshold range(s) configured
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={sortByMin}
                        className="text-gray-400 hover:text-white"
                        disabled={localData.length < 2}
                    >
                        <ArrowUpDown className="h-4 w-4 mr-1" />
                        Sort
                    </Button>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
                {localData.map((row, index) => (
                    <ThresholdRow
                        key={row.id}
                        row={row}
                        index={index}
                        onChange={handleChange}
                        onDelete={deleteRow}
                    />
                ))}
            </div>

            {localData.length === 0 && (
                <div className="text-center py-8 text-gray-400 border-2 border-dashed border-slate-600 rounded-lg">
                    <p>No thresholds configured</p>
                    <p className="text-xs mt-1">Click "Add Row" to create a threshold range</p>
                </div>
            )}

            <div className="flex gap-2 mt-4">
                <Button onClick={addRow} variant="outline" className="flex-1 border-slate-600 hover:bg-slate-700">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Row
                </Button>
            </div>

            {localData.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-600">
                    <p className="text-xs text-gray-400 mb-2">Preview:</p>
                    <div className="flex flex-wrap gap-1">
                        {localData.map((row) => (
                            <div
                                key={row.id}
                                className="px-2 py-1 rounded text-xs font-medium"
                                style={{ 
                                    backgroundColor: row.color + '30', 
                                    color: row.color,
                                    border: `1px solid ${row.color}`
                                }}
                            >
                                {row.label || row.range}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
});

ThresholdForm.displayName = 'ThresholdForm';

const VoLTECallForm = memo(({ value, setValue, onClose }) => {
    const [localData, setLocalData] = useState([]);
    const isInitialMount = useRef(true);
    const pendingUpdate = useRef(false);

    useEffect(() => {
        let parsed = [];
        if (value) {
            if (Array.isArray(value)) {
                parsed = value;
            } else if (typeof value === 'string') {
                try {
                    parsed = JSON.parse(value);
                } catch (e) {
                    parsed = [];
                }
            }
        }
        setLocalData((Array.isArray(parsed) ? parsed : []).map(normalizeRow));
        isInitialMount.current = false;
    }, []);

    const handleChange = useCallback((index, updatedRow) => {
        pendingUpdate.current = true;
        setLocalData(prev => {
            const updated = [...prev];
            updated[index] = normalizeRow(updatedRow);
            return updated;
        });
    }, []);

    const addRow = useCallback(() => {
        pendingUpdate.current = true;
        setLocalData(prev => [...prev, createNewRow()]);
    }, []);

    const deleteRow = useCallback((index) => {
        pendingUpdate.current = true;
        setLocalData(prev => prev.filter((_, i) => i !== index));
    }, []);

    const sortByMin = useCallback(() => {
        pendingUpdate.current = true;
        setLocalData(prev => [...prev].sort((a, b) => a.min - b.min));
    }, []);

    useEffect(() => {
        if (isInitialMount.current) return;
        if (!pendingUpdate.current) return;
        setValue(localData);
        pendingUpdate.current = false;
    }, [localData, setValue]);

    return (
        <div className="mt-4 p-4 border border-slate-600 rounded-lg bg-slate-800">
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h3 className="text-lg font-semibold text-white">VoLTE Call</h3>
                    <p className="text-xs text-gray-400 mt-1">
                        {localData.length} threshold range(s) configured
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={sortByMin}
                        className="text-gray-400 hover:text-white"
                        disabled={localData.length < 2}
                    >
                        <ArrowUpDown className="h-4 w-4 mr-1" />
                        Sort
                    </Button>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
                {localData.map((row, index) => (
                    <ThresholdRow
                        key={row.id}
                        row={row}
                        index={index}
                        onChange={handleChange}
                        onDelete={deleteRow}
                    />
                ))}
            </div>

            {localData.length === 0 && (
                <div className="text-center py-8 text-gray-400 border-2 border-dashed border-slate-600 rounded-lg">
                    <p>No thresholds configured</p>
                </div>
            )}

            <div className="flex gap-2 mt-4">
                <Button onClick={addRow} variant="outline" className="flex-1 border-slate-600 hover:bg-slate-700">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Row
                </Button>
            </div>

            {localData.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-600">
                    <p className="text-xs text-gray-400 mb-2">Preview:</p>
                    <div className="flex flex-wrap gap-1">
                        {localData.map((row) => (
                            <div
                                key={row.id}
                                className="px-2 py-1 rounded text-xs font-medium"
                                style={{ 
                                    backgroundColor: row.color + '30', 
                                    color: row.color,
                                    border: `1px solid ${row.color}`
                                }}
                            >
                                {row.label || row.range}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
});

VoLTECallForm.displayName = 'VoLTECallForm';

const CoverageHoleForm = memo(({ value, setValue, onClose }) => {
    const [localValueStr, setLocalValueStr] = useState(String(value ?? DEFAULT_COVERAGE_HOLE));

    useEffect(() => {
        setLocalValueStr(String(value ?? DEFAULT_COVERAGE_HOLE));
    }, [value]);

    const handleBlur = useCallback(() => {
        const num = parseNumber(localValueStr);
        const finalValue = num > 0 ? -num : num;
        setLocalValueStr(String(finalValue));
        setValue(finalValue);
    }, [localValueStr, setValue]);

    const currentValue = parseNumber(localValueStr);

    return (
        <div className="mt-4 p-4 border border-slate-600 rounded-lg bg-slate-800">
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h3 className="text-lg font-semibold text-white">Coverage Hole</h3>
                    <p className="text-xs text-gray-400 mt-1">
                        RSRP threshold below which is considered a coverage hole
                    </p>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose}>
                    <X className="h-4 w-4" />
                </Button>
            </div>

            <div className="flex items-center gap-3">
                <Input
                    type="number"
                    step="any"
                    value={localValueStr}
                    onChange={e => setLocalValueStr(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            handleBlur();
                        }
                    }}
                    className="w-32 text-white bg-slate-700 border-slate-600"
                />
                <span className="text-gray-400 text-sm">dBm</span>
                <div className="text-xs text-gray-500">
                    (Values below {currentValue} dBm will be marked as coverage holes)
                </div>
            </div>
        </div>
    );
});

CoverageHoleForm.displayName = 'CoverageHoleForm';

const parseThresholdData = (data) => {
    const parsedData = { 
        id: data.id,
        userId: data.user_id,
        isDefault: data.is_default,
    };

    Object.keys(PARAMETERS).forEach(key => {
        if (key === "coveragehole") {
            parsedData[key] = parseNumber(data.coveragehole_json || data.coveragehole) || DEFAULT_COVERAGE_HOLE;
        } else if (key === "num_cells" || key === "level" || key === "jitter" || key === "latency" || key === "packet_loss" || key === "tac" || key === "dominance" || key === "coverage_violation" ) {
      
            const jsonString = data[key]; // Read directly from num_cells and level
            let parsed = [];
            
            if (jsonString) {
                try {
                    parsed = typeof jsonString === 'object' 
                        ? (Array.isArray(jsonString) ? jsonString : [jsonString])
                        : JSON.parse(jsonString);
                } catch (e) {
                    console.error(`Error parsing ${key}:`, e);
                    parsed = [];
                }
            }
            
            parsedData[key] = (Array.isArray(parsed) ? parsed : [parsed])
                .map(normalizeRow)
                .filter(row => {
                    // Make sure row has valid min/max
                    return row.min !== undefined && 
                           row.max !== undefined && 
                           row.min !== null && 
                           row.max !== null;
                });
        }
        else {
            const jsonString = data[`${key}_json`];
            let parsed = [];
            
            if (jsonString) {
                try {
                    parsed = typeof jsonString === 'object' 
                        ? (Array.isArray(jsonString) ? jsonString : [jsonString])
                        : JSON.parse(jsonString);
                } catch (e) {
                    parsed = [];
                }
            }
            
            parsedData[key] = (Array.isArray(parsed) ? parsed : [parsed])
                .map(normalizeRow)
                .filter(row => row.min !== undefined && row.max !== undefined);
        }
    });

    let volteCallData = [];
    if (data.volte_call) {
        try {
            volteCallData = typeof data.volte_call === 'string' 
                ? JSON.parse(data.volte_call) 
                : (Array.isArray(data.volte_call) ? data.volte_call : []);
        } catch (e) {
            volteCallData = [];
        }
    }
    parsedData.volte_call = (Array.isArray(volteCallData) ? volteCallData : []).map(normalizeRow);

    return parsedData;
};

const buildSavePayload = (thresholds, userId) => {
    const normalizeArray = (arr) => {
        return (arr || []).map(row => ({
            min: parseNumber(row.min),
            max: parseNumber(row.max),
            color: row.color || '#00ff00',
            label: row.label || '',
            range: generateRangeString(parseNumber(row.min), parseNumber(row.max)),
        }));
    };

    const payload = { 
        id: thresholds.id || 0,
        user_id: userId || 0,
        is_default: 0,
        rsrp_json: JSON.stringify(normalizeArray(thresholds.rsrp)),
        rsrq_json: JSON.stringify(normalizeArray(thresholds.rsrq)),
        sinr_json: JSON.stringify(normalizeArray(thresholds.sinr)),
        dl_thpt_json: JSON.stringify(normalizeArray(thresholds.dl_thpt)),
        ul_thpt_json: JSON.stringify(normalizeArray(thresholds.ul_thpt)),
        delta_json: JSON.stringify(normalizeArray(thresholds.delta)),
        lte_bler_json: JSON.stringify(normalizeArray(thresholds.lte_bler)),
        mos_json: JSON.stringify(normalizeArray(thresholds.mos)),
        volte_call: JSON.stringify(normalizeArray(thresholds.volte_call)),
        coveragehole_json: String(thresholds.coveragehole ?? DEFAULT_COVERAGE_HOLE),
        num_cells: JSON.stringify(normalizeArray(thresholds.num_cells)),
        level: JSON.stringify(normalizeArray(thresholds.level)),
        jitter: JSON.stringify(normalizeArray(thresholds.jitter)),
        latency: JSON.stringify(normalizeArray(thresholds.latency)),
        packet_loss: JSON.stringify(normalizeArray(thresholds.packet_loss)),
        tac: JSON.stringify(normalizeArray(thresholds.tac)),
        dominance: JSON.stringify(normalizeArray(thresholds.dominance)),
        coverage_violation: JSON.stringify(normalizeArray(thresholds.coverage_violation)),
    };

    return payload;
};

const SettingsPage = ({ onSaveSuccess }) => {
    const { user } = useAuth();
    const [thresholds, setThresholds] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeParam, setActiveParam] = useState(null);

    const allParameters = { ...PARAMETERS, ...SPECIAL_FIELDS };

    useEffect(() => {
        let mounted = true;

        const fetchData = async () => {
            try {
                const response = await settingApi.getThresholdSettings();
                const data = extractResponseData(response);
                
                if (mounted) {
                    if (data?.Status === 1 && data.Data) {
                        const parsed = parseThresholdData(data.Data);
                        setThresholds(parsed);
                    } else {
                        toast.error(data?.Message || "Failed to load settings");
                    }
                    setLoading(false);
                }
            } catch (error) {
                if (mounted) {
                    toast.error(`Error: ${error.message}`);
                    setLoading(false);
                }
            }
        };

        fetchData();
        return () => { mounted = false; };
    }, []);

    const updateParam = useCallback((key, data) => {
        setThresholds(prev => prev ? { ...prev, [key]: data } : null);
    }, []);

    const handleSave = useCallback(async () => {
        if (!thresholds) {
            toast.error("No thresholds to save");
            return;
        }

        // Ensure any focused input commits its latest value before building payload.
        if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        
        setSaving(true);
        try {
            const payload = buildSavePayload(thresholds, user?.id);
            const response = await settingApi.saveThreshold(payload);
            const data = extractResponseData(response);
            
            if (data?.Status === 1) {
                toast.success("Settings saved successfully!");
                if (onSaveSuccess) onSaveSuccess();
                
                const refetchResponse = await settingApi.getThresholdSettings();
                const refetchData = extractResponseData(refetchResponse);
                
                if (refetchData?.Status === 1 && refetchData.Data) {
                    const refetched = parseThresholdData(refetchData.Data);
                    setThresholds(refetched);

                    // Notify other views/hooks (map, legends, etc.) to refetch fresh thresholds.
                    if (typeof window !== "undefined") {
                        window.dispatchEvent(
                            new CustomEvent("thresholds:updated", {
                                detail: { updatedAt: Date.now(), thresholdId: refetchData.Data.id ?? null },
                            }),
                        );
                    }
                }
            } else {
                toast.error(data?.Message || "Save failed");
            }
        } catch (error) {
            toast.error(`Error: ${error.message}`);
        } finally {
            setSaving(false);
        }
    }, [thresholds, user?.id, onSaveSuccess]);

    const handleClose = useCallback(() => {
        setActiveParam(null);
    }, []);

    const toggleParam = useCallback((key) => {
        setActiveParam(prev => prev === key ? null : key);
    }, []);

    const getParamCount = (key) => {
        if (key === "coveragehole") return null;
        const data = thresholds?.[key];
        return Array.isArray(data) ? data.length : 0;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full w-full bg-gray-800">
                <Spinner />
            </div>
        );
    }

    if (!thresholds) {
        return (
            <div className="flex items-center justify-center h-full w-full bg-gray-800 text-white">
                <div className="text-center">
                    <p className="text-xl mb-4">Failed to load settings</p>
                    <Button onClick={() => window.location.reload()}>Retry</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gray-800 text-white h-full w-full p-4 overflow-auto">
            <div className="max-w-5xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-bold">Settings</h1>
                    <Button 
                        onClick={handleSave} 
                        disabled={saving}
                        className="bg-blue-600 hover:bg-blue-700"
                    >
                        {saving ? (
                            <>
                                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="h-4 w-4 mr-2" />
                                Save All
                            </>
                        )}
                    </Button>
                </div>

                <Card className="bg-slate-900 border-slate-700">
                    <CardHeader>
                        <CardTitle className="text-white">Threshold Configuration</CardTitle>
                        <CardDescription className="text-gray-400">
                            Configure min/max value ranges and colors for map visualization
                        </CardDescription>
                    </CardHeader>

                    <CardContent>
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(allParameters).map(([key, name]) => {
                                const count = getParamCount(key);
                                const isActive = activeParam === key;
                                
                                return (
                                    <Button
                                        key={key}
                                        variant={isActive ? "default" : "outline"}
                                        onClick={() => toggleParam(key)}
                                        className={isActive 
                                            ? "bg-blue-600 hover:bg-blue-700" 
                                            : "border-slate-600 hover:bg-slate-700 text-gray-300"
                                        }
                                    >
                                        {name}
                                        {count !== null && count > 0 && (
                                            <span className="ml-2 px-1.5 py-0.5 text-xs bg-blue-500 rounded-full">
                                                {count}
                                            </span>
                                        )}
                                    </Button>
                                );
                            })}
                        </div>

                        {activeParam === "coveragehole" && (
                            <CoverageHoleForm
                                value={thresholds.coveragehole}
                                setValue={val => updateParam("coveragehole", val)}
                                onClose={handleClose}
                            />
                        )}

                        {activeParam === "volte_call" && (
                            <VoLTECallForm
                                value={thresholds.volte_call}
                                setValue={val => updateParam("volte_call", val)}
                                onClose={handleClose}
                            />
                        )}

                        {activeParam && activeParam !== "coveragehole" && activeParam !== "volte_call" && (
                            <ThresholdForm
                                key={activeParam}
                                paramKey={activeParam}
                                paramName={allParameters[activeParam]}
                                initialData={thresholds[activeParam] || []}
                                onUpdate={data => updateParam(activeParam, data)}
                                onClose={handleClose}
                            />
                        )}

                        {!activeParam && (
                            <div className="mt-6 p-4 bg-slate-800 rounded-lg border border-slate-700">
                                <h4 className="text-sm font-semibold text-gray-300 mb-3">
                                    Current Configuration Summary
                                </h4>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                    {Object.entries(allParameters).map(([key, name]) => {
                                        if (key === "coveragehole") {
                                            return (
                                                <div 
                                                    key={key} 
                                                    className="p-3 bg-slate-700/50 rounded cursor-pointer hover:bg-slate-700"
                                                    onClick={() => toggleParam(key)}
                                                >
                                                    <div className="text-xs text-gray-400">{name}</div>
                                                    <div className="text-lg font-bold text-white">
                                                        {thresholds.coveragehole} dBm
                                                    </div>
                                                </div>
                                            );
                                        }
                                        
                                        const data = thresholds[key] || [];
                                        return (
                                            <div 
                                                key={key} 
                                                className="p-3 bg-slate-700/50 rounded cursor-pointer hover:bg-slate-700"
                                                onClick={() => toggleParam(key)}
                                            >
                                                <div className="text-xs text-gray-400">{name}</div>
                                                <div className="text-lg font-bold text-white">
                                                    {data.length} range{data.length !== 1 ? 's' : ''}
                                                </div>
                                                {data.length > 0 && (
                                                    <div className="flex gap-1 mt-2">
                                                        {data.slice(0, 4).map((row, i) => (
                                                            <div
                                                                key={row.id || i}
                                                                className="w-4 h-4 rounded"
                                                                style={{ backgroundColor: row.color }}
                                                            />
                                                        ))}
                                                        {data.length > 4 && (
                                                            <span className="text-xs text-gray-400">+{data.length - 4}</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </CardContent>

                    <CardFooter className="justify-between border-t border-slate-700 pt-4">
                        <div className="text-xs text-gray-500">
                            User: {user?.name || 'Unknown'} (ID: {user?.id || 'N/A'}) | 
                            Threshold ID: {thresholds?.id || 'New'}
                            {thresholds?.isDefault === 1 ? ' (Default)' : ' (Custom)'}
                        </div>
                        <Button 
                            onClick={handleSave} 
                            disabled={saving}
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            {saving ? (
                                <>
                                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save className="h-4 w-4 mr-2" />
                                    Save Settings
                                </>
                            )}
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
};

export default SettingsPage;
