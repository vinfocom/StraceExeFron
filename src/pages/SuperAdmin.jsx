import React, { useEffect, useState } from "react";
import { companyApi } from "../api/apiEndpoints";
import { isCancelledError } from "../api/apiService";
import DataTable from "../components/common/DataTable";
import { useAuth } from "../context/AuthContext";
import { Navigate } from "react-router-dom";
import Spinner from "../components/common/Spinner";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";  
import { useNavigate } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "react-toastify";
import { FEATURE_OPTIONS, buildFeaturePayload } from "@/utils/featureAccess";

const USER_TYPE_OPTIONS = [
  { value: 1, label: "User" },
  { value: 2, label: "Admin" },
  { value: 3, label: "Superadmin" },
];

const SuperAdminCompanies = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isCreateUserDialogOpen, setIsCreateUserDialogOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [createUserForm, setCreateUserForm] = useState({
    name: "",
    email: "",
    mobile: "",
    password: "",
    m_user_type_id: 3,
    features: FEATURE_OPTIONS.map((item) => item.key),
  });

  const handleOpenDialog = (company) => {
    navigate("/company-form", { state: { company } });
  };

  const normalizeCompanyStatus = (status) => Number(status) === 1 ? 1 : 0;
  const getGrantedLicenses = (company) => Number(company?.total_granted_licenses ?? 0);
  const getUsedLicenses = (company) => Number(company?.total_used_licenses ?? 0);
  const hasAvailableLicense = (company) => {
    const granted = getGrantedLicenses(company);
    const used = getUsedLicenses(company);
    return granted <= 0 || used < granted;
  };

  const handleCompanyStatusUpdate = async (companyId, targetStatus) => {
    try{
      const res = await companyApi.updateCompanyStatus(companyId, targetStatus);
      if(res?.Status === 1 ){
        toast.success("Status updated successfully");
        fetchCompanies();
      }
    } catch(err){
      console.error("Error updating company status:", err);
      toast.error("Failed to update company status. Please try again.");
    }
  };

  const handleInactiveCompany = async (company) => {
    const currentStatus = normalizeCompanyStatus(company?.status);
    if (currentStatus === 0) {
      toast.info("Company is already inactive.");
      return;
    }
    const confirmed = window.confirm("Are you sure you want to set this company as inactive?");
    if (!confirmed) return;

    await handleCompanyStatusUpdate(company.id, 0);
  };

  const handleActivateCompany = async (company) => {
    const currentStatus = normalizeCompanyStatus(company?.status);
    if (currentStatus === 1) {
      toast.info("Company is already active.");
      return;
    }
    const confirmed = window.confirm("Are you sure you want to set this company as active?");
    if (!confirmed) return;

    await handleCompanyStatusUpdate(company.id, 1);
  };

  const handleDeleteCompany = async (id) => {
    if (!window.confirm('Are you sure you want to delete this company? This action cannot be undone.')) {
      return;
    }
    try{
      const res = await companyApi.deleteCompany(id);
      if(res?.Status === 1 ){
        toast.success("Company deleted Successfully")
        fetchCompanies();
      }
    }catch(err){
      console.error("Error deleting company:", err);
      toast.error("Failed to delete company. Please try again.");
    }
  }

  const resetCreateUserForm = () => {
    setCreateUserForm({
      name: "",
      email: "",
      mobile: "",
      password: "",
      m_user_type_id: 3,
      features: FEATURE_OPTIONS.map((item) => item.key),
    });
  };

  const openCreateUserDialog = (company) => {
    if (!hasAvailableLicense(company)) {
      toast.error("No available licenses for this company.");
      return;
    }
    setSelectedCompany(company);
    resetCreateUserForm();
    setIsCreateUserDialogOpen(true);
  };

  const closeCreateUserDialog = () => {
    setIsCreateUserDialogOpen(false);
    setSelectedCompany(null);
    resetCreateUserForm();
  };

  const handleCreateUserFieldChange = (event) => {
    const { name, value } = event.target;
    setCreateUserForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleUserTypeChange = (value) => {
    setCreateUserForm((prev) => ({
      ...prev,
      m_user_type_id: Number(value),
    }));
  };

  const handleFeatureToggle = (featureKey, checked) => {
    setCreateUserForm((prev) => {
      const nextFeatures = checked
        ? [...new Set([...prev.features, featureKey])]
        : prev.features.filter((item) => item !== featureKey);

      return {
        ...prev,
        features: nextFeatures,
      };
    });
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();

    if (!selectedCompany?.id) {
      toast.error("Company details are missing.");
      return;
    }

    if (!createUserForm.name.trim() || !createUserForm.email.trim() || !createUserForm.password.trim()) {
      toast.error("Name, email, and password are required.");
      return;
    }

    try {
      setIsCreatingUser(true);
      const payload = {
        company_id: selectedCompany.id,
        name: createUserForm.name.trim(),
        email: createUserForm.email.trim(),
        mobile: createUserForm.mobile.trim(),
        password: createUserForm.password,
        m_user_type_id: Number(createUserForm.m_user_type_id) || 3,
        ...buildFeaturePayload(createUserForm.features),
      };

      const response = await companyApi.createUser(payload);
      if (response?.Status === 1) {
        toast.success(response?.Message || "User created successfully.");
        closeCreateUserDialog();
        fetchCompanies();
        return;
      }

      toast.error(response?.Message || "Failed to create user.");
    } catch (err) {
      console.error("Error creating company user:", err);
      toast.error(
        err?.response?.data?.Message ||
        err?.response?.data?.message ||
        err?.message ||
        "Failed to create user."
      );
    } finally {
      setIsCreatingUser(false);
    }
  };

  const columns = [
    { header: "ID", accessor: "id" },
    { header: "Company Code", accessor: "company_code" },
    { header: "Company Name", accessor: "company_name" },
    { header: "Contact Person", accessor: "contact_person" },
    { header: "Email", accessor: "email" },
    { header: "Mobile", accessor: "mobile" },
    { 
      header: "Status", 
      accessor: "status",
      render: (row) => {
        const status = normalizeCompanyStatus(row.status);
        return (
        <Badge variant={status === 1 ? "success" : "destructive"}>
          {status === 1 ? "Active" : "Inactive"}
        </Badge>
      );
      }
    },
    { 
      header: "Licenses", 
      render: (row) => (
        <Button onClick={()=>{
          navigate(`/company-licenses?companyId=${row.id}`);
        }}>
        <span className="text-sm">
          {getUsedLicenses(row)} / {getGrantedLicenses(row)}
        </span>
        </Button>
      )
    },
    {
      header: "Created On",
      render: (row) => row.created_on ? new Date(row.created_on).toLocaleDateString() : "-"
    },
    {header: "Validity", accessor: "license_validity_in_months"},
    {
            header: 'Action',
            render: (user) => (
                <DropdownMenu >
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0 text-gray-600 hover:text-gray-800 hover:bg-gray-100">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-white border border-gray-200 shadow-lg">
                        <DropdownMenuLabel className="text-gray-800">Actions</DropdownMenuLabel>
                        <DropdownMenuItem 
                            onClick={() => handleOpenDialog(user)}
                            className="text-gray-700 hover:bg-gray-100 cursor-pointer"
                        >
                            Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => navigate(`/company-licenses?companyId=${user.id}`)}
                            className="text-gray-700 hover:bg-gray-100 cursor-pointer"
                        >
                            Manage Licenses
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => openCreateUserDialog(user)}
                            className={`cursor-pointer ${
                              hasAvailableLicense(user)
                                ? "text-gray-700 hover:bg-gray-100"
                                : "text-gray-400 cursor-not-allowed"
                            }`}
                        >
                            Add User
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() =>
                              normalizeCompanyStatus(user?.status) === 1
                                ? handleInactiveCompany(user)
                                : handleActivateCompany(user)
                            }
                            className={`cursor-pointer ${
                              normalizeCompanyStatus(user?.status) === 1
                                ? "text-red-600 hover:bg-red-50"
                                : "text-emerald-600 hover:bg-emerald-50"
                            }`}
                        >
                            {normalizeCompanyStatus(user?.status) === 1 ? "Inactive" : "Activate"}
                        </DropdownMenuItem>
                    
                    <DropdownMenuItem
                            onClick={() => handleDeleteCompany(user.id)}
                            className="text-red-600 hover:bg-red-50 cursor-pointer"
                        >
                            Delete
                        </DropdownMenuItem>
                        </DropdownMenuContent>
                    
                </DropdownMenu>
            ),
        },
  ];

  
  useEffect(() => {
    if (user?.m_user_type_id === 3) {
      fetchCompanies();
    }
  }, [user]);

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const response = await companyApi.getAll();
      
      if (response?.Status === 1) {
        const sortedData = Array.isArray(response.Data)
          ? [...response.Data].sort((a, b) => Number(a?.id ?? 0) - Number(b?.id ?? 0))
          : [];
        setData(sortedData);
      } else {
        setError(response?.Message || "Failed to fetch data");
      }
    } catch (err) {
      if (isCancelledError(err)) {
        return;
      }
      console.error("Error fetching companies:", err);
      setError("API Error: Could not load companies.");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) return <Spinner />;
  
 
  if (!user || user.m_user_type_id !== 3) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="p-6 space-y-6 ">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold tracking-tight">Company Management</h1>
        <Button onClick={() => navigate("/company-form")}> <Plus /> Add Company</Button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-md border border-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center h-64 items-center">
          <Spinner />
        </div>
      ) : (
        <DataTable columns={columns} data={data} />
      )}

      <Dialog open={isCreateUserDialogOpen} onOpenChange={(open) => !open && closeCreateUserDialog()}>
        <DialogContent className="sm:max-w-[560px] bg-white">
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
            <DialogDescription>
              Create a user for {selectedCompany?.company_name || "the selected company"} and issue a license immediately.
            </DialogDescription>
          </DialogHeader>

          {selectedCompany ? (
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              Licenses: {getUsedLicenses(selectedCompany)} / {getGrantedLicenses(selectedCompany)}
            </div>
          ) : null}

          <form onSubmit={handleCreateUser} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="create-user-name">Name</Label>
                <Input
                  id="create-user-name"
                  name="name"
                  value={createUserForm.name}
                  onChange={handleCreateUserFieldChange}
                  placeholder="Enter user name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-user-email">Email</Label>
                <Input
                  id="create-user-email"
                  name="email"
                  type="email"
                  value={createUserForm.email}
                  onChange={handleCreateUserFieldChange}
                  placeholder="Enter email address"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-user-mobile">Mobile</Label>
                <Input
                  id="create-user-mobile"
                  name="mobile"
                  value={createUserForm.mobile}
                  onChange={handleCreateUserFieldChange}
                  placeholder="Optional mobile number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-user-password">Password</Label>
                <Input
                  id="create-user-password"
                  name="password"
                  type="password"
                  value={createUserForm.password}
                  onChange={handleCreateUserFieldChange}
                  placeholder="Enter password"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-user-type">User Type</Label>
              <Select
                value={String(createUserForm.m_user_type_id)}
                onValueChange={handleUserTypeChange}
              >
                <SelectTrigger id="create-user-type" className="bg-white">
                  <SelectValue placeholder="Select user type" />
                </SelectTrigger>
                <SelectContent className="z-[2102]">
                  {USER_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Features</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {FEATURE_OPTIONS.map((feature) => (
                  <label
                    key={feature.key}
                    className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700"
                  >
                    <Checkbox
                      checked={createUserForm.features.includes(feature.key)}
                      onCheckedChange={(checked) => handleFeatureToggle(feature.key, Boolean(checked))}
                    />
                    <span>{feature.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeCreateUserDialog} disabled={isCreatingUser}>
                Cancel
              </Button>
              <Button type="submit" disabled={isCreatingUser}>
                {isCreatingUser ? "Creating..." : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SuperAdminCompanies;
