// src/components/projects/HeaderProjectsDropdown.jsx
import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "react-toastify";
import { Map, Calendar, Building2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import Spinner from "@/components/common/Spinner";
import { mapViewApi } from "@/api/apiEndpoints";
import { useNavigate } from "react-router-dom";
import {
  getProjectsListCacheKey,
  readProjectsListCache,
  writeProjectsListCache,
} from "@/utils/projectsCache";

const ProjectsDropdown = ({ currentProjectId }) => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const projectsCacheKey = useMemo(() => getProjectsListCacheKey(), []);
  const cachedProjects = useMemo(() => {
    return readProjectsListCache();
  }, []);

  // 1. Define the fetcher function
  const fetchProjects = async () => {
    const res = await mapViewApi.getProjects();
    if (res?.Data && Array.isArray(res.Data)) {
      return res.Data;
    }
    return [];
  };

  // 2. Use SWR
  // passing `null` as the key when `!open` pauses fetching until the dropdown is opened
  const {
    data: projects = [],
    isLoading: loading,
    error,
  } = useSWR(open ? projectsCacheKey : null, fetchProjects, {
    fallbackData: cachedProjects,
    keepPreviousData: true,
    revalidateIfStale: false,
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    onSuccess: (data) => {
      if (Array.isArray(data)) {
        writeProjectsListCache(data);
      }
    },
    onError: (err) => {
      console.error("❌ Failed to fetch projects:", err);
      toast.error("Failed to load projects.");
    },
  });

  const formatDate = (d) => (d ? new Date(d).toLocaleDateString() : "N/A");

  const handleSelect = (project) => {
    if (!project || !project.id) return;

    const params = new URLSearchParams({ project_id: project.id });
    if (project.ref_session_id) {
      params.set("session", project.ref_session_id);
    }
    navigate(`/unified-map?${params.toString()}`, {
      state: {
        project,
        sessionIds: project.ref_session_id
          ? String(project.ref_session_id).split(",").map((id) => id.trim()).filter(Boolean)
          : [],
      },
    });
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button className="flex items-center gap-2">
          <Map className="h-4 w-4" />
          Projects
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[320px] max-h-[400px] overflow-y-auto bg-white text-gray-900">
        <DropdownMenuLabel className="text-gray-700">Select Project</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => {
            navigate("/viewProject");
            setOpen(false);
          }}
          className="cursor-pointer font-medium text-blue-600 hover:bg-blue-50"
        >
          <Map className="h-4 w-4 mr-2" />
          View All Projects
        </DropdownMenuItem>
        <DropdownMenuSeparator />

        {loading ? (
          <div className="flex justify-center items-center py-8">
            <Spinner />
          </div>
        ) : projects.length > 0 ? (
          projects.map((project) => (
            <DropdownMenuItem
              key={project.id}
              onClick={() => handleSelect(project)}
              className={`cursor-pointer ${
                project.id === Number(currentProjectId)
                  ? "bg-blue-50 text-blue-700"
                  : "hover:bg-gray-100"
              }`}
            >
              <div className="flex flex-col gap-1 w-full">
                <div className="flex items-center gap-2">
                  <Map className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">{project.project_name}</span>
                  {project.id === Number(currentProjectId) && (
                    <span className="ml-auto text-xs bg-blue-600 text-white px-2 py-0.5 rounded">
                      Active
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 ml-6">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(project.created_on)}
                  </div>
                  {project.provider && (
                    <div className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {project.provider}
                    </div>
                  )}
                </div>
              </div>
            </DropdownMenuItem>
          ))
        ) : (
          <div className="py-8 text-center text-sm text-gray-500">
            {error ? "Error loading projects" : "No projects found"}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ProjectsDropdown;
