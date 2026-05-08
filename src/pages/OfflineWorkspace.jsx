import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Database,
  FileUp,
  FolderOpen,
  HardDrive,
  Loader2,
  Lock,
  RefreshCw,
  RotateCw,
  Server,
  ShieldCheck,
  UploadCloud,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PYTHON_BASE_URL_EXPORT } from "@/api/pythonApiService";

const OFFLINE_IMPORT_QUEUE_KEY = "stracer:offline-import-queue:v1";
const LOCAL_SESSION_KEY = "user";
const LOCAL_OFFLINE_API_URL = `${PYTHON_BASE_URL_EXPORT}/api/offline`;

const readJson = (key, fallback) => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

const getLocalUser = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(LOCAL_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const formatBytes = (bytes = 0) => {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
};

const normalizeImportItem = (item = {}) => ({
  id: item.id,
  name: item.name || item.original_name || item.originalName || "Imported file",
  size: item.size ?? item.file_size ?? item.fileSize ?? 0,
  type: item.type || item.content_type || item.contentType || "unknown",
  importedAt: item.importedAt || item.created_at || item.createdAt || new Date().toISOString(),
  workspaceName: item.workspaceName || item.workspace_name || "Offline Workspace",
  parseStatus: item.parseStatus || item.parse_status || "queued",
  syncStatus: item.syncStatus || item.sync_status || "pending",
});

const useOnlineStatus = () => {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
};

const StatusTile = ({ icon: Icon, label, value, tone = "slate" }) => {
  const toneClass =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "red"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-slate-200 bg-white text-slate-800";

  return (
    <div className={`flex min-h-[92px] items-center gap-3 rounded-lg border p-4 ${toneClass}`}>
      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-md bg-white/80">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
        <p className="mt-1 text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
};

const StepRow = ({ icon: Icon, title, detail, status }) => {
  const statusClass =
    status === "ready"
      ? "bg-emerald-100 text-emerald-700"
      : status === "pending"
        ? "bg-amber-100 text-amber-700"
        : "bg-slate-100 text-slate-700";

  return (
    <div className="flex items-start gap-3 border-b border-slate-100 py-4 last:border-0">
      <div className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-md bg-slate-100 text-slate-700">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass}`}>
            {status}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-600">{detail}</p>
      </div>
    </div>
  );
};

const OfflineWorkspace = () => {
  const online = useOnlineStatus();
  const fileInputRef = useRef(null);
  const [queue, setQueue] = useState(() => readJson(OFFLINE_IMPORT_QUEUE_KEY, []));
  const [workspaceName, setWorkspaceName] = useState("Offline Workspace");
  const [checkingLocalApi, setCheckingLocalApi] = useState(false);
  const [localApiStatus, setLocalApiStatus] = useState("not-connected");
  const user = useMemo(() => getLocalUser(), []);
  const isElectron =
    typeof navigator !== "undefined" && /electron/i.test(navigator.userAgent || "");

  useEffect(() => {
    writeJson(OFFLINE_IMPORT_QUEUE_KEY, queue);
  }, [queue]);

  const loadBackendImports = async ({ quiet = false } = {}) => {
    try {
      const response = await fetch(`${LOCAL_OFFLINE_API_URL}/imports`);
      if (!response.ok) throw new Error("Local imports unavailable");
      const payload = await response.json();
      const imports = Array.isArray(payload?.Data) ? payload.Data.map(normalizeImportItem) : [];
      setQueue(imports);
      setLocalApiStatus("connected");
      if (!quiet) toast.success("Loaded local imports from SQLite.");
      return imports;
    } catch {
      if (!quiet) toast.info("Using browser fallback queue until local backend starts.");
      return null;
    }
  };

  useEffect(() => {
    loadBackendImports({ quiet: true });
  }, []);

  const pendingCount = queue.filter((item) => item.syncStatus !== "synced").length;
  const totalSize = queue.reduce((sum, item) => sum + (Number(item.size) || 0), 0);

  const checkLocalApi = async () => {
    setCheckingLocalApi(true);
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 2000);
      const response = await fetch(`${LOCAL_OFFLINE_API_URL}/health`, {
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      setLocalApiStatus(response.ok ? "connected" : "error");
      toast[response.ok ? "success" : "warning"](
        response.ok ? "Local backend is reachable." : "Local backend returned an error.",
      );
    } catch {
      setLocalApiStatus("not-connected");
      toast.info("Local backend is not running yet.");
    } finally {
      setCheckingLocalApi(false);
    }
  };

  const handleFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const uploadToBackend = async () => {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      formData.append("workspaceName", workspaceName || "Offline Workspace");
      formData.append(
        "metadata",
        JSON.stringify({
          source: "offline-workspace-ui",
          queuedWhileOnline: online,
        }),
      );

      const response = await fetch(`${LOCAL_OFFLINE_API_URL}/import`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Local import failed");
      const payload = await response.json();
      const imports = Array.isArray(payload?.Data) ? payload.Data.map(normalizeImportItem) : [];
      setLocalApiStatus("connected");
      setQueue((current) => [...imports, ...current]);
      toast.success(payload?.Message || `${files.length} file(s) queued in SQLite.`);
    };

    const now = new Date().toISOString();
    const nextItems = files.map((file) => ({
      id: `${Date.now()}-${file.name}-${file.size}`,
      name: file.name,
      size: file.size,
      type: file.type || "unknown",
      importedAt: now,
      workspaceName,
      parseStatus: "queued",
      syncStatus: online ? "ready-to-sync" : "pending",
    }));

    uploadToBackend()
      .catch(() => {
        setLocalApiStatus("not-connected");
        setQueue((current) => [...nextItems, ...current]);
        toast.warning(`${files.length} file${files.length > 1 ? "s" : ""} queued in browser fallback.`);
      })
      .finally(() => {
        if (fileInputRef.current) fileInputRef.current.value = "";
      });
  };

  const handleDrop = (event) => {
    event.preventDefault();
    handleFiles(event.dataTransfer.files);
  };

  const clearQueue = () => {
    setQueue([]);
    toast.info("Local import queue cleared.");
  };

  const markReadyForSync = () => {
    fetch(`${LOCAL_OFFLINE_API_URL}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 100 }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Local sync prepare failed");
        const payload = await response.json();
        setLocalApiStatus("connected");
        await loadBackendImports({ quiet: true });
        toast.success(payload?.Message || "Queued files marked ready for cloud sync.");
      })
      .catch(() => {
        setLocalApiStatus("not-connected");
        setQueue((current) =>
          current.map((item) => ({
            ...item,
            syncStatus: item.syncStatus === "synced" ? "synced" : "ready-to-sync",
          })),
        );
        toast.warning("Local backend unavailable. Browser queue marked ready.");
      });
  };

  const localApiTone =
    localApiStatus === "connected" ? "green" : localApiStatus === "error" ? "amber" : "red";
  const localApiText =
    localApiStatus === "connected"
      ? "Local API connected"
      : localApiStatus === "error"
        ? "Local API returned an error"
        : "Local API not connected";

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Electron offline mode
            </p>
            <h1 className="mt-1 text-3xl font-bold text-slate-950">Offline Workspace</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Import files, stage local project work, and keep a sync queue ready for the cloud
              database when the connection returns.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={checkLocalApi} disabled={checkingLocalApi}>
              {checkingLocalApi ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Server className="mr-2 h-4 w-4" />
              )}
              Check Local API
            </Button>
            <Button variant="outline" onClick={() => loadBackendImports()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Load Local Queue
            </Button>
            <Button onClick={markReadyForSync} disabled={!queue.length}>
              <RotateCw className="mr-2 h-4 w-4" />
              Prepare Sync
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <StatusTile
            icon={online ? Wifi : WifiOff}
            label="Internet"
            value={online ? "Online" : "Offline"}
            tone={online ? "green" : "amber"}
          />
          <StatusTile
            icon={isElectron ? HardDrive : AlertCircle}
            label="Runtime"
            value={isElectron ? "Electron desktop" : "Browser preview"}
            tone={isElectron ? "green" : "amber"}
          />
          <StatusTile icon={Server} label="Local Backend" value={localApiText} tone={localApiTone} />
          <StatusTile
            icon={user ? ShieldCheck : Lock}
            label="Offline Login"
            value={user ? "Cached user available" : "First online login required"}
            tone={user ? "green" : "amber"}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="rounded-lg border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileUp className="h-5 w-5 text-slate-700" />
                Local Import Queue
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <Input
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  placeholder="Workspace name"
                />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <FolderOpen className="mr-2 h-4 w-4" />
                  Select Files
                </Button>
              </div>

              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
                className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center transition hover:border-slate-500"
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud className="h-10 w-10 text-slate-500" />
                <p className="mt-3 text-sm font-semibold text-slate-900">
                  Drop session, prediction, CSV, Excel, or polygon files here
                </p>
                <p className="mt-1 max-w-xl text-sm text-slate-500">
                  The next backend step will copy these files into Electron app storage, parse them
                  into SQLite, and add durable sync jobs.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => handleFiles(event.target.files)}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Queued Files
                  </p>
                  <p className="mt-1 text-2xl font-bold text-slate-950">{queue.length}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Pending Sync
                  </p>
                  <p className="mt-1 text-2xl font-bold text-slate-950">{pendingCount}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Local Size
                  </p>
                  <p className="mt-1 text-2xl font-bold text-slate-950">{formatBytes(totalSize)}</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                {queue.length ? (
                  <div className="divide-y divide-slate-100">
                    {queue.slice(0, 8).map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-4 p-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatBytes(item.size)} | {new Date(item.importedAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex flex-none items-center gap-2">
                          <Badge variant="secondary">{item.parseStatus}</Badge>
                          <Badge variant={item.syncStatus === "ready-to-sync" ? "success" : "warning"}>
                            {item.syncStatus}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex min-h-[96px] items-center justify-center text-sm text-slate-500">
                    No local files queued yet.
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button variant="outline" onClick={clearQueue} disabled={!queue.length}>
                  Clear Queue
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="rounded-lg border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="h-5 w-5 text-slate-700" />
                  Build Plan
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StepRow
                  icon={Lock}
                  title="Offline login cache"
                  detail="First login stays online. After that, Electron can unlock the local workspace with cached user identity."
                  status={user ? "ready" : "pending"}
                />
                <StepRow
                  icon={HardDrive}
                  title="SQLite local store"
                  detail="Projects, sessions, polygons, parsed log rows, and sync jobs will live in a local database."
                  status="pending"
                />
                <StepRow
                  icon={Server}
                  title="Local Python API"
                  detail="The bundled Python service should own file parsing, SQLite writes, and map-ready local data queries."
                  status={localApiStatus === "connected" ? "ready" : "pending"}
                />
                <StepRow
                  icon={Cloud}
                  title="Cloud sync worker"
                  detail="When internet returns, pending jobs upload in batches with retry and idempotency keys."
                  status={online ? "ready" : "pending"}
                />
              </CardContent>
            </Card>

            <Card className="rounded-lg border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  {online ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <CloudOff className="h-5 w-5 text-amber-600" />
                  )}
                  Sync Readiness
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600">
                <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
                  <RefreshCw className="mt-0.5 h-4 w-4 text-slate-600" />
                  <p>
                    Pending imports should be converted into durable `sync_queue` rows before we
                    send anything to the cloud database.
                  </p>
                </div>
                <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-slate-600" />
                  <p>
                    Each upload needs a stable idempotency key so retries do not create duplicate
                    sessions or projects.
                  </p>
                </div>
                <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
                  <Cloud className="mt-0.5 h-4 w-4 text-slate-600" />
                  <p>
                    Cloud sync should run after the local parse succeeds, not while the user is
                    importing files.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OfflineWorkspace;
