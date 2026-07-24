const UPLINK_RE = /\b(upload|uplink|ul|request|response|complete|report|dial|mo call|mobile originated|invite|register)\b|ue\s*[-=]+>\s*\w+|>/i;
const DOWNLINK_RE = /\b(download|downlink|dl|paging|setup|command|accept|enquiry|release|incoming|ringing|mt call|mobile terminated)\b|\w+\s*[-=]+>\s*ue|</i;

function textForDirection(item = {}) {
  return [
    item.flowDirection,
    item.direction,
    item.from,
    item.to,
    item.officialName,
    item.title,
    item.eventKey,
    item.category,
    item.summary,
    item.rawMessage,
  ].filter(Boolean).join(" ");
}

export function getDirectionInfo(item = {}) {
  const from = String(item.from || "").trim().toUpperCase();
  const to = String(item.to || "").trim().toUpperCase();

  if (from === "UE" && to && to !== "UE" && to !== "TIMELINE") {
    return { key: "upload", label: "↑", shortLabel: "↑", ariaLabel: "UE to network" };
  }

  if (to === "UE" && from && from !== "UE" && from !== "EVENT") {
    return { key: "download", label: "↓", shortLabel: "↓", ariaLabel: "Network to UE" };
  }

  const text = textForDirection(item);
  if (UPLINK_RE.test(text)) return { key: "upload", label: "↑", shortLabel: "↑", ariaLabel: "UE to network" };
  if (DOWNLINK_RE.test(text)) return { key: "download", label: "↓", shortLabel: "↓", ariaLabel: "Network to UE" };

  return { key: "event", label: "↔", shortLabel: "↔", ariaLabel: "Event" };
}
