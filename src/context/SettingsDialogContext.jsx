import React, {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const SettingsPage = lazy(() => import("@/pages/Setting"));

const SettingsDialogContext = createContext({
  openSettings: () => {},
  closeSettings: () => {},
});

export function SettingsDialogProvider({ children }) {
  const [dialogState, setDialogState] = useState({
    open: false,
    onSaveSuccess: null,
  });

  const openSettings = useCallback((options = {}) => {
    setDialogState({
      open: true,
      onSaveSuccess:
        typeof options?.onSaveSuccess === "function"
          ? options.onSaveSuccess
          : null,
    });
  }, []);

  const closeSettings = useCallback(() => {
    setDialogState((current) => ({ ...current, open: false }));
  }, []);

  const handleOpenChange = useCallback((open) => {
    setDialogState((current) => ({
      ...current,
      open,
      onSaveSuccess: open ? current.onSaveSuccess : null,
    }));
  }, []);

  const handleSaveSuccess = useCallback(() => {
    dialogState.onSaveSuccess?.();
  }, [dialogState.onSaveSuccess]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleUtilityAction = (event) => {
      if (event?.detail?.action === "settings") {
        openSettings();
      }
    };

    window.addEventListener("stracer:utility-action", handleUtilityAction);
    return () =>
      window.removeEventListener("stracer:utility-action", handleUtilityAction);
  }, [openSettings]);

  const value = useMemo(
    () => ({
      openSettings,
      closeSettings,
    }),
    [openSettings, closeSettings],
  );

  return (
    <SettingsDialogContext.Provider value={value}>
      {children}

      <Dialog
        open={dialogState.open}
        onOpenChange={handleOpenChange}
      >
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden p-0">
          <Suspense
            fallback={
              <div className="flex min-h-[320px] items-center justify-center">
                Loading settings...
              </div>
            }
          >
            <SettingsPage onSaveSuccess={handleSaveSuccess} />
          </Suspense>
        </DialogContent>
      </Dialog>
    </SettingsDialogContext.Provider>
  );
}

export function useSettingsDialog() {
  return useContext(SettingsDialogContext);
}
