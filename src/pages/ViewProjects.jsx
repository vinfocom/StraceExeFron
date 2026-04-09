// src/pages/ViewProjectsPage.jsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Map, Folder, Calendar, Building2, RefreshCw, Search, Eye, Delete, Trash } from "lucide-react";
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
import { Remove } from "@mui/icons-material";
import {
  readProjectsListCache,
  removeProjectFromProjectsCache,
  writeProjectsListCache,
} from "@/utils/projectsCache";

const ViewProjectsPage = () => {
  const navigate = useNavigate();
  const initialCachedProjects = useMemo(() => {
    return readProjectsListCache();
  }, []);

  const [projects, setProjects] = useState(initialCachedProjects);
  const [loading, setLoading] = useState(initialCachedProjects.length === 0);
  const [searchQuery, setSearchQuery] = useState("");

  const formatDate = (d) => (d ? new Date(d).toLocaleDateString() : "N/A");

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
    fetchProjects({ background: initialCachedProjects.length > 0 });
  }, [fetchProjects, initialCachedProjects.length]);

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
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-gray-100">
                  <tr>
                     <th className="text-left p-3 font-semibold text-gray-700 border-b">
                      <div className="flex items-center gap-2">
                        Id
                      </div>
                    </th>
                    <th className="text-left p-3 font-semibold text-gray-700 border-b">
                      <div className="flex items-center gap-2">
                        <Map className="h-4 w-4" />
                        Project Name
                      </div>
                    </th>
                    {/* <th className="text-left p-3 font-semibold text-gray-700 border-b">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Provider
                      </div>
                    </th> */}
                    <th className="text-left p-3 font-semibold text-gray-700 border-b">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Created On
                      </div>
                    </th>
                    <th className="text-center p-3 font-semibold text-gray-700 border-b">
                      Actions
                    </th>
                    <th className="text-center p-3 font-semibold text-gray-700 border-b">
                      Delete
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.map((project) => (
                    <tr
                      key={project.id}
                      className="hover:bg-gray-50 transition-colors border-b last:border-b-0"
                    >
                      <td className="p-3">
                        <span className="font-medium text-gray-900">
                          {project.id}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-medium text-gray-900">
                          {project.project_name}
                        </span>
                      </td>
                      
                      <td className="p-3 text-gray-600">
                        {formatDate(project.created_on)}
                      </td>
                      <td className="p-3 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewOnMap(project)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View on Map
                        </Button>
                      </td>
                      <td className="p-3 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteProject(project)}
                        >
                          <Trash  color="red"/>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
