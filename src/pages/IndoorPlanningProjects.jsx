import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { indoorPlanningApi } from '@/api/apiEndpoints'

const defaultProjectName = () => {
  const stamp = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  return `Omni Site Signal ${stamp}`
}

const getProjectId = (project) => project?.id || project?.Id || project?.projectId || project?.ProjectId || project?._id

const getProjectKey = (project, index) => {
  return getProjectId(project) || `${project?.name || project?.Name || project?.projectName || 'indoor-project'}-${project?.createdAt || project?.CreatedAt || project?.updatedAt || project?.UpdatedAt || index}`
}

function IndoorPlanningProjects() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showNewProject, setShowNewProject] = useState(false)
  const [projectName, setProjectName] = useState(defaultProjectName)
  const [creating, setCreating] = useState(false)

  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
  }, [projects])

  useEffect(() => {
    let cancelled = false
    const loadProjects = async () => {
      setLoading(true)
      setError('')
      try {
        const result = await indoorPlanningApi.getProjects()
        if (!cancelled) setProjects(Array.isArray(result) ? result : result?.projects || [])
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Could not load indoor projects.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadProjects()
    return () => {
      cancelled = true
    }
  }, [])

  const openProject = (project) => {
    const id = getProjectId(project)
    if (!id) {
      setError('This indoor project has no project id, so it cannot be opened.')
      return
    }
    navigate(`/indoor-planing/${id}`, { state: { indoorProject: project } })
  }

  const createProject = async (event) => {
    event?.preventDefault?.()
    const name = projectName.trim() || defaultProjectName()
    setCreating(true)
    setError('')
    try {
      const created = await indoorPlanningApi.createProject({ name })
      const project = created?.project || created
      const id = getProjectId(project)
      if (id) {
        navigate(`/indoor-planing/${id}`, { state: { indoorProject: project, isNewProject: true } })
        return
      }
      setShowNewProject(false)
    } catch (err) {
      setError(err?.message || 'Could not create indoor project.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-slate-50 p-4">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
            onClick={() => {
              setProjectName(defaultProjectName())
              setShowNewProject(true)
            }}
          >
            <Plus className="h-4 w-4" />
            New Project
          </button>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Omni Site Signal Projects</h1>
          {error && <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          {loading ? (
            <p className="mt-4 text-sm text-slate-600">Loading projects...</p>
          ) : sortedProjects.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">No Omni Site Signal projects created yet.</p>
          ) : (
            <div className="mt-4 grid gap-2">
              {sortedProjects.map((project, index) => (
                <button
                  key={getProjectKey(project, index)}
                  type="button"
                  className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-3 text-left hover:border-indigo-300 hover:bg-indigo-50"
                  onClick={() => openProject(project)}
                >
                  <span>
                    <span className="block font-medium text-slate-900">{project.name || project.Name || project.projectName || 'Untitled Omni Site Signal Project'}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Updated {project.updatedAt || project.UpdatedAt ? new Date(project.updatedAt || project.UpdatedAt).toLocaleString() : 'not yet'}
                    </span>
                  </span>
                  <span className="text-xs font-medium text-indigo-700">Open</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {showNewProject && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
          <form className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-4 shadow-xl" onSubmit={createProject}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">New Omni Site Signal Project</h2>
              <button type="button" className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={() => setShowNewProject(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="grid gap-1.5 text-sm text-slate-700">
              Project Name
              <input
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                autoFocus
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" onClick={() => setShowNewProject(false)}>Cancel</button>
              <button type="submit" className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white" disabled={creating}>
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export default IndoorPlanningProjects
