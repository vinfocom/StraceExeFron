// src/components/SideBar.jsx
import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Upload,
  History,
  Map,
  Settings,
  FolderPlus,
  Plus,
  Users,
  LogOut,
  UserCircle2,
  ChevronRight,
  FileText,
  Building,
} from 'lucide-react';
import appLogo from '/favicon.svg';

const ROLES = {
  SUPER_ADMIN: 3,
  ADMIN: 2,
  USER: 1,
};

const SideBar = ({ compact = false }) => {
  const location = useLocation();
  const [openDropdowns, setOpenDropdowns] = useState({});
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { user, logout } = useAuth();

  const userRole = user?.m_user_type_id || 0;

  const navLinks = [
    { icon: LayoutDashboard, text: 'Dashboard', path: '/dashboard' },
    {
      icon: Upload,
      text: 'Upload Data',
      path: '/upload-data',
      allowedRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    },
    { icon: Map, text: 'Map View', path: '/mapview' },
    {
      icon: Building,
      text: 'Licenses',
      path: '/companies',
      allowedRoles: [ROLES.SUPER_ADMIN],
    },
    {
      icon: History,
      text: 'Manage Drive Sessions',
      path: '/drive-test-sessions',
      allowedRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    },
    {
      icon: FolderPlus,
      text: 'Projects',
      hasDropdown: true,
      allowedRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
      children: [
        { icon: Plus, text: 'Planning', path: '/create-project' },
        { icon: FileText, text: 'View Projects', path: '/viewProject' },
      ],
    },
    {
      icon: Users,
      text: 'Manage Users',
      path: '/manage-users',
      allowedRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    },
    {
      icon: Settings,
      text: 'Settings',
      path: '/settings',
      allowedRoles: [ROLES.ADMIN, ROLES.SUPER_ADMIN],
    },
  ];

  const toggleDropdown = (text) => {
    setOpenDropdowns((prev) => ({ ...prev, [text]: !prev[text] }));
  };

  const hasPermission = (item) => {
    if (!item.allowedRoles) return true;
    return item.allowedRoles.includes(userRole);
  };

  const isChildActive = (children) => children.some((child) => location.pathname === child.path);
  const labelClass = compact
    ? 'hidden group-hover/mapSidebar:inline'
    : 'inline';
  const titleClass = compact
    ? 'hidden group-hover/mapSidebar:block'
    : 'block';
  const chevronClass = compact
    ? 'hidden group-hover/mapSidebar:inline-flex'
    : 'inline-flex';
  const iconSpacingClass = compact
    ? 'h-5 w-5 mr-0 group-hover/mapSidebar:mr-3 flex-shrink-0'
    : 'h-5 w-5 mr-3 flex-shrink-0';

  const renderNavItem = (link, index) => {
    if (!hasPermission(link)) return null;

    const hasChildren = link.hasDropdown && link.children;
    const isOpen = openDropdowns[link.text];
    const isParentActive = hasChildren && isChildActive(link.children);

    return (
      <li key={index} className="mb-1.5">
        {hasChildren ? (
          <>
            <button
              onClick={() => toggleDropdown(link.text)}
              className={`w-full flex items-center ${compact ? 'justify-center group-hover/mapSidebar:justify-between' : 'justify-between'} p-3 rounded-lg transition-all duration-300 ease-out ${isParentActive
                  ? 'bg-primary/90 text-primary-foreground shadow-sm'
                  : 'text-slate-200 hover:bg-slate-700/80 hover:text-white'
                }`}
            >
              <span className="flex items-center">
                <link.icon className={iconSpacingClass} />
                <span className={`font-medium whitespace-nowrap ${labelClass}`}>{link.text}</span>
              </span>
              <span className={`${chevronClass} transition-transform duration-300 ${isOpen ? 'rotate-90' : ''}`}>
                <ChevronRight className="h-4 w-4" />
              </span>
            </button>

            <ul className={`overflow-hidden transition-all duration-300 ease-out ${compact
                ? isOpen
                  ? 'max-h-0 opacity-0 mt-0 group-hover/mapSidebar:max-h-40 group-hover/mapSidebar:opacity-100 group-hover/mapSidebar:mt-1'
                  : 'max-h-0 opacity-0 mt-0'
                : isOpen
                  ? 'max-h-40 opacity-100 mt-1'
                  : 'max-h-0 opacity-0'
              }`}>
              {link.children.map((child, childIndex) => (
                <li key={childIndex}>
                  <NavLink
                    to={child.path}
                    className={({ isActive }) =>
                      `flex items-center p-2 pl-11 rounded-lg transition-colors duration-200 ${isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-slate-300 hover:bg-slate-700/80 hover:text-white'
                      }`
                    }
                  >
                    <child.icon className="h-4 w-4 mr-3" />
                    <span className="text-sm whitespace-nowrap">{child.text}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <NavLink
            to={link.path}
            className={({ isActive }) =>
              `flex items-center ${compact ? 'justify-center group-hover/mapSidebar:justify-start' : ''} p-3 rounded-lg transition-all duration-300 ease-out ${isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-slate-200 hover:bg-slate-700/80 hover:text-white'
              }`
            }
          >
            <link.icon className={iconSpacingClass} />
            <span className={`font-medium whitespace-nowrap ${labelClass}`}>{link.text}</span>
          </NavLink>
        )}
      </li>
    );
  };

  return (
    <div className="h-full w-full bg-slate-900/90 text-white flex flex-col">
      <div className={`p-4 flex items-center h-16 flex-shrink-0 border-b border-slate-700/40 ${compact ? 'justify-center group-hover/mapSidebar:justify-start' : 'justify-center'}`}>
        <img src={appLogo} alt="S-Tracer" className="h-8 sm:h-9 object-contain" />
        <span className={`ml-2 font-semibold tracking-wide text-lg whitespace-nowrap ${titleClass}`}>STracer</span>
      </div>

      <nav className="flex-1 overflow-y-auto p-2.5">
        <ul>{navLinks.map(renderNavItem)}</ul>
      </nav>

      <div className="border-t border-slate-700/40 p-2.5">
        <button
          onClick={() => setShowUserMenu((prev) => !prev)}
          className={`w-full flex items-center rounded-lg p-2.5 transition-colors duration-200 text-slate-200 hover:bg-slate-700/80 hover:text-white ${compact ? 'justify-center group-hover/mapSidebar:justify-start' : ''}`}
        >
          {user?.name?.charAt(0).toUpperCase()}
          <span className={`truncate text-sm ${labelClass}`}>
            Welcome, <span className="font-semibold">{user?.name || 'User'}</span>
          </span>
        </button>

        <div
          className={`overflow-hidden transition-all duration-300 ease-out ${compact
              ? showUserMenu
                ? 'max-h-0 opacity-0 mt-0 group-hover/mapSidebar:max-h-16 group-hover/mapSidebar:opacity-100 group-hover/mapSidebar:mt-2'
                : 'max-h-0 opacity-0'
              : showUserMenu
                ? 'max-h-16 opacity-100 mt-2'
                : 'max-h-0 opacity-0'
            }`}
        >
          <button
            onClick={logout}
            className="w-full flex items-center rounded-lg p-2 text-sm font-medium transition-colors duration-200 bg-destructive/90 text-white hover:bg-destructive"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

export default SideBar;
