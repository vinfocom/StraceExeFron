import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { companyApi } from "../api/apiEndpoints";
import { toast } from "react-toastify";
import DataTable from "../components/common/DataTable";
import Spinner from "../components/common/Spinner";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FEATURE_OPTIONS, getEnabledFeaturesFromSource } from "@/utils/featureAccess";
import PortalUsage from "@/components/company/PortalUsage";

const bodyTextClass = "text-[clamp(0.875rem,calc(0.82rem+0.2vw),1rem)]";
const tableTextClass = "text-[clamp(0.8125rem,calc(0.78rem+0.18vw),0.9375rem)]";
const badgeClass = "inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[clamp(0.75rem,calc(0.72rem+0.15vw),0.875rem)] font-semibold leading-tight";
const controlClass = "block min-h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[clamp(0.8125rem,calc(0.78rem+0.18vw),0.9375rem)] text-slate-800 outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/15 disabled:opacity-60";
const fieldLabelClass = "mb-2 block text-[clamp(0.875rem,calc(0.82rem+0.2vw),1rem)] font-semibold leading-tight text-slate-700";

const toDateInputValue = (value) => {
  const date = String(value ?? "").match(/^\d{4}-\d{2}-\d{2}/);
  return date ? date[0] : "";
};

const CompanyLicensesPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const companyIdQuery = searchParams.get("companyId");

  const [users, setUsers] = useState([]);
  const [licenseEdits, setLicenseEdits] = useState({});
  const [updatingLicenseId, setUpdatingLicenseId] = useState(null);
  const [featureLicense, setFeatureLicense] = useState(null);
  const [selectedFeatures, setSelectedFeatures] = useState([]);
  const [filterInputs, setFilterInputs] = useState({ code: "", mobile: "", status: "" });
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const companyName = users[0]?.company_name || "";

  const formatDate = (value) => {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString();
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const apiFilters = {
        ...(companyIdQuery ? { companyId: companyIdQuery } : {}),
        ...filters,
      };
      const response = await companyApi.licensesDetails(apiFilters);
      const userData = Array.isArray(response?.Data) ? response.Data : [];
      setUsers(userData);

      const nextEdits = {};
      userData.forEach((row) => {
        if (row?.license_id == null) return;
        nextEdits[row.license_id] = {
          status: String(row.license_status ?? 0),
          valid_till: toDateInputValue(row.valid_till),
        };
      });
      setLicenseEdits(nextEdits);
    } catch (error) {
      toast.error(error?.message || "Failed to fetch users.");
      setUsers([]);
      setLicenseEdits({});
    } finally {
      setLoading(false);
    }
  }, [companyIdQuery, filters]);

  useEffect(() => {
    if (companyIdQuery) {
      fetchUsers();
    } else {
      setLoading(false);
      toast.error("No Company ID provided.");
    }
  }, [fetchUsers, companyIdQuery]);

  const getUserStatusBadge = (isActive) => {
    const statusConfig = {
      1: {
        label: "Active",
        className: "bg-green-100 text-green-700 border border-green-300",
      },
      0: {
        label: "Inactive",
        className: "bg-yellow-100 text-yellow-700 border border-yellow-300",
      },
      2: {
        label: "Deleted",
        className: "bg-red-100 text-red-700 border border-red-300",
      },
    };
    const config = statusConfig[isActive] || {
      label: "Unknown",
      className: "bg-gray-100 text-gray-700 border border-gray-300",
    };
    return (
      <span className={`${badgeClass} ${config.className}`}>
        {config.label}
      </span>
    );
  };

  const getLicenseStatusBadge = (status) => {
    const statusConfig = {
      1: {
        label: "Active",
        className: "bg-green-100 text-green-700 border border-green-300",
      },
      0: {
        label: "Inactive",
        className: "bg-yellow-100 text-yellow-700 border border-yellow-300",
      },
      2: {
        label: "Revoked",
        className: "bg-red-100 text-red-700 border border-red-300",
      },
    };
    const config = statusConfig[status] || {
      label: "Unknown",
      className: "bg-gray-100 text-gray-700 border border-gray-300",
    };
    return (
      <span className={`${badgeClass} ${config.className}`}>
        {config.label}
      </span>
    );
  };

  const onChangeLicenseField = (licenseId, field, value) => {
    setLicenseEdits((prev) => ({
      ...prev,
      [licenseId]: {
        ...(prev[licenseId] || {}),
        [field]: value,
      },
    }));
  };

  const handleUpdateLicense = async (row) => {
    const licenseId = row?.license_id;
    if (!licenseId) return;

    const edit = licenseEdits[licenseId] || {};
    const status = Number(edit.status);
    const validTill = edit.valid_till ?? toDateInputValue(row.valid_till);

    if (![0, 1, 2].includes(status)) {
      toast.error("Invalid status value.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(validTill)) {
      toast.error("Select a valid license expiry date.");
      return;
    }

    try {
      setUpdatingLicenseId(licenseId);
      await companyApi.updateIssuedLicense(licenseId, {
        status,
        valid_till: `${validTill}T00:00:00`,
      });
      toast.success("License updated successfully.");
      await fetchUsers();
    } catch (error) {
      toast.error(error?.message || "Failed to update license.");
    } finally {
      setUpdatingLicenseId(null);
    }
  };

  const handleRevokeLicense = async (row) => {
    const licenseId = row?.license_id;
    if (!licenseId) return;

    const confirmed = window.confirm(
      "Are you sure you want to revoke this license?",
    );
    if (!confirmed) return;

    try {
      setUpdatingLicenseId(licenseId);
      await companyApi.revokeLicense(licenseId);
      toast.success("License revoked successfully.");
      await fetchUsers();
    } catch (error) {
      toast.error(error?.message || "Failed to revoke license.");
    } finally {
      setUpdatingLicenseId(null);
    }
  };

  const openFeatureEditor = (row) => {
    setFeatureLicense(row);
    setSelectedFeatures(getEnabledFeaturesFromSource(row));
  };

  const saveFeatures = async () => {
    if (!featureLicense?.license_id) return;
    const licenseId = featureLicense.license_id;
    try {
      setUpdatingLicenseId(licenseId);
      await companyApi.updateIssuedLicense(licenseId, {
        enabled_features: selectedFeatures,
      });
      toast.success("License features updated.");
      setFeatureLicense(null);
      await fetchUsers();
    } catch (error) {
      toast.error(error?.message || "Failed to update license features.");
    } finally {
      setUpdatingLicenseId(null);
    }
  };

  const renderValidTill = (row, inputId) => (
    <input
      id={inputId}
      type="date"
      aria-label={`Valid till for license ${row.license_id}`}
      value={licenseEdits[row.license_id]?.valid_till ?? toDateInputValue(row.valid_till)}
      onChange={(e) =>
        onChangeLicenseField(row.license_id, "valid_till", e.target.value)
      }
      disabled={updatingLicenseId === row.license_id}
      className={controlClass}
    />
  );

  const renderStatusEditor = (row, inputId) => {
    const edit = licenseEdits[row.license_id] || {};
    const selectedStatus = edit.status ?? String(row.license_status ?? 0);
    return (
      <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5">
        <select
          id={inputId}
          aria-label={`Status for license ${row.license_id}`}
          value={selectedStatus}
          onChange={(e) =>
            onChangeLicenseField(row.license_id, "status", e.target.value)
          }
          disabled={updatingLicenseId === row.license_id}
          className={controlClass}
        >
          <option value="1">Active</option>
          <option value="0">Inactive</option>
          <option value="2">Revoked</option>
        </select>
        {getLicenseStatusBadge(row.license_status)}
      </div>
    );
  };

  const renderActions = (row) => {
    const isUpdating = updatingLicenseId === row.license_id;
    return (
      <div className="grid w-full grid-cols-2 gap-1.5">
        <Button
          size="sm"
          className={`min-h-9 min-w-0 px-1.5 ${tableTextClass}`}
          onClick={() => handleUpdateLicense(row)}
          disabled={isUpdating}
        >
          {isUpdating ? "Updating..." : "Update"}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className={`min-h-9 min-w-0 px-1.5 ${tableTextClass}`}
          onClick={() => handleRevokeLicense(row)}
          disabled={isUpdating}
        >
          Revoke
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={`col-span-2 min-h-9 min-w-0 px-1.5 ${tableTextClass}`}
          onClick={() => openFeatureEditor(row)}
          disabled={isUpdating}
        >
          Features
        </Button>
      </div>
    );
  };

  const columns = [
    {
      header: "S. No.",
      className: "w-[5%]",
      render: (_row, index) => (
        <span className="text-gray-700 font-medium">{index + 1}</span>
      ),
    },
    {
      header: "License Id",
      className: "w-[6%]",
      accessor: "license_id",
      render: (row) => <span className="text-gray-700">{row.license_id || "-"}</span>,
    },
    {
      header: "Name",
      className: "w-[12%] overflow-hidden text-ellipsis",
      accessor: "name",
      render: (row) => (
        <span className="text-gray-800 font-medium" title={row.user_name || undefined}>{row.user_name || "-"}</span>
      ),
    },
    {
      header: "Mobile No.",
      className: "w-[10%] overflow-hidden text-ellipsis",
      accessor: "user_mobile",
      render: (row) => <span className="text-gray-700" title={row.user_mobile || undefined}>{row.user_mobile || "-"}</span>,
    },
    {
      header: "Created On",
      className: "w-[9%]",
      accessor: "created_on",
      render: (row) => formatDate(row.created_on),
    },
    {
      header: "Valid Till",
      className: "w-[12%]",
      accessor: "valid_till",
      render: (row) => renderValidTill(row),
    },
    {
      header: "License Code",
      className: "w-[10%] overflow-hidden text-ellipsis",
      accessor: "licenses_code",
      render: (row) => <span className="text-gray-700" title={row.license_code || undefined}>{row.license_code || "-"}</span>,
    },
    {
      header: "License Status",
      className: "w-[16%]",
      accessor: "license_status",
      render: (row) => renderStatusEditor(row),
    },
    {
      header: "User Status",
      className: "w-[8%]",
      accessor: "user_isactive",
      render: (row) => <div>{getUserStatusBadge(row.user_isactive)}</div>,
    },
    {
      header: "Action",
      className: "w-[12%]",
      render: renderActions,
    },
  ];

  if (loading && users.length === 0) return <Spinner />;

  return (
    <main className={`min-h-dvh min-w-0 bg-slate-100 p-[clamp(0.875rem,2.5vw,2rem)] text-slate-800 ${bodyTextClass}`}>
      <div className="mx-auto w-full max-w-[88rem]">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-4 py-[clamp(1rem,2.5vw,2rem)] max-[36rem]:items-stretch">
          <div className="flex min-w-0 items-start gap-[clamp(0.75rem,1.4vw,1rem)] max-[36rem]:w-full">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate("/companies")}
              className="h-11 w-11 shrink-0 border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              aria-label="Back to companies"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="m-0 break-words text-[clamp(1.45rem,calc(1.15rem+1.1vw),2.125rem)] leading-tight font-bold text-gray-900">{companyName || "Company Licenses"}</h1>
              <p className={`mt-1.5 leading-normal text-slate-500 ${bodyTextClass}`}>Manage licenses, expiry dates, and features</p>
            </div>
          </div>
        </div>

        <form
          className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_10rem_auto_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            setFilters(Object.fromEntries(Object.entries(filterInputs)
              .map(([key, value]) => [key, value.trim()])
              .filter(([, value]) => value !== "")));
          }}
        >
          <label className="text-sm font-medium text-slate-700">License code
            <input className={`${controlClass} mt-1`} value={filterInputs.code} onChange={(event) => setFilterInputs((prev) => ({ ...prev, code: event.target.value }))} placeholder="LIC-963406" />
          </label>
          <label className="text-sm font-medium text-slate-700">Mobile
            <input className={`${controlClass} mt-1`} value={filterInputs.mobile} onChange={(event) => setFilterInputs((prev) => ({ ...prev, mobile: event.target.value }))} placeholder="Mobile number" />
          </label>
          <label className="text-sm font-medium text-slate-700">Status
            <select className={`${controlClass} mt-1`} value={filterInputs.status} onChange={(event) => setFilterInputs((prev) => ({ ...prev, status: event.target.value }))}>
              <option value="">All</option><option value="1">Active</option><option value="0">Inactive</option><option value="2">Revoked</option>
            </select>
          </label>
          <Button type="submit" className="min-h-10">Search</Button>
          <Button type="button" variant="outline" className="min-h-10" onClick={() => { setFilterInputs({ code: "", mobile: "", status: "" }); setFilters({}); }}>Clear</Button>
        </form>

        {companyIdQuery && (
          <div className="mb-4">
            <PortalUsage
              companyId={companyIdQuery}
              onShowFeatures={(activeUser) => navigate(
                `/company-license-features?${new URLSearchParams({ companyId: companyIdQuery, userId: String(activeUser.user_id) })}`,
              )}
            />
          </div>
        )}

        <Card className="min-w-0 gap-0 overflow-hidden rounded-[clamp(0.875rem,1.5vw,1.25rem)] border-slate-200 bg-white py-0 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
          <CardContent className="px-[clamp(0.75rem,2vw,1.5rem)] py-[clamp(0.75rem,2vw,1.5rem)]">
            {loading ? (
              <div className="flex justify-center p-8">
                <Spinner />
              </div>
            ) : (
              <div className="min-w-0">
                <div className="hidden max-w-full overflow-x-auto min-[1536px]:block" role="region" aria-label="Company licenses table" tabIndex={0}>
                  <DataTable
                    data={users}
                    columns={columns}
                    className="gap-0 border-0 py-0 shadow-none"
                    tableClassName="w-full min-w-[82rem] table-fixed"
                    headClassName={`bg-slate-50 px-2 py-2.5 font-bold whitespace-nowrap ${tableTextClass}`}
                    cellClassName={`px-2 py-2.5 align-middle whitespace-nowrap ${tableTextClass}`}
                    rowClassName="border-slate-200 even:bg-slate-50/60"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 min-[1536px]:hidden">
                  {users.length === 0 ? (
                    <p className={`col-span-full px-4 py-8 text-center text-slate-500 ${bodyTextClass}`}>No licenses found for this company.</p>
                  ) : users.map((row, index) => (
                    <article className="flex min-w-0 flex-col gap-4 rounded-xl border border-slate-200 bg-white p-[clamp(1rem,2vw,1.25rem)]" key={row.license_id ?? row.id ?? index}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="m-0 break-words text-[clamp(1.05rem,calc(0.96rem+0.4vw),1.3rem)] font-bold text-slate-800">{row.user_name || "Unnamed user"}</h2>
                          <p className={`mt-1 text-slate-500 ${tableTextClass}`}>License #{row.license_id || "-"}</p>
                        </div>
                        {getUserStatusBadge(row.user_isactive)}
                      </div>
                      <dl className="m-0 grid gap-3">
                        <div className="grid grid-cols-[minmax(6.5rem,38%)_minmax(0,1fr)] gap-3"><dt className={`text-slate-500 ${tableTextClass}`}>Mobile No.</dt><dd className="m-0 min-w-0 break-words font-semibold text-slate-700">{row.user_mobile || "-"}</dd></div>
                        <div className="grid grid-cols-[minmax(6.5rem,38%)_minmax(0,1fr)] gap-3"><dt className={`text-slate-500 ${tableTextClass}`}>Created On</dt><dd className="m-0 min-w-0 break-words font-semibold text-slate-700">{formatDate(row.created_on)}</dd></div>
                        <div className="grid grid-cols-[minmax(6.5rem,38%)_minmax(0,1fr)] gap-3"><dt className={`text-slate-500 ${tableTextClass}`}>License Code</dt><dd className="m-0 min-w-0 break-words font-semibold text-slate-700">{row.license_code || "-"}</dd></div>
                      </dl>
                      <div className="grid grid-cols-1 gap-3">
                        <div className="min-w-0">
                          <label className={fieldLabelClass} htmlFor={`license-valid-${row.license_id}`}>Valid Till</label>
                          {renderValidTill(row, `license-valid-${row.license_id}`)}
                        </div>
                        <div className="min-w-0">
                          <label className={fieldLabelClass} htmlFor={`license-status-${row.license_id}`}>License Status</label>
                          {renderStatusEditor(row, `license-status-${row.license_id}`)}
                        </div>
                      </div>
                      <div className="mt-auto border-t border-slate-200 pt-3">{renderActions(row)}</div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Dialog open={Boolean(featureLicense)} onOpenChange={(open) => { if (!open && updatingLicenseId == null) setFeatureLicense(null); }}>
        <DialogContent title="License features" style={{ width: "min(28rem, 90vw)" }} showCloseButton={updatingLicenseId == null}>
          <h2 className="mb-3 text-xl font-bold text-slate-900">License features</h2>
          <p className="mb-4 text-sm text-slate-600">
            {featureLicense?.user_name || "User"} | {featureLicense?.license_code || `License #${featureLicense?.license_id}`}
          </p>
          <div className="grid gap-2">
            {FEATURE_OPTIONS.map((feature) => (
              <label key={feature.key} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={selectedFeatures.includes(feature.key)}
                  onChange={(event) => setSelectedFeatures((current) => event.target.checked
                    ? [...current, feature.key]
                    : current.filter((key) => key !== feature.key))}
                  disabled={updatingLicenseId != null}
                  className="h-4 w-4 accent-blue-600"
                />
                {feature.label}
              </label>
            ))}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFeatureLicense(null)} disabled={updatingLicenseId != null}>Cancel</Button>
            <Button onClick={saveFeatures} disabled={updatingLicenseId != null}>
              {updatingLicenseId != null ? "Saving..." : "Save features"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default CompanyLicensesPage;
