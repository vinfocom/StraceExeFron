import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { companyApi } from "../api/apiEndpoints";
import { toast } from "react-toastify";
import DataTable from "../components/common/DataTable";
import Spinner from "../components/common/Spinner";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const CompanyLicensesPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const companyIdQuery = searchParams.get("companyId");

  const [users, setUsers] = useState([]);
  const [licenseEdits, setLicenseEdits] = useState({});
  const [updatingLicenseId, setUpdatingLicenseId] = useState(null);
  const [loading, setLoading] = useState(true);

  const toDateInputValue = (value) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).split("T")[0];
    const year = d.getFullYear();
    const month = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const apiFilters = {
        ...(companyIdQuery ? { companyId: companyIdQuery } : {}),
      };
      const response = await companyApi.licensesDetails(apiFilters);
      const userData = Array.isArray(response?.Data) ? response.Data : [];
      setUsers(userData);

      const nextEdits = {};
      userData.forEach((row) => {
        if (row?.license_id == null) return;
        nextEdits[row.license_id] = {
          valid_till: toDateInputValue(row.valid_till),
          status: String(row.license_status ?? 0),
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
  }, [companyIdQuery]);

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
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.className}`}>
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
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.className}`}>
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

    if (!edit.valid_till) {
      toast.error("Please select valid till date.");
      return;
    }

    if (![0, 1, 2].includes(status)) {
      toast.error("Invalid status value.");
      return;
    }

    try {
      setUpdatingLicenseId(licenseId);
      await companyApi.updateIssuedLicense(licenseId, {
        valid_till: edit.valid_till,
        status,
      });
      toast.success("License updated successfully.");
      await fetchUsers();
    } catch (error) {
      toast.error(error?.message || "Failed to update license.");
    } finally {
      setUpdatingLicenseId(null);
    }
  };

  const columns = [
    {
      header: "S. No.",
      render: (_row, index) => (
        <span className="text-gray-700 font-medium">{index + 1}</span>
      ),
    },
    {
      header: "License Id",
      accessor: "license_id",
      render: (row) => <span className="text-gray-700">{row.license_id || "-"}</span>,
    },
    {
      header: "User Name",
      accessor: "name",
      render: (row) => (
        <span className="text-gray-800 font-medium">{row.user_name || "-"}</span>
      ),
    },
    {
      header: "Mobile No.",
      accessor: "user_mobile",
      render: (row) => <span className="text-gray-700">{row.user_mobile || "-"}</span>,
    },
    {
      header: "Company",
      accessor: "company_name",
      render: (row) => <span className="text-gray-700">{row.company_name || "-"}</span>,
    },
    {
      header: "Created On",
      accessor: "created_on",
      render: (row) =>
        row.created_on ? new Date(row.created_on).toLocaleDateString() : "-",
    },
    {
      header: "Valid Till",
      accessor: "valid_till",
      render: (row) => {
        const edit = licenseEdits[row.license_id] || {};
        return (
          <input
            type="date"
            value={edit.valid_till || ""}
            onChange={(e) =>
              onChangeLicenseField(row.license_id, "valid_till", e.target.value)
            }
            className="border rounded px-2 py-1 text-sm bg-white"
          />
        );
      },
    },
    {
      header: "License Code",
      accessor: "licenses_code",
      render: (row) => <span className="text-gray-700">{row.license_code || "-"}</span>,
    },
    {
      header: "License Status",
      accessor: "license_status",
      render: (row) => {
        const edit = licenseEdits[row.license_id] || {};
        const selectedStatus = edit.status ?? String(row.license_status ?? 0);
        return (
          <div className="flex items-center gap-2">
            <select
              value={selectedStatus}
              onChange={(e) =>
                onChangeLicenseField(row.license_id, "status", e.target.value)
              }
              className="border rounded px-2 py-1 text-sm bg-white"
            >
              <option value="1">Active</option>
              <option value="0">Inactive</option>
              <option value="2">Revoked</option>
            </select>
            {getLicenseStatusBadge(row.license_status)}
          </div>
        );
      },
    },
    {
      header: "User Status",
      accessor: "user_isactive",
      render: (row) => <div>{getUserStatusBadge(row.user_isactive)}</div>,
    },
    {
      header: "Action",
      render: (row) => {
        const isUpdating = updatingLicenseId === row.license_id;
        return (
          <Button
            size="sm"
            onClick={() => handleUpdateLicense(row)}
            disabled={isUpdating}
          >
            {isUpdating ? "Updating..." : "Update"}
          </Button>
        );
      },
    },
  ];

  if (loading && users.length === 0) return <Spinner />;

  return (
    <div className="space-y-6 bg-gray-50 min-h-screen p-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate("/companies")}
            className="h-10 w-10 bg-white border-gray-300 hover:bg-gray-100 text-gray-700"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-bold text-gray-800">Company Licenses</h1>
        </div>
      </div>

      <Card className="bg-white border border-gray-200 shadow-sm">
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          ) : (
            <DataTable
              data={users}
              columns={columns}
              emptyMessage="No licenses found for this company."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CompanyLicensesPage;
