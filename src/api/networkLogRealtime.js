import { CSHARP_BASE_URL } from "./apiService";

const buildWebSocketUrl = (sessionIds = []) => {
  const ids = (Array.isArray(sessionIds) ? sessionIds : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .join(",");

  const base = CSHARP_BASE_URL || window.location.origin;
  const url = new URL("/ws/network-log", base || window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  if (ids) url.searchParams.set("session_ids", ids);
  return url.toString();
};

export const connectNetworkLogRealtime = ({
  sessionIds = [],
  onChanged,
  onStatus,
  reconnect = true,
} = {}) => {
  if (typeof window === "undefined" || !("WebSocket" in window)) {
    onStatus?.("unsupported");
    return () => {};
  }

  let socket = null;
  let closedByClient = false;
  let reconnectTimer = null;
  let reconnectAttempt = 0;

  const normalizedIds = (Array.isArray(sessionIds) ? sessionIds : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  const open = () => {
    if (closedByClient || normalizedIds.length === 0) return;

    socket = new WebSocket(buildWebSocketUrl(normalizedIds));
    onStatus?.("connecting");

    socket.onopen = () => {
      reconnectAttempt = 0;
      onStatus?.("connected");
      socket.send(JSON.stringify({ sessionIds: normalizedIds }));
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message?.type === "networkLogChanged") {
          onChanged?.(message);
        }
      } catch {
        // Ignore malformed realtime messages.
      }
    };

    socket.onerror = () => {
      onStatus?.("error");
    };

    socket.onclose = () => {
      onStatus?.("closed");
      if (!reconnect || closedByClient) return;

      const delay = Math.min(30000, 1000 * 2 ** reconnectAttempt);
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(open, delay);
    };
  };

  open();

  return () => {
    closedByClient = true;
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    if (socket && socket.readyState <= WebSocket.OPEN) {
      socket.close(1000, "Component unmounted");
    }
  };
};
