import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mountain, Ruler } from 'lucide-react';

const ElevationProfile = ({ map, onProfileRequest }) => {
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);

  const handleMapClick = (event) => {
    const latLng = event.latLng;
    if (!startPoint) {
      setStartPoint({ lat: latLng.lat(), lng: latLng.lng() });
    } else if (!endPoint) {
      setEndPoint({ lat: latLng.lat(), lng: latLng.lng() });
    }
  };

  const generateProfile = () => {
    if (startPoint && endPoint) {
      onProfileRequest(startPoint, endPoint);
    }
  };

  const resetSelection = () => {
    setStartPoint(null);
    setEndPoint(null);
  };

  return (
    <Card className="w-80 absolute top-20 right-4 z-10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center text-lg">
          <Mountain className="h-5 w-5 mr-2" />
          Elevation Profile
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Start Point</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Latitude" value={startPoint?.lat || ''} readOnly />
            <Input placeholder="Longitude" value={startPoint?.lng || ''} readOnly />
          </div>
        </div>

        <div>
          <Label>End Point</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Latitude" value={endPoint?.lat || ''} readOnly />
            <Input placeholder="Longitude" value={endPoint?.lng || ''} readOnly />
          </div>
        </div>

        <div className="flex space-x-2">
          <Button onClick={generateProfile} disabled={!startPoint || !endPoint}>
            <Ruler className="h-4 w-4 mr-2" />
            Generate Profile
          </Button>
          <Button variant="outline" onClick={resetSelection}>
            Reset
          </Button>
        </div>

        <div className="text-sm text-gray-600">
          <p>Click on the map to select points:</p>
          <p>1. First click: Start point</p>
          <p>2. Second click: End point</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default ElevationProfile;