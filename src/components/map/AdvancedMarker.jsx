import { useEffect, useMemo, useRef } from "react";
import { useGoogleMap } from "@react-google-maps/api";
import { createAdvancedMarker, createAdvancedMarkerContent, getAdvancedMarkerLatLngEvent } from "@/lib/advancedMarkers";

export default function AdvancedMarker({
  position,
  title,
  zIndex,
  draggable = false,
  clickable = true,
  icon,
  label,
  onClick,
  onMouseOver,
  onMouseOut,
  onDrag,
  onDragEnd,
  onLoad,
  onUnmount,
}) {
  const map = useGoogleMap();
  const markerRef = useRef(null);
  const propsRef = useRef(null);
  propsRef.current = {
    position,
    title,
    zIndex,
    draggable,
    clickable,
    icon,
    label,
    onClick,
    onMouseOver,
    onMouseOut,
    onDrag,
    onDragEnd,
    onLoad,
    onUnmount,
  };

  const iconKey = useMemo(() => JSON.stringify(icon ?? null), [icon]);
  const labelKey = useMemo(() => JSON.stringify(label ?? null), [label]);

  useEffect(() => {
    const initialProps = propsRef.current;
    if (!map || !initialProps?.position) return undefined;
    const marker = createAdvancedMarker({ map, ...initialProps });
    if (!marker) return undefined;
    markerRef.current = marker;

    const handleClick = (event) => propsRef.current?.onClick?.(event);
    const handleMouseOver = (event) => propsRef.current?.onMouseOver?.(event);
    const handleMouseOut = (event) => propsRef.current?.onMouseOut?.(event);
    const handleDrag = () => propsRef.current?.onDrag?.(getAdvancedMarkerLatLngEvent(marker));
    const handleDragEnd = () => propsRef.current?.onDragEnd?.(getAdvancedMarkerLatLngEvent(marker));
    marker.addEventListener("gmp-click", handleClick);
    marker.addEventListener("mouseover", handleMouseOver);
    marker.addEventListener("mouseout", handleMouseOut);
    marker.addEventListener("gmp-drag", handleDrag);
    marker.addEventListener("gmp-dragend", handleDragEnd);
    propsRef.current?.onLoad?.(marker);

    return () => {
      marker.removeEventListener("gmp-click", handleClick);
      marker.removeEventListener("mouseover", handleMouseOver);
      marker.removeEventListener("mouseout", handleMouseOut);
      marker.removeEventListener("gmp-drag", handleDrag);
      marker.removeEventListener("gmp-dragend", handleDragEnd);
      marker.map = null;
      propsRef.current?.onUnmount?.(marker);
      markerRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const marker = markerRef.current;
    const currentProps = propsRef.current;
    if (!marker || !currentProps?.position) return;
    marker.position = currentProps.position;
    marker.title = currentProps.title || "";
    marker.zIndex = Number.isFinite(currentProps.zIndex) ? currentProps.zIndex : undefined;
    marker.gmpDraggable = Boolean(currentProps.draggable);
    marker.gmpClickable = Boolean(currentProps.clickable);
    marker.replaceChildren(createAdvancedMarkerContent({
      icon: currentProps.icon,
      label: currentProps.label,
      clickable: currentProps.clickable,
    }));
  }, [position?.lat, position?.lng, title, zIndex, draggable, clickable, iconKey, labelKey]);

  return null;
}
