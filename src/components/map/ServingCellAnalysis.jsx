import React, { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Info } from 'lucide-react';

const ServingCellAnalysis = ({ selectedPoint, cellData, map }) => {
  const linesRef = useRef([]);

  useEffect(() => {
    // Cleanup previous lines
    linesRef.current.forEach(line => line.setMap(null));
    linesRef.current = [];

    if (selectedPoint && cellData && cellData.length > 0 && map) {
      // Draw lines to serving and neighbor cells
      const lines = cellData.map(cell => {
        const line = new window.google.maps.Polyline({
          path: [
            { lat: selectedPoint.lat, lng: selectedPoint.lon },
            { lat: cell.lat, lng: cell.lon }
          ],
          geodesic: true,
          strokeColor: cell.isServing ? '#FF0000' : '#4285F4',
          strokeOpacity: cell.isServing ? 1.0 : 0.6,
          strokeWeight: cell.isServing ? 3 : 2,
          map: map
        });
        return line;
      });

      linesRef.current = lines;
    }

    return () => {
      linesRef.current.forEach(line => line.setMap(null));
    };
  }, [selectedPoint, cellData, map]);

  if (!selectedPoint || !cellData || cellData.length === 0) {
    return null;
  }

  return (
    <Card className="w-96 absolute bottom-4 right-4 z-10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center text-lg">
          <Info className="h-5 w-5 mr-2" />
          Serving Cell Analysis
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cell ID</TableHead>
              <TableHead>Technology</TableHead>
              <TableHead>RSRP</TableHead>
              <TableHead>Distance</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cellData.map((cell, index) => (
              <TableRow key={index} className={cell.isServing ? 'bg-blue-50' : ''}>
                <TableCell className="font-medium">{cell.cellId}</TableCell>
                <TableCell>{cell.technology}</TableCell>
                <TableCell>{cell.rsrp} dBm</TableCell>
                <TableCell>{cell.distance.toFixed(2)} km</TableCell>
                <TableCell>{cell.isServing ? 'Serving' : 'Neighbor'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default ServingCellAnalysis;