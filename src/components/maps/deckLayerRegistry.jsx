import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const DeckLayerRegistryContext = createContext(null);
const DeckLayerRegistryVersionContext = createContext(0);
const EMPTY_LAYERS = [];

const sameLayerList = (left, right) =>
  left.length === right.length && left.every((layer, index) => layer === right[index]);

export const DeckLayerRegistryProvider = ({ children }) => {
  const groupsRef = useRef(new Map());
  const [version, setVersion] = useState(0);

  const registerGroup = useCallback((name, layers) => {
    groupsRef.current.set(name, Array.isArray(layers) ? layers.filter(Boolean) : []);
    setVersion((value) => value + 1);
    return () => {
      if (!groupsRef.current.has(name)) return;
      groupsRef.current.delete(name);
      setVersion((value) => value + 1);
    };
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

export const useDeckLayerGroup = (name, layers) => {
  const context = useContext(DeckLayerRegistryContext);
  const registerGroup = context?.registerGroup;
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
    return registerGroup(name, stableLayers);
  }, [registerGroup, name, stableLayers]);
};
