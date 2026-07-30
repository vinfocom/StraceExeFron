const PAGE = {
  width: 612,
  height: 792,
  marginX: 48,
  marginTop: 48,
  marginBottom: 48,
};

const FONT_REGULAR = "F1";
const FONT_BOLD = "F2";
const FONT_MONO = "F3";

function escapePdfText(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function blobDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatTimestamp(date) {
  if (!(date instanceof Date)) return "N/A";
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} `
    + `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)} UTC`;
}

function formatClock(date) {
  if (!(date instanceof Date)) return "--:--:--";
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function formatDuration(ms = 0) {
  if (!ms || ms < 0) return "0s";
  if (ms < 1000) return `${ms} ms`;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m ${seconds}s`;
  }
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function wrapText(text, maxChars) {
  const normalized = String(text ?? "").trim();
  if (!normalized) return [""];
  if (normalized.length <= maxChars) return [normalized];

  const words = normalized.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }

    if (`${current} ${word}`.length <= maxChars) {
      current = `${current} ${word}`;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines;
}

function truncate(value, length) {
  const text = String(value ?? "");
  if (text.length <= length) return text;
  if (length <= 1) return text.slice(0, length);
  return `${text.slice(0, length - 1)}~`;
}

function createProcedureParameterRows(procedure) {
  return [
    ["Procedure ID", procedure.id],
    ["Procedure Name", procedure.name],
    ["Call ID", procedure.callId || "N/A"],
    ["Result", procedure.result],
    ["Protocol", procedure.protocol],
    ["Technology", procedure.technology],
    ["Start Time", formatTimestamp(procedure.startTime)],
    ["End Time", formatTimestamp(procedure.endTime)],
    ["Duration", formatDuration(procedure.durationMs)],
    ["Flow Model", procedure.flowModel?.name || "Generic Row Analysis"],
    ["Access Type", procedure.flowModel?.access || procedure.technology || "N/A"],
    ["Serving Cell", procedure.servingCell || "N/A"],
    ["Target Cell", procedure.targetCell || "N/A"],
    ["PCI", procedure.pci || "N/A"],
    ["EARFCN", procedure.earfcn || "N/A"],
    ["Band", procedure.band || "N/A"],
    ["TAC", procedure.tac || "N/A"],
    ["PLMN", procedure.plmn || "N/A"],
    ["Bandwidth", procedure.bandwidth || "N/A"],
    ["Message Count", procedure.items?.length ?? 0],
  ];
}

function createEvidenceRows(procedure, maxLabels = 14, maxValuesPerLabel = 4) {
  const evidenceMap = new Map();

  for (const item of procedure.items || []) {
    for (const detail of item.details || []) {
      const label = String(detail?.label || "").trim();
      const value = String(detail?.value || "").trim();
      if (!label || !value) continue;
      if (!evidenceMap.has(label)) evidenceMap.set(label, new Map());
      const valueCounts = evidenceMap.get(label);
      valueCounts.set(value, (valueCounts.get(value) || 0) + 1);
    }
  }

  const rows = Array.from(evidenceMap.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .slice(0, maxLabels)
    .map(([label, valueCounts]) => {
      const collected = Array.from(valueCounts.entries())
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
      const shown = collected.slice(0, maxValuesPerLabel);
      const suffix = collected.length > shown.length
        ? ` (+${collected.length - shown.length} more values)`
        : "";
      const valueSummary = shown
        .map(([value, count]) => (count > 1 ? `${value} (count: ${count})` : value))
        .join(" | ");
      return [label, `${valueSummary}${suffix}`];
    });

  if (!rows.length) {
    rows.push(["Decoded Evidence", "No decoded parameter/value pairs were extracted from this procedure."]);
  }

  return rows;
}

function createProcedureOverviewRows(procedures = []) {
  return procedures.map((procedure) => [
    procedure.id,
    procedure.name,
    procedure.result,
    procedure.technology || "N/A",
    formatDuration(procedure.durationMs),
    String(procedure.items?.length ?? 0),
  ]);
}

function createRepeatedRowSummaryRows(procedures = [], maxRows = 30) {
  const rowCounts = new Map();

  for (const procedure of procedures) {
    for (const item of procedure.items || []) {
      const key = JSON.stringify([
        item.type || "",
        item.title || "",
        item.category || "",
        item.domain || "",
        item.rawMessage || "",
      ]);
      const current = rowCounts.get(key) || {
        type: item.type || "N/A",
        title: item.title || item.eventKey || "Untitled",
        category: item.category || "N/A",
        count: 0,
      };
      current.count += 1;
      rowCounts.set(key, current);
    }
  }

  return Array.from(rowCounts.values())
    .filter((row) => row.count > 1)
    .sort((left, right) => right.count - left.count || left.title.localeCompare(right.title))
    .slice(0, maxRows)
    .map((row) => [row.type, row.title, row.category, String(row.count)]);
}

function timeMs(date) {
  return date instanceof Date ? date.getTime() : null;
}

function uniqueNonEmpty(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function findDetailValue(item, labels = []) {
  for (const detail of item?.details || []) {
    if (labels.includes(detail.label) && detail.value) return detail.value;
  }
  return "";
}

function extractDashboardMetrics(timeline = [], procedures = [], summary = null) {
  const timestamps = timeline.map((item) => timeMs(item.timestamp)).filter((value) => value !== null);
  const durationMs = timestamps.length ? Math.max(0, Math.max(...timestamps) - Math.min(...timestamps)) : 0;
  const technologies = uniqueNonEmpty(procedures.map((procedure) => procedure.technology));
  const protocols = uniqueNonEmpty(procedures.map((procedure) => procedure.protocol));
  const registrationCount = procedures.filter((procedure) => /registration|attach/i.test(procedure.name)).length;
  const tauCount = procedures.filter((procedure) => /tracking\W*area\W*update|tau/i.test(procedure.name)).length;
  const rrcConnections = procedures.filter((procedure) => /rrc\W*(connection|resume|setup|reconfiguration)/i.test(procedure.name)).length;
  const cellChanges = procedures.filter((procedure) => /handover|cell\W*change|mobility/i.test(procedure.name)).length;
  const errors = procedures.filter((procedure) => procedure.result === "Failure").length
    + timeline.filter((item) => /\b(fail|reject|error|timeout|drop|rlf)\b/i.test([item.title, item.summary, item.rawMessage].filter(Boolean).join(" "))).length;

  return {
    testDurationMs: durationMs,
    totalMessages: timeline.length,
    totalProtocols: protocols.length,
    technologies,
    registrationCount,
    cellChanges,
    calls: summary?.totalCalls ?? 0,
    attachCount: procedures.filter((procedure) => /attach/i.test(procedure.name)).length,
    tauCount,
    rrcConnections,
    errors,
  };
}

function createExecutiveSummaryLines(metrics, procedures = [], summary = null) {
  const lines = [];
  const connectedCalls = summary?.connected ?? 0;
  const failedProcedures = procedures.filter((procedure) => procedure.result === "Failure").length;
  const successfulRegistrations = procedures.filter((procedure) => /registration|attach/i.test(procedure.name) && procedure.result === "Success").length;
  const handovers = procedures.filter((procedure) => /handover|mobility|cell\W*change/i.test(procedure.name)).length;

  lines.push(`The log covers ${formatDuration(metrics.testDurationMs)} with ${metrics.totalMessages} decoded rows across ${metrics.totalProtocols} protocol groups.`);

  if (metrics.technologies.length) {
    lines.push(`Detected radio technologies: ${metrics.technologies.join(", ")}.`);
  }

  if (successfulRegistrations > 0) {
    lines.push(`${successfulRegistrations} registration or attach procedure${successfulRegistrations > 1 ? "s were" : " was"} completed successfully.`);
  } else if (metrics.registrationCount > 0) {
    lines.push(`Registration-related procedures were observed, but none were clearly completed successfully in the parsed evidence.`);
  }

  if ((summary?.totalCalls ?? 0) > 0) {
    lines.push(`${summary.totalCalls} call session${summary.totalCalls > 1 ? "s were" : " was"} detected, with ${connectedCalls} connected and ${(summary.totalCalls - connectedCalls)} not fully connected or dropped.`);
  }

  if (handovers > 0) {
    lines.push(`${handovers} mobility or cell-change procedure${handovers > 1 ? "s were" : " was"} observed during the session.`);
  }

  if (failedProcedures > 0 || metrics.errors > 0) {
    lines.push(`${failedProcedures} procedure failure${failedProcedures > 1 ? "s were" : " was"} flagged, and ${metrics.errors} total error-like indications were found in the analyzed scope.`);
  } else {
    lines.push("No strong failure signature was detected in the analyzed scope.");
  }

  return lines;
}

function createTechnologyTimelineRows(procedures = []) {
  const ordered = [...procedures]
    .filter((procedure) => procedure.technology && procedure.startTime instanceof Date)
    .sort((left, right) => timeMs(left.startTime) - timeMs(right.startTime));

  const rows = [];
  for (const procedure of ordered) {
    const previous = rows[rows.length - 1];
    if (previous && previous[1] === procedure.technology) continue;
    rows.push([
      formatClock(procedure.startTime),
      procedure.technology,
      procedure.name,
    ]);
  }
  return rows;
}

function createRegistrationRows(procedures = []) {
  return procedures
    .filter((procedure) => /registration|attach|tracking\W*area\W*update|location\W*update|authentication|security/i.test(procedure.name))
    .map((procedure) => {
      const rejectCause = procedure.items
        .map((item) => findDetailValue(item, ["Reject Cause", "Cause"]))
        .find(Boolean) || "N/A";
      return [
        procedure.name,
        formatClock(procedure.startTime),
        formatClock(procedure.endTime),
        formatDuration(procedure.durationMs),
        procedure.result,
        rejectCause,
      ];
    });
}

function createServiceStateRows(timeline = []) {
  const rows = [];
  let previousKey = "";

  for (const item of timeline) {
    const voice = findDetailValue(item, ["Voice Service"]);
    const data = findDetailValue(item, ["Data Service"]);
    const reg = findDetailValue(item, ["Registration State"]);
    const combined = [
      voice ? `Voice ${voice}` : "",
      data ? `Data ${data}` : "",
      reg ? `Reg ${reg}` : "",
    ].filter(Boolean).join(" | ");

    if (!combined || combined === previousKey) continue;
    previousKey = combined;
    rows.push([formatClock(item.timestamp), combined, item.title || item.category || "State Update"]);
  }

  return rows;
}

function createCellAnalysisRows(procedures = []) {
  return procedures
    .filter((procedure) => procedure.servingCell || procedure.targetCell || procedure.pci || procedure.earfcn || procedure.tac || procedure.band || procedure.plmn)
    .map((procedure) => [
      formatClock(procedure.startTime),
      procedure.name,
      procedure.servingCell || "N/A",
      procedure.targetCell || "N/A",
      procedure.pci || "N/A",
      procedure.earfcn || "N/A",
      procedure.tac || "N/A",
      procedure.band || "N/A",
    ]);
}

function createRrcRows(procedures = []) {
  return procedures
    .filter((procedure) => /rrc/i.test(procedure.protocol || "") || /rrc|measurement|handover|paging|reconfiguration/i.test(procedure.name))
    .map((procedure) => [
      procedure.name,
      formatClock(procedure.startTime),
      formatDuration(procedure.durationMs),
      procedure.result,
      procedure.technology || "N/A",
    ]);
}

function createNasRows(procedures = []) {
  return procedures
    .filter((procedure) => (procedure.protocol || "") === "NAS" || /registration|attach|detach|authentication|security|tracking\W*area\W*update|service\W*request/i.test(procedure.name))
    .map((procedure) => [
      procedure.name,
      formatClock(procedure.startTime),
      formatDuration(procedure.durationMs),
      procedure.result,
      procedure.callId || "N/A",
    ]);
}

function createSectionIntro(title, countLabel, count) {
  if (!count) return null;
  return `${title}: ${count} ${countLabel}${count > 1 ? "s" : ""} found in the selected scope.`;
}

function buildPdfBlob(pages) {
  const objects = [];
  const pageIds = [];
  const contentIds = [];

  const reserveObject = () => {
    objects.push("");
    return objects.length;
  };

  const setObject = (id, body) => {
    objects[id - 1] = body;
  };

  const catalogId = reserveObject();
  const pagesId = reserveObject();
  const fontRegularId = reserveObject();
  const fontBoldId = reserveObject();
  const fontMonoId = reserveObject();

  pages.forEach((entries) => {
    pageIds.push(reserveObject());
    contentIds.push(reserveObject());
  });

  setObject(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  setObject(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  setObject(fontRegularId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  setObject(fontBoldId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  setObject(fontMonoId, "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");

  pages.forEach((entries, index) => {
    const contentStream = entries.map((entry) => (
      `BT /${entry.font} ${entry.size} Tf 1 0 0 1 ${entry.x} ${entry.y} Tm (${escapePdfText(entry.text)}) Tj ET`
    )).join("\n");

    setObject(contentIds[index], `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`);
    setObject(
      pageIds[index],
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] `
        + `/Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R /F3 ${fontMonoId} 0 R >> >> `
        + `/Contents ${contentIds[index]} 0 R >>`,
    );
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

class PdfLayout {
  constructor() {
    this.pages = [[]];
    this.pageNumber = 1;
    this.y = PAGE.height - PAGE.marginTop;
  }

  currentPage() {
    return this.pages[this.pages.length - 1];
  }

  ensureSpace(heightNeeded) {
    if (this.y - heightNeeded >= PAGE.marginBottom) return;
    this.pages.push([]);
    this.pageNumber += 1;
    this.y = PAGE.height - PAGE.marginTop;
  }

  addLine(text, { font = FONT_REGULAR, size = 10, indent = 0, spacing = 4 } = {}) {
    const lineHeight = size + spacing;
    this.ensureSpace(lineHeight);
    this.currentPage().push({
      text: String(text ?? ""),
      x: PAGE.marginX + indent,
      y: this.y,
      font,
      size,
    });
    this.y -= lineHeight;
  }

  addWrapped(text, { font = FONT_REGULAR, size = 10, indent = 0, spacing = 4 } = {}) {
    const width = PAGE.width - (PAGE.marginX * 2) - indent;
    const maxChars = Math.max(16, Math.floor(width / (size * 0.56)));
    const lines = wrapText(text, maxChars);
    lines.forEach((line) => this.addLine(line, { font, size, indent, spacing }));
  }

  addSpacer(height = 8) {
    this.ensureSpace(height);
    this.y -= height;
  }

  addTable(headers, rows, widths) {
    const formatRow = (values) => values
      .map((value, index) => truncate(value, widths[index]).padEnd(widths[index], " "))
      .join("  ");

    this.addLine(formatRow(headers), { font: FONT_MONO, size: 9, spacing: 3 });
    this.addLine(widths.map((width) => "-".repeat(width)).join("  "), { font: FONT_MONO, size: 9, spacing: 3 });
    rows.forEach((row) => {
      this.addLine(formatRow(row), { font: FONT_MONO, size: 9, spacing: 3 });
    });
  }
}

function sanitizeFileSegment(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "report";
}

export function downloadL3EventPdfReport({
  sourceFileName = "",
  summary = null,
  analysis,
  timeline = [],
  selectedCall = null,
}) {
  if (!analysis?.procedures?.length) {
    throw new Error("No analyzed procedures are available to export.");
  }

  const layout = new PdfLayout();
  const generatedAt = new Date();
  const reportScope = selectedCall?.id ? `Selected call ${selectedCall.id}` : "Full uploaded dataset";
  const procedures = analysis.procedures;
  const dashboard = extractDashboardMetrics(timeline, procedures, summary);
  const executiveSummaryLines = createExecutiveSummaryLines(dashboard, procedures, summary);
  const technologyTimelineRows = createTechnologyTimelineRows(procedures);
  const registrationRows = createRegistrationRows(procedures);
  const serviceStateRows = createServiceStateRows(timeline);
  const cellAnalysisRows = createCellAnalysisRows(procedures);
  const rrcRows = createRrcRows(procedures);
  const nasRows = createNasRows(procedures);

  layout.addLine("L3 Event Analyzer Report", { font: FONT_BOLD, size: 18, spacing: 6 });
  layout.addWrapped("Professional decoded report built from the currently available L3 and Event evidence. Sections are included only when the uploaded files provide enough data.", {
    size: 10,
    spacing: 4,
  });
  layout.addSpacer(8);

  [
    `Source File: ${sourceFileName || "N/A"}`,
    `Report Scope: ${reportScope}`,
    `Generated At: ${formatTimestamp(generatedAt)}`,
    `Technology Mix: ${(analysis.stats?.technologies || []).join(", ") || "N/A"}`,
  ].forEach((line) => layout.addWrapped(line, { size: 10, spacing: 3 }));

  layout.addSpacer(10);
  layout.addLine("Dashboard", { font: FONT_BOLD, size: 13, spacing: 5 });
  [
    `Test Duration: ${formatDuration(dashboard.testDurationMs)}`,
    `Total Messages: ${dashboard.totalMessages}`,
    `Total Protocols: ${dashboard.totalProtocols}`,
    `Technologies Detected: ${dashboard.technologies.join(", ") || "N/A"}`,
    `Registration Count: ${dashboard.registrationCount}`,
    `Cell Changes: ${dashboard.cellChanges}`,
    `Calls: ${dashboard.calls}`,
    `Attach Count: ${dashboard.attachCount}`,
    `TAU Count: ${dashboard.tauCount}`,
    `RRC Connections: ${dashboard.rrcConnections}`,
    `Errors: ${dashboard.errors}`,
  ].forEach((line) => layout.addWrapped(`- ${line}`, { size: 10, indent: 8, spacing: 3 }));

  layout.addSpacer(10);
  layout.addLine("Executive Summary", { font: FONT_BOLD, size: 13, spacing: 5 });
  executiveSummaryLines.forEach((line) => layout.addWrapped(`- ${line}`, { size: 10, indent: 8, spacing: 3 }));

  if (summary?.calls?.length) {
    layout.addSpacer(10);
    layout.addLine("Call Inventory", { font: FONT_BOLD, size: 13, spacing: 5 });
    layout.addTable(
      ["Call ID", "Start", "End", "Status", "Setup Time", "Duration"],
      summary.calls.map((call) => [
        call.id,
        formatClock(call.startTime),
        formatClock(call.endTime),
        call.status || "N/A",
        formatDuration(call.setupTimeMs ?? 0),
        formatDuration(call.durationMs ?? call.totalDurationMs ?? 0),
      ]),
      [12, 9, 9, 12, 10, 10],
    );
  }

  if (technologyTimelineRows.length) {
    layout.addSpacer(10);
    layout.addLine("Technology Timeline", { font: FONT_BOLD, size: 13, spacing: 5 });
    layout.addWrapped(createSectionIntro("Technology Timeline", "transition", technologyTimelineRows.length), { size: 10, spacing: 3 });
    layout.addTable(
      ["Time", "Technology", "Observed In"],
      technologyTimelineRows,
      [10, 14, 28],
    );
  }

  if (registrationRows.length) {
    layout.addSpacer(10);
    layout.addLine("Registration Analysis", { font: FONT_BOLD, size: 13, spacing: 5 });
    layout.addWrapped(createSectionIntro("Registration Analysis", "procedure", registrationRows.length), { size: 10, spacing: 3 });
    layout.addTable(
      ["Procedure", "Start", "End", "Duration", "Result", "Cause"],
      registrationRows,
      [18, 8, 8, 10, 10, 16],
    );
  }

  if (serviceStateRows.length) {
    layout.addSpacer(10);
    layout.addLine("Service State Analysis", { font: FONT_BOLD, size: 13, spacing: 5 });
    layout.addWrapped(createSectionIntro("Service State Analysis", "state transition", serviceStateRows.length), { size: 10, spacing: 3 });
    layout.addTable(
      ["Time", "State", "Source"],
      serviceStateRows,
      [8, 34, 16],
    );
  }

  if (cellAnalysisRows.length) {
    layout.addSpacer(10);
    layout.addLine("Cell Analysis", { font: FONT_BOLD, size: 13, spacing: 5 });
    layout.addWrapped(createSectionIntro("Cell Analysis", "cell context row", cellAnalysisRows.length), { size: 10, spacing: 3 });
    layout.addTable(
      ["Time", "Procedure", "Serving", "Target", "PCI", "EARFCN", "TAC", "Band"],
      cellAnalysisRows,
      [8, 14, 10, 10, 6, 8, 6, 8],
    );
  }

  if (rrcRows.length) {
    layout.addSpacer(10);
    layout.addLine("RRC Analysis", { font: FONT_BOLD, size: 13, spacing: 5 });
    layout.addWrapped(`Observed ${rrcRows.length} RRC-related procedures in the selected scope.`, { size: 10, spacing: 3 });
    layout.addTable(
      ["Procedure", "Start", "Duration", "Result", "Tech"],
      rrcRows,
      [22, 8, 10, 10, 12],
    );
  }

  if (nasRows.length) {
    layout.addSpacer(10);
    layout.addLine("NAS Analysis", { font: FONT_BOLD, size: 13, spacing: 5 });
    layout.addWrapped(`Observed ${nasRows.length} NAS-related procedures in the selected scope.`, { size: 10, spacing: 3 });
    layout.addTable(
      ["Procedure", "Start", "Duration", "Result", "Call"],
      nasRows,
      [22, 8, 10, 10, 10],
    );
  }

  layout.addSpacer(10);
  layout.addLine("Procedure Overview", { font: FONT_BOLD, size: 13, spacing: 5 });
  layout.addTable(
    ["ID", "Name", "Result", "Tech", "Duration", "Rows"],
    createProcedureOverviewRows(procedures),
    [6, 24, 10, 12, 10, 8],
  );

  const repeatedRows = createRepeatedRowSummaryRows(procedures);
  if (repeatedRows.length) {
    layout.addSpacer(10);
    layout.addLine("Repeated Event / Message Counts", { font: FONT_BOLD, size: 13, spacing: 5 });
    layout.addTable(
      ["Type", "Title", "Category", "Count"],
      repeatedRows,
      [8, 26, 16, 8],
    );
  }

  procedures.forEach((procedure) => {
    layout.addSpacer(12);
    layout.addLine(`${procedure.id} ${procedure.name}`, { font: FONT_BOLD, size: 12, spacing: 4 });
    layout.addWrapped(
      `Outcome ${procedure.result}. Protocol ${procedure.protocol || "N/A"}. Technology ${procedure.technology || "N/A"}. `
        + `Observed rows ${procedure.items?.length ?? 0}.`,
      { size: 10, spacing: 3 },
    );

    layout.addSpacer(4);
    layout.addLine("Observed Parameters", { font: FONT_BOLD, size: 10, spacing: 3 });
    createProcedureParameterRows(procedure).forEach(([label, value]) => {
      layout.addWrapped(`${label}: ${value}`, { font: FONT_MONO, size: 9, indent: 8, spacing: 2 });
    });

    layout.addSpacer(4);
    layout.addLine("Decoded Parameter / Value Evidence", { font: FONT_BOLD, size: 10, spacing: 3 });
    createEvidenceRows(procedure).forEach(([label, value]) => {
      layout.addWrapped(`${label}: ${value}`, { font: FONT_MONO, size: 9, indent: 8, spacing: 2 });
    });
  });

  const blob = buildPdfBlob(layout.pages);
  const fileStem = sanitizeFileSegment(sourceFileName.replace(/\.[^.]+$/, ""));
  const scopeStem = selectedCall?.id ? `-${sanitizeFileSegment(selectedCall.id)}` : "";
  blobDownload(blob, `l3-event-analyzer-report-${fileStem}${scopeStem}.pdf`);
}
