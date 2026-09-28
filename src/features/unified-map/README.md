# Unified map boundaries

`src/pages/UnifiedMapView.jsx` remains the route entry while map responsibilities move in small steps.

- `data/` owns resource request identity, cancellation generations, and dataset request keys.
- `processing/` owns grid aggregation and worker-backed transformations. Prediction grid rows are normalized once per dataset and filtered by small viewport messages.
- `map/` owns normalized viewport bounds; the overlay runtime remains in the map component.
- `layers/` is reserved for feature layer builders that register with the shared Deck.gl layer registry.
- `interactions/` is reserved for selection and tooltip behavior.
- `drawing/` owns drawing hit targets and removal behavior; rendering and native map bindings remain at their current integration points.
- `panels/` is reserved for focused map panel components.

The remaining UI and layer code stays in its current locations until each extraction can preserve map ordering, drawing behavior, and current props without a broad rewrite.
