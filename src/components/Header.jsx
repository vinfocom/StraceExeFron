// components/Header.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
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

export default function Header() {
  const location = useLocation();
  const [serverOnline, setServerOnline] = useState(false);
  const normalizedPath = location.pathname.toLowerCase().replace(/\/+$/, '') || '/';

  const isMapPage = normalizedPath === '/debug-map' || normalizedPath === '/mapview';
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
    <header className="h-14 bg-slate-900/95 border border-slate-700/40 backdrop-blur-md rounded-none shadow-sm flex items-center justify-between px-3 sm:px-4 flex-shrink-0 relative z-30 text-slate-100">
      <div className="flex items-center space-x-2 min-w-[180px]">
        {!isMapPage && (
          <p className="text-base sm:text-lg font-bold tracking-tight text-white truncate">
            {routeLabel}
          </p>
        )}
        {isMapPage && <AdvancedFilters />}
      </div>

      <div className="flex-1 flex items-center justify-center">
        {isMapPage && <DrawingControlsPanel position="relative" />}
      </div>

      <div className="flex items-center space-x-3 min-w-[180px] justify-end">
        <span
          className={`inline-block h-2 w-2 rounded-full ${statusDotClass}`}
          title={serverOnline ? "Server connected" : "Working offline"}
        />
      </div>
    </header>
  );
}
