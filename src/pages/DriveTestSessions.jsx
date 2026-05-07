// src/pages/DriveTestSessionsPage.jsx
import React, { useState, useEffect, useCallback } from "react";
import { adminApi, mapViewApi } from "../api/apiEndpoints";
import { toast } from "react-toastify";
import Spinner from "../components/common/Spinner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Search, Calendar, X, Settings2, Clock } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Trash2, Map, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const resolveCompanyId = (user) => {
  const directCompanyId = Number(
    user?.company_id ?? user?.CompanyId ?? user?.companyId ?? 0,
  );
  if (Number.isFinite(directCompanyId) && directCompanyId > 0) {
    return directCompanyId;
  }

  if (typeof window === "undefined") return 0;

  try {
    const cachedUser = JSON.parse(sessionStorage.getItem("user") || "null");
    const cachedCompanyId = Number(
      cachedUser?.company_id ??
        cachedUser?.CompanyId ??
        cachedUser?.companyId ??
        0,
    );
    return Number.isFinite(cachedCompanyId) && cachedCompanyId > 0
      ? cachedCompanyId
      : 0;
  } catch {
    return 0;
  }
};

const DriveTestSessionsPage = () => {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSessions, setSelectedSessions] = useState([]);
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");

  // Column-specific search states
  const [columnFilters, setColumnFilters] = useState({
    sessionId: "",
    userDetails: "",
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    startLocation: "",
    endLocation: "",
    distance: "",
    captureFrequency: "",
    sessionRemarks: "",
  });

  // Date filter states
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [sessionsPerPage, setSessionsPerPage] = useState(10); // ✅ fixed: added setter

  const [projectName, setProjectName] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const scopedCompanyId = resolveCompanyId(user);
  const isSuperAdmin = Number(user?.m_user_type_id ?? user?.UserTypeId ?? user?.role_id ?? 0) === 3;

  const [visibleColumns, setVisibleColumns] = useState({
    sessionId: true,
    userDetails: true,
    startDate: true,
    startTime: true,
    endDate: false,
    endTime: false,
    startLocation: true,
    endLocation: false,
    actions: true,
    distance: false,
    captureFrequency: false,
    sessionRemarks: false,
  });

  // Define all available columns with their properties
  const allColumns = {
    sessionId: { label: "Session ID", defaultVisible: true },
    userDetails: { label: "User Details", defaultVisible: true },
    startDate: { label: "Start Date", defaultVisible: true },
    startTime: { label: "Start Time", defaultVisible: true },
    endDate: { label: "End Date", defaultVisible: false },
    endTime: { label: "End Time", defaultVisible: false },
    startLocation: { label: "Start Location", defaultVisible: true },
    endLocation: { label: "End Location", defaultVisible: false },
    distance: { label: "Distance (km)", defaultVisible: false },
    captureFrequency: { label: "Capture Frequency", defaultVisible: false },
    sessionRemarks: { label: "Session Remarks", defaultVisible: false },
    actions: { label: "Actions", defaultVisible: true },
  };

  // Toggle column visibility
  const toggleColumn = (columnKey) => {
    setVisibleColumns((prev) => ({
      ...prev,
      [columnKey]: !prev[columnKey],
    }));
  };

  // Update column filter
  const updateColumnFilter = (column, value) => {
    setColumnFilters((prev) => ({
      ...prev,
      [column]: value,
    }));
  };

  // Clear specific column filter
  const clearColumnFilter = (column) => {
    setColumnFilters((prev) => ({
      ...prev,
      [column]: "",
    }));
  };

  // Clear all column filters
  const clearAllColumnFilters = () => {
    setColumnFilters({
      sessionId: "",
      userDetails: "",
      startDate: "",
      startTime: "",
      endDate: "",
      endTime: "",
      startLocation: "",
      endLocation: "",
      distance: "",
      captureFrequency: "",
      sessionRemarks: "",
    });
  };

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminApi.getSessions();
      const rows = Array.isArray(data?.Data) ? data.Data : [];
      const sortedRows = [...rows].sort((a, b) => {
        const aId = Number(a?.id ?? 0);
        const bId = Number(b?.id ?? 0);
        return bId - aId;
      });
      setSessions(sortedRows);
    } catch (error) {
      toast.error(`Failed to fetch sessions: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, startDate, endDate, columnFilters]);

  const toggleSessionSelection = (sessionId) => {
    setSelectedSessions((prev) =>
      prev.includes(sessionId)
        ? prev.filter((id) => id !== sessionId)
        : [...prev, sessionId],
    );
  };

  const clearDateFilters = () => {
    setStartDate("");
    setEndDate("");
  };

  const clearSearch = () => {
    setSearchTerm("");
  };

  const formatDateOnly = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const formatTimeOnly = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleTimeString();
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString();
  };

  const filteredSessions = sessions.filter((session) => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();

    const matchesGlobalSearch =
      !searchTerm ||
      session.id.toString().toLowerCase().includes(lowerCaseSearchTerm) ||
      (session.CreatedBy &&
        session.CreatedBy.toLowerCase().includes(lowerCaseSearchTerm)) ||
      (session.mobile &&
        session.mobile.toLowerCase().includes(lowerCaseSearchTerm)) ||
      (session.start_address &&
        session.start_address.toLowerCase().includes(lowerCaseSearchTerm)) ||
      (session.end_address &&
        session.end_address.toLowerCase().includes(lowerCaseSearchTerm));

    const matchesSessionId =
      !columnFilters.sessionId ||
      session.id
        .toString()
        .toLowerCase()
        .includes(columnFilters.sessionId.toLowerCase());

    const matchesUserDetails =
      !columnFilters.userDetails ||
      (session.CreatedBy &&
        session.CreatedBy.toLowerCase().includes(
          columnFilters.userDetails.toLowerCase(),
        )) ||
      (session.mobile &&
        session.mobile
          .toLowerCase()
          .includes(columnFilters.userDetails.toLowerCase())) ||
      (session.make &&
        session.make
          .toLowerCase()
          .includes(columnFilters.userDetails.toLowerCase())) ||
      (session.model &&
        session.model
          .toLowerCase()
          .includes(columnFilters.userDetails.toLowerCase())) ||
      (session.os &&
        session.os
          .toLowerCase()
          .includes(columnFilters.userDetails.toLowerCase())) ||
      (session.operator_name &&
        session.operator_name
          .toLowerCase()
          .includes(columnFilters.userDetails.toLowerCase()));

    const matchesStartDate =
      !columnFilters.startDate ||
      (session.start_time &&
        formatDateOnly(session.start_time)
          .toLowerCase()
          .includes(columnFilters.startDate.toLowerCase()));

    const matchesStartTime =
      !columnFilters.startTime ||
      (session.start_time &&
        formatTimeOnly(session.start_time)
          .toLowerCase()
          .includes(columnFilters.startTime.toLowerCase()));

    const matchesEndDate =
      !columnFilters.endDate ||
      (session.end_time &&
        formatDateOnly(session.end_time)
          .toLowerCase()
          .includes(columnFilters.endDate.toLowerCase()));

    const matchesEndTime =
      !columnFilters.endTime ||
      (session.end_time &&
        formatTimeOnly(session.end_time)
          .toLowerCase()
          .includes(columnFilters.endTime.toLowerCase()));

    const matchesStartLocation =
      !columnFilters.startLocation ||
      (session.start_address &&
        session.start_address
          .toLowerCase()
          .includes(columnFilters.startLocation.toLowerCase()));

    const matchesEndLocation =
      !columnFilters.endLocation ||
      (session.end_address &&
        session.end_address
          .toLowerCase()
          .includes(columnFilters.endLocation.toLowerCase()));

    const matchesDistance =
      !columnFilters.distance ||
      (session.distance_km &&
        session.distance_km.toString().includes(columnFilters.distance));

    const matchesCaptureFrequency =
      !columnFilters.captureFrequency ||
      (session.capture_frequency &&
        session.capture_frequency
          .toLowerCase()
          .includes(columnFilters.captureFrequency.toLowerCase()));

    const matchesSessionRemarks =
      !columnFilters.sessionRemarks ||
      (session.notes &&
        session.notes
          .toLowerCase()
          .includes(columnFilters.sessionRemarks.toLowerCase()));

    let matchesDateRange = true;
    if (startDate || endDate) {
      const sessionDate = session.start_time
        ? new Date(session.start_time)
        : null;

      if (sessionDate) {
        sessionDate.setHours(0, 0, 0, 0);

        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          if (sessionDate < start) {
            matchesDateRange = false;
          }
        }

        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (sessionDate > end) {
            matchesDateRange = false;
          }
        }
      } else {
        matchesDateRange = false;
      }
    }

    return (
      matchesGlobalSearch &&
      matchesSessionId &&
      matchesUserDetails &&
      matchesStartDate &&
      matchesStartTime &&
      matchesEndDate &&
      matchesEndTime &&
      matchesStartLocation &&
      matchesEndLocation &&
      matchesDistance &&
      matchesCaptureFrequency &&
      matchesSessionRemarks &&
      matchesDateRange
    );
  });

  // Pagination logic (must come before toggleSelectAll uses currentSessions)
  const indexOfLastSession = currentPage * sessionsPerPage;
  const indexOfFirstSession = indexOfLastSession - sessionsPerPage;
  const currentSessions = filteredSessions.slice(
    indexOfFirstSession,
    indexOfLastSession,
  );
  const totalPages = Math.ceil(filteredSessions.length / sessionsPerPage);

  const allCurrentPageSelected =
    currentSessions.length > 0 &&
    currentSessions.every((s) => selectedSessions.includes(s.id));

  const paginate = (pageNumber) => {
    if (pageNumber > 0 && pageNumber <= totalPages) {
      setCurrentPage(pageNumber);
    }
  };

  const toggleSelectAll = () => {
    const currentPageIds = currentSessions.map((s) => s.id);
    const allSelectedOnPage = currentPageIds.every((id) =>
      selectedSessions.includes(id),
    );

    if (allSelectedOnPage) {
      setSelectedSessions((prev) =>
        prev.filter((id) => !currentPageIds.includes(id)),
      );
    } else {
      setSelectedSessions((prev) => [...new Set([...prev, ...currentPageIds])]);
    }
  };

  const clearSelection = () => {
    setSelectedSessions([]);
  };

  const handleDelete = async (sessionId) => {
    if (
      window.confirm(
        "Are you sure you want to delete this session? This will also remove all associated log data.",
      )
    ) {
      try {
        await adminApi.deleteSession(sessionId);
        toast.success("Session deleted successfully");
        setSelectedSessions((prev) => prev.filter((id) => id !== sessionId));
        fetchSessions();
      } catch (error) {
        toast.error(`Failed to delete session: ${error.message}`);
      }
    }
  };

  const handleDeleteSelected = async () => {
    if (!selectedSessions.length) return;
    if (
      !window.confirm(
        `Are you sure you want to delete ${selectedSessions.length} selected session(s)? This will also remove all associated log data.`,
      )
    ) {
      return;
    }

    try {
      await Promise.all(selectedSessions.map((id) => adminApi.deleteSession(id)));
      toast.success(`${selectedSessions.length} session(s) deleted successfully`);
      setSelectedSessions([]);
      fetchSessions();
    } catch (error) {
      toast.error(`Failed to delete selected sessions: ${error.message}`);
    }
  };

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      toast.warning("Project name is required");
      return;
    }
    if (selectedSessions.length === 0) {
      toast.warning("Please select at least one session");
      return;
    }

    const normalizedSessionIds = selectedSessions
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0);

    const selectedCompanyIds = [
      ...new Set(
        sessions
          .filter((s) => normalizedSessionIds.includes(Number(s?.id)))
          .map((s) =>
            Number(s?.company_id ?? s?.CompanyId ?? s?.companyId ?? 0),
          )
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    ];

    const inferredCompanyId =
      Number.isFinite(scopedCompanyId) && scopedCompanyId > 0
        ? scopedCompanyId
        : selectedCompanyIds.length === 1
          ? selectedCompanyIds[0]
          : 0;

    if (!isSuperAdmin && selectedCompanyIds.length > 1 && inferredCompanyId <= 0) {
      toast.error(
        "Selected sessions belong to multiple companies. Please select sessions from one company.",
      );
      return;
    }

    const payload = {
      ProjectName: projectName.trim(),
      SessionIds: normalizedSessionIds,
      ...(inferredCompanyId > 0 ? { company_id: inferredCompanyId } : {}),
    };
    try {
      const res = await mapViewApi.createProject(payload);
      if (res.Status === 1) {
        toast.success("Project created successfully");
        setSelectedSessions([]);
        setIsDialogOpen(false);
      }
    } catch (error) {
      console.error("Project creation error:", error);
      toast.error(`Failed to create project: ${error.message}`);
    }
  };

  const handleViewOnMap = (sessionId) => {
    navigate(`/debug-map?sessionId=${encodeURIComponent(String(sessionId))}`);
  };

  const handleViewSelectedOnMap = () => {
    if (selectedSessions.length === 0) {
      toast.warning("Please select at least one session");
      return;
    }
    const sessionIdsParam = selectedSessions.join(",");
    navigate(`/debug-map?sessionId=${encodeURIComponent(sessionIdsParam)}`);
  };

  const hasActiveColumnFilters = Object.values(columnFilters).some(
    (filter) => filter !== "",
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col bg-white">
      <div className="flex items-center justify-between mb-4 gap-4">
        <div className="flex items-center gap-3 w-full justify-end flex-wrap">
          {/* Column Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                <Settings2 className="h-4 w-4 mr-2" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {Object.entries(allColumns).map(([key, column]) => {
                if (
                  key === "sessionId" ||
                  key === "userDetails" ||
                  key === "actions"
                ) {
                  return null;
                }
                return (
                  <DropdownMenuCheckboxItem
                    key={key}
                    checked={visibleColumns[key]}
                    onCheckedChange={() => toggleColumn(key)}
                  >
                    {column.label}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Clear All Filters Button */}
          {hasActiveColumnFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearAllColumnFilters}
              className="h-9"
            >
              <X className="h-4 w-4 mr-2" />
              Clear Column Filters
            </Button>
          )}

          {/* Multi-select actions */}
          {selectedSessions.length > 0 && (
            <>
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {selectedSessions.length} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={clearSelection}
                className="h-9"
              >
                Clear
              </Button>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    Create Project
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <div className="flex justify-center mt-10">
                    <div className="w-full max-w-md bg-white shadow-lg rounded-2xl p-6 space-y-4">
                      <h2 className="text-xl font-semibold text-gray-800">
                        Create New Project
                      </h2>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-600">
                          Project Name
                        </label>
                        <input
                          type="text"
                          value={projectName}
                          onChange={(e) => setProjectName(e.target.value)}
                          placeholder="Enter project name"
                          className="w-full px-4 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                        />
                      </div>
                      <Button
                        onClick={handleCreateProject}
                        className="w-full rounded-xl"
                        disabled={!projectName.trim() || selectedSessions.length === 0}
                      >
                        Create Project
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <Button
                variant="default"
                size="sm"
                onClick={handleViewSelectedOnMap}
                className="bg-blue-600 hover:bg-blue-700 h-9"
              >
                <MapPin className="h-4 w-4 mr-2" />
                View on Map
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleDeleteSelected}
                className="h-9 border hover:bg-red-100"
              >
                <Trash2 className="h-4 w-4 mr-2 text-red-500" />
                Delete Selected
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Active Filters Display */}
      {(searchTerm || startDate || endDate || hasActiveColumnFilters) && (
        <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
          <span>Active filters:</span>
          {searchTerm && (
            <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
              Global: "{searchTerm}"
            </span>
          )}
          {(startDate || endDate) && (
            <span className="bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-2 py-1 rounded">
              Date: {startDate || "..."} to {endDate || "..."}
            </span>
          )}
          {Object.entries(columnFilters).map(([key, value]) => {
            if (value) {
              return (
                <span
                  key={key}
                  className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded flex items-center gap-1"
                >
                  {allColumns[key]?.label}: "{value}"
                  <X
                    className="h-3 w-3 cursor-pointer hover:text-green-950"
                    onClick={() => clearColumnFilter(key)}
                  />
                </span>
              );
            }
            return null;
          })}
        </div>
      )}

      <div className="rounded-lg border shadow-sm flex-grow overflow-auto">
        <Table>
          <TableHeader>
            {/* Column Headers Row */}
            <TableRow>
              <TableHead className="w-[50px]">
                <Checkbox
                  checked={allCurrentPageSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all on this page"
                />
              </TableHead>
              {visibleColumns.sessionId && <TableHead>Session ID</TableHead>}
              {visibleColumns.userDetails && <TableHead>User Details</TableHead>}
              {visibleColumns.startDate && (
                <TableHead>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Start Date
                  </div>
                </TableHead>
              )}
              {visibleColumns.startTime && (
                <TableHead>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Start Time
                  </div>
                </TableHead>
              )}
              {visibleColumns.endDate && (
                <TableHead>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    End Date
                  </div>
                </TableHead>
              )}
              {visibleColumns.endTime && (
                <TableHead>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    End Time
                  </div>
                </TableHead>
              )}
              {visibleColumns.startLocation && <TableHead>Start Location</TableHead>}
              {visibleColumns.endLocation && <TableHead>End Location</TableHead>}
              {visibleColumns.distance && <TableHead>Distance (km)</TableHead>}
              {visibleColumns.captureFrequency && <TableHead>Capture Frequency</TableHead>}
              {visibleColumns.sessionRemarks && <TableHead>Session Remarks</TableHead>}
              {visibleColumns.actions && (
                <TableHead className="text-right">Actions</TableHead>
              )}
            </TableRow>

            {/* Column Filter Inputs Row */}
            <TableRow className="bg-muted/50">
              <TableHead className="w-[50px] p-2"></TableHead>

              {visibleColumns.sessionId && (
                <TableHead className="p-2">
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="Filter..."
                      className="h-8 text-xs pr-7"
                      value={columnFilters.sessionId}
                      onChange={(e) => updateColumnFilter("sessionId", e.target.value)}
                    />
                    {columnFilters.sessionId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => clearColumnFilter("sessionId")}
                        className="absolute right-0 top-0 h-8 w-7 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </TableHead>
              )}

              {visibleColumns.userDetails && (
                <TableHead className="p-2">
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="Filter..."
                      className="h-8 text-xs pr-7"
                      value={columnFilters.userDetails}
                      onChange={(e) => updateColumnFilter("userDetails", e.target.value)}
                    />
                    {columnFilters.userDetails && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => clearColumnFilter("userDetails")}
                        className="absolute right-0 top-0 h-8 w-7 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </TableHead>
              )}

              {visibleColumns.startDate && (
                <TableHead className="p-2">
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="Filter date..."
                      className="h-8 text-xs pr-7"
                      value={columnFilters.startDate}
                      onChange={(e) => updateColumnFilter("startDate", e.target.value)}
                    />
                    {columnFilters.startDate && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => clearColumnFilter("startDate")}
                        className="absolute right-0 top-0 h-8 w-7 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </TableHead>
              )}

              {visibleColumns.startTime && (
                <TableHead className="p-2">
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="Filter time..."
                      className="h-8 text-xs pr-7"
                      value={columnFilters.startTime}
                      onChange={(e) => updateColumnFilter("startTime", e.target.value)}
                    />
                    {columnFilters.startTime && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => clearColumnFilter("startTime")}
                        className="absolute right-0 top-0 h-8 w-7 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </TableHead>
              )}

              {visibleColumns.endDate && (
                <TableHead className="p-2">
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="Filter date..."
                      className="h-8 text-xs pr-7"
                      value={columnFilters.endDate}
                      onChange={(e) => updateColumnFilter("endDate", e.target.value)}
                    />
                    {columnFilters.endDate && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => clearColumnFilter("endDate")}
                        className="absolute right-0 top-0 h-8 w-7 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </TableHead>
              )}

              {visibleColumns.endTime && (
                <TableHead className="p-2">
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="Filter time..."
                      className="h-8 text-xs pr-7"
                      value={columnFilters.endTime}
                      onChange={(e) => updateColumnFilter("endTime", e.target.value)}
                    />
                    {columnFilters.endTime && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => clearColumnFilter("endTime")}
                        className="absolute right-0 top-0 h-8 w-7 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </TableHead>
              )}

              {visibleColumns.startLocation && (
                <TableHead className="p-2">
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="Filter..."
                      className="h-8 text-xs pr-7"
                      value={columnFilters.startLocation}
                      onChange={(e) => updateColumnFilter("startLocation", e.target.value)}
                    />
                    {columnFilters.startLocation && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => clearColumnFilter("startLocation")}
                        className="absolute right-0 top-0 h-8 w-7 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </TableHead>
              )}

              {visibleColumns.endLocation && (
                <TableHead className="p-2">
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="Filter..."
                      className="h-8 text-xs pr-7"
                      value={columnFilters.endLocation}
                      onChange={(e) => updateColumnFilter("endLocation", e.target.value)}
                    />
                    {columnFilters.endLocation && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => clearColumnFilter("endLocation")}
                        className="absolute right-0 top-0 h-8 w-7 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </TableHead>
              )}

              {visibleColumns.distance && (
                <TableHead className="p-2">
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="Filter..."
                      className="h-8 text-xs pr-7"
                      value={columnFilters.distance}
                      onChange={(e) => updateColumnFilter("distance", e.target.value)}
                    />
                    {columnFilters.distance && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => clearColumnFilter("distance")}
                        className="absolute right-0 top-0 h-8 w-7 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </TableHead>
              )}

              {visibleColumns.captureFrequency && (
                <TableHead className="p-2">
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="Filter..."
                      className="h-8 text-xs pr-7"
                      value={columnFilters.captureFrequency}
                      onChange={(e) => updateColumnFilter("captureFrequency", e.target.value)}
                    />
                    {columnFilters.captureFrequency && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => clearColumnFilter("captureFrequency")}
                        className="absolute right-0 top-0 h-8 w-7 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </TableHead>
              )}

              {visibleColumns.sessionRemarks && (
                <TableHead className="p-2">
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="Filter..."
                      className="h-8 text-xs pr-7"
                      value={columnFilters.sessionRemarks}
                      onChange={(e) => updateColumnFilter("sessionRemarks", e.target.value)}
                    />
                    {columnFilters.sessionRemarks && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => clearColumnFilter("sessionRemarks")}
                        className="absolute right-0 top-0 h-8 w-7 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </TableHead>
              )}

              {visibleColumns.actions && (
                <TableHead className="text-right p-2"></TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentSessions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={
                    Object.values(visibleColumns).filter(Boolean).length + 1
                  }
                  className="h-24 text-center text-muted-foreground"
                >
                  No sessions found matching your search criteria.
                </TableCell>
              </TableRow>
            ) : (
              currentSessions.map((session) => (
                <TableRow
                  key={session.id}
                  className={
                    selectedSessions.includes(session.id)
                      ? "bg-blue-900/30"
                      : ""
                  }
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedSessions.includes(session.id)}
                      onCheckedChange={() => toggleSessionSelection(session.id)}
                      aria-label={`Select session ${session.id}`}
                    />
                  </TableCell>

                  {visibleColumns.sessionId && (
                    <TableCell className="whitespace-normal break-words max-w-[150px]">
                      <div className="font-medium">{session.id || "N/A"}</div>
                    </TableCell>
                  )}

                  {visibleColumns.userDetails && (
                    <TableCell className="whitespace-normal break-words max-w-[200px]">
                      <div className="font-medium">
                        {session.CreatedBy || "Unknown User"} (
                        {session.mobile || "N/A"})
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {session.make}, {session.model}, {session.os},{" "}
                        {session.operator_name}
                      </div>
                    </TableCell>
                  )}

                  {visibleColumns.startDate && (
                    <TableCell className="whitespace-nowrap">
                      {formatDateOnly(session.start_time)}
                    </TableCell>
                  )}

                  {visibleColumns.startTime && (
                    <TableCell className="whitespace-nowrap">
                      {formatTimeOnly(session.start_time)}
                    </TableCell>
                  )}

                  {visibleColumns.endDate && (
                    <TableCell className="whitespace-nowrap">
                      {formatDateOnly(session.end_time)}
                    </TableCell>
                  )}

                  {visibleColumns.endTime && (
                    <TableCell className="whitespace-nowrap">
                      {formatTimeOnly(session.end_time)}
                    </TableCell>
                  )}

                  {visibleColumns.startLocation && (
                    <TableCell className="whitespace-normal break-words max-w-[200px]">
                      {session.start_address}
                    </TableCell>
                  )}

                  {visibleColumns.endLocation && (
                    <TableCell className="whitespace-normal break-words max-w-[200px]">
                      {session.end_address}
                    </TableCell>
                  )}

                  {visibleColumns.distance && (
                    <TableCell className="whitespace-normal break-words max-w-[100px]">
                      {session.distance_km
                        ? `${session.distance_km.toFixed(2)} km`
                        : "N/A"}
                    </TableCell>
                  )}

                  {visibleColumns.captureFrequency && (
                    <TableCell className="font-medium whitespace-normal break-words max-w-[150px]">
                      <div>{session.capture_frequency || "N/A"}</div>
                    </TableCell>
                  )}

                  {visibleColumns.sessionRemarks && (
                    <TableCell className="font-medium whitespace-normal break-words max-w-[200px]">
                      {session.notes || "No Remarks"}
                    </TableCell>
                  )}

                  {visibleColumns.actions && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewOnMap(session.id)}
                        >
                          <Map className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="!bg-white hover:!bg-white focus:!bg-white active:!bg-white border-red-200 text-red-500 hover:text-red-600"
                          onClick={() => handleDelete(session.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ✅ Fixed pagination footer: uses DropdownMenu instead of undefined Dropdown */}
      <div className="flex items-center justify-between p-4 border-t">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                {sessionsPerPage} / page
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {[10, 20, 50, 100].map((n) => (
                <DropdownMenuItem
                  key={n}
                  onClick={() => {
                    setSessionsPerPage(n);
                    setCurrentPage(1);
                  }}
                >
                  {n}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <span>
            Showing {indexOfFirstSession + 1} to{" "}
            {Math.min(indexOfLastSession, filteredSessions.length)} of{" "}
            {filteredSessions.length} entries.
          </span>
          {selectedSessions.length > 0 && (
            <span className="ml-2 text-blue-400">
              ({selectedSessions.length} selected across all pages)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => paginate(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <span className="text-sm">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => paginate(currentPage + 1)}
            disabled={currentPage === totalPages || totalPages === 0}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DriveTestSessionsPage;
