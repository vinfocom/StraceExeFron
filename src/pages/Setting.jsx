import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { toast } from 'react-toastify';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import Spinner from '../components/common/Spinner';
import { X, Plus, Save, RefreshCw, ArrowUpDown, Download, Upload } from 'lucide-react';
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
    level: "Ping Pong",
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
const DEFAULT_TECHNOLOGY_COLORS = {
    twoG: "#6B7280",
    threeG: "#10B981",
    fourG: "#8B5CF6",
    fiveG: "#EC4899",
};
const TECHNOLOGY_COLOR_LABELS = {
    default: "Default",
    fiveG: "5G",
    fourG: "4G",
    threeG: "3G",
    twoG: "2G",
};
const THRESHOLD_BUCKET_KEYS = ["default", "5g", "4g", "3g", "2g"];
const TECHNOLOGY_TAB_TO_BUCKET_KEY = {
    default: "default",
    fiveG: "5g",
    fourG: "4g",
    threeG: "3g",
    twoG: "2g",
};

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

const createEmptyThresholdBuckets = () => ({
    default: [],
    "5g": [],
    "4g": [],
    "3g": [],
    "2g": [],
});

const createEmptyScalarBuckets = (fallback = DEFAULT_COVERAGE_HOLE) => ({
    default: fallback,
    "5g": fallback,
    "4g": fallback,
    "3g": fallback,
    "2g": fallback,
});

const parseBucketedRangeValue = (rawValue) => {
    if (!rawValue) return createEmptyThresholdBuckets();

    try {
        const parsed = typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue;

        if (Array.isArray(parsed)) {
            return {
                ...createEmptyThresholdBuckets(),
                default: parsed,
            };
        }

        if (parsed && typeof parsed === "object") {
            return THRESHOLD_BUCKET_KEYS.reduce((acc, key) => {
                acc[key] = Array.isArray(parsed[key]) ? parsed[key] : [];
                return acc;
            }, createEmptyThresholdBuckets());
        }
    } catch (error) {
        console.error("Error parsing threshold bucket payload:", error);
    }

    return createEmptyThresholdBuckets();
};

const parseBucketedScalarValue = (rawValue, fallback = DEFAULT_COVERAGE_HOLE) => {
    if (rawValue === null || rawValue === undefined || rawValue === "") {
        return createEmptyScalarBuckets(fallback);
    }

    try {
        const parsed = typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue;

        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return THRESHOLD_BUCKET_KEYS.reduce((acc, key) => {
                const nextValue = parsed[key];
                acc[key] = nextValue === undefined || nextValue === null || nextValue === ""
                    ? fallback
                    : parseNumber(nextValue);
                return acc;
            }, createEmptyScalarBuckets(fallback));
        }
    } catch {
        const parsedNumber = parseNumber(rawValue);
        return createEmptyScalarBuckets(parsedNumber || fallback);
    }

    return createEmptyScalarBuckets(parseNumber(rawValue) || fallback);
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
        <div className="grid grid-cols-12 gap-2 items-center p-3.5 bg-slate-900/70 border border-slate-600/70 rounded-xl hover:border-blue-500/40 hover:bg-slate-900 transition-all">
            <div className="col-span-2">
                <label className="text-xs text-slate-300 block mb-1">Min</label>
                <Input
                    className="text-white bg-slate-950 border-slate-600 focus:border-blue-500 rounded-lg"
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
                <label className="text-xs text-slate-300 block mb-1">Max</label>
                <Input
                    className="text-white bg-slate-950 border-slate-600 focus:border-blue-500 rounded-lg"
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
                <label className="text-xs text-slate-300 block mb-1">Color</label>
                <div className="flex items-center gap-2">
                    <Input
                        type="color"
                        value={color}
                        onChange={e => {
                            setColor(e.target.value);
                            syncToParent({ color: e.target.value });
                        }}
                        className="w-10 h-9 p-1 cursor-pointer rounded-lg border-slate-600 bg-slate-950"
                    />
                    <Input
                        className="text-white bg-slate-950 border-slate-600 flex-1 text-xs rounded-lg"
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

            <div className="col-span-4 flex items-end gap-2">
                <div className="flex-1">
                    <label className="text-xs text-slate-300 block mb-1">Range</label>
                    <div 
                        className="text-xs px-2 py-2 rounded-lg text-center font-semibold truncate border"
                        style={{ backgroundColor: color + '40', color: color }}
                    >
                        {generateRangeString(currentMin, currentMax) || 'N/A'}
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(index)}
                    className="h-9 w-9 text-rose-300 hover:text-rose-200 hover:bg-rose-900/40 rounded-lg"
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
});

ThresholdRow.displayName = 'ThresholdRow';

const ThresholdForm = memo(({ paramKey, paramName, initialData, onUpdate, onClose }) => {
    const [localBuckets, setLocalBuckets] = useState(createEmptyThresholdBuckets());
    const [activeTechTab, setActiveTechTab] = useState("default");
    const isInitialMount = useRef(true);
    const pendingUpdate = useRef(false);

    useEffect(() => {
        const normalizedBuckets = THRESHOLD_BUCKET_KEYS.reduce((acc, key) => {
            acc[key] = Array.isArray(initialData?.[key])
                ? initialData[key].map(row => normalizeRow(row))
                : [];
            return acc;
        }, createEmptyThresholdBuckets());
        setLocalBuckets(normalizedBuckets);
        setActiveTechTab("default");
        isInitialMount.current = false;
        pendingUpdate.current = false;
    }, [paramKey]);

    const activeBucketKey = TECHNOLOGY_TAB_TO_BUCKET_KEY[activeTechTab] || "default";
    const currentRows = localBuckets[activeBucketKey] || [];

    const handleChange = useCallback((index, updatedRow) => {
        pendingUpdate.current = true;
        setLocalBuckets(prev => {
            const updated = [...(prev[activeBucketKey] || [])];
            updated[index] = normalizeRow(updatedRow);
            return {
                ...prev,
                [activeBucketKey]: updated,
            };
        });
    }, [activeBucketKey]);

    const addRow = useCallback(() => {
        pendingUpdate.current = true;
        setLocalBuckets(prev => ({
            ...prev,
            [activeBucketKey]: [...(prev[activeBucketKey] || []), createNewRow()],
        }));
    }, [activeBucketKey]);

    const deleteRow = useCallback((index) => {
        pendingUpdate.current = true;
        setLocalBuckets(prev => ({
            ...prev,
            [activeBucketKey]: (prev[activeBucketKey] || []).filter((_, i) => i !== index),
        }));
    }, [activeBucketKey]);

    const sortByMin = useCallback(() => {
        pendingUpdate.current = true;
        setLocalBuckets(prev => ({
            ...prev,
            [activeBucketKey]: [...(prev[activeBucketKey] || [])].sort((a, b) => a.min - b.min),
        }));
    }, [activeBucketKey]);

    useEffect(() => {
        if (isInitialMount.current) return;
        if (!pendingUpdate.current) return;
        onUpdate(localBuckets);
        pendingUpdate.current = false;
    }, [localBuckets, onUpdate]);

    return (
        <div className="mt-5 border border-slate-700 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 shadow-lg overflow-hidden">
            <div className="flex justify-between items-start px-5 pt-5 mb-5">
                <div>
                    <h3 className="text-lg font-semibold tracking-wide text-white">{paramName}</h3>
                    <p className="text-xs text-slate-400 mt-1">
                        {currentRows.length} threshold range(s) configured
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={sortByMin}
                        className="text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg"
                        disabled={currentRows.length < 2}
                    >
                        <ArrowUpDown className="h-4 w-4 mr-1" />
                        Sort
                    </Button>
                    <Button variant="ghost" size="icon" onClick={onClose} className="rounded-lg hover:bg-slate-800">
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="px-5">
                <div className="inline-flex overflow-hidden rounded-t-2xl border border-slate-700 border-b-0 bg-slate-950/50">
                    {Object.entries(TECHNOLOGY_COLOR_LABELS).map(([techKey, techLabel], index, arr) => {
                        const isActive = activeTechTab === techKey;
                        const isFirst = index === 0;
                        const isLast = index === arr.length - 1;

                        return (
                            <button
                                key={techKey}
                                type="button"
                                onClick={() => setActiveTechTab(techKey)}
                                className={[
                                    "px-5 py-3 text-sm font-semibold transition-all focus:outline-none",
                                    "border-r border-slate-700 last:border-r-0",
                                    isActive
                                        ? "bg-slate-800 text-white"
                                        : "bg-transparent text-slate-300 hover:bg-slate-900 hover:text-white",
                                    isFirst ? "rounded-tl-2xl" : "",
                                    isLast ? "rounded-tr-2xl" : "",
                                ].filter(Boolean).join(" ")}
                            >
                                {techLabel}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="mx-5 mb-5 rounded-b-2xl rounded-tr-2xl border border-slate-700 bg-slate-800">
                

                <div className="p-4">
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {currentRows.map((row, index) => (
                            <ThresholdRow
                                key={row.id}
                                row={row}
                                index={index}
                                onChange={handleChange}
                                onDelete={deleteRow}
                            />
                        ))}
                    </div>

                    {currentRows.length === 0 && (
                        <div className="text-center py-8 text-slate-400 border-2 border-dashed border-slate-600/70 rounded-xl bg-slate-900/40">
                            <p>No thresholds configured</p>
                            <p className="text-xs mt-1">Click "Add Row" to create a threshold range</p>
                        </div>
                    )}

                    <div className="flex gap-2 mt-4">
                        <Button onClick={addRow} variant="outline" className="flex-1 border-slate-500 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg">
                            <Plus className="h-4 w-4 mr-1" />
                            Add Row
                        </Button>
                    </div>

                    {currentRows.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-slate-700">
                            <p className="text-xs text-slate-400 mb-2 uppercase tracking-wide">Preview</p>
                            <div className="flex flex-wrap gap-1">
                                {currentRows.map((row) => (
                                    <div
                                        key={row.id}
                                        className="px-2 py-1 rounded-lg text-xs font-semibold"
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
            </div>
        </div>
    );
});

ThresholdForm.displayName = 'ThresholdForm';

const VoLTECallForm = memo(({ value, setValue, onClose }) => {
    const [localBuckets, setLocalBuckets] = useState(createEmptyThresholdBuckets());
    const [activeTechTab, setActiveTechTab] = useState("default");
    const isInitialMount = useRef(true);
    const pendingUpdate = useRef(false);

    useEffect(() => {
        const nextBuckets = THRESHOLD_BUCKET_KEYS.reduce((acc, key) => {
            acc[key] = Array.isArray(value?.[key]) ? value[key].map(normalizeRow) : [];
            return acc;
        }, createEmptyThresholdBuckets());
        setLocalBuckets(nextBuckets);
        setActiveTechTab("default");
        isInitialMount.current = false;
    }, [value]);

    const activeBucketKey = TECHNOLOGY_TAB_TO_BUCKET_KEY[activeTechTab] || "default";
    const currentRows = localBuckets[activeBucketKey] || [];

    const handleChange = useCallback((index, updatedRow) => {
        pendingUpdate.current = true;
        setLocalBuckets(prev => {
            const updated = [...(prev[activeBucketKey] || [])];
            updated[index] = normalizeRow(updatedRow);
            return {
                ...prev,
                [activeBucketKey]: updated,
            };
        });
    }, [activeBucketKey]);

    const addRow = useCallback(() => {
        pendingUpdate.current = true;
        setLocalBuckets(prev => ({
            ...prev,
            [activeBucketKey]: [...(prev[activeBucketKey] || []), createNewRow()],
        }));
    }, [activeBucketKey]);

    const deleteRow = useCallback((index) => {
        pendingUpdate.current = true;
        setLocalBuckets(prev => ({
            ...prev,
            [activeBucketKey]: (prev[activeBucketKey] || []).filter((_, i) => i !== index),
        }));
    }, [activeBucketKey]);

    const sortByMin = useCallback(() => {
        pendingUpdate.current = true;
        setLocalBuckets(prev => ({
            ...prev,
            [activeBucketKey]: [...(prev[activeBucketKey] || [])].sort((a, b) => a.min - b.min),
        }));
    }, [activeBucketKey]);

    useEffect(() => {
        if (isInitialMount.current) return;
        if (!pendingUpdate.current) return;
        setValue(localBuckets);
        pendingUpdate.current = false;
    }, [localBuckets, setValue]);

    return (
        <div className="mt-5 p-5 border border-slate-700 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 shadow-lg">
            <div className="flex justify-between items-start mb-5">
                <div>
                    <h3 className="text-lg font-semibold tracking-wide text-white">VoLTE Call</h3>
                    <p className="text-xs text-slate-400 mt-1">
                        {currentRows.length} threshold range(s) configured
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={sortByMin}
                        className="text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg"
                        disabled={currentRows.length < 2}
                    >
                        <ArrowUpDown className="h-4 w-4 mr-1" />
                        Sort
                    </Button>
                    <Button variant="ghost" size="icon" onClick={onClose} className="rounded-lg hover:bg-slate-800">
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="mb-5">
                <div className="inline-flex overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/80 p-1 shadow-inner">
                    {Object.entries(TECHNOLOGY_COLOR_LABELS).map(([techKey, techLabel]) => {
                        const isActive = activeTechTab === techKey;
                        return (
                            <button
                                key={techKey}
                                type="button"
                                onClick={() => setActiveTechTab(techKey)}
                                className={[
                                    "px-4 py-2 text-sm font-semibold transition-all focus:outline-none",
                                    isActive
                                        ? "bg-slate-800 text-white rounded-xl"
                                        : "bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl",
                                ].join(" ")}
                            >
                                {techLabel}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
                {currentRows.map((row, index) => (
                    <ThresholdRow
                        key={row.id}
                        row={row}
                        index={index}
                        onChange={handleChange}
                        onDelete={deleteRow}
                    />
                ))}
            </div>

            {currentRows.length === 0 && (
                <div className="text-center py-8 text-slate-400 border-2 border-dashed border-slate-600/70 rounded-xl bg-slate-900/40">
                    <p>No thresholds configured</p>
                </div>
            )}

            <div className="flex gap-2 mt-4">
                <Button onClick={addRow} variant="outline" className="flex-1 border-slate-500 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Row
                </Button>
            </div>

            {currentRows.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-700">
                    <p className="text-xs text-slate-400 mb-2 uppercase tracking-wide">Preview</p>
                    <div className="flex flex-wrap gap-1">
                        {currentRows.map((row) => (
                            <div
                                key={row.id}
                                className="px-2 py-1 rounded-lg text-xs font-semibold"
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
    const [localValues, setLocalValues] = useState(createEmptyScalarBuckets(DEFAULT_COVERAGE_HOLE));
    const [activeTechTab, setActiveTechTab] = useState("default");

    const activeBucketKey = TECHNOLOGY_TAB_TO_BUCKET_KEY[activeTechTab] || "default";
    const activeValue = localValues[activeBucketKey] ?? DEFAULT_COVERAGE_HOLE;
    const [localValueStr, setLocalValueStr] = useState(String(activeValue));

    useEffect(() => {
        const nextValues = createEmptyScalarBuckets(DEFAULT_COVERAGE_HOLE);
        THRESHOLD_BUCKET_KEYS.forEach((key) => {
            nextValues[key] = value?.[key] ?? DEFAULT_COVERAGE_HOLE;
        });
        setLocalValues(nextValues);
        setActiveTechTab("default");
        setLocalValueStr(String(nextValues.default));
    }, [value]);

    useEffect(() => {
        setLocalValueStr(String(localValues[activeBucketKey] ?? DEFAULT_COVERAGE_HOLE));
    }, [activeBucketKey, localValues]);

    const handleBlur = useCallback(() => {
        const num = parseNumber(localValueStr);
        const finalValue = num > 0 ? -num : num;
        setLocalValueStr(String(finalValue));
        const nextValues = {
            ...localValues,
            [activeBucketKey]: finalValue,
        };
        setLocalValues(nextValues);
        setValue(nextValues);
    }, [activeBucketKey, localValueStr, localValues, setValue]);

    const currentValue = parseNumber(localValueStr);

    return (
        <div className="mt-5 p-5 border border-slate-700 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 shadow-lg">
            <div className="flex justify-between items-start mb-5">
                <div>
                    <h3 className="text-lg font-semibold tracking-wide text-white">Coverage Hole</h3>
                    <p className="text-xs text-slate-400 mt-1">
                        RSRP threshold below which is considered a coverage hole
                    </p>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} className="rounded-lg hover:bg-slate-800">
                    <X className="h-4 w-4" />
                </Button>
            </div>

            <div className="flex items-center gap-3">
                <div className="inline-flex overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/80 p-1 shadow-inner">
                    {Object.entries(TECHNOLOGY_COLOR_LABELS).map(([techKey, techLabel]) => {
                        const isActive = activeTechTab === techKey;
                        return (
                            <button
                                key={techKey}
                                type="button"
                                onClick={() => setActiveTechTab(techKey)}
                                className={[
                                    "px-4 py-2 text-sm font-semibold transition-all focus:outline-none",
                                    isActive
                                        ? "bg-slate-800 text-white rounded-xl"
                                        : "bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl",
                                ].join(" ")}
                            >
                                {techLabel}
                            </button>
                        );
                    })}
                </div>
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
                    className="w-32 text-white bg-slate-950 border-slate-600 rounded-lg"
                />
                <span className="text-slate-300 text-sm font-medium">dBm</span>
                <div className="text-xs text-slate-500">
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
        _bucketPayloads: {},
    };

    Object.keys(PARAMETERS).forEach(key => {
        if (key === "coveragehole") {
            const scalarBuckets = parseBucketedScalarValue(data.coveragehole_json || data.coveragehole, DEFAULT_COVERAGE_HOLE);
            parsedData._bucketPayloads[key] = scalarBuckets;
            parsedData[key] = scalarBuckets;
        } else if (key === "num_cells" || key === "level" || key === "jitter" || key === "latency" || key === "packet_loss" || key === "tac" || key === "dominance" || key === "coverage_violation" ) {
            const bucketedRanges = parseBucketedRangeValue(data[key]);
            parsedData._bucketPayloads[key] = bucketedRanges;
            parsedData[key] = THRESHOLD_BUCKET_KEYS.reduce((acc, bucketKey) => {
                acc[bucketKey] = (Array.isArray(bucketedRanges[bucketKey]) ? bucketedRanges[bucketKey] : [])
                    .map(normalizeRow)
                    .filter(row => row.min !== undefined && row.max !== undefined && row.min !== null && row.max !== null);
                return acc;
            }, createEmptyThresholdBuckets());
        }
        else {
            const bucketedRanges = parseBucketedRangeValue(data[`${key}_json`]);
            parsedData._bucketPayloads[key] = bucketedRanges;
            parsedData[key] = THRESHOLD_BUCKET_KEYS.reduce((acc, bucketKey) => {
                acc[bucketKey] = (Array.isArray(bucketedRanges[bucketKey]) ? bucketedRanges[bucketKey] : [])
                    .map(normalizeRow)
                    .filter(row => row.min !== undefined && row.max !== undefined);
                return acc;
            }, createEmptyThresholdBuckets());
        }
    });

    const volteCallBuckets = parseBucketedRangeValue(data.volte_call);
    parsedData._bucketPayloads.volte_call = volteCallBuckets;
    parsedData.volte_call = THRESHOLD_BUCKET_KEYS.reduce((acc, bucketKey) => {
        acc[bucketKey] = (Array.isArray(volteCallBuckets[bucketKey]) ? volteCallBuckets[bucketKey] : []).map(normalizeRow);
        return acc;
    }, createEmptyThresholdBuckets());

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

    const normalizeBucketedRanges = (key, sourceBuckets) => {
        const existingBuckets = thresholds?._bucketPayloads?.[key] || createEmptyThresholdBuckets();
        const nextBuckets = { ...createEmptyThresholdBuckets(), ...existingBuckets };
        THRESHOLD_BUCKET_KEYS.forEach((bucketKey) => {
            nextBuckets[bucketKey] = normalizeArray(sourceBuckets?.[bucketKey] || []);
        });
        return JSON.stringify(nextBuckets);
    };

    const normalizeBucketedScalar = (key, sourceValues, fallback = DEFAULT_COVERAGE_HOLE) => {
        const existingBuckets = thresholds?._bucketPayloads?.[key] || createEmptyScalarBuckets(fallback);
        const nextBuckets = { ...createEmptyScalarBuckets(fallback), ...existingBuckets };
        THRESHOLD_BUCKET_KEYS.forEach((bucketKey) => {
            const parsedValue = parseNumber(sourceValues?.[bucketKey]);
            nextBuckets[bucketKey] = Number.isFinite(parsedValue) ? parsedValue : fallback;
        });
        return JSON.stringify(nextBuckets);
    };

    const payload = { 
        id: thresholds.id || 0,
        user_id: userId || 0,
        is_default: 0,
        rsrp_json: normalizeBucketedRanges("rsrp", thresholds.rsrp),
        rsrq_json: normalizeBucketedRanges("rsrq", thresholds.rsrq),
        sinr_json: normalizeBucketedRanges("sinr", thresholds.sinr),
        dl_thpt_json: normalizeBucketedRanges("dl_thpt", thresholds.dl_thpt),
        ul_thpt_json: normalizeBucketedRanges("ul_thpt", thresholds.ul_thpt),
        delta_json: normalizeBucketedRanges("delta", thresholds.delta),
        lte_bler_json: normalizeBucketedRanges("lte_bler", thresholds.lte_bler),
        mos_json: normalizeBucketedRanges("mos", thresholds.mos),
        volte_call: normalizeBucketedRanges("volte_call", thresholds.volte_call),
        coveragehole_json: normalizeBucketedScalar("coveragehole", thresholds.coveragehole, DEFAULT_COVERAGE_HOLE),
        num_cells: normalizeBucketedRanges("num_cells", thresholds.num_cells),
        level: normalizeBucketedRanges("level", thresholds.level),
        jitter: normalizeBucketedRanges("jitter", thresholds.jitter),
        latency: normalizeBucketedRanges("latency", thresholds.latency),
        packet_loss: normalizeBucketedRanges("packet_loss", thresholds.packet_loss),
        tac: normalizeBucketedRanges("tac", thresholds.tac),
        dominance: normalizeBucketedRanges("dominance", thresholds.dominance),
        coverage_violation: normalizeBucketedRanges("coverage_violation", thresholds.coverage_violation),
    };

    return payload;
};

const createImportableSettingsSnapshot = (thresholds) => {
    if (!thresholds) return null;

    const cloneBucketedRanges = (sourceBuckets) => THRESHOLD_BUCKET_KEYS.reduce((acc, bucketKey) => {
        acc[bucketKey] = (sourceBuckets?.[bucketKey] || []).map((row) => ({
            min: parseNumber(row.min),
            max: parseNumber(row.max),
            color: row.color || '#00ff00',
            label: row.label || '',
            range: generateRangeString(parseNumber(row.min), parseNumber(row.max)),
        }));
        return acc;
    }, createEmptyThresholdBuckets());

    const cloneBucketedScalar = (sourceValues, fallback = DEFAULT_COVERAGE_HOLE) => THRESHOLD_BUCKET_KEYS.reduce((acc, bucketKey) => {
        const parsedValue = parseNumber(sourceValues?.[bucketKey]);
        acc[bucketKey] = Number.isFinite(parsedValue) ? parsedValue : fallback;
        return acc;
    }, createEmptyScalarBuckets(fallback));

    return {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: {
            rsrp: cloneBucketedRanges(thresholds.rsrp),
            rsrq: cloneBucketedRanges(thresholds.rsrq),
            sinr: cloneBucketedRanges(thresholds.sinr),
            dl_thpt: cloneBucketedRanges(thresholds.dl_thpt),
            ul_thpt: cloneBucketedRanges(thresholds.ul_thpt),
            delta: cloneBucketedRanges(thresholds.delta),
            lte_bler: cloneBucketedRanges(thresholds.lte_bler),
            mos: cloneBucketedRanges(thresholds.mos),
            volte_call: cloneBucketedRanges(thresholds.volte_call),
            coveragehole: cloneBucketedScalar(thresholds.coveragehole, DEFAULT_COVERAGE_HOLE),
            num_cells: cloneBucketedRanges(thresholds.num_cells),
            level: cloneBucketedRanges(thresholds.level),
            jitter: cloneBucketedRanges(thresholds.jitter),
            latency: cloneBucketedRanges(thresholds.latency),
            packet_loss: cloneBucketedRanges(thresholds.packet_loss),
            tac: cloneBucketedRanges(thresholds.tac),
            dominance: cloneBucketedRanges(thresholds.dominance),
            coverage_violation: cloneBucketedRanges(thresholds.coverage_violation),
        },
    };
};

const buildThresholdsFromImportedSettings = (importedSettings, currentThresholds) => {
    if (!importedSettings || typeof importedSettings !== "object") {
        throw new Error("Invalid settings file");
    }

    const normalizeImportedRanges = (sourceBuckets) => THRESHOLD_BUCKET_KEYS.reduce((acc, bucketKey) => {
        acc[bucketKey] = Array.isArray(sourceBuckets?.[bucketKey])
            ? sourceBuckets[bucketKey].map(normalizeRow)
            : [];
        return acc;
    }, createEmptyThresholdBuckets());

    const normalizeImportedScalar = (sourceValues, fallback = DEFAULT_COVERAGE_HOLE) => THRESHOLD_BUCKET_KEYS.reduce((acc, bucketKey) => {
        const rawValue = sourceValues?.[bucketKey];
        acc[bucketKey] = rawValue === undefined || rawValue === null || rawValue === ""
            ? fallback
            : parseNumber(rawValue);
        return acc;
    }, createEmptyScalarBuckets(fallback));

    return {
        ...currentThresholds,
        rsrp: normalizeImportedRanges(importedSettings.rsrp),
        rsrq: normalizeImportedRanges(importedSettings.rsrq),
        sinr: normalizeImportedRanges(importedSettings.sinr),
        dl_thpt: normalizeImportedRanges(importedSettings.dl_thpt),
        ul_thpt: normalizeImportedRanges(importedSettings.ul_thpt),
        delta: normalizeImportedRanges(importedSettings.delta),
        lte_bler: normalizeImportedRanges(importedSettings.lte_bler),
        mos: normalizeImportedRanges(importedSettings.mos),
        volte_call: normalizeImportedRanges(importedSettings.volte_call),
        coveragehole: normalizeImportedScalar(importedSettings.coveragehole, DEFAULT_COVERAGE_HOLE),
        num_cells: normalizeImportedRanges(importedSettings.num_cells),
        level: normalizeImportedRanges(importedSettings.level),
        jitter: normalizeImportedRanges(importedSettings.jitter),
        latency: normalizeImportedRanges(importedSettings.latency),
        packet_loss: normalizeImportedRanges(importedSettings.packet_loss),
        tac: normalizeImportedRanges(importedSettings.tac),
        dominance: normalizeImportedRanges(importedSettings.dominance),
        coverage_violation: normalizeImportedRanges(importedSettings.coverage_violation),
        _bucketPayloads: {},
    };
};

const SettingsPage = ({ onSaveSuccess }) => {
    const { user } = useAuth();
    const [thresholds, setThresholds] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeParam, setActiveParam] = useState(null);
    const fileInputRef = useRef(null);

    const allParameters = { ...PARAMETERS, ...SPECIAL_FIELDS };

    useEffect(() => {
        let mounted = true;

        const fetchData = async () => {
            try {
                const response = await settingApi.getThresholdSettings();
                if (!response) return;
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

    const persistThresholds = useCallback(async (nextThresholds, successMessage = "Settings saved successfully!") => {
        if (!nextThresholds) {
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
            const payload = buildSavePayload(nextThresholds, user?.id);
            const response = await settingApi.saveThreshold(payload);
            if (!response) return;
            const data = extractResponseData(response);
            
            if (data?.Status === 1) {
                toast.success(successMessage);
                if (onSaveSuccess) onSaveSuccess();
                
                const refetchResponse = await settingApi.getThresholdSettings();
                if (!refetchResponse) return;
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
    }, [user?.id, onSaveSuccess]);

    const handleSave = useCallback(async () => {
        await persistThresholds(thresholds, "Settings saved successfully!");
    }, [persistThresholds, thresholds]);

    const handleDownloadSettings = useCallback(() => {
        if (!thresholds) {
            toast.error("No settings available to download");
            return;
        }

        const snapshot = createImportableSettingsSnapshot(thresholds);
        const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        const datePart = new Date().toISOString().slice(0, 10);
        anchor.href = url;
        anchor.download = `settings-backup-${datePart}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    }, [thresholds]);

    const handleUploadButtonClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleUploadSettings = useCallback(async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const rawText = await file.text();
            const parsedFile = JSON.parse(rawText);
            const importedSettings = parsedFile?.settings || parsedFile;
            const nextThresholds = buildThresholdsFromImportedSettings(importedSettings, thresholds);
            setThresholds(nextThresholds);
            setActiveParam(null);
            await persistThresholds(nextThresholds, "Settings imported and updated successfully!");
        } catch (error) {
            toast.error(`Import failed: ${error.message}`);
        } finally {
            event.target.value = '';
        }
    }, [persistThresholds, thresholds]);

    const handleClose = useCallback(() => {
        setActiveParam(null);
    }, []);

    const toggleParam = useCallback((key) => {
        setActiveParam(prev => prev === key ? null : key);
    }, []);

    const getParamCount = (key) => {
        if (key === "coveragehole") return null;
        const data = thresholds?.[key];
        return Array.isArray(data?.default) ? data.default.length : 0;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
                <Spinner />
            </div>
        );
    }

    if (!thresholds) {
        return (
            <div className="flex items-center justify-center h-full w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
                <div className="text-center">
                    <p className="text-xl mb-4">Failed to load settings</p>
                    <Button onClick={() => window.location.reload()}>Retry</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white min-h-screen w-full p-4 md:p-6 overflow-auto">
            <div className="max-w-6xl mx-auto">
                <Card className="bg-slate-900/80 border-slate-700/80 rounded-2xl shadow-xl overflow-hidden">
                    <CardHeader className="border-b border-slate-700/70 bg-slate-900/90">
                        <CardTitle className="text-white text-xl tracking-tight">Settings</CardTitle>
                        
                    </CardHeader>

                    <CardContent className="pt-5">
                        <>
                                <div className="flex flex-wrap gap-2.5">
                                    {Object.entries(allParameters).map(([key, name]) => {
                                        const count = getParamCount(key);
                                        const isActive = activeParam === key;
                                        
                                        return (
                                            <Button
                                                key={key}
                                                variant={isActive ? "default" : "outline"}
                                                onClick={() => toggleParam(key)}
                                                className={isActive 
                                                    ? "bg-blue-600 hover:bg-blue-700 text-white ring-2 ring-blue-400/50 rounded-full px-4"
                                                    : "border-slate-500 !bg-slate-600 hover:!bg-slate-700 text-gray-100 rounded-full px-4"
                                                }
                                            >
                                                {name}
                                                {count !== null && count > 0 && (
                                                    <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-slate-900/50 border border-slate-300/20 rounded-full">
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
                                        initialData={thresholds[activeParam] || createEmptyThresholdBuckets()}
                                        onUpdate={data => updateParam(activeParam, data)}
                                        onClose={handleClose}
                                    />
                                )}

                                {!activeParam && (
                                    <div className="mt-6 p-5 bg-slate-900/70 rounded-2xl border border-slate-700/70">
                                        <h4 className="text-sm font-semibold text-slate-200 mb-3 uppercase tracking-wide">
                                            Current Configuration Summary
                                        </h4>
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                            {Object.entries(allParameters).map(([key, name]) => {
                                                if (key === "coveragehole") {
                                                    return (
                                                        <div 
                                                            key={key} 
                                                            className="p-3.5 bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl cursor-pointer hover:border-blue-500/40 transition-all"
                                                            onClick={() => toggleParam(key)}
                                                        >
                                                            <div className="text-xs text-slate-400">{name}</div>
                                                            <div className="text-lg font-bold text-white">
                                                                {thresholds.coveragehole?.default ?? DEFAULT_COVERAGE_HOLE} dBm
                                                            </div>
                                                        </div>
                                                    );
                                                }

                                                const data = thresholds[key] || [];
                                                return (
                                                    <div 
                                                        key={key} 
                                                        className="p-3.5 bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl cursor-pointer hover:border-blue-500/40 transition-all"
                                                        onClick={() => toggleParam(key)}
                                                    >
                                                        <div className="text-xs text-slate-400">{name}</div>
                                                        <div className="text-lg font-bold text-white">
                                                            {(data.default || []).length} range{(data.default || []).length !== 1 ? 's' : ''}
                                                        </div>
                                                        {(data.default || []).length > 0 && (
                                                            <div className="flex gap-1 mt-2">
                                                                {(data.default || []).slice(0, 4).map((row, i) => (
                                                                    <div
                                                                        key={row.id || i}
                                                                        className="w-4 h-4 rounded"
                                                                        style={{ backgroundColor: row.color }}
                                                                    />
                                                                ))}
                                                                {(data.default || []).length > 4 && (
                                                                    <span className="text-xs text-slate-400">+{(data.default || []).length - 4}</span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                        </>
                    </CardContent>

                    <CardFooter className="justify-between border-t border-slate-700/70 pt-4 bg-slate-900/90">
                        <div className="text-xs text-slate-400">
                            User: {user?.name || 'Unknown'} (ID: {user?.id || 'N/A'}) | 
                            Threshold ID: {thresholds?.id || 'New'}
                            {thresholds?.isDefault === 1 ? ' (Default)' : ' (Custom)'}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="application/json,.json"
                                onChange={handleUploadSettings}
                                className="hidden"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleDownloadSettings}
                                disabled={saving}
                                className="border-slate-500 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg"
                            >
                                <Download className="h-4 w-4 mr-2" />
                                Download Settings
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleUploadButtonClick}
                                disabled={saving}
                                className="border-slate-500 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg"
                            >
                                <Upload className="h-4 w-4 mr-2" />
                                Upload Settings
                            </Button>
                            <Button 
                                onClick={handleSave} 
                                disabled={saving}
                                className="bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md"
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
                        </div>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
};

export default SettingsPage;
