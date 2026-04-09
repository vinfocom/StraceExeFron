// src/App.jsx
import React, { Suspense, lazy } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Link,
} from "react-router-dom";
import { SWRConfig } from "swr";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import AuthProvider, { useAuth } from "./context/AuthContext";
import { indexedDBProvider } from "./utils/indexedDBProvider";
import Spinner from "./components/common/Spinner";
import { MapProvider } from './context/MapContext';

// --- Lazy Load Pages for Optimization ---
const LoginPage = lazy(() => import("./pages/Login"));
const DashboardPage = lazy(() => import("./pages/Dashboard"));
const SimpleMapView = lazy(() => import("./pages/MapView"));
const ManageUsersPage = lazy(() => import("./pages/ManageUser"));
const DriveTestSessionsPage = lazy(() => import("./pages/DriveTestSessions"));
const AppLayout = lazy(() => import("./components/layout/AppLayout"));
const UploadDataPage = lazy(() => import("./pages/UploadData"));
const SettingsPage = lazy(() => import("./pages/Setting"));
const UnifiedMapView = lazy(() => import("./pages/UnifiedMapView"));
const HighPerfMap = lazy(() => import("@/pages/HighPerfMap"));
const LogsCirclesPage = lazy(() => import("@/pages/LogsCirclesPage"));
const ProjectsPage = lazy(() => import("./pages/Projects"));
const PredictionMapPage = lazy(() => import("./pages/PredictionMap"));
const GetReportPage = lazy(() => import("./pages/GetReport"));
const ViewProjectsPage = lazy(() => import("./pages/ViewProjects"));
const SessionMapDebug = lazy(() => import("./pages/SessionMapDebug"));
const MultiViewPage = lazy(() => import("./pages/MultiViewPage"));
const SuperAdminCompanies = lazy(() => import("@/pages/SuperAdmin"));
const CompanyForm = lazy(() => import("./pages/CompanyForm"));  
const CompanyLicensesPage = lazy(() => import("./pages/CompanyLicenses"));

// Loading Component for Suspense
const PageLoader = () => (
  <div className="flex h-screen w-full items-center justify-center">
    <Spinner />
  </div>
);

const SuperAdminRoute = ({ children }) => {
  const { user, isAuthenticated, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!isAuthenticated()) return <Navigate to="/" replace />;
  if (user?.m_user_type_id !== 3) return <Navigate to="/dashboard" replace />;
  return <AppLayout>{children}</AppLayout>;
};

const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!isAuthenticated()) return <Navigate to="/" replace />;
  return <AppLayout>{children}</AppLayout>;
};

const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <Spinner />;
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

// SWR Config moved outside component to prevent recreation on re-render
const swrConfig = {
  provider: indexedDBProvider,
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  revalidateOnMount: true,
  // ... rest of your existing swrConfig settings
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <MapProvider>
          <SWRConfig value={swrConfig}>
            <ToastContainer position="top-right" autoClose={3000} theme="colored" />
            
            {/* Suspense handles the loading state while lazy components are being fetched */}
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<PublicRoute><LoginPage /></PublicRoute>} />
                <Route path="/company-form" element={<PrivateRoute><CompanyForm /></PrivateRoute>} />
                
                {/* Wrap related routes in a fragment if needed, but keeping your structure */}
                <Route path="/debug-map" element={<PrivateRoute><SessionMapDebug /></PrivateRoute>} />
                <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
                <Route path="/drive-test-sessions" element={<PrivateRoute><DriveTestSessionsPage /></PrivateRoute>} />
                <Route path="/mapview" element={<PrivateRoute><HighPerfMap /></PrivateRoute>} />
                <Route path="/map" element={<PrivateRoute><SimpleMapView /></PrivateRoute>} />
                <Route path="/multi-map" element={<MultiViewPage />} />
                <Route path="/manage-users" element={<PrivateRoute><ManageUsersPage /></PrivateRoute>} />
                <Route path="/upload-data" element={<PrivateRoute><UploadDataPage /></PrivateRoute>} />
                <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
                <Route path="/logscircles" element={<PrivateRoute><LogsCirclesPage /></PrivateRoute>} />
                <Route path="/create-project" element={<PrivateRoute><ProjectsPage /></PrivateRoute>} />
                <Route path="/prediction-map" element={<PrivateRoute><PredictionMapPage /></PrivateRoute>} />
                <Route path="/getreport" element={<PrivateRoute><GetReportPage /></PrivateRoute>} />
                <Route path="/unified-map" element={<PrivateRoute><UnifiedMapView /></PrivateRoute>} />
                <Route path="/viewProject" element={<PrivateRoute><ViewProjectsPage /></PrivateRoute>} />
                
                <Route path="/companies" element={<SuperAdminRoute><SuperAdminCompanies /></SuperAdminRoute>} />
                <Route path="/company-licenses" element={<SuperAdminRoute><CompanyLicensesPage /></SuperAdminRoute>} />
                
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </SWRConfig>
        </MapProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;