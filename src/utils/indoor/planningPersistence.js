export const serializePlanningData = (plan) => JSON.stringify(plan)

export const parseProjectPlan = (project) => {
  const value = project?.planJson || project?.PlanJson || project?.plan_json
  if (!value) return null
  if (typeof value === 'object') return value
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
