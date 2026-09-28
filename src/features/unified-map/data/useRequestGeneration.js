import { useEffect, useMemo, useRef } from "react";
import { createRequestGeneration } from "./requestGeneration.js";

export const useRequestGeneration = (identity) => {
  const generationRef = useRef(null);
  if (!generationRef.current) generationRef.current = createRequestGeneration();

  const identityRef = useRef(identity);
  identityRef.current = identity;
  const previousIdentityRef = useRef(identity);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (previousIdentityRef.current === identity) return;
    previousIdentityRef.current = identity;
    generationRef.current?.invalidate();
  }, [identity]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current?.invalidate();
    };
  }, []);

  return useMemo(() => ({
    begin({ force = false } = {}) {
      if (!mountedRef.current || identityRef.current !== identity) {
        return { request: null, started: false, stale: true };
      }
      const active = generationRef.current.getCurrent();
      if (!force && active?.identity === identity && !active.controller.signal.aborted) {
        return { request: active, started: false, stale: false };
      }
      return { request: generationRef.current.begin(identity), started: true, stale: false };
    },
    finish: (request) => generationRef.current.finish(request),
    invalidate: () => generationRef.current.invalidate(),
    isCurrent: (request) => mountedRef.current && identityRef.current === request?.identity && generationRef.current.isCurrent(request),
    getCurrent: () => generationRef.current.getCurrent(),
  }), [identity]);
};
