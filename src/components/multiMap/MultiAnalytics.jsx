import React, { useMemo, useState, useEffect } from "react";
import {
  Activity,
  Signal,
  Radio,
  Wifi,
  Clock,
  Database,
  Layers,
  Server,
  Route,
  Grid
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { mapViewApi } from "@/api/apiEndpoints";
import Spinner from "@/components/common/Spinner";

const StatCard = ({ title, value, icon: Icon, color, subValue, loading }) => (
  <Card className="border-l-4 shadow-sm hover:shadow-md transition-shadow bg-white" style={{ borderLeftColor: color }}>
    <CardContent className="p-4 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <div className="flex items-baseline gap-2">
          {loading ? (
             <div className="h-8 w-16 bg-gray-200 animate-pulse rounded mt-1"></div>
          ) : (
             <>
              <h3 className="text-2xl font-bold text-gray-800">{value}</h3>
              {subValue && <span className="text-xs text-gray-400">{subValue}</span>}
             </>
          )}
        </div>
      </div>
      <div className="p-2 rounded-full bg-opacity-10" style={{ backgroundColor: `${color}20` }}>
        <Icon size={24} style={{ color: color }} />
      </div>
    </CardContent>
  </Card>
);

const MultiAnalytics = ({ locations = [], sessionIds = [], projectId }) => {
  const [duration, setDuration] = useState("0h 0m");
  const [distance, setDistance] = useState(0);
  const [siteCount, setSiteCount] = useState(0);
  const [loadingAsync, setLoadingAsync] = useState(false);

  // --- Derived Statistics (Synchronous from locations prop) ---
  const stats = useMemo(() => {
    if (!locations.length) return { pci: 0, tech: 0, band: 0, operator: 0 };

    const pcis = new Set();
    const techs = new Set();
    const bands = new Set();
    const operators = new Set();

    locations.forEach(l => {
      // Handle different naming conventions from different APIs
      const pci = l.pci || l.PCI || l.physical_cell_id;
      const tech = l.technology || l.networkType || l.Network;
      const band = l.band || l.primaryBand || l.Band;
      const op = l.provider || l.operator || l.Operator;

      if (pci) pcis.add(pci);
      if (tech) techs.add(tech);
      if (band) bands.add(band);
      if (op) operators.add(op);
    });

    return {
      pci: pcis.size,
      tech: techs.size,
      band: bands.size,
      operator: operators.size
    };
  }, [locations]);

  // --- Async Data Fetching ---
  useEffect(() => {
    const fetchAsyncStats = async () => {
      setLoadingAsync(true);
      try {
        // 1. Fetch Duration & Distance if sessions exist
        if (sessionIds.length > 0) {
          const idsParams = sessionIds.join(",");
          
          const [durationRes, distRes] = await Promise.allSettled([
            mapViewApi.getDuration({ sessionIds: idsParams }),
            mapViewApi.getDistanceSession({ sessionIds: idsParams })
          ]);

          // Process Duration
          if (durationRes.status === "fulfilled") {
            const data = durationRes.value?.Data || durationRes.value?.data || [];
            let totalHrs = 0;
            if (Array.isArray(data)) {
              totalHrs = data.reduce((acc, curr) => acc + (curr.TotalDurationHours || 0), 0);
            }
            const h = Math.floor(totalHrs);
            const m = Math.round((totalHrs - h) * 60);
            setDuration(`${h}h ${m}m`);
          }

          // Process Distance
          if (distRes.status === "fulfilled") {
            const d = distRes.value?.TotalDistanceKm || 0;
            setDistance(typeof d === 'number' ? d.toFixed(2) : d);
          }
        }

        // 2. Fetch Site Count if project exists
        if (projectId) {
          const siteRes = await mapViewApi.getSiteNoMl({ projectId });
          const count = siteRes?.count || siteRes?.data?.length || 0;
          setSiteCount(count);
        }
      } catch (error) {
        console.error("Failed to fetch analytics stats", error);
      } finally {
        setLoadingAsync(false);
      }
    };

    fetchAsyncStats();
  }, [sessionIds, projectId]);

  return (
    <div className="p-1 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Multi-View Analytics</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Row 1: General Stats */}
          <StatCard 
            title="Total Sessions" 
            value={sessionIds.length} 
            icon={Database} 
            color="#3B82F6" 
          />
          
          <StatCard 
            title="Total Distance" 
            value={distance} 
            subValue="km"
            icon={Route} 
            color="#F59E0B" 
            loading={loadingAsync}
          />

          {/* Row 2: Network Stats */}
          <StatCard 
            title="Logs Displayed" 
            value={locations.length.toLocaleString()} 
            icon={Activity} 
            color="#6366F1" 
          />
          <StatCard 
            title="Unique PCIs" 
            value={stats.pci} 
            icon={Grid} 
            color="#EC4899" 
          />
          <StatCard 
            title="Technologies" 
            value={stats.tech} 
            icon={Signal} 
            color="#EF4444" 
          />
          <StatCard 
            title="Bands" 
            value={stats.band} 
            icon={Layers} 
            color="#14B8A6" 
          />
           <StatCard 
            title="Operators" 
            value={stats.operator} 
            icon={Radio} 
            color="#F97316" 
          />
        </div>
      </div>
    </div>
  );
};

export default MultiAnalytics;