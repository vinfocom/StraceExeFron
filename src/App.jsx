// src/App.jsx
import React, { Suspense, lazy, useEffect } from "react";
import {
  BrowserRouter as Router,
  HashRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useLocation,
} from "react-router-dom";
import { SWRConfig } from "swr";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import AuthProvider, { useAuth } from "./context/AuthContext";
import { SettingsDialogProvider } from "./context/SettingsDialogContext";
import { indexedDBProvider } from "./utils/indexedDBProvider";
import { MapProvider } from './context/MapContext';
import ElectronWindowBar from "./components/layout/ElectronWindowBar";
import { tryAutoSyncOfflineQueue } from "./api/apiEndpoints";
import appLogo from "/favicon.svg";
import comlog from "/logo.svg";
import Spinner from "./components/common/Spinner";

const TRANSITION_INTENT_KEY = "authTransitionIntent";
const getTransitionMode = () =>
  sessionStorage.getItem(TRANSITION_INTENT_KEY) === "logout"
    ? "logout"
    : sessionStorage.getItem(TRANSITION_INTENT_KEY) === "dashboard"
      ? "dashboard"
      : null;

// --- Lazy Load Pages for Optimization ---
const LoginPage = lazy(() => import("./pages/Login"));
const DashboardPage = lazy(() => import("./pages/Dashboard"));
const ManageUsersPage = lazy(() => import("./pages/ManageUser"));
const DriveTestSessionsPage = lazy(() => import("./pages/DriveTestSessions"));
const AppLayout = lazy(() => import("./components/layout/AppLayout"));
const UploadDataPage = lazy(() => import("./pages/UploadData"));
const IndoorPlaningPage = lazy(() => import("./pages/IndoorPlaning"));
const IndoorPlanningProjectsPage = lazy(() => import("./pages/IndoorPlanningProjects"));
const SettingsPage = lazy(() => import("./pages/Setting"));
const UnifiedMapView = lazy(() => import("./pages/UnifiedMapView"));
const RealtimeNetworkMap = lazy(() => import("./pages/RealtimeNetworkMap"));
const HighPerfMap = lazy(() => import("@/pages/HighPerfMap"));
const ProjectsPage = lazy(() => import("./pages/Projects"));
const PredictionMapPage = lazy(() => import("./pages/PredictionMap"));
const GetReportPage = lazy(() => import("./pages/GetReport"));
const ViewProjectsPage = lazy(() => import("./pages/ViewProjects"));
const MultiViewPage = lazy(() => import("./pages/MultiViewPage"));
const SuperAdminCompanies = lazy(() => import("@/pages/SuperAdmin"));
const CompanyForm = lazy(() => import("./pages/CompanyForm"));  
const CompanyLicensesPage = lazy(() => import("./pages/CompanyLicenses"));
const DataDeletionPage = lazy(() => import("./pages/DataDeletion"));
const BackendL3EventAnalyzerPage = lazy(() => import("./pages/BackendL3EventAnalyzer"));

// Loading Component for Suspense
const PageLoader = ({ mode = "dashboard" }) => {
  const title =
    mode === "logout" ? "Signing You Out" : "Opening Your Portal";
  const description =
    mode === "logout"
      ? "Closing your active session and returning to sign in."
      : "Loading your workspace.";

  return (
  <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#edf5fb]">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(24,77,140,0.14),transparent_36%)]" />
    <div className="absolute left-4 top-4 z-20 sm:left-8 sm:top-6">
      <img src={comlog} alt="Vinfocom" className="h-[110px] w-auto sm:h-[140px]" />
    </div>

    <div className="relative z-10 grid min-h-[calc(100vh-2rem)] w-full max-w-6xl overflow-hidden rounded-[30px] bg-white shadow-[0_32px_90px_rgba(15,23,42,0.14)] lg:max-h-[920px] lg:grid-cols-[1.02fr_0.98fr]">
      <section className="relative hidden overflow-hidden bg-[#0b2240] lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(34,197,246,0.18),transparent_22%),linear-gradient(160deg,#0b2240_0%,#0f2f57_52%,#0a1d35_100%)]" />
        <div className="absolute -left-24 -top-12 h-[280px] w-[280px] rounded-full border-[48px] border-[#1d5ca8] opacity-90" />
        <div className="absolute bottom-14 left-44 h-40 w-16 rotate-[-33deg] rounded-full bg-[#1490e3]" />
        <div className="absolute bottom-6 left-64 h-48 w-16 rotate-[-33deg] rounded-full bg-[#2d6fb7]" />
        <img
          src={appLogo}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute right-[-6rem] top-1/2 h-[24rem] w-[24rem] -translate-y-1/2 rotate-[-18deg] opacity-[0.08] saturate-0 brightness-200"
        />
      </section>

      <section className="relative flex items-center justify-center px-6 py-10 sm:px-10 lg:px-14">
        <div className="flex w-full max-w-[380px] flex-col items-center text-center">
          <div className="relative mb-8 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-[#eef6ff] ring-1 ring-[#d6e7fb] shadow-[0_18px_38px_rgba(20,144,227,0.16)]">
            <div className="absolute inset-[-10px] rounded-[2.4rem] border border-sky-200/70 animate-[spin_5s_linear_infinite]" />
            <img
              src={appLogo}
              alt="S-Tracer"
              className="h-16 w-16 object-contain animate-pulse"
            />
          </div>

          <div className="mb-6 flex items-center gap-2" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-300 animate-[bounce_1s_ease-in-out_infinite]" />
            <span className="h-2.5 w-2.5 rounded-full bg-sky-500 animate-[bounce_1s_ease-in-out_infinite] [animation-delay:0.12s]" />
            <span className="h-2.5 w-2.5 rounded-full bg-sky-700 animate-[bounce_1s_ease-in-out_infinite] [animation-delay:0.24s]" />
          </div>

          <h2 className="text-[2rem] font-bold tracking-[-0.02em] text-slate-900">
            {title}
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-6 text-slate-500">
            {description}
          </p>
        </div>
      </section>
    </div>
  </div>
  );
};

const RouteFallback = () => <Spinner />;

const AuthLoader = () => {
  const mode = getTransitionMode();
  return mode ? <PageLoader mode={mode} /> : <RouteFallback />;
};

const SuperAdminRoute = ({ children }) => {
  const { user, isAuthenticated, loading } = useAuth();
  if (loading) return <AuthLoader />;
  if (!isAuthenticated()) return <Navigate to="/" replace />;
  if (user?.m_user_type_id !== 3) return <Navigate to="/dashboard" replace />;
  return <AppLayout>{children}</AppLayout>;
};

const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <AuthLoader />;
  if (!isAuthenticated()) return <Navigate to="/" replace />;
  return <AppLayout>{children}</AppLayout>;
};

const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return <AuthLoader />;
  }
  return isAuthenticated() ? <Navigate to="/dashboard" replace /> : children;
};

const NotFoundPage = () => (
  <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-gray-50 to-gray-100">
    <div className="text-center p-8 bg-white rounded-xl shadow-lg">
      <h1 className="text-6xl font-bold text-gray-800 mb-4">404</h1>
      <h2 className="text-2xl font-semibold text-gray-700 mb-2">Page Not Found</h2>
      <Link to="/dashboard" className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
        Go to Dashboard
      </Link>
    </div>
  </div>
);

const swrConfig = {
  provider: indexedDBProvider,
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  revalidateOnMount: true,
};

function AppShell({ isElectronRuntime }) {
  const location = useLocation();
  const isStandaloneDeletion = location.pathname.startsWith("/uSeR-daTa-dEleTion");

  return (
    <>
      {!isStandaloneDeletion && <ElectronWindowBar />}
      <ToastContainer position="top-right" autoClose={3000} theme="colored" />

      <div className={isElectronRuntime && !isStandaloneDeletion ? "electron-content pt-8" : ""}>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<PublicRoute><LoginPage /></PublicRoute>} />
            <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
            <Route path="/uSeR-daTa-dEleTion" element={<DataDeletionPage />} />
            <Route path="/company-form" element={<PrivateRoute><CompanyForm /></PrivateRoute>} />

            <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
            <Route path="/drive-test-sessions" element={<PrivateRoute><DriveTestSessionsPage /></PrivateRoute>} />
            <Route path="/mapview" element={<PrivateRoute><HighPerfMap /></PrivateRoute>} />
            <Route path="/multi-map" element={<PrivateRoute><MultiViewPage /></PrivateRoute>} />
            <Route path="/manage-users" element={<PrivateRoute><ManageUsersPage /></PrivateRoute>} />
            <Route path="/upload-data" element={<PrivateRoute><UploadDataPage /></PrivateRoute>} />
            <Route path="/indoor-planing" element={<PrivateRoute><IndoorPlanningProjectsPage /></PrivateRoute>} />
            <Route path="/indoor-planing/:projectId" element={<PrivateRoute><IndoorPlaningPage /></PrivateRoute>} />
            <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
            <Route path="/create-project" element={<PrivateRoute><ProjectsPage /></PrivateRoute>} />
            <Route path="/prediction-map" element={<PrivateRoute><PredictionMapPage /></PrivateRoute>} />
            <Route path="/getreport" element={<PrivateRoute><GetReportPage /></PrivateRoute>} />
            <Route path="/unified-map" element={<PrivateRoute><UnifiedMapView /></PrivateRoute>} />
            <Route path="/realtime-network-map" element={<PrivateRoute><RealtimeNetworkMap /></PrivateRoute>} />
            <Route path="/viewProject" element={<PrivateRoute><ViewProjectsPage /></PrivateRoute>} />
            <Route path="/project-l3-events" element={<PrivateRoute><BackendL3EventAnalyzerPage /></PrivateRoute>} />

            <Route path="/companies" element={<SuperAdminRoute><SuperAdminCompanies /></SuperAdminRoute>} />
            <Route path="/company-licenses" element={<SuperAdminRoute><CompanyLicensesPage /></SuperAdminRoute>} />

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </div>
    </>
  );
}

function App() {
  const isElectronRuntime =
    typeof navigator !== "undefined" &&
    /electron/i.test(navigator.userAgent || "");
  const RouterComponent = isElectronRuntime ? HashRouter : Router;

  useEffect(() => {
    const cls = "electron-runtime";
    if (isElectronRuntime) {
      document.documentElement.classList.add(cls);
      document.body.classList.add(cls);
    } else {
      document.documentElement.classList.remove(cls);
      document.body.classList.remove(cls);
    }
    return () => {
      document.documentElement.classList.remove(cls);
      document.body.classList.remove(cls);
    };
  }, [isElectronRuntime]);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        await tryAutoSyncOfflineQueue();
      } catch {
        // Intentionally silent: sync is best-effort.
      }
    };

    tick();
    const id = setInterval(tick, 60_000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  return (
    <RouterComponent>
      <AuthProvider>
        <MapProvider>
          <SWRConfig value={swrConfig}>
            <SettingsDialogProvider>
              <AppShell isElectronRuntime={isElectronRuntime} />
            </SettingsDialogProvider>
          </SWRConfig>
        </MapProvider>
      </AuthProvider>
    </RouterComponent>
  );
}

export default App;
