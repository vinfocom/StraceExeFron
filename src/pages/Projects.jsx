// src/pages/CreateProjectPage.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "react-toastify";
import { mapViewApi } from "../api/apiEndpoints";
import { ProjectForm } from "../components/project/ProjectForm";
import { useAuth } from "../context/AuthContext";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

const resolveCompanyId = (user) => {
  const directCompanyId = Number(
    user?.company_id ?? user?.CompanyId ?? user?.companyId ?? 0
  );
  if (Number.isFinite(directCompanyId) && directCompanyId > 0) {
    return directCompanyId;
  }

  if (typeof window === "undefined") return 0;

  try {
    const cachedUser = JSON.parse(sessionStorage.getItem("user") || "null");
    const cachedCompanyId = Number(
      cachedUser?.company_id ??
        cachedUser?.CompanyId ??
        cachedUser?.companyId ??
        0
    );
    return Number.isFinite(cachedCompanyId) && cachedCompanyId > 0
      ? cachedCompanyId
      : 0;
  } catch {
    return 0;
  }
};

const CreateProjectPage = () => {
  const { user } = useAuth();
  const [polygons, setPolygons] = useState([]);
  const [loading, setLoading] = useState(false);
  const inFlightFetchRef = useRef(null);
  const scopedCompanyId = resolveCompanyId(user);

  const fetchPolygons = useCallback(async ({ silent = false } = {}) => {
    if (inFlightFetchRef.current) {
      return inFlightFetchRef.current;
    }

    setLoading(true);
    const task = (async () => {
      try {
        const polygonsRes = await mapViewApi.getAvailablePolygons(
          undefined,
          Number.isFinite(scopedCompanyId) && scopedCompanyId > 0
            ? scopedCompanyId
            : undefined
        );
        const shapeList = Array.isArray(polygonsRes?.data)
          ? polygonsRes.data
          : [];

        const mappedPolygons = shapeList.map((p) => ({
          value: p.id,
          label: p.name,
          wkt: p.wkt,
          sessionIds: Array.isArray(p.sessionIds) ? p.sessionIds : [],
          geometry: null,
          geojson: null,
        }));

        setPolygons(mappedPolygons);

        if (!silent && mappedPolygons.length > 0) {
          toast.success(`Loaded ${mappedPolygons.length} polygons`);
        }
      } catch (error) {
        console.error("Polygon fetch error:", error);
        if (!silent) {
          toast.error("Failed to load polygons.");
        }
        setPolygons([]);
      } finally {
        setLoading(false);
        inFlightFetchRef.current = null;
      }
    })();

    inFlightFetchRef.current = task;
    return task;
  }, [scopedCompanyId]);

  useEffect(() => {
    fetchPolygons({ silent: true });
  }, [fetchPolygons]);

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Create Project</h1>
          <p className="text-gray-600 mt-1">
            Create a new project using available building extraction areas.
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => fetchPolygons({ silent: false })}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Project Form */}
      {loading && polygons.length === 0 ? (
        <div className="text-center py-8">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-gray-400" />
          <p className="mt-2 text-gray-600">Loading polygons...</p>
        </div>
      ) : (
        <ProjectForm
          polygons={polygons}
          loading={loading}
          onProjectCreated={() => fetchPolygons({ silent: true })}
        />
      )}
    </div>
  );
};

export default CreateProjectPage;
