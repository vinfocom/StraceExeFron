/** Return the API body for either apiService's unwrapped result or raw Axios. */
export const getClutterTilesPayload = (response) => {
  const body = response?.data;
  if (Array.isArray(body)) return response;
  if (body && typeof body === "object") return body;
  return response;
};
