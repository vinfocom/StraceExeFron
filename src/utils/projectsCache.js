import {
  makeProjectCacheKey,
  readProjectSessionCache,
  readProjectSessionCacheEntry,
  isProjectSessionCacheFresh,
  writeProjectSessionCache,
} from "@/utils/projectSessionCache";

const PROJECTS_RESOURCE = "projects-list";
const PROJECTS_SCOPE = "all";
export const PROJECTS_LIST_CACHE_MAX_AGE_MS = 60 * 1000;

export const getProjectsListCacheKey = () =>
  makeProjectCacheKey({ resource: PROJECTS_RESOURCE, projectId: PROJECTS_SCOPE });

export const readProjectsListCache = () => {
  const cached = readProjectSessionCache(getProjectsListCacheKey());
  return Array.isArray(cached) ? cached : [];
};

export const readProjectsListCacheEntry = () => {
  const cached = readProjectSessionCacheEntry(getProjectsListCacheKey());
  if (!Array.isArray(cached?.data)) return null;
  return cached;
};

export const isProjectsListCacheFresh = (
  cacheEntry,
  maxAgeMs = PROJECTS_LIST_CACHE_MAX_AGE_MS,
) => isProjectSessionCacheFresh(cacheEntry, maxAgeMs);

export const writeProjectsListCache = (projects = []) =>
  writeProjectSessionCache(
    getProjectsListCacheKey(),
    Array.isArray(projects) ? projects : [],
  );

export const findProjectInProjectsCache = (projectId) => {
  if (!projectId) return null;
  const numericProjectId = Number(projectId);
  const projects = readProjectsListCache();
  return projects.find((project) => Number(project?.id) === numericProjectId) || null;
};

export const removeProjectFromProjectsCache = (projectId) => {
  if (!projectId) return;
  const numericProjectId = Number(projectId);
  const projects = readProjectsListCache();
  const nextProjects = projects.filter((project) => Number(project?.id) !== numericProjectId);
  writeProjectsListCache(nextProjects);
};

export const upsertProjectInProjectsCache = (incomingProject) => {
  if (!incomingProject || incomingProject.id == null) return;
  const numericProjectId = Number(incomingProject.id);
  const projects = readProjectsListCache();
  const nextProjects = [...projects];
  const existingIndex = nextProjects.findIndex(
    (project) => Number(project?.id) === numericProjectId,
  );

  if (existingIndex >= 0) {
    nextProjects[existingIndex] = incomingProject;
  } else {
    nextProjects.push(incomingProject);
  }

  writeProjectsListCache(nextProjects);
};

