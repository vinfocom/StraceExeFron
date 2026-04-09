import React, { useState, useEffect } from 'react';
import { GoogleMap, useLoadScript, Marker, InfoWindow, DrawingManager } from '@react-google-maps/api';
import Spinner from '../common/Spinner';

const libraries = ["places", "drawing"];
const mapContainerStyle = {
    height: '100%',
    width: '100%',
};

// Helper function to determine marker color based on value
const getColorForMetric = (value, metric = 'RSRP') => {
     switch (metric) {
    case "RSRP": // Signal Reference Power
      if (value > -85) return "#006400"; // Dark Green (Excellent)
      if (value > -95) return "#90EE90"; // Light Green (Good)
      if (value > -105) return "#FFFF00"; // Yellow (Fair)
      return "#FF0000"; // Red (Poor)

    case "RSRQ": // Signal Quality
      if (value > -10) return "#006400"; // Dark Green
      if (value > -15) return "#90EE90"; // Light Green
      if (value > -20) return "#FFFF00"; // Yellow
      return "#FF0000"; // Red

    case "SNR": // Signal-to-Noise Ratio
      if (value > 20) return "#006400"; // Dark Green
      if (value > 13) return "#90EE90"; // Light Green
      if (value > 5) return "#FFFF00"; // Yellow
      return "#FF0000"; // Red

    default:
      return "#1E90FF"

    }   
 };

// NEW: Helper function to generate a custom marker icon with a specific color
const getMarkerIcon = (color) => {
    return {
        path: window.google.maps.SymbolPath.CIRCLE,
        fillColor: color,
        fillOpacity: 1,
        strokeColor: 'white',
        strokeWeight: 1,
        scale: 8,
    };
};


const MapDisplay = ({ markers, center, loading }) => {
    // IMPORTANT: Replace with your environment variable
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY; 
    
    const { isLoaded, loadError } = useLoadScript({
        googleMapsApiKey: apiKey,
        libraries
    });

    const [selectedMarker, setSelectedMarker] = useState(null);

    if (!apiKey) {
        return <div className="p-4 flex items-center justify-center h-full bg-red-100 text-red-800">Error: Google Maps API key is not configured.</div>;
    }

    if (loadError) return <div className="p-4 flex items-center justify-center h-full bg-red-100 text-red-800">Error loading maps. Please check your API key and network connection.</div>;
    if (!isLoaded) return <Spinner />;

    return (
        <div className="relative h-full w-full">
             {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-70 z-10">
                    <div className="text-center">
                        <div className="w-12 h-12 border-4 border-blue-500 border-solid rounded-full animate-spin mx-auto" style={{ borderTopColor: 'transparent' }}></div>
                        <p className="mt-2 text-gray-600">Loading Map Data...</p>
                    </div>
                </div>
            )}
            <GoogleMap
                mapContainerStyle={mapContainerStyle}
                zoom={12}
                center={center}
            >
                {markers.map((marker) => (
                     <Marker
                        key={marker.id}
                        position={marker.position}
                        onClick={() => setSelectedMarker(marker)}
                        icon={getMarkerIcon(getColorForMetric(marker.value))}
                    />
                ))}

                {selectedMarker && (
                    <InfoWindow
                        position={selectedMarker.position}
                        onCloseClick={() => setSelectedMarker(null)}
                    >
                        <div>
                            <div dangerouslySetInnerHTML={{ __html: selectedMarker.popupContent }} />
                        </div>
                    </InfoWindow>
                )}
                {/* Feature: Drawing Manager */}
                <DrawingManager
                    options={{
                        drawingControl: true,
                        drawingControlOptions: {
                            position: window.google.maps.ControlPosition.TOP_CENTER,
                            drawingModes: [
                                window.google.maps.drawing.OverlayType.POLYGON,
                            ],
                        },
                    }}
                />
            </GoogleMap>
        </div>
    );
};

export default MapDisplay;