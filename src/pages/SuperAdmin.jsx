import React, { useEffect, useState } from "react";
import { companyApi } from "../api/apiEndpoints";
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
import { toast } from "react-toastify";

const SuperAdminCompanies = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const handleOpenDialog = (company) => {
    navigate("/company-form", { state: { company } });
  };

  const normalizeCompanyStatus = (status) => Number(status) === 1 ? 1 : 0;

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
          {row.total_used_licenses} / {row.total_granted_licenses}
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
                            onClick={() => handleInactiveCompany(user)}
                            className="text-red-600 hover:bg-red-50 cursor-pointer"
                        >
                            Inactive
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
        setData(response.Data);
      } else {
        setError(response?.Message || "Failed to fetch data");
      }
    } catch (err) {
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
    </div>
  );
};

export default SuperAdminCompanies;
