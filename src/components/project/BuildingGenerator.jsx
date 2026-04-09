// components/project/BuildingGenerator.jsx
import React from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { buildingApi } from "../../api/apiEndpoints";

export const BuildingGenerator = ({ 
  selectedPolygonData, 
  generatedBuildings, 
  setGeneratedBuildings,
  buildingLoading,
  setBuildingLoading 
}) => {
  const downloadGeoJSON = (geojson, filename) => {
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Downloaded: ${filename}`);
  };

  if (!selectedPolygonData) return null;

  // Only show status if buildings are generated
  if (!generatedBuildings) return null;

  return (
    <div className="space-y-2">
      <div className="p-3 bg-green-50 border border-green-200 rounded">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-green-800">
              ✓ Buildings Generated
            </p>
            <p className="text-xs text-green-600">
              {generatedBuildings.features?.length || 0} buildings found
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => downloadGeoJSON(
              generatedBuildings,
              `buildings_${selectedPolygonData?.label}.geojson`
            )}
          >
            <Download className="h-4 w-4 mr-1" />
            Download
          </Button>
        </div>
      </div>
    </div>
  );
};

// Export the generation function separately so ProjectForm can use it
export const generateBuildingsForPolygon = async (polygonData) => {
  if (!polygonData || !polygonData.wkt) {
    throw new Error("Invalid polygon data");
  }

  const payload = { WKT: polygonData.wkt };
  const response = await buildingApi.generateBuildings(payload);

  if (response.Status === 1 && response.Stats?.total_buildings > 0) {
    return {
      success: true,
      data: response.Data,
      message: response.Message,
      count: response.Stats.total_buildings
    };
  } else if (response.Status === 0 && response.Stats?.total_buildings === 0) {
    return {
      success: false,
      data: null,
      message: response.Message || "No buildings found in this area",
      count: 0
    };
  } else {
    return {
      success: false,
      data: null,
      message: response.Message || "Unexpected response from server",
      count: 0
    };
  }
};