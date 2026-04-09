import React, { useState } from 'react';
import { StandaloneSearchBox, useGoogleMap } from '@react-google-maps/api';
import { Input } from "@/components/ui/input"; // Assuming this is your input component

const MapSearchBox = () => {
    const map = useGoogleMap();
    const [searchBox, setSearchBox] = useState(null);

    const onPlacesChanged = () => {
        // Check if searchBox is loaded before using it
        if (searchBox) {
            const places = searchBox.getPlaces();
            const place = places[0];

            // Ensure a place was selected and it has geometry
            if (place && place.geometry && place.geometry.location) {
                const newCenter = {
                    lat: place.geometry.location.lat(),
                    lng: place.geometry.location.lng(),
                };
                
                // Move the map to the selected location
                map.panTo(newCenter);
                map.setZoom(15);
            }
        }
    };

    // The onLoad function for the StandaloneSearchBox
    const onLoad = (ref) => {
        setSearchBox(ref);
    };

    return (
        <div style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: 1 }}>
            <StandaloneSearchBox
                onLoad={onLoad}
                onPlacesChanged={onPlacesChanged}
            >
                {/* This is the only child now */}
                <Input
                    type="text"
                    placeholder="Search for a location"
                    className="w-80 bg-white/90 shadow-md" // Added shadow for better visibility
                />
            </StandaloneSearchBox>
        </div>
    );
};

export default MapSearchBox;