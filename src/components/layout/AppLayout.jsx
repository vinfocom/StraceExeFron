import React, { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import SideBar from "../SideBar";
import Header from "../Header";
import { cancelAllRequests } from "@/api/apiService";

const AppLayout = ({ children }) => {
  const isElectronRuntime =
    typeof navigator !== "undefined" &&
    /electron/i.test(navigator.userAgent || "");
  const location = useLocation();
  const [isCompactViewport, setIsCompactViewport] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 1280 : false,
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    return () => {
      cancelAllRequests();
    };
  }, [location.pathname]);

  useEffect(() => {
    const handleResize = () => {
      setIsCompactViewport(window.innerWidth < 1280);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isCompactViewport) {
      setIsSidebarOpen(false);
    }
  }, [isCompactViewport]);

  const pathsWithoutHeader = [
    "/mapview",
    "/prediction-map",
    "/unified-map",
    "/multi-map",
    "/project-l3-events",
  ];
  const pathsWithoutSidebar = ["/unified-map"];

  const shouldShowHeader = !pathsWithoutHeader.some((path) =>
    location.pathname.startsWith(path)
  );

  const shouldShowSidebar = !pathsWithoutSidebar.some((path) =>
    location.pathname.startsWith(path)
  );

  return (
    <div className="flex min-h-screen bg-transparent">
      {shouldShowSidebar && (
        <>
          {isCompactViewport && isSidebarOpen && (
            <button
              type="button"
              aria-label="Close sidebar overlay"
              className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px]"
              onClick={() => setIsSidebarOpen(false)}
            />
          )}

          <div
            className={`${
              isCompactViewport
                ? `fixed ${isElectronRuntime ? "top-8 h-[calc(100%-2rem)]" : "top-0 h-full"} left-0 z-50 w-[270px] -translate-x-full shadow-2xl ${
                    isSidebarOpen ? "translate-x-0" : ""
                  }`
                : `peer group/mapSidebar fixed left-0 ${isElectronRuntime ? "top-8 h-[calc(100%-2rem)]" : "top-0 h-full"} z-40 w-[74px] hover:w-[270px]`
            } bg-slate-900/95 backdrop-blur-md border-r border-slate-700/40 flex flex-col transition-all duration-300 ease-in-out`}
          >
            <div className="flex-1 overflow-hidden">
              <SideBar compact={!isCompactViewport} />
            </div>
          </div>
        </>
      )}

      <div
        className={`min-w-0 max-w-full flex-1 flex flex-col overflow-x-hidden transition-all duration-300 ease-in-out ${
          shouldShowSidebar && !isCompactViewport
            ? "ml-[74px] peer-hover:ml-[270px]"
            : "ml-0"
        }`}
      >
        {shouldShowHeader && (
          <Header
            showSidebarToggle={shouldShowSidebar && isCompactViewport}
            onSidebarToggle={() => setIsSidebarOpen((prev) => !prev)}
          />
        )}

        <main className="h-full flex-1 overflow-x-hidden overflow-y-auto p-0 m-0 min-w-0">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
