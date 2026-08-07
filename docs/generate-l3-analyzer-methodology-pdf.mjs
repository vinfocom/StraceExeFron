import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.join(__dirname, "l3-event-analyzer-methodology.pdf");

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 48;
const MARGIN_TOP = 52;
const MARGIN_BOTTOM = 50;
const BODY_SIZE = 10;
const TITLE_SIZE = 18;
const SECTION_SIZE = 13;
const LINE_HEIGHT = 14;

function clean(value = "") {
  return String(value)
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePdfText(value = "") {
  return clean(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(value, maxChars = 92) {
  const text = clean(value);
  if (!text) return [""];
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!line) {
      line = word;
    } else if (`${line} ${word}`.length <= maxChars) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

class PdfDoc {
  constructor() {
    this.pages = [];
    this.current = [];
    this.y = PAGE_HEIGHT - MARGIN_TOP;
    this.pageNumber = 0;
    this.addPage();
  }

  addPage() {
    if (this.current.length) {
      this.pages.push(this.current);
    }
    this.pageNumber += 1;
    this.current = [
      "BT",
      "/F2 8 Tf",
      `1 1 1 rg`,
      `${MARGIN_X} ${MARGIN_BOTTOM - 18} Td`,
      `(${escapePdfText(`L3/Event Analyzer Methodology - Page ${this.pageNumber}`)}) Tj`,
      "ET",
    ];
    this.y = PAGE_HEIGHT - MARGIN_TOP;
  }

  ensure(space = LINE_HEIGHT) {
    if (this.y - space < MARGIN_BOTTOM) {
      this.addPage();
    }
  }

  line(text, { size = BODY_SIZE, font = "F1", leading = LINE_HEIGHT, gap = 0, color = "0.13 0.16 0.22" } = {}) {
    this.ensure(leading + gap);
    this.current.push(
      "BT",
      `/${font} ${size} Tf`,
      `${color} rg`,
      `${MARGIN_X} ${this.y} Td`,
      `(${escapePdfText(text)}) Tj`,
      "ET",
    );
    this.y -= leading + gap;
  }

  wrapped(text, options = {}) {
    const maxChars = options.maxChars || (options.size && options.size > 12 ? 70 : 92);
    for (const line of wrapText(text, maxChars)) {
      this.line(line, options);
    }
  }

  section(title) {
    this.y -= 8;
    this.line(title, { size: SECTION_SIZE, font: "F2", leading: 18, gap: 2, color: "0.04 0.24 0.45" });
  }

  bullet(text) {
    this.wrapped(`- ${text}`, { size: BODY_SIZE, leading: LINE_HEIGHT, maxChars: 88 });
  }

  table(headers, rows, widths) {
    const header = headers.map((header, index) => clean(header).padEnd(widths[index])).join("  ");
    this.line(header, { font: "F3", size: 8.5, leading: 12, color: "0.04 0.24 0.45" });
    this.line("-".repeat(Math.min(105, header.length)), { font: "F3", size: 8.5, leading: 10, color: "0.45 0.50 0.57" });
    for (const row of rows) {
      const cells = row.map((cell, index) => clean(cell).slice(0, widths[index]).padEnd(widths[index]));
      this.line(cells.join("  "), { font: "F3", size: 8.2, leading: 11, color: "0.15 0.18 0.24" });
    }
  }

  finish() {
    if (this.current.length) this.pages.push(this.current);
    return buildPdf(this.pages);
  }
}

function buildPdf(pageStreams) {
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };

  const catalogId = add("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = add("");
  const font1Id = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const font2Id = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const font3Id = add("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");
  const pageIds = [];

  for (const streamLines of pageStreams) {
    const stream = streamLines.join("\n");
    const contentId = add(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`);
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${font1Id} 0 R /F2 ${font2Id} 0 R /F3 ${font3Id} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

const doc = new PdfDoc();

doc.line("L3/Event Analyzer Methodology", { size: TITLE_SIZE, font: "F2", leading: 24, color: "0.03 0.16 0.32" });
doc.wrapped("How the current model reads L3 and Events files, fixes timestamps, classifies technology, detects call sessions, separates connected, not connected, and dropped calls, and calculates setup time and duration.", { size: 10.5, leading: 15, maxChars: 88 });
doc.line(`Generated: ${new Date().toISOString().slice(0, 10)}`, { size: 9, leading: 16, color: "0.38 0.43 0.50" });

doc.section("1. Input Data");
doc.bullet("The analyzer consumes two families of records: decoded L3 signaling rows and device or modem Event rows.");
doc.bullet("L3 rows provide protocol messages such as RRC, NAS, IMS SIP, attach, registration, handover, bearer, and release messages.");
doc.bullet("Event rows provide call-state callbacks such as CALL_DIAL_INITIATED, CALL_DIALING, CALL_ALERTING, CALL_ACTIVE, CALL_DISCONNECTED, CallState, mPreciseCallState, and disconnect cause rows.");
doc.bullet("Each row keeps source metadata, raw message text, decoded details, source file, row index, severity, latitude, longitude, and any parser metadata available from the uploaded archive.");

doc.section("2. Timeline Normalization");
doc.bullet("Every L3 and Event row is merged into one chronological timeline in timelineBuilder.js.");
doc.bullet("Timestamps can be epoch milliseconds, epoch seconds, full date strings, or time-only values such as 17:34:50.306.");
doc.bullet("Time-only values are anchored to 1970-01-01 UTC so ordering stays stable and the visible time matches the log text.");
doc.bullet("If raw logcat text contains a fresher embedded timestamp, the analyzer uses that embedded timestamp as the true event time.");
doc.bullet("If an embedded event is stale compared with the CSV capture time, it is marked stale and is not allowed to create false call evidence.");

doc.section("3. Technology Classification");
doc.bullet("Technology is inferred from procedure analysis, item protocol, interface names, source category, and raw message text.");
doc.bullet("The normalization rule maps gsm or 2g to 2G, umts/utran/3g to 3G, lte/4g/enodeb/eps to LTE, and nr/5g/gnb to 5G.");
doc.bullet("Protocol analysis also tags procedures using 3GPP families: LTE RRC, NR RRC, NAS, IMS, GSM RR/MM/CC, UMTS RRC, EPS, and NR NAS.");
doc.bullet("For each call, the UI records technology at the start and at the end. If technology changes during mobility, the home table shows it as Start -> End.");
doc.bullet("Unknown is kept when no reliable radio/protocol hint exists. The model does not invent a technology from unrelated text.");

doc.section("4. Procedure and Signaling Model");
doc.bullet("protocolAnalyzer.js matches rows against a procedure library of known 3GPP messages and flows.");
doc.bullet("Examples include GSM MO Call, UMTS CS MO Call, Paging, RRC Connection Establishment, Security Mode Control, Authentication, Attach, Registration, IMS SIP setup, and handover procedures.");
doc.bullet("The procedure model records protocol, source node, destination node, specification family, success markers, failure markers, duration, and related evidence.");
doc.bullet("signalingModel.js converts the merged timeline into the Excel View rows: Timestamp, UE, eNB/gNB, MME/AMF/Core, Interface, Message, and raw Detail.");

doc.section("5. Call Session Detection");
doc.bullet("sessionBuilder.js creates one call session when it sees a real start event.");
doc.bullet("Outgoing starts are detected from CALL_DIAL_INITIATED, CALL_DIALING, or dial/calling/trying state.");
doc.bullet("Incoming starts are detected only from CallState or mPreciseCallState rows that contain ringing or alerting plus incoming/MT-call wording.");
doc.bullet("Generic ringing by itself is intentionally not a start because it created false calls in real traces.");
doc.bullet("Duplicate start rows inside a one second window are deduplicated into the same session.");
doc.bullet("A session ends on CALL_DISCONNECTED or an idle/disconnected/ended call-state row. Both terminal callbacks are captured because ordering matters.");

doc.section("6. Connection Evidence");
doc.bullet("A call is connected only when strong connection evidence is found before the normalized end marker.");
doc.bullet("Strong evidence includes SIP INVITE followed by SIP 200 OK followed by SIP ACK, explicit connected call state, non-remote callType=3 after alerting, or media/bearer establishment.");
doc.bullet("Remote capability callType=3 is not treated as connection by itself. Local callType=3 can confirm the call after alerting.");
doc.bullet("Codec evidence such as CODEC_AMR_NB, CODEC_AMR_WB, CODEC_EVS, or updateMediaCapabilities codec fields is kept as supporting evidence.");
doc.bullet("Evidence after the actual end is ignored so delayed callbacks do not turn a failed attempt into a connected call.");

doc.section("7. Fixed-Duration Drive-Test Inference");
doc.bullet("Some drive-test calls complete locally with weak explicit connection callbacks. For those, the analyzer has a conservative estimator.");
doc.bullet("The estimator requires local cause 3, an attempt between 85 and 130 seconds, alerting evidence, and either codec evidence or modem disconnect before Idle.");
doc.bullet("When those conditions match, connected time is inferred as end time minus 90 seconds.");
doc.bullet("The inferred setup must be between 1 and 30 seconds and after alerting. Inferred values are marked with connectionEstimated.");
doc.bullet("This rule is narrow by design because it should repair known scripted-call traces without hiding real setup failures.");

doc.section("8. Connected, Not Connected, Dropped");
doc.bullet("callClassifier.js classifies a session after milestones and evidence are finalized.");
doc.bullet("Connected means the call has connection evidence and no unrecovered abnormal termination evidence before the end.");
doc.bullet("Not Connected means the session ended before connection evidence. Details can be Busy, Rejected, User Cancelled, Call Setup Failure, IMS Failure, Radio Failure, or Handover Failure.");
doc.bullet("Dropped means the call connected first and then ended with abnormal release evidence such as radio failure, handover failure, IMS failure, bearer/media loss, SCG failure, or unrecovered RRC failure.");
doc.bullet("Recovered RF problems are tracked. If RRC re-establishment or a recovery signal appears before release, that issue is exposed as evidence but does not force a dropped final result.");

doc.section("9. RF and Protocol Failure Signals");
doc.bullet("RF/radio failure hints include radio link failure, RLF, RRC re-establishment failure, unexpected RRC release, bearer loss, lost signal, out of service, SCG fail, and SCG failure.");
doc.bullet("Handover failures include handover or HO text combined with fail, failure, reject, drop, or timeout.");
doc.bullet("IMS/SIP failures include IMS registration lost/deregistered/unregistered and SIP failure codes such as 408, 480, 486, 500, and 503 in SIP context.");
doc.bullet("Bearer failures include voice bearer, media, RTP, or QoS flow loss/failure/release unexpected wording.");
doc.bullet("Disconnect cause codes are mapped through disconnectCauseMapper.js and combined with L3 evidence to choose the most specific reason.");

doc.section("10. Duration Calculation");
doc.bullet("durationCalculator.js uses the normalized first terminal marker as the end time, not later cleanup rows.");
doc.bullet("Call setup time is dial/start to connected/setup completion. It stays null when the call never connected.");
doc.bullet("Connected duration is connected time to normalized end time. It stays null for not-connected attempts.");
doc.bullet("Attempt duration is dial/start to end time and is tracked separately from connected talk time.");
doc.bullet("The summary uses connected media time as call duration, while still keeping total attempt duration for diagnostics.");

doc.section("11. Summary Output");
doc.bullet("summaryBuilder.js counts total calls, connected, dropped, not connected, busy, rejected, setup failures, ongoing, and unknown.");
doc.bullet("Average setup time is calculated from connected calls with positive setup time.");
doc.bullet("Average talk time is calculated from connected duration values greater than zero.");
doc.bullet("Success rate is connected calls divided by total calls.");
doc.bullet("The home screen now shows the main cards plus a per-call table with call id, start, end, technology, result, setup time, duration, and reason.");

doc.section("12. Excel View and PDF Export");
doc.bullet("Excel View is a signaling sheet, not a spreadsheet clone. It shows all filtered data in one scrollable table.");
doc.bullet("The visible columns are Timestamp, UE, eNB/gNB, MME/AMF/Core, Interface, and Message.");
doc.bullet("Interface and Message filters live in their column headers. UE, radio, and core columns support uplink/downlink filtering.");
doc.bullet("The selected row detail panel shows the raw message first, then supporting decoded fields.");
doc.bullet("Download Summary creates a PDF with Summary, Call Summary, Technology Summary, and Sheet Messages. Sheet Messages contain Timestamp, Interface, Message, and Detail/raw message.");

doc.section("13. Main Source Files");
doc.table(
  ["File", "Responsibility"],
  [
    ["timestampUtils.js", "embedded timestamp extraction and stale-event checks"],
    ["timelineBuilder.js", "merge L3/Event rows into chronological timeline"],
    ["protocolAnalyzer.js", "3GPP procedure detection and technology/protocol context"],
    ["sessionBuilder.js", "call session creation, milestones, SIP/media/RF evidence"],
    ["callClassifier.js", "connected/not connected/dropped decision and reason"],
    ["durationCalculator.js", "setup, connected duration, and attempt duration"],
    ["summaryBuilder.js", "aggregate call counters and averages"],
    ["signalingModel.js", "Excel View signaling rows and lane/message model"],
    ["pdfReport.js", "in-app PDF reports and sheet-message summary export"],
    ["L3EventsTab.jsx", "home cards, per-call table, tabs, and export actions"],
  ],
  [24, 66],
);

doc.section("14. Validation Dataset Results");
doc.bullet("The corrected analyzer was checked against the uploaded archives used during development.");
doc.table(
  ["Archive", "Total", "Connected", "Not Connected", "Dropped"],
  [
    ["Log_20260807_094502.zip", "4", "2", "1", "1"],
    ["BestL3.zip", "5", "5", "0", "0"],
    ["CSTEST.zip", "6", "2", "2", "2"],
  ],
  [30, 8, 10, 14, 8],
);

doc.section("15. Practical Reading Guide");
doc.bullet("When a count looks wrong, first inspect stale timestamp flags and whether an Event row was delayed by log buffering.");
doc.bullet("If a not-connected call appears connected, check whether the evidence came from remote capability callType=3 or from a row after end time.");
doc.bullet("If a connected call appears dropped, check whether RF failure evidence was recovered by RRC re-establishment or later normal SIP/BYE release.");
doc.bullet("If setup time is zero or missing, confirm that dial/start and connected evidence both have usable timestamps.");
doc.bullet("If technology is Unknown, inspect protocol, interface, source category, and raw text. The model only labels a technology when one of those inputs has a clear hint.");

fs.writeFileSync(outputPath, doc.finish());
console.log(outputPath);
