// PlaceAutocomplete.jsx
import React, { useEffect, useRef } from "react";

const PlaceAutocomplete = ({ onPlaceSelect }) => {
  const autocompleteRef = useRef(null);

  useEffect(() => {
    if (!window.google || !window.google.maps || !autocompleteRef.current) return;

    const placeAutocomplete = autocompleteRef.current;

    // Listen for place selection
    const listener = placeAutocomplete.addEventListener("gmp-placeselect", (event) => {
      const place = event.detail;
      if (place && place.location) {
        onPlaceSelect(place);
      }
    });

    return () => {
      if (listener) {
        placeAutocomplete.removeEventListener("gmp-placeselect", listener);
      }
    };
  }, [onPlaceSelect]);

  return (
    <gmpx-place-autocomplete
      ref={autocompleteRef}
      style={{ width: "100%" }}
      placeholder="Search for a location"
      countries="IN" // Restrict to India
    />
  );
};

export default PlaceAutocomplete;
