import React, { useState, useEffect } from "react"; //
import { Outlet, useLocation } from "react-router-dom";
import SideBar from "../SideBar";
import Header from "../Header";
import { cancelAllRequests } from "@/api/apiService"; // Import the cancel function
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

const AppLayout = ({ children }) => {
  const isElectronRuntime =
    typeof navigator !== "undefined" &&
    /electron/i.test(navigator.userAgent || "");
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  // ✅ NEW: Clear the API queue whenever the route changes
  useEffect(() => {
    cancelAllRequests();
  }, [location.pathname]);

  // Routes where the header should NOT show
  const pathsWithoutHeader = [
    "/mapview",
    "/prediction-map",
    "/map",
    "/unified-map"
  ];

  // Routes where the sidebar should NOT show
  const pathsWithoutSidebar = [
    "/unified-map",
  ];

  const shouldShowHeader = !pathsWithoutHeader.some((path) =>
    location.pathname.startsWith(path)
  );

  const shouldShowSidebar = !pathsWithoutSidebar.some((path) =>
    location.pathname.startsWith(path)
  );

  return (
    <div className="flex h-screen ">

      {/* Sidebar — always visible, just changes width */}
      {shouldShowSidebar && (
        <div
          className={`fixed left-0 ${isElectronRuntime ? "top-8 h-[calc(100%-2rem)]" : "top-0 h-full"} z-40 bg-slate-900 shadow-xl flex flex-col
            transition-all duration-300 ease-in-out
            ${collapsed ? "w-16" : "w-[250px]"}`}
        >
          {/* SideBar content (icon-only when collapsed) */}
          <div className="flex-1 overflow-hidden">
            <SideBar collapsed={collapsed} />
          </div>

          {/* Collapse toggle button — pinned to bottom of sidebar */}
          <div className="flex justify-center p-3 border-t border-slate-700 flex-shrink-0">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="text-gray-400 hover:text-white hover:bg-slate-700 p-1.5 rounded-lg transition-all duration-200"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed
                ? <PanelLeftOpen className="h-5 w-5" />
                : <PanelLeftClose className="h-5 w-5" />
              }
            </button>
          </div>
        </div>
      )}

      {/* Main content — margin shifts based on sidebar width */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ease-in-out
        ${shouldShowSidebar ? (collapsed ? "ml-16" : "ml-[250px]") : "ml-0"}`}
      >
        {shouldShowHeader && <Header />}

        <main className={`flex-1 overflow-y-auto ${!shouldShowHeader ? "h-full" : ""}`}>
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
