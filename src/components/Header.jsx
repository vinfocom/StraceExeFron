// components/Header.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import DrawingControlsPanel from './map/layout/DrawingControlsPanel';
import AdvancedFilters from './map/HeaderFilters';
import { checkAllServices } from '../api/apiEndpoints';

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/dashboard': 'Dashboard',
  '/setting': 'Settings',
  '/settings': 'Settings',
  '/drivetestsessions': 'Manage Drive Test Sessions',
  '/drive-test-sessions': 'Manage Drive Test Sessions',
  '/viewprojects': 'Existing Projects',
  '/projects': 'Create Project',
  '/manageuser': 'Manage Users',
  '/companylicenses': 'Company Licenses',
  '/superadmin': 'Company Management',
  '/uploaddata': 'Upload Data',
};

export default function Header({ showSidebarToggle = false, onSidebarToggle = null }) {
  const location = useLocation();
  const [serverOnline, setServerOnline] = useState(false);
  const normalizedPath = location.pathname.toLowerCase().replace(/\/+$/, '') || '/';

  const isMapPage = normalizedPath === '/mapview';
  const routeLabel = PAGE_TITLES[normalizedPath] || normalizedPath
    .replaceAll('-', ' ')
    .replace('/', '')
    .replace(/\b\w/g, (ch) => ch.toUpperCase()) || 'Dashboard';

  useEffect(() => {
    let stopped = false;

    const readServerStatus = async () => {
      try {
        const services = await checkAllServices({ includePython: false });
        if (!stopped) setServerOnline(Boolean(services?.csharp?.healthy));
      } catch {
        if (!stopped) setServerOnline(false);
      }
    };

    readServerStatus();
    const id = setInterval(readServerStatus, 30000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  const statusDotClass = useMemo(
    () => (serverOnline ? "bg-emerald-400" : "bg-red-500"),
    [serverOnline],
  );

  return (
    <header className="relative z-30 flex min-h-14 flex-wrap items-center gap-3 border border-slate-700/40 bg-slate-900/95 px-3 py-2 text-slate-100 shadow-sm backdrop-blur-md sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {showSidebarToggle && (
          <button
            type="button"
            onClick={onSidebarToggle}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-800/70 text-slate-100 transition hover:bg-slate-700"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}
        {!isMapPage && (
          <p className="min-w-0 truncate text-base font-bold tracking-tight text-white sm:text-lg">
            {routeLabel}
          </p>
        )}
        {isMapPage && <AdvancedFilters />}
      </div>

      <div className="order-3 flex w-full items-center justify-start md:order-none md:w-auto md:flex-1 md:justify-center">
        {isMapPage && <DrawingControlsPanel position="relative" />}
      </div>

      <div className="flex items-center justify-end gap-3 md:min-w-[80px]">
        <span
          className={`inline-block h-2 w-2 rounded-full ${statusDotClass}`}
          title={serverOnline ? "Server connected" : "Working offline"}
        />
      </div>
    </header>
  );
}
