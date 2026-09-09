import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { toast } from "react-toastify";
import { l3EventApi } from "@/api/apiEndpoints";
import Spinner from "@/components/common/Spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const getValue = (row, ...keys) => {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null) return row[key];
  }
  return null;
};

const extractInsights = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.Data)) return payload.Data;
  return [];
};

const formatDateTime = (value) => {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

const formatCoordinate = (value) => {
  if (value === null || value === undefined || value === "") return "Not available";
  return String(value);
};

const formatDetails = (details) => {
  if (details === null || details === undefined || details === "") return "No additional details";
  if (typeof details === "object") return JSON.stringify(details, null, 2);

  try {
    return JSON.stringify(JSON.parse(details), null, 2);
  } catch {
    return String(details);
  }
};

const severityClass = (severity) => {
  const normalized = String(severity || "").toUpperCase();
  if (normalized === "HIGH" || normalized === "CRITICAL") return "destructive";
  if (normalized === "MEDIUM" || normalized === "WARNING") return "warning";
  return "secondary";
};

const InsightsPage = () => {
  const navigate = useNavigate();
  const { sessionId: routeSessionId } = useParams();
  const [searchParams] = useSearchParams();
  const sessionId = routeSessionId || searchParams.get("sessionId") || searchParams.get("id");
  const [insights, setInsights] = useState([]);
  const [count, setCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchInsights = useCallback(async () => {
    if (!sessionId) {
      setError("A session id is required to load insights.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await l3EventApi.getUploadInsights(sessionId);
      setInsights(extractInsights(response));
      setCount(response?.count ?? response?.Count ?? null);
    } catch (requestError) {
      const message = requestError?.message || "Unable to load insights.";
      setError(message);
      toast.error(`Failed to load insights: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const pageCount = useMemo(
    () => (count === null ? insights.length : Number(count) || 0),
    [count, insights.length],
  );

  return (
    <div className="min-h-full bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(-1)}
              aria-label="Back to drive test sessions"
              title="Back to drive test sessions"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Insights</h1>
              <p className="mt-1 text-sm text-slate-500">Session {sessionId || "not selected"}</p>
            </div>
          </div>
          <Button variant="outline" onClick={fetchInsights} disabled={loading || !sessionId}>
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center rounded-xl border bg-white">
            <Spinner size={72} />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <p className="text-sm text-red-600">{error}</p>
              <Button onClick={fetchInsights}>Try again</Button>
            </CardContent>
          </Card>
        ) : insights.length === 0 ? (
          <Card>
            <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
              <p className="font-medium text-slate-700">No insights found</p>
              <p className="text-sm text-slate-500">There are no generated insights for this session yet.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between rounded-xl border bg-white px-4 py-3 shadow-sm">
              <p className="text-sm text-slate-600">
                {pageCount} insight{pageCount === 1 ? "" : "s"} for this session
              </p>
              <Badge variant="secondary">Session {sessionId}</Badge>
            </div>

            <div className="grid gap-4">
              {insights.map((insight, index) => {
                const severity = getValue(insight, "severity", "Severity") || "UNKNOWN";
                const title = getValue(insight, "title", "Title") || "Untitled insight";
                const description = getValue(insight, "description", "Description") || "No description available";
                const insightTime = getValue(insight, "insightTime", "InsightTime", "insighttime");
                const latitude = getValue(insight, "latitude", "Latitude");
                const longitude = getValue(insight, "longitude", "Longitude");
                const details = getValue(insight, "details", "Details");

                return (
                  <Card key={getValue(insight, "id", "Id") ?? `${title}-${index}`} className="overflow-hidden">
                    <CardHeader className="border-b bg-white pb-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Badge variant={severityClass(severity)}>{String(severity).toUpperCase()}</Badge>
                            {getValue(insight, "source", "Source") && (
                              <span className="text-xs text-slate-500">
                                {getValue(insight, "source", "Source")}
                              </span>
                            )}
                          </div>
                          <CardTitle className="text-lg text-slate-900">{title}</CardTitle>
                        </div>
                        <span className="shrink-0 text-xs text-slate-400">
                          Insight {index + 1}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="grid gap-5 pt-5 lg:grid-cols-[minmax(0,1fr)_260px]">
                      <div className="space-y-4">
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Description</p>
                          <p className="text-sm leading-6 text-slate-700">{description}</p>
                        </div>
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Details</p>
                          <pre className="max-h-52 overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100 whitespace-pre-wrap break-words">
                            {formatDetails(details)}
                          </pre>
                        </div>
                      </div>
                      <div className="grid content-start gap-3 rounded-lg bg-slate-50 p-4 text-sm">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Insight time</p>
                          <p className="mt-1 text-slate-700">{formatDateTime(insightTime)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location</p>
                          <p className="mt-1 text-slate-700">
                            {formatCoordinate(latitude)}, {formatCoordinate(longitude)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default InsightsPage;
