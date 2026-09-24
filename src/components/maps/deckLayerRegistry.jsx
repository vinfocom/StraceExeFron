import React, { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { MAP_LAYER_CATEGORIES, registerMapLayerGroup } from "./mapLayerPolicy.js";

const DeckLayerRegistryContext = createContext(null);
const DeckLayerRegistryVersionContext = createContext(0);
const EMPTY_LAYERS = [];

const sameLayerList = (left, right) =>
  left.length === right.length && left.every((layer, index) => layer === right[index]);

export const DeckLayerRegistryProvider = ({ children }) => {
  const groupsRef = useRef(new Map());
  const [version, setVersion] = useState(0);

  const registerGroup = useCallback((ownerId, category, layers, order = 0) => {
    return registerMapLayerGroup(
      groupsRef.current,
      ownerId,
      category,
      layers,
      order,
      () => setVersion((value) => value + 1),
    );
  }, []);

  const value = useMemo(() => ({ groupsRef, registerGroup }), [registerGroup]);
  return (
    <DeckLayerRegistryContext.Provider value={value}>
      <DeckLayerRegistryVersionContext.Provider value={version}>
        {children}
      </DeckLayerRegistryVersionContext.Provider>
    </DeckLayerRegistryContext.Provider>
  );
};

export const useDeckLayerRegistry = () => {
  const context = useContext(DeckLayerRegistryContext);
  const version = useContext(DeckLayerRegistryVersionContext);
  return context
    ? { groups: context.groupsRef.current, version }
    : { groups: new Map(), version: 0 };
};

export const useDeckLayerGroup = (category, layers, order = 0) => {
  const context = useContext(DeckLayerRegistryContext);
  const registerGroup = context?.registerGroup;
  const ownerId = useId();
  const stableLayersRef = useRef({ input: null, value: EMPTY_LAYERS });
  const stableLayers = useMemo(() => {
    const nextLayers = Array.isArray(layers) ? layers.filter(Boolean) : EMPTY_LAYERS;
    const previous = stableLayersRef.current;
    if (sameLayerList(previous.value, nextLayers)) return previous.value;

    stableLayersRef.current = { input: layers, value: nextLayers };
    return nextLayers;
  }, [layers]);

  useEffect(() => {
    if (!registerGroup) return undefined;
    if (!Object.hasOwn(MAP_LAYER_CATEGORIES, category)) {
      if (import.meta.env?.DEV) console.warn(`[DeckLayerRegistry] Unknown layer category "${category}".`);
      return undefined;
    }
    return registerGroup(ownerId, category, stableLayers, order);
  }, [registerGroup, ownerId, category, stableLayers, order]);
};
