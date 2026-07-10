export const ZOOM_STEP = 0.5;
const MIN_ZOOM_STEP_LEVEL = 2;
const MAX_ZOOM_STEP_LEVEL = 21;

const makeStepButton = (label, title) => {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.style.width = "40px";
  button.style.height = "40px";
  button.style.border = "0";
  button.style.background = "#ffffff";
  button.style.color = "#1f2937";
  button.style.fontSize = "20px";
  button.style.fontWeight = "600";
  button.style.cursor = "pointer";
  button.style.display = "flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "center";
  button.style.transition = "background 0.15s ease";
  button.addEventListener("mouseenter", () => {
    if (!button.disabled) button.style.background = "#f1f5f9";
  });
  button.addEventListener("mouseleave", () => {
    button.style.background = "#ffffff";
  });
  return button;
};

// Google's built-in zoom control only steps by whole zoom levels. This adds a
// replacement +/- control that steps the map zoom by ZOOM_STEP (0.5) instead.
export const createZoomStepControl = (map, { position } = {}) => {
  if (!map || typeof document === "undefined" || !window.google?.maps) {
    return null;
  }

  const container = document.createElement("div");
  container.style.margin = "10px";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.borderRadius = "6px";
  container.style.overflow = "hidden";
  container.style.border = "1px solid #cbd5e1";
  container.style.boxShadow = "0 1px 4px rgba(0, 0, 0, 0.3)";
  container.style.userSelect = "none";
  container.style.fontFamily = "Arial, sans-serif";

  const zoomInButton = makeStepButton("+", "Zoom in (0.5)");
  const zoomOutButton = makeStepButton("−", "Zoom out (0.5)");
  zoomInButton.style.borderBottom = "1px solid #e2e8f0";

  const stepZoom = (delta) => {
    const currentZoom = Number(map.getZoom?.());
    if (!Number.isFinite(currentZoom)) return;
    const snapped = Math.round(currentZoom / ZOOM_STEP) * ZOOM_STEP;
    const nextZoom = Math.max(
      MIN_ZOOM_STEP_LEVEL,
      Math.min(MAX_ZOOM_STEP_LEVEL, snapped + delta),
    );
    map.setZoom(nextZoom);
  };

  const zoomInHandler = () => stepZoom(ZOOM_STEP);
  const zoomOutHandler = () => stepZoom(-ZOOM_STEP);
  zoomInButton.addEventListener("click", zoomInHandler);
  zoomOutButton.addEventListener("click", zoomOutHandler);

  container.appendChild(zoomInButton);
  container.appendChild(zoomOutButton);

  const controlPosition =
    position || window.google.maps.ControlPosition.RIGHT_BOTTOM;
  const controlsArray = map.controls[controlPosition];
  controlsArray.push(container);

  return {
    container,
    controlPosition,
    setDisabled: (disabled) => {
      zoomInButton.disabled = disabled;
      zoomOutButton.disabled = disabled;
      zoomInButton.style.opacity = disabled ? "0.5" : "1";
      zoomOutButton.style.opacity = disabled ? "0.5" : "1";
      zoomInButton.style.cursor = disabled ? "not-allowed" : "pointer";
      zoomOutButton.style.cursor = disabled ? "not-allowed" : "pointer";
    },
    dispose: () => {
      zoomInButton.removeEventListener("click", zoomInHandler);
      zoomOutButton.removeEventListener("click", zoomOutHandler);
      const controls = map.controls[controlPosition];
      if (controls?.getLength) {
        for (let i = controls.getLength() - 1; i >= 0; i -= 1) {
          if (controls.getAt(i) === container) {
            controls.removeAt(i);
            break;
          }
        }
      }
    },
  };
};
