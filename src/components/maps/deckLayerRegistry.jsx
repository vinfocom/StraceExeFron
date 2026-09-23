import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const DeckLayerRegistryContext = createContext(null);

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

  const value = useMemo(() => ({ groupsRef, registerGroup, version }), [registerGroup, version]);
  return <DeckLayerRegistryContext.Provider value={value}>{children}</DeckLayerRegistryContext.Provider>;
};

export const useDeckLayerRegistry = () => {
  const context = useContext(DeckLayerRegistryContext);
  return context
    ? { groups: context.groupsRef.current, version: context.version }
    : { groups: new Map(), version: 0 };
};

export const useDeckLayerGroup = (name, layers) => {
  const context = useContext(DeckLayerRegistryContext);
  useEffect(() => {
    if (!context) return undefined;
    return context.registerGroup(name, layers);
  }, [context, name, layers]);
};
