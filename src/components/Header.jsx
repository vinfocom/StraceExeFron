// components/Header.jsx
import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from "@/components/ui/button";
import { LogOut } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import DrawingControlsPanel from './map/layout/DrawingControlsPanel';
import AdvancedFilters from './map/HeaderFilters';

export default function Header() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const isMapPage = location.pathname === '/debug-map' || location.pathname === '/mapview';

  return (
    <header className="h-16 bg-slate-950 text-white shadow-lg flex items-center justify-between px-6 flex-shrink-0 relative z-50">
      
      <div className="flex items-center space-x-3 min-w-[200px]">
       
        {isMapPage && <AdvancedFilters />}
      </div>

      <div className="flex-1 flex items-center justify-center">
        {isMapPage && <DrawingControlsPanel position="relative" />}
      </div>

      <div className="flex items-center space-x-4 min-w-[200px] justify-end">
        <p className="text-gray-300 text-sm">
          Welcome, <span className="font-semibold text-white">{user?.name || 'User'}</span>
        </p>
        <Button 
          onClick={logout} 
          variant="destructive" 
          size="sm" 
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
      </div>
    </header>
  );
}