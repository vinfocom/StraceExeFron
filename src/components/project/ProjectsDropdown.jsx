// src/components/projects/HeaderProjectsDropdown.jsx
import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "react-toastify";
import { Map, Calendar, Building2, Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Spinner from "@/components/common/Spinner";
import { mapViewApi } from "@/api/apiEndpoints";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  getProjectsListCacheKey,
  readProjectsListCache,
  writeProjectsListCache,
} from "@/utils/projectsCache";

const ProjectsDropdown = ({ currentProjectId }) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const { user } = useAuth();
  const userScope =
    user?.id ??
    user?.Id ??
    user?.user_id ??
    user?.UserId ??
    user?.email ??
    user?.Email ??
    "guest";
  const projectsCacheKey = useMemo(() => getProjectsListCacheKey(), [userScope]);
  const cachedProjects = useMemo(() => {
    return readProjectsListCache();
  }, [userScope]);

  const normalizeProject = (project) => {
    if (!project || typeof project !== "object") return null;

    const id = project.id ?? project.project_id ?? project.ProjectId;
    if (id == null || String(id).trim() === "") return null;

    return {
      ...project,
      id: Number(id),
      project_name:
        project.project_name ||
        project.ProjectName ||
        project.name ||
        project.project ||
        "Untitled Project",
      ref_session_id:
        project.ref_session_id ??
        project.refSessionId ??
        project.session_ids ??
        project.sessionIds ??
        "",
      created_on:
        project.created_on ??
        project.createdAt ??
        project.CreatedOn ??
        project.date_created ??
        null,
      provider:
        project.provider ??
        project.Provider ??
        project.operator ??
        project.company_name ??
        "",
    };
  };

  // 1. Define the fetcher function
  const fetchProjects = async () => {
    const res = await mapViewApi.getProjects();
    const rawProjects = Array.isArray(res?.Data)
      ? res.Data
      : Array.isArray(res?.data?.Data)
        ? res.data.Data
        : Array.isArray(res?.data)
          ? res.data
          : [];

    return rawProjects.map(normalizeProject).filter(Boolean);
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

  const normalizedProjects = useMemo(() => {
    return (Array.isArray(projects) ? projects : [])
      .map(normalizeProject)
      .filter(Boolean);
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return normalizedProjects;

    return normalizedProjects.filter((project) => {
      return (
        String(project.project_name || "").toLowerCase().includes(query) ||
        String(project.provider || "").toLowerCase().includes(query) ||
        String(project.id || "").includes(query)
      );
    });
  }, [normalizedProjects, searchQuery]);

  const formatDate = (d) => {
    if (!d) return "N/A";
    const parsed = new Date(d);
    return Number.isNaN(parsed.getTime()) ? "N/A" : parsed.toLocaleDateString();
  };

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

  const handleOpenChange = (nextOpen) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSearchQuery("");
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button className="flex items-center gap-2">
          <Map className="h-4 w-4" />
          Projects
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[340px] bg-white text-gray-900">
        <DropdownMenuLabel className="text-gray-700">Select Project</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <div className="px-2 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="h-9 border-gray-200 pl-9"
            />
          </div>
        </div>

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

        <div className="max-h-[360px] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <Spinner />
            </div>
          ) : filteredProjects.length > 0 ? (
            filteredProjects.map((project) => (
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
              {error ? "Error loading projects" : "No matching projects found"}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ProjectsDropdown;
