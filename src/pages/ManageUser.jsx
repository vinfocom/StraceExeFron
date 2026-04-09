import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminApi } from '../api/apiEndpoints';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import DataTable from '../components/common/DataTable';
import Spinner from '../components/common/Spinner';
import UserFormDialog from '../components/users/UserFormDialog';
import { Button } from "@/components/ui/button";
import { MoreHorizontal, ChevronLeft, ChevronRight } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from '@/components/ui/label';

const ManageUsersPage = () => {
    const { user } = useAuth();
    const userRoleId = Number(user?.m_user_type_id ?? 0);
    const isSuperAdmin = userRoleId === 3;
    const loggedInCompanyId = Number(user?.company_id ?? user?.CompanyId ?? user?.companyId ?? 0);
    const [searchParams] = useSearchParams();
    const companyIdQuery = searchParams.get('companyId');
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [filters, setFilters] = useState({ UserName: '', MobileNo: '', EmailId: '', CompanyId: '' });
    const [isFetchingDetails, setIsFetchingDetails] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [usersPerPage] = useState(10);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const superAdminCompanyId = companyIdQuery
                ? Number(companyIdQuery)
                : Number(filters.CompanyId?.trim() || 0);

            const scopedCompanyId = isSuperAdmin
                ? superAdminCompanyId
                : loggedInCompanyId;

            const apiFilters = {
                ...(filters.UserName?.trim() ? { UserName: filters.UserName.trim() } : {}),
                ...(filters.MobileNo?.trim() ? { Mobile: filters.MobileNo.trim() } : {}),
                ...(filters.EmailId?.trim() ? { Email: filters.EmailId.trim() } : {}),
                ...(Number.isFinite(scopedCompanyId) && scopedCompanyId > 0 ? { company_id: scopedCompanyId } : {})
            };
            const response = await adminApi.getUsers(apiFilters);
            if (response?.Status !== 1) {
                throw new Error(response?.Message || 'Failed to fetch users.');
            }

            const userData = Array.isArray(response?.Data) ? response.Data : [];
            const normalizedUsers = userData.map((item) => {
                const obUser = item?.ob_user || item || {};
                const userId = obUser.id ?? item?.user_id ?? item?.id;
                const userTypeId = obUser.m_user_type_id ?? item?.m_user_type_id ?? null;
                const companyId = obUser.company_id ?? item?.company_id ?? null;

                return {
                    ...item,
                    ...obUser,
                    id: userId,
                    user_id: userId,
                    user_name: obUser.name ?? item?.user_name ?? '',
                    user_email: obUser.email ?? item?.user_email ?? '',
                    user_mobile: obUser.mobile ?? item?.user_mobile ?? '',
                    user_isactive: obUser.isactive ?? item?.user_isactive ?? 0,
                    m_user_type_id: userTypeId,
                    license_id: item?.license_id ?? userTypeId,
                    company_id: companyId,
                    company_name: item?.company_name ?? (companyId ? `ID: ${companyId}` : '-'),
                    created_on: obUser.date_created ?? item?.created_on ?? null,
                };
            });

            setUsers(normalizedUsers);
        } catch (error) {
            toast.error(error.message || 'Failed to fetch users.');
            setUsers([]);
        } finally {
            setLoading(false);
        }
    }, [filters, companyIdQuery, isSuperAdmin, loggedInCompanyId]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleOpenDialog = async (user = null) => {
        if (user) {
            console.log("handleOpenDialog user:", user);
            setIsDialogOpen(true);
            setIsFetchingDetails(true);
            try {
                const userId = user.id ?? user.user_id ?? user.UserId;
                const response = await adminApi.getUserById(userId);
                const userData = response.Data?.ob_user || response.Data || response;
                setCurrentUser(userData);
            } catch (error) {
                toast.error("Failed to fetch latest user details.");
                setIsDialogOpen(false);
            } finally {
                setIsFetchingDetails(false);
            }
        } else {
            setCurrentUser(null);
            setIsDialogOpen(true);
        }
    };

    const handleCloseDialog = () => {
        setIsDialogOpen(false);
        setCurrentUser(null);
    };

    const handleSaveUser = () => {
        fetchUsers();
        handleCloseDialog();
    };

    const handleDeleteUser = async (userOrId) => {
        console.log("handleDeleteUser item:", userOrId);
        const userId = typeof userOrId === 'object'
            ? (userOrId.user_id ?? userOrId.id ?? userOrId.UserId ?? userOrId.userId)
            : userOrId;

        if (!userId) {
            toast.error('Cannot determine user id for delete.');
            return;
        }

        if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await adminApi.deleteUser(userId);
            const ok =
                response?.Status === 1 ||
                response?.Status === '1' ||
                response?.status === 200 ||
                response?.status === '200' ||
                response?.Success === true ||
                response?.success === true ||
                response?.IsSuccess === true ||
                (typeof response?.Message === 'string' && /success/i.test(response.Message));

            if (ok) {
                const successMsg = response?.Message || 'User deleted successfully!';
                toast.success(successMsg);
                fetchUsers();
            } else {
                const msg = response?.Message || response?.message || 'Failed to delete user.';
                toast.error(msg);
            }
        } catch (error) {
            toast.error(error?.message || 'Failed to delete user.');
        }
    };

    const handleActivateUser = async (userOrId) => {
        const userId = typeof userOrId === 'object'
            ? (userOrId.user_id ?? userOrId.id ?? userOrId.UserId ?? userOrId.userId)
            : userOrId;

        if (!userId) {
            toast.error('Cannot determine user id for activation.');
            return;
        }

        if (!window.confirm('Are you sure you want to activate this user?')) {
            return;
        }

        try {
            const response = await adminApi.activateUser(userId);
            const ok =
                response?.Status === 1 ||
                response?.Status === '1' ||
                response?.status === 200 ||
                response?.status === '200' ||
                response?.Success === true ||
                response?.success === true ||
                response?.IsSuccess === true ||
                (typeof response?.Message === 'string' && /success/i.test(response.Message));

            if (ok) {
                const successMsg = response?.Message || 'User activated successfully!';
                toast.success(successMsg);
                fetchUsers();
                if (typeof window !== 'undefined' && window.fetchCompanies) {
                    window.fetchCompanies(); // Try to poke SuperAdmin to update if it exists globally, though usually not possible, we will just rely on standard fetchUsers.
                }
            } else {
                const msg = response?.Message || response?.message || 'Failed to activate user.';
                toast.error(msg);
            }
        } catch (error) {
            toast.error(error?.message || 'Failed to activate user.');
        }
    };

    const handleDeactivateUser = async (userOrId) => {
        const userId = typeof userOrId === 'object'
            ? (userOrId.user_id ?? userOrId.id ?? userOrId.UserId ?? userOrId.userId)
            : userOrId;

        if (!userId) {
            toast.error('Cannot determine user id for deactivation.');
            return;
        }

        if (!window.confirm('Are you sure you want to deactivate this user?')) {
            return;
        }

        try {
            const response = await adminApi.inactivateUser(userId);
            const ok =
                response?.Status === 1 ||
                response?.Status === '1' ||
                response?.status === 200 ||
                response?.status === '200' ||
                response?.Success === true ||
                response?.success === true ||
                response?.IsSuccess === true ||
                (typeof response?.Message === 'string' && /success/i.test(response.Message));

            if (ok) {
                const successMsg = response?.Message || 'User deactivated successfully!';
                toast.success(successMsg);
                fetchUsers();
                if (typeof window !== 'undefined' && window.fetchCompanies) {
                    window.fetchCompanies();
                }
            } else {
                const msg = response?.Message || response?.message || 'Failed to deactivate user.';
                toast.error(msg);
            }
        } catch (error) {
            toast.error(error?.message || 'Failed to deactivate user.');
        }
    };

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const handleReset = () => {
        setFilters({ UserName: '', MobileNo: '', EmailId: '', CompanyId: '' });
    };

    useEffect(() => {
        setCurrentPage(1);
    }, [users.length]);

    const indexOfLastUser = currentPage * usersPerPage;
    const indexOfFirstUser = indexOfLastUser - usersPerPage;
    const currentUsers = users.slice(indexOfFirstUser, indexOfLastUser);
    const totalPages = users.length > 0 ? Math.ceil(users.length / usersPerPage) : 1;

    const paginate = (pageNumber) => {
        if (pageNumber > 0 && pageNumber <= totalPages) {
            setCurrentPage(pageNumber);
        }
    };

    const getUserTypeLabel = (typeId) => {
        const userTypes = {
            0: 'Default',
            1: 'Admin',
            2: 'User',
            3: 'Manager',
        };
        return userTypes[typeId] !== undefined ? userTypes[typeId] : typeId || '-';
    };

    const getStatusBadge = (isActive) => {
        const statusConfig = {
            1: { label: 'Active', className: 'bg-green-100 text-green-700 border border-green-300' },
            0: { label: 'Inactive', className: 'bg-yellow-100 text-yellow-700 border border-yellow-300' },
            2: { label: 'Deleted', className: 'bg-red-100 text-red-700 border border-red-300' },
        };
        const config = statusConfig[isActive] || { label: 'Unknown', className: 'bg-gray-100 text-gray-700 border border-gray-300' };
        return (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.className}`}>
                {config.label}
            </span>
        );
    };

    const columns = [
        {
            header: 'S. No.',
            render: (row, index) => <span className="text-gray-700 font-medium">{indexOfFirstUser + index + 1}</span>
        },
        {
            header: 'License Id',
            accessor: 'license_id',
            render: (row) => <span className="text-gray-700">{getUserTypeLabel(row.license_id)}</span>
        },
        {
            header: 'User Name',
            accessor: 'name',
            render: (row) => <span className="text-gray-800 font-medium">{row.user_name || '-'}</span>
        },
        {
            header: 'Email ID',
            accessor: 'email',
            render: (row) => <span className="text-gray-700">{row.user_email || '-'}</span>
        },
        {
            header: 'Mobile No.',
            accessor: 'user_mobile',
            render: (row) => <span className="text-gray-700">{row.user_mobile || '-'}</span>
        },{
            header: 'Company',
            accessor: 'company_name',
            render: (row) => <span className="text-gray-700">{row.company_name || '-'}</span>
        },{
            header: 'Created On',
            accessor: 'created_on',
            render: (row) => row.created_on ? new Date(row.created_on).toLocaleDateString() : '-'
        },
        
         ...(isSuperAdmin ? [{
        header: 'Licenses Code',
        accessor: 'licenses_code',
        render: (row) => (
            <span className="text-gray-700">{row.license_code || '-'}</span>
        )
    }] : []),
        {
            header: 'Status',
            accessor: 'user_isactive',
            render: (row) => getStatusBadge(row.user_isactive)
        },
        {
            header: 'Action',
            render: (user) => (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0 text-gray-600 hover:text-gray-800 hover:bg-gray-100">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-white border border-gray-200 shadow-lg">
                        <DropdownMenuLabel className="text-gray-800">Actions</DropdownMenuLabel>
                        {user.user_isactive === 1 && (
                            <>
                                <DropdownMenuItem
                                    onClick={() => handleDeactivateUser(user)}
                                    className="text-yellow-600 hover:bg-yellow-50 cursor-pointer"
                                >
                                    Make Inactive
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => handleDeleteUser(user)}
                                    className="text-red-600 hover:bg-red-50 cursor-pointer"
                                >
                                    Delete
                                </DropdownMenuItem>
                            </>
                        )}
                        {user.user_isactive === 0 && (
                            <>
                                <DropdownMenuItem
                                    onClick={() => handleActivateUser(user)}
                                    className="text-green-600 hover:bg-green-50 cursor-pointer"
                                >
                                    Make Active
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => handleDeleteUser(user)}
                                    className="text-red-600 hover:bg-red-50 cursor-pointer"
                                >
                                    Delete
                                </DropdownMenuItem>
                            </>
                        )}
                        {user.user_isactive === 2 && (
                            <DropdownMenuItem
                                onClick={() => handleActivateUser(user)}
                                className="text-green-600 hover:bg-green-50 cursor-pointer"
                            >
                                Make Active
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            ),
        },
    ];

    if (loading && users.length === 0) return <Spinner />;

    return (
        <div className="space-y-6 bg-gray-50 min-h-screen p-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-800">Manage Users</h1>
            </div>

            <Card className="bg-white border border-gray-200 shadow-sm">
                <CardContent className="pt-6">
                    <div className={`grid grid-cols-1 gap-4 items-end ${isSuperAdmin ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
                        <div className="space-y-1.5">
                            <Label htmlFor="UserName" className="text-gray-700 font-medium">User Name</Label>
                            <Input
                                id="UserName"
                                name="UserName"
                                placeholder="Search by name..."
                                value={filters.UserName}
                                onChange={handleFilterChange}
                                className="bg-white border-gray-300 text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="MobileNo" className="text-gray-700 font-medium">Mobile No</Label>
                            <Input
                                id="MobileNo"
                                name="MobileNo"
                                placeholder="Search by mobile..."
                                value={filters.MobileNo}
                                onChange={handleFilterChange}
                                className="bg-white border-gray-300 text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="EmailId" className="text-gray-700 font-medium">Email ID</Label>
                            <Input
                                id="EmailId"
                                name="EmailId"
                                placeholder="Search by email..."
                                value={filters.EmailId}
                                onChange={handleFilterChange}
                                className="bg-white border-gray-300 text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>
                        {isSuperAdmin && (
                            <div className="space-y-1.5">
                                <Label htmlFor="CompanyId" className="text-gray-700 font-medium">Company ID</Label>
                                <Input
                                    id="CompanyId"
                                    name="CompanyId"
                                    type="number"
                                    placeholder="Search by company ID..."
                                    value={filters.CompanyId}
                                    onChange={handleFilterChange}
                                    className="bg-white border-gray-300 text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500"
                                />
                            </div>
                        )}
                        <div className="flex gap-2">
                            <Button 
                                onClick={fetchUsers} 
                                disabled={loading}
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                {loading ? 'Searching...' : 'Search'}
                            </Button>
                            <Button 
                                variant="outline" 
                                onClick={handleReset} 
                                disabled={loading}
                                className="border-gray-300 text-gray-700 hover:bg-gray-100"
                            >
                                Reset
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-white border border-gray-200 shadow-sm">
                <CardHeader className="border-b border-gray-200">
                    <div className="flex justify-between items-center">
                        <span className="text-lg font-semibold text-gray-800">
                            Users List ({users.length} total)
                        </span>
                       
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="h-64 flex items-center justify-center">
                            <Spinner />
                        </div>
                    ) : users.length === 0 ? (
                        <div className="h-64 flex items-center justify-center text-gray-500">
                            No users found. Try adjusting your filters or add a new user.
                        </div>
                    ) : (
                        <DataTable columns={columns} data={currentUsers} />
                    )}
                </CardContent>

                {users.length > 0 && (
                    <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
                        <div className="text-sm text-gray-600">
                            Showing {indexOfFirstUser + 1} to {Math.min(indexOfLastUser, users.length)} of {users.length} entries
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => paginate(currentPage - 1)}
                                disabled={currentPage === 1}
                                className="border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                            >
                                <ChevronLeft className="h-4 w-4 mr-1" />
                                Previous
                            </Button>
                            <span className="text-sm text-gray-700 px-3">
                                Page {currentPage} of {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => paginate(currentPage + 1)}
                                disabled={currentPage === totalPages}
                                className="border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                            >
                                Next
                                <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </div>
                    </div>
                )}
            </Card>

            <UserFormDialog
                isOpen={isDialogOpen}
                onClose={handleCloseDialog}
                onSave={handleSaveUser}
                user={currentUser}
                isLoading={isFetchingDetails}
            />
        </div>
    );
};

export default ManageUsersPage;
