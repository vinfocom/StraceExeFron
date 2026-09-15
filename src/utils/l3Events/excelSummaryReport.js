import { createSignalingMessageTable, writeExcelSignalingSummary } from "./pdfReport.js";

export async function createExcelSignalingSummaryWorkbook(options) {
  const module = await import("exceljs");
  const ExcelJS = module.default || module;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Signal Tracker";
  let sheet;
  const layout = {
    addLine(title) {
      sheet = workbook.addWorksheet(title);
      sheet.columns = Array.from({ length: 8 }, () => ({ width: 22 }));
      sheet.getColumn(1).width = 30;
      sheet.addRow([title]).font = { bold: true, size: 16, color: { argb: "FF1E3A8A" } };
    },
    addWrapped(text) {
      const row = sheet.addRow([text]);
      sheet.mergeCells(row.number, 1, row.number, 8);
      row.alignment = { wrapText: true, vertical: "top" };
      row.height = Math.max(30, Math.ceil(text.length / 130) * 16);
    },
    addSpacer() {
      sheet.addRow([]);
    },
    addTable(headers, rows) {
      const header = sheet.addRow(headers);
      header.font = { bold: true, color: { argb: "FFFFFFFF" } };
      header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
      header.alignment = { wrapText: true };
      sheet.addRows(rows);
      sheet.views = [{ state: "frozen", ySplit: header.number }];
      sheet.autoFilter = { from: { row: header.number, column: 1 }, to: { row: header.number + rows.length, column: headers.length } };
      headers.forEach((label, index) => {
        sheet.getColumn(index + 1).width = /Detail|Reason|Interfaces|Message/.test(label) ? 65 : label === "Timestamp" ? 30 : 22;
      });
      for (let index = header.number + 1; index <= sheet.rowCount; index += 1) {
        sheet.getRow(index).alignment = { wrapText: true, vertical: "top" };
      }
    },
  };
  const fileStem = writeExcelSignalingSummary(layout, options, (target, rows, settings) => {
    const table = createSignalingMessageTable(rows, settings);
    target.addTable(table.headers, table.rows);
  });
  return { workbook, fileStem };
}

export async function downloadExcelSignalingSummaryExcel(options) {
  const { workbook, fileStem } = await createExcelSignalingSummaryWorkbook(options);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${fileStem}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
