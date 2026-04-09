// components/project/SessionSelector.jsx
import React, { useState } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { excelApi } from "../../api/apiEndpoints";
import Spinner from "../common/Spinner";

const SessionMultiDropdown = ({ sessions, selectedSessions, setSelectedSessions }) => {
  return (
    <div className="w-full border rounded p-2 bg-white max-h-60 overflow-auto">
      {sessions.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">No sessions available</p>
      ) : (
        sessions.map((s) => (
          <label key={s.value} className="flex items-center gap-2 py-1 hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedSessions.includes(s.value)}
              onChange={() =>
                setSelectedSessions((prev) =>
                  prev.includes(s.value) 
                    ? prev.filter((v) => v !== s.value) 
                    : [...prev, s.value]
                )
              }
            />
            <span>{s.label}</span>
          </label>
        ))
      )}
    </div>
  );
};

export const SessionSelector = ({ selectedSessions, setSelectedSessions }) => {
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [sessionsInRange, setSessionsInRange] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const handleFetchSessions = async () => {
    if (!startDate || !endDate) {
      toast.warn("Please select both start and end dates.");
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      toast.error("Start date cannot be after end date.");
      return;
    }

    setSessionsLoading(true);
    setSelectedSessions([]);
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    try {
      const response = await excelApi.getSessions(start, end);
      const fetched = response.Data || [];
      setSessionsInRange(
        fetched.map((s) => ({
          value: s.id,
          label: s.label || `Session ${s.id}`,
        }))
      );
      if (fetched.length === 0) {
        toast.info("No sessions found in this date range.");
      } else {
        toast.success(`Found ${fetched.length} session(s)`);
      }
    } catch (error) {
      toast.error("Failed to fetch sessions.");
      console.error(error);
    } finally {
      setSessionsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-4 bg-gray-50 space-y-4">
        <Label>Fetch Sessions (Optional)</Label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <DatePicker date={startDate} setDate={setStartDate} />
          <DatePicker date={endDate} setDate={setEndDate} />
          <Button
            type="button"
            onClick={handleFetchSessions}
            disabled={sessionsLoading}
          >
            {sessionsLoading ? <Spinner /> : "Fetch Sessions"}
          </Button>
        </div>
      </div>

      <div>
        <Label>Select Sessions</Label>
        <SessionMultiDropdown
          sessions={sessionsInRange}
          selectedSessions={selectedSessions}
          setSelectedSessions={setSelectedSessions}
        />
      </div>
    </div>
  );
};