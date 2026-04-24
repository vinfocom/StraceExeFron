// src/pages/ViewProjectsPage.jsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Map, Folder, Calendar, RefreshCw, Search, Eye, Trash } from "lucide-react";
import { GoogleMap, PolygonF, useJsApiLoader } from "@react-google-maps/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Spinner from "@/components/common/Spinner";
import { mapViewApi } from "@/api/apiEndpoints";
import { parseWKTToPolygons } from "@/utils/wkt";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "@/lib/googleMapsLoader";
import {
  readProjectsListCacheEntry,
  isProjectsListCacheFresh,
  removeProjectFromProjectsCache,
  writeProjectsListCache,
} from "@/utils/projectsCache";

const normalizeLatLng = (input) => {
  if (!input) return null;
  if (Array.isArray(input) && input.length >= 2) {
    const first = Number(input[0]);
    const second = Number(input[1]);
    if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
    const looksLikeLngLat = Math.abs(first) > 40 && Math.abs(second) < 40;
    return looksLikeLngLat
      ? { lat: second, lng: first }
      : { lat: first, lng: second };
  }

  if (typeof input === "object") {
    const lat = Number(input.lat ?? input.latitude ?? input.Lat ?? input.Latitude);
    const lng = Number(input.lng ?? input.lon ?? input.longitude ?? input.Lng ?? input.Longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }

  return null;
};

const extractPolygonFromGeometryObject = (geometryObject) => {
  if (!geometryObject || typeof geometryObject !== "object") return [];

  if (geometryObject.type === "Polygon" && Array.isArray(geometryObject.coordinates)) {
    const outerRing = geometryObject.coordinates[0] || [];
    return outerRing.map(normalizeLatLng).filter(Boolean);
  }

  if (geometryObject.type === "MultiPolygon" && Array.isArray(geometryObject.coordinates)) {
    const outerRing = geometryObject.coordinates[0]?.[0] || [];
    return outerRing.map(normalizeLatLng).filter(Boolean);
  }

  if (Array.isArray(geometryObject.polygon)) {
    return geometryObject.polygon.map(normalizeLatLng).filter(Boolean);
  }

  return [];
};

const getProjectPolygonPoints = (project) => {
  const geometryCandidates = [
    project?.geometry,
    project?.Geometry,
    project?.geometry_wkt,
    project?.GeometryWkt,
    project?.region_wkt,
    project?.RegionWkt,
    project?.region_blob_b64,
    project?.regionBlobB64,
    project?.wkt,
    project?.WKT,
    project?.polygon_wkt,
    project?.polygonWkt,
    project?.project_polygon,
    project?.project_geometry,
  ];

  for (const candidate of geometryCandidates) {
    if (!candidate) continue;

    if (typeof candidate === "string") {
      const raw = candidate.trim();
      if (!raw) continue;

      if (/^(POLYGON|MULTIPOLYGON)/i.test(raw)) {
        const parsed = parseWKTToPolygons(raw);
        const firstPath = parsed?.[0]?.paths?.[0];
        if (Array.isArray(firstPath) && firstPath.length >= 3) {
          return firstPath;
        }
      }

      if ((raw.startsWith("{") && raw.endsWith("}")) || (raw.startsWith("[") && raw.endsWith("]"))) {
        try {
          const parsedJson = JSON.parse(raw);
          const points = extractPolygonFromGeometryObject(parsedJson);
          if (points.length >= 3) return points;
        } catch {
          // Ignore non-json strings
        }
      }
    } else if (typeof candidate === "object") {
      const points = extractPolygonFromGeometryObject(candidate);
      if (points.length >= 3) return points;
    }
  }

  return [];
};

const getPolygonCenter = (points) => {
  if (!Array.isArray(points) || points.length === 0) {
    return { lat: 20.5937, lng: 78.9629 };
  }
  const acc = points.reduce(
    (sum, point) => ({
      lat: sum.lat + point.lat,
      lng: sum.lng + point.lng,
    }),
    { lat: 0, lng: 0 },
  );
  return {
    lat: acc.lat / points.length,
    lng: acc.lng / points.length,
  };
};

const ProjectPolygonPreview = ({ points, mapsReady, mapsError }) => {
  if (!points?.length || points.length < 3) {
    return (
      <div className="h-40 rounded-md border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-sm text-slate-500">
        No polygon found
      </div>
    );
  }

  if (mapsError) {
    return (
      <div className="h-40 rounded-md border border-dashed border-amber-300 bg-amber-50 flex items-center justify-center text-sm text-amber-700 px-2 text-center">
        Google Maps failed to load
      </div>
    );
  }

  if (!mapsReady) {
    return (
      <div className="h-40 rounded-md border border-slate-200 bg-slate-50 flex items-center justify-center text-sm text-slate-500">
        Loading map...
      </div>
    );
  }

  const center = getPolygonCenter(points);
  const onMapLoad = (map) => {
    if (!window.google?.maps || !Array.isArray(points) || points.length < 3) return;
    const bounds = new window.google.maps.LatLngBounds();
    points.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, 18);
  };

  return (
    <div className="h-40 rounded-md border border-slate-200 bg-slate-50 overflow-hidden">
      <GoogleMap
        mapContainerClassName="h-full w-full"
        center={center}
        zoom={13}
        onLoad={onMapLoad}
        options={{
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: false,
          clickableIcons: false,
          gestureHandling: "cooperative",
        }}
      >
        <PolygonF
          paths={points}
          options={{
            strokeColor: "#2563eb",
            strokeOpacity: 1,
            strokeWeight: 2,
            fillColor: "#2563eb",
            fillOpacity: 0.2,
            clickable: false,
            editable: false,
            draggable: false,
          }}
        />
      </GoogleMap>
    </div>
  );
};

const ViewProjectsPage = () => {
  const navigate = useNavigate();
  const { isLoaded: mapsReady, loadError: mapsError } = useJsApiLoader(
    GOOGLE_MAPS_LOADER_OPTIONS,
  );
  const initialProjectsCache = useMemo(() => {
    return readProjectsListCacheEntry();
  }, []);
  const initialCachedProjects = initialProjectsCache?.data || [];
  const hasFreshInitialProjectsCache = isProjectsListCacheFresh(initialProjectsCache);

  const [projects, setProjects] = useState(initialCachedProjects);
  const [loading, setLoading] = useState(initialCachedProjects.length === 0);
  const [searchQuery, setSearchQuery] = useState("");

  const formatDate = (value) => {
    if (value == null) return "N/A";

    // Handle object-shaped date payloads from backend serializers
    if (typeof value === "object") {
      const candidates = [
        value.$date,
        value.date,
        value.Date,
        value.value,
        value.Value,
        value.created_on,
        value.createdOn,
      ];

      // Support structures like { year, month, day } or { Year, Month, Day }
      const year = Number(value.year ?? value.Year);
      const month = Number(value.month ?? value.Month);
      const day = Number(value.day ?? value.Day);
      if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
        const parsed = new Date(year, month - 1, day);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "2-digit",
          });
        }
      }

      const nested = candidates.find((c) => c != null && String(c).trim() !== "");
      if (nested != null) {
        return formatDate(nested);
      }
    }

    const raw = String(value).trim();
    if (!raw || raw.toLowerCase() === "null" || raw.toLowerCase() === "undefined") {
      return "N/A";
    }

    const direct = new Date(raw);
    if (!Number.isNaN(direct.getTime())) {
      return direct.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
    }

    // Handle common DB string formats like "dd-MM-yyyy HH:mm:ss" or "dd/MM/yyyy HH:mm:ss"
    const match = raw.match(
      /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/,
    );
    if (match) {
      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
      const hours = Number(match[4] ?? 0);
      const minutes = Number(match[5] ?? 0);
      const seconds = Number(match[6] ?? 0);
      const parsed = new Date(year, month - 1, day, hours, minutes, seconds);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "2-digit",
        });
      }
    }

    // Avoid rendering [object Object] in UI
    if (raw === "[object Object]") return "N/A";
    return raw;
  };

  const fetchProjects = useCallback(async ({ background = false } = {}) => {
    if (!background) setLoading(true);
    try {
      const res = await mapViewApi.getProjects();
      if (res?.Data && Array.isArray(res.Data)) {
        setProjects(res.Data);
        writeProjectsListCache(res.Data);
      } else {
        setProjects([]);
        writeProjectsListCache([]);
        if (!background) {
          toast.warn("No projects found.");
        }
      }
    } catch (error) {
      if (!background) {
        toast.error("Failed to load projects.");
      } else {
        console.warn("Failed to refresh project list in background.", error);
      }
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects({ background: initialCachedProjects.length > 0 && hasFreshInitialProjectsCache });
    const intervalId = window.setInterval(() => {
      fetchProjects({ background: true });
    }, 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, [fetchProjects, hasFreshInitialProjectsCache, initialCachedProjects.length]);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    
    const query = searchQuery.toLowerCase();
    return projects.filter((project) => {
      return (
        project.project_name?.toLowerCase().includes(query) ||
        project.provider?.toLowerCase().includes(query) ||
        project.id?.toString().includes(query)
      );
    });
  }, [projects, searchQuery]);

  const handleViewOnMap = (project) => {
    if (!project || !project.id) {
      toast.warn("Project has no ID to view on map.");
      return;
    }

    const params = new URLSearchParams({ project_id: project.id });
    if (project.ref_session_id) params.set("session", project.ref_session_id);
    navigate(`/unified-map?${params.toString()}`, {
      state: {
        project,
        sessionIds: project.ref_session_id
          ? String(project.ref_session_id).split(",").map((id) => id.trim()).filter(Boolean)
          : [],
      },
    });
  };


  const handleDeleteProject = async (project) => {
    if (!project || !project.id) {
      toast.warn("Project has no ID to delete.");
      return;
    }

    if (!window.confirm(`Are you sure you want to delete project "${project.project_name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const res = await mapViewApi.deleteProject(project.id);
      if (res.Status === 1) {
        toast.success("Project deleted successfully.");
        const updatedProjects = projects.filter((item) => Number(item.id) !== Number(project.id));
        setProjects(updatedProjects);
        removeProjectFromProjectsCache(project.id);
        writeProjectsListCache(updatedProjects);
        fetchProjects({ background: true });
      } else {
        toast.error("Failed to delete project.");
      }
    } catch (error) {
      console.error("Delete project failed.", error);
      toast.error("An error occurred while deleting the project.");
    }
  }

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Existing Projects</h1>
          <p className="text-gray-600 mt-1">
            Browse and open your previously created projects.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchProjects()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Projects Card */}
      <Card className="h-full">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Project List</CardTitle>
            {/* Search Input */}
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center h-40">
              <Spinner />
            </div>
          ) : filteredProjects.length ? (
            <div className="max-h-[70vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {filteredProjects.map((project) => {
                  const polygonPoints = getProjectPolygonPoints(project);
                  return (
                    <Card key={project.id} className="border-slate-200 shadow-sm aspect-square flex flex-col">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-900">
                                {project.project_name || "Untitled Project"}
                              </p>
                              <p className="text-xs text-slate-500 mt-1">Project ID: {project.id}</p>
                            </div>
                            <div className="text-xs text-slate-500 flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                               {formatDate(project.created_on)}
                            </div>
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 flex-1 flex flex-col">
                        <div className="flex-1 min-h-0">
                          <ProjectPolygonPreview
                            points={polygonPoints}
                            mapsReady={mapsReady}
                            mapsError={mapsError}
                          />
                        </div>

                        <div className="flex items-center justify-end gap-2 mt-auto">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewOnMap(project)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View on Map
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteProject(project)}
                          >
                            <Trash color="red" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-gray-500">
              <Folder className="h-12 w-12 mb-2 text-gray-300" />
              <span>
                {searchQuery ? "No projects match your search." : "No projects found."}
              </span>
            </div>
          )}

          {/* Results count */}
          {!loading && projects.length > 0 && (
            <div className="mt-4 text-sm text-gray-500 text-right">
              Showing {filteredProjects.length} of {projects.length} projects
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ViewProjectsPage;
