export function installElectronFocusRecovery(targetWindow) {
  const recover = targetWindow.electronWindow?.recoverFocus;
  if (typeof recover !== "function") return () => {};

  const restoreFocus = () => {
    try {
      recover();
    } catch {
      // Closing a window must not change a dialog's result or throw in the UI.
    }
  };

  const originals = new Map();
  for (const name of ["alert", "confirm", "prompt"]) {
    const original = targetWindow[name];
    if (typeof original !== "function") continue;
    const wrapped = (...args) => {
      try {
        return original.apply(targetWindow, args);
      } finally {
        restoreFocus();
      }
    };
    originals.set(name, { original, wrapped });
    targetWindow[name] = wrapped;
  }

  const onPointerDown = (event) => {
    if (event.isTrusted && !targetWindow.document.hasFocus() &&
        event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) {
      restoreFocus();
    }
  };
  targetWindow.document.addEventListener("pointerdown", onPointerDown, true);

  return () => {
    targetWindow.document.removeEventListener("pointerdown", onPointerDown, true);
    for (const [name, { original, wrapped }] of originals) {
      if (targetWindow[name] === wrapped) targetWindow[name] = original;
    }
  };
}
