import React, { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Square, X } from "lucide-react";
import appLogo from "/favicon.svg";

const menuButtonClass =
  "px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-200 rounded transition-colors";

const menuPanelClass =
  "absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded shadow-lg min-w-[150px] z-[100] p-1";

const MAP_ZOOM_LOCK_STORAGE_KEY = "stracer:map-zoom-lock";
const MAP_ZOOM_LOCK_EVENT = "stracer:map-zoom-lock-change";

const MenuGroup = ({
  label,
  actions,
  isOpen,
  onToggle,
  onHoverOpen,
  onActionClick,
}) => (
  <div
    className="relative [webkit-app-region:no-drag]"
    onMouseEnter={onHoverOpen}
  >
    <button
      type="button"
      onClick={onToggle}
      className={`${menuButtonClass} cursor-pointer ${isOpen ? "bg-slate-200" : ""}`}
    >
      {label}
    </button>
    {isOpen && (
      <div className={menuPanelClass}>
        {actions.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={async () => {
              await item.onClick();
              onActionClick();
            }}
            className="w-full text-left px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 rounded"
          >
            {item.checked !== undefined ? (
              <span className="flex w-full items-center justify-between gap-3">
                <span>{item.label}</span>
                <span className="w-3 text-center">{item.checked ? "✓" : ""}</span>
              </span>
            ) : (
              item.label
            )}
          </button>
        ))}
      </div>
    )}
  </div>
);

const callWindowApi = async (fnName) => {
  const api = window?.electronWindow;
  if (!api || typeof api[fnName] !== "function") return;
  await api[fnName]();
};

const emitUtilityAction = (action) => {
  if (typeof window === "undefined" || !action) return;
  window.dispatchEvent(
    new CustomEvent("stracer:utility-action", {
      detail: { action },
    }),
  );
};

const readMapZoomLock = () => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MAP_ZOOM_LOCK_STORAGE_KEY) === "1";
};

const setMapZoomLock = (locked) => {
  if (typeof window === "undefined") return;
  const nextLocked = Boolean(locked);
  window.localStorage.setItem(MAP_ZOOM_LOCK_STORAGE_KEY, nextLocked ? "1" : "0");
  window.dispatchEvent(
    new CustomEvent(MAP_ZOOM_LOCK_EVENT, {
      detail: { locked: nextLocked },
    }),
  );
};

const navigateRoute = (path) => {
  if (typeof window === "undefined" || !path) return;

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const isHashMode =
    typeof navigator !== "undefined" &&
    /electron/i.test(navigator.userAgent || "");

  if (isHashMode) {
    const currentHashPath = window.location.hash?.replace(/^#/, "") || "/";
    if (currentHashPath === normalizedPath) return;
    window.location.hash = normalizedPath;
    return;
  }

  if (window.location.pathname === normalizedPath) return;
  window.history.pushState({}, "", normalizedPath);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

const ElectronWindowBar = () => {
  const isElectron = useMemo(
    () => typeof navigator !== "undefined" && /electron/i.test(navigator.userAgent || ""),
    [],
  );
  const [maximized, setMaximized] = useState(false);
  const [activeMenu, setActiveMenu] = useState(null);
  const [mapZoomLocked, setMapZoomLocked] = useState(readMapZoomLock);
  const menuBarRef = useRef(null);

  useEffect(() => {
    if (!isElectron) return;
    let mounted = true;
    const sync = async () => {
      const api = window?.electronWindow;
      if (!api?.isMaximized) return;
      const value = await api.isMaximized();
      if (mounted) setMaximized(Boolean(value));
    };
    sync();
    const id = setInterval(sync, 800);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [isElectron]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!menuBarRef.current?.contains(event.target)) {
        setActiveMenu(null);
      }
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setActiveMenu(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    const handleMapZoomLockChange = (event) => {
      setMapZoomLocked(Boolean(event?.detail?.locked));
    };
    window.addEventListener(MAP_ZOOM_LOCK_EVENT, handleMapZoomLockChange);
    setMapZoomLocked(readMapZoomLock());
    return () => {
      window.removeEventListener(MAP_ZOOM_LOCK_EVENT, handleMapZoomLockChange);
    };
  }, []);

  if (!isElectron) return null;

  return (
    <div
      className="h-8 bg-slate-100 border-b border-slate-300 flex items-center justify-between px-2 fixed top-0 left-0 right-0 z-[2000] select-none"
      style={{ WebkitAppRegion: "drag" }}
    >
      <div
        ref={menuBarRef}
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: "no-drag" }}
      >
        <MenuGroup
          label="File"
          isOpen={activeMenu === "File"}
          onToggle={() => setActiveMenu((prev) => (prev === "File" ? null : "File"))}
          onHoverOpen={() => activeMenu && setActiveMenu("File")}
          onActionClick={() => setActiveMenu(null)}
          actions={[
            { label: "Import Site", onClick: () => emitUtilityAction("import") },
            { label: "Reload", onClick: () => callWindowApi("reload") },
            
            { label: "Quit", onClick: () => callWindowApi("quit") },
          ]}
        />
        <MenuGroup
          label="Edit"
          isOpen={activeMenu === "Edit"}
          onToggle={() => setActiveMenu((prev) => (prev === "Edit" ? null : "Edit"))}
          onHoverOpen={() => activeMenu && setActiveMenu("Edit")}
          onActionClick={() => setActiveMenu(null)}
          actions={[
            { label: "Undo", onClick: () => callWindowApi("undo") },
            { label: "Redo", onClick: () => callWindowApi("redo") },
            { label: "Cut", onClick: () => callWindowApi("cut") },
            { label: "Copy", onClick: () => callWindowApi("copy") },
            { label: "Paste", onClick: () => callWindowApi("paste") },
            { label: "Select All", onClick: () => callWindowApi("selectAll") },
          ]}
        />
        <MenuGroup
          label="View"
          isOpen={activeMenu === "View"}
          onToggle={() => setActiveMenu((prev) => (prev === "View" ? null : "View"))}
          onHoverOpen={() => activeMenu && setActiveMenu("View")}
          onActionClick={() => setActiveMenu(null)}
          actions={[
            { label: "Dashboard", onClick: () => navigateRoute("/dashboard") },
            { label: "Map View", onClick: () => navigateRoute("/mapview") },
           
            { label: "Reload", onClick: () => callWindowApi("reload") },
            { label: "Toggle DevTools", onClick: () => callWindowApi("toggleDevTools") },
          ]}
        />
        <MenuGroup
          label="Project"
          isOpen={activeMenu === "Project"}
          onToggle={() => setActiveMenu((prev) => (prev === "Project" ? null : "Project"))}
          onHoverOpen={() => activeMenu && setActiveMenu("Project")}
          onActionClick={() => setActiveMenu(null)}
          actions={[
            { label: "View Projects", onClick: () => navigateRoute("/viewProject") },
            { label: "Create Project", onClick: () => navigateRoute("/create-project") },
          ]}
        />
        <MenuGroup
          label="Utility"
          isOpen={activeMenu === "Utility"}
          onToggle={() => setActiveMenu((prev) => (prev === "Utility" ? null : "Utility"))}
          onHoverOpen={() => activeMenu && setActiveMenu("Utility")}
          onActionClick={() => setActiveMenu(null)}
          actions={[
            { label: "Opacity", onClick: () => emitUtilityAction("opacity") },
            { label: "Log Radius", onClick: () => emitUtilityAction("log-radius") },
            { label: "Secondary Radius", onClick: () => emitUtilityAction("neighbor-radius") },
            { label: "Site Size", onClick: () => emitUtilityAction("triangle-size") },
            { label: "Beamwidth", onClick: () => emitUtilityAction("beamwidth") },
             {
              label: "Map Lock",
              checked: mapZoomLocked,
              onClick: () => setMapZoomLock(!mapZoomLocked),
            },
            { label: "Settings", onClick: () => emitUtilityAction("settings") },
          ]}
        />
        <MenuGroup
          label="Window"
          isOpen={activeMenu === "Window"}
          onToggle={() => setActiveMenu((prev) => (prev === "Window" ? null : "Window"))}
          onHoverOpen={() => activeMenu && setActiveMenu("Window")}
          onActionClick={() => setActiveMenu(null)}
          actions={[
            { label: "Minimize", onClick: () => callWindowApi("minimize") },
            { label: maximized ? "Restore" : "Maximize", onClick: () => callWindowApi("maximizeToggle") },
          ]}
        />
        <MenuGroup
          label="Help"
          isOpen={activeMenu === "Help"}
          onToggle={() => setActiveMenu((prev) => (prev === "Help" ? null : "Help"))}
          onHoverOpen={() => activeMenu && setActiveMenu("Help")}
          onActionClick={() => setActiveMenu(null)}
          actions={[{ label: "About S-Tracer", onClick: () => callWindowApi("about") }]}
        />
      </div>

      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none">
        <img
          src={appLogo}
          alt="S-Tracer"
          className="h-5 w-5 rounded-sm object-contain"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
        <span className="text-xs font-semibold text-slate-800">S-Tracer</span>
      </div>

      <div className="flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" }}>
        <button
          type="button"
          onClick={() => callWindowApi("minimize")}
          className="w-7 h-6 rounded hover:bg-slate-200 flex items-center justify-center"
          title="Minimize"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => callWindowApi("maximizeToggle")}
          className="w-7 h-6 rounded hover:bg-slate-200 flex items-center justify-center"
          title={maximized ? "Restore" : "Maximize"}
        >
          <Square className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => callWindowApi("close")}
          className="w-7 h-6 rounded hover:bg-red-600 hover:text-white flex items-center justify-center"
          title="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

export default ElectronWindowBar;
