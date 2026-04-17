// components/Header.jsx
import React from 'react';
import { useLocation } from 'react-router-dom';
import DrawingControlsPanel from './map/layout/DrawingControlsPanel';
import AdvancedFilters from './map/HeaderFilters';

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
  const normalizedPath = location.pathname.toLowerCase().replace(/\/+$/, '') || '/';

  const isMapPage = normalizedPath === '/debug-map' || normalizedPath === '/mapview';
  const routeLabel = PAGE_TITLES[normalizedPath] || normalizedPath
    .replaceAll('-', ' ')
    .replace('/', '')
    .replace(/\b\w/g, (ch) => ch.toUpperCase()) || 'Dashboard';

  return (
    <header className="h-16 bg-slate-900/95 border border-slate-700/40 backdrop-blur-md rounded-none shadow-sm flex items-center justify-between px-4 sm:px-6 flex-shrink-0 relative z-30 text-slate-100">
      <div className="flex items-center space-x-3 min-w-[200px]">
        {!isMapPage && (
          <p className="text-lg sm:text-xl font-bold tracking-tight text-white truncate">
            {routeLabel}
          </p>
        )}
        {isMapPage && <AdvancedFilters />}
      </div>

      <div className="flex-1 flex items-center justify-center">
        {isMapPage && <DrawingControlsPanel position="relative" />}
      </div>

      <div className="flex items-center space-x-4 min-w-[200px] justify-end" />
    </header>
  );
}
