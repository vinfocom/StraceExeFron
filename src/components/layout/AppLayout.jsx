import React, { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import SideBar from "../SideBar";
import Header from "../Header";
import { cancelAllRequests } from "@/api/apiService";

const AppLayout = ({ children }) => {
  const isElectronRuntime =
    typeof navigator !== "undefined" &&
    /electron/i.test(navigator.userAgent || "");
  const location = useLocation();

  useEffect(() => {
    cancelAllRequests();
  }, [location.pathname]);

  const pathsWithoutHeader = ["/mapview", "/prediction-map", "/map", "/unified-map"];
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
        <div
          className={`peer group/mapSidebar fixed left-0 ${isElectronRuntime ? "top-8 h-[calc(100%-2rem)]" : "top-0 h-full"} z-40 bg-slate-900/95 backdrop-blur-md shadow-xl border-r border-slate-700/40 flex flex-col transition-all duration-300 ease-in-out w-[74px] hover:w-[270px]`}
        >
          <div className="flex-1 overflow-hidden">
            <SideBar compact />
          </div>
        </div>
      )}

      <div
        className={`flex-1 flex flex-col transition-all duration-300 ease-in-out ${
          shouldShowSidebar
            ? "ml-[74px] peer-hover:ml-[270px]"
            : "ml-0"
        }`}
      >
        {shouldShowHeader && <Header />}

        <main className="flex-1 overflow-y-auto h-full p-0 m-0">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
