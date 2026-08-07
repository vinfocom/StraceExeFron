const PAYLOAD_RE = /payload\[(\d+)\]=([0-9a-fA-F]+)/;
const CHANNEL_RE = /\b(BCCH-DL-SCH|BCCH-BCH|DL-DCCH|UL-DCCH|DL-CCCH|UL-CCCH|PCCH|MCCH|SC-MCCH|BCCH)\b/i;

function readUIntLE(bytes, offset, size) {
  if (offset + size > bytes.length) return null;
  let value = 0;
  for (let index = 0; index < size; index += 1) {
    value += bytes[offset + index] << (index * 8);
  }
  return value;
}

function hexByte(value) {
  return `0x${String(value ?? 0).toString(16).padStart(2, "0").toUpperCase()}`;
}

function toHexToken(value, width = 8) {
  return `0x${String(value ?? 0).toString(16).padStart(width, "0").toUpperCase()}`;
}

export function nrArfcnToMHz(nrArfcn) {
  if (!Number.isFinite(nrArfcn) || nrArfcn < 0) return null;
  if (nrArfcn <= 599999) return nrArfcn * 0.005;
  if (nrArfcn <= 2016666) return 3000 + ((nrArfcn - 600000) * 0.015);
  return 24250.08 + ((nrArfcn - 2016667) * 0.06);
}

export function inferNrBand(nrArfcn) {
  if (!Number.isFinite(nrArfcn)) return "Unknown";
  if (nrArfcn >= 151600 && nrArfcn <= 160600) return "n28";
  if (nrArfcn >= 499200 && nrArfcn <= 537999) return "n41";
  if (nrArfcn >= 620000 && nrArfcn <= 653333) return "n78";
  return "Unknown";
}

function extractChannel(text) {
  const match = String(text || "").match(CHANNEL_RE);
  return match ? match[1].toUpperCase() : null;
}

function parsePayload(text) {
  const match = String(text || "").match(PAYLOAD_RE);
  if (!match) return null;
  const advertisedBytes = Number(match[1]);
  const hex = match[2];
  const visibleBytes = Math.floor(hex.length / 2);
  const bytes = Array.from({ length: visibleBytes }, (_, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16));
  if (!Number.isFinite(advertisedBytes) || !bytes.length || bytes.some((byte) => !Number.isFinite(byte))) return null;
  return { advertisedBytes, hex, visibleBytes, bytes };
}

export function getNrRrcPayloadInsights(row = {}) {
  const text = [
    row.rawMessage,
    row.message,
    row.interface,
    row.protocol,
    row.procedure,
    row.sourceCategory,
  ].filter(Boolean).join(" ");

  if (!/\bNR[-_ ]?RRC\b|NR_RRC|Full NR-RRC OTA message|NR RRC configuration/i.test(text)) {
    return [];
  }

  const payload = parsePayload(text);
  const channel = extractChannel(text);
  if (!payload) {
    return channel ? [{ label: "Channel", value: channel }] : [];
  }

  const { advertisedBytes, bytes, hex, visibleBytes } = payload;
  const truncated = advertisedBytes > visibleBytes || /…|\.\.\./.test(text);
  const missingBytes = Math.max(0, advertisedBytes - visibleBytes);
  const pci = readUIntLE(bytes, 7, 2);
  const cellToken = readUIntLE(bytes, 9, 4);
  const nrArfcn = readUIntLE(bytes, 17, 4);
  const wrapperDirectionFlag = bytes.length > 6 ? bytes[6] : null;
  const wrapperMessageClass = bytes.length > 21 ? bytes[21] : null;
  const wrapperRemainingBytes = readUIntLE(bytes, 29, 3);
  const frequencyMHz = nrArfcnToMHz(nrArfcn);
  const band = inferNrBand(nrArfcn);

  const insights = [
    { label: "Payload Length", value: `${advertisedBytes} bytes advertised, ${visibleBytes} bytes visible` },
  ];

  if (truncated) {
    insights.push({ label: "Payload Status", value: `Truncated in CSV (${missingBytes} bytes not shown)` });
  } else {
    insights.push({ label: "Payload Status", value: "Visible payload is complete" });
  }

  insights.push({ label: "Channel", value: channel || "Not exposed in this CSV row" });

  if (pci !== null) insights.push({ label: "NR PCI", value: String(pci) });
  if (nrArfcn !== null) insights.push({ label: "NR ARFCN", value: String(nrArfcn) });
  if (frequencyMHz !== null) insights.push({ label: "NR Frequency", value: `${frequencyMHz.toFixed(3)} MHz` });
  if (band !== "Unknown") insights.push({ label: "NR Band", value: band });
  if (cellToken !== null) insights.push({ label: "Wrapper Cell Token", value: `${toHexToken(cellToken)} (${cellToken})` });
  if (wrapperDirectionFlag !== null) insights.push({ label: "Wrapper Direction Flag", value: `${hexByte(wrapperDirectionFlag)} (logger-specific)` });
  if (wrapperMessageClass !== null) insights.push({ label: "Wrapper Message Class", value: `${hexByte(wrapperMessageClass)} (logger-specific)` });
  if (wrapperRemainingBytes !== null) insights.push({ label: "Wrapper Remaining Bytes", value: String(wrapperRemainingBytes) });

  insights.push({
    label: "Exact ASN.1 Decode",
    value: truncated
      ? "Unavailable because the NR-RRC PDU is truncated"
      : "Requires TS 38.331 UPER decoder",
  });
  insights.push({ label: "Visible Bytes", value: hex.match(/.{1,2}/g)?.join(" ") || hex });

  return insights;
}
