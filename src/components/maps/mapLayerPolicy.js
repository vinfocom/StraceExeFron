export const MAP_LAYER_CATEGORIES = Object.freeze({
  background: 0,
  logs: 1,
  predictions: 2,
  sites: 3,
  events: 4,
  drawings: 5,
});

const layerMetadata = new WeakMap();

export const categorizeMapLayer = (layer, category, order = 0) => {
  if (layer && typeof layer === "object") {
    layerMetadata.set(layer, { category, order });
  }
  return layer;
};

export const getMapLayerMetadata = (layer) => layerMetadata.get(layer) ?? null;

export const registerMapLayerGroup = (groups, ownerId, category, layers, order = 0, onChange = () => {}) => {
  const token = Symbol(ownerId);
  groups.set(ownerId, {
    category,
    order,
    token,
    layers: Array.isArray(layers) ? layers.filter(Boolean) : [],
  });
  onChange();
  return () => {
    if (groups.get(ownerId)?.token !== token) return;
    groups.delete(ownerId);
    onChange();
  };
};

export const sortMapLayerEntries = (entries) => [...entries].sort((left, right) => {
  const leftPriority = Object.hasOwn(MAP_LAYER_CATEGORIES, left.category)
    ? MAP_LAYER_CATEGORIES[left.category]
    : Number.MAX_SAFE_INTEGER;
  const rightPriority = Object.hasOwn(MAP_LAYER_CATEGORIES, right.category)
    ? MAP_LAYER_CATEGORIES[right.category]
    : Number.MAX_SAFE_INTEGER;
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  const orderDifference = (left.order ?? 0) - (right.order ?? 0);
  if (orderDifference) return orderDifference;
  return String(left.layer?.id ?? "").localeCompare(String(right.layer?.id ?? ""));
});

export const assertCategorizedLayerEntries = (entries, { warn = console.warn } = {}) => {
  const ids = new Set();
  let valid = true;
  for (const entry of entries) {
    if (!Object.hasOwn(MAP_LAYER_CATEGORIES, entry.category)) {
      valid = false;
      warn(`[MapLayerPolicy] Layer "${entry.layer?.id ?? "<missing-id>"}" has missing or unknown category "${entry.category ?? "<missing>"}".`);
    }
    const id = entry.layer?.id;
    if (typeof id !== "string" || !id.trim()) {
      valid = false;
      warn("[MapLayerPolicy] Every map layer must have a stable, non-empty id.");
    } else if (ids.has(id)) {
      valid = false;
      warn(`[MapLayerPolicy] Duplicate layer id "${id}" in a map registry.`);
    } else {
      ids.add(id);
    }
  }
  return valid;
};
