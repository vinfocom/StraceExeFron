import React, { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { companyApi } from "@/api/apiEndpoints";
import { Button } from "@/components/ui/button";

const formatExpiry = (value) => {
  if (!value) return "";
  const utcValue = /(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : `${value}Z`;
  const date = new Date(utcValue);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};

export default function PortalUsage({ companyId, onShowFeatures }) {
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setUsage(null);
      setError("");
      try {
        const response = await companyApi.portalUsage(companyId ? { companyId } : undefined);
        if (response?.Status !== 1) throw new Error(response?.Message || "Could not load portal usage.");
        if (!cancelled) setUsage(response);
      } catch (loadError) {
        if (!cancelled) setError(loadError?.message || "Could not load portal usage.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [companyId, refreshKey]);

  const activeUsers = Array.isArray(usage?.active_users) ? usage.active_users : [];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Active portal users">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Active portal users</h2>
          <p className="mt-1 text-sm text-slate-600">Users with a current web portal session</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setRefreshKey((key) => key + 1)} disabled={loading}>
          <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
        </Button>
      </div>

      {loading ? <p className="text-sm text-slate-600">Loading active users...</p> : error ? (
        <p role="alert" className="text-sm text-red-700">{error}</p>
      ) : (
        <>
          <p className="mb-4 text-3xl font-bold text-slate-900">{usage?.total_active_portal_users ?? 0}</p>
          {activeUsers.length === 0 ? (
            <p className="text-sm text-slate-600">No active portal users.</p>
          ) : (
            <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
              {activeUsers.map((activeUser) => (
                <li key={activeUser.user_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <p className="font-semibold text-slate-900">{activeUser.user_name || `User #${activeUser.user_id}`}</p>
                    <p className="text-slate-600">{[activeUser.user_email, activeUser.user_mobile].filter(Boolean).join(" · ") || "No contact details"}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {formatExpiry(activeUser.expires_at_utc) && (
                      <p className="text-slate-500">Session expires {formatExpiry(activeUser.expires_at_utc)}</p>
                    )}
                    {onShowFeatures && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onShowFeatures(activeUser)}
                        aria-label={`Features for ${activeUser.user_name || `user ${activeUser.user_id}`}`}
                      >
                        Features
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
