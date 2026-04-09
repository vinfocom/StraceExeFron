// MapContainer.jsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import { GoogleMap, useLoadScript, MarkerF, InfoWindowF } from "@react-google-maps/api";
import SearchField from "./SearchFields"; // Your existing SearchField component

const mapContainerStyle = {
  height: "100vh",
  width: "100%",
};

// Initial center set to Delhi, India
const center = {
  lat: 28.6139,
  lng: 77.2090,
};

// Options to disable default map controls for a cleaner look
const options = {
  disableDefaultUI: true,
  zoomControl: true,
};

export default function CustomMap() {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
  });

  const [currentPosition, setCurrentPosition] = useState(null);
  const [infoWindowVisible, setInfoWindowVisible] = useState(false);
  const mapRef = useRef();

  // Callback to get the map instance once it's loaded
  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  // Function to toggle the InfoWindow
  const toggleInfoWindow = () => {
    setInfoWindowVisible(!infoWindowVisible);
  };

  // Find user's location when the component mounts
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const pos = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setCurrentPosition(pos);
        setInfoWindowVisible(true); // Automatically show the info window

        // Pan the map to the user's location
        if (mapRef.current) {
          mapRef.current.panTo(pos);
          mapRef.current.setZoom(16);
        }
      },
      (err) => {
        console.error("Location error:", err);
        alert("⚠️ Please allow location access in your browser");
      }
    );
  }, []);

  if (loadError) return "Error loading maps";
  if (!isLoaded) return "Loading Maps...";

  return (
    <div>
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        zoom={12}
        center={center}
        options={options}
        onLoad={onMapLoad}
      >
        {/* Your custom SearchField component still works here */}
        <SearchField />

        {/* Marker for the user's current location */}
        {currentPosition && (
          <MarkerF 
            position={currentPosition} 
            onClick={toggleInfoWindow}
          >
            {/* Replicates the "You are here" popup from Leaflet */}
            {infoWindowVisible && (
              <InfoWindowF
                position={currentPosition}
                onCloseClick={() => setInfoWindowVisible(false)}
              >
                <div>
                  <h4>You are here</h4>
                </div>
              </InfoWindowF>
            )}
          </MarkerF>
        )}
      </GoogleMap>
    </div>
  );
}