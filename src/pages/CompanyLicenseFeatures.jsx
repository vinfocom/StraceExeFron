import React, { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { companyApi } from "@/api/apiEndpoints";
import { Button } from "@/components/ui/button";
import { FEATURE_OPTIONS, getEnabledFeaturesFromSource } from "@/utils/featureAccess";

const statusLabels = { 0: "Inactive", 1: "Active", 2: "Revoked" };

export default function CompanyLicenseFeatures() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const companyId = searchParams.get("companyId");
  const userId = searchParams.get("userId");
  const validIds = /^[1-9]\d*$/.test(companyId || "") && /^[1-9]\d*$/.test(userId || "");
  const [licenses, setLicenses] = useState([]);
  const [featureEdits, setFeatureEdits] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!validIds) {
      setLoading(false);
      setError("A valid company and user ID are required.");
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      setLicenses([]);
      try {
        const response = await companyApi.licensesDetails({ companyId });
        if (response?.Status !== 1) throw new Error(response?.Message || "Could not load licenses.");
        const matching = (Array.isArray(response.Data) ? response.Data : [])
          .filter((row) => String(row.user_id) === userId);
        if (!cancelled) {
          setLicenses(matching);
          setFeatureEdits(Object.fromEntries(matching.map((row) => [
            row.license_id,
            getEnabledFeaturesFromSource(row),
          ])));
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError?.message || "Could not load licenses.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [companyId, userId, validIds]);

  const toggleFeature = (licenseId, featureKey, checked) => {
    setFeatureEdits((current) => {
      const selected = current[licenseId] || [];
      return {
        ...current,
        [licenseId]: checked
          ? [...new Set([...selected, featureKey])]
          : selected.filter((key) => key !== featureKey),
      };
    });
  };

  const saveFeatures = async (licenseId) => {
    const enabledFeatures = featureEdits[licenseId] || [];
    setSavingId(licenseId);
    try {
      const response = await companyApi.updateIssuedLicense(licenseId, {
        enabled_features: enabledFeatures,
      });
      if (response?.Status !== 1) throw new Error(response?.Message || "Could not update license features.");
      const saved = getEnabledFeaturesFromSource(response.Data);
      setLicenses((current) => current.map((row) => row.license_id === licenseId
        ? { ...row, enabled_features: saved }
        : row));
      setFeatureEdits((current) => ({ ...current, [licenseId]: saved }));
      toast.success("License features updated.");
    } catch (saveError) {
      toast.error(saveError?.message || "Could not update license features.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <main className="min-h-dvh bg-slate-100 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="outline" size="icon" aria-label="Back to company licenses" onClick={() => navigate(`/company-licenses?companyId=${companyId || ""}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">License features</h1>
            <p className="text-sm text-slate-600">{licenses[0]?.user_name || `User #${userId || "-"}`}</p>
          </div>
        </div>

        {loading ? <p>Loading license features...</p> : error ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
        ) : licenses.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">No issued licenses found for this user.</p>
        ) : (
          <div className="space-y-5">
            {licenses.map((license) => (
              <section key={license.license_id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{license.license_code || `License #${license.license_id}`}</h2>
                    <p className="mt-1 text-sm text-slate-600">{license.company_name || "Company"} | License #{license.license_id}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                    {statusLabels[license.license_status] || "Unknown"}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {FEATURE_OPTIONS.map((feature) => (
                    <label key={feature.key} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm font-medium text-slate-800">
                      <input
                        type="checkbox"
                        checked={(featureEdits[license.license_id] || []).includes(feature.key)}
                        onChange={(event) => toggleFeature(license.license_id, feature.key, event.target.checked)}
                        disabled={savingId != null}
                        className="h-4 w-4 accent-blue-600"
                      />
                      {feature.label}
                    </label>
                  ))}
                </div>
                <div className="mt-5 flex justify-end">
                  <Button onClick={() => saveFeatures(license.license_id)} disabled={savingId != null}>
                    {savingId === license.license_id ? "Saving..." : "Save features"}
                  </Button>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
