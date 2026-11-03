import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatINR } from './calculations';
import { formatDateDisplay } from './dateUtils';

export interface WeeklyReportExportData {
  companyName: string;
  weekRangeDisplay: string;
  startDate: string;
  endDate: string;
  teamSummaries: Array<{
    teamId: string;
    teamName: string;
    workCategory: string;
    labourSubtotal: number;
    overtimeSubtotal: number;
    additionalChargesSubtotal: number;
    grossAmount: number;
    creditsSubtotal: number;
    deductionsSubtotal: number;
    advancesAppliedSubtotal: number;
    finalPayable: number;
    entries: Array<{
      date: string;
      shift_batch: string;
      in_time?: string;
      out_time?: string;
      overtime_amount: number;
      lines: Array<{
        category_name: string;
        count: number;
        rate: number;
        final_amount: number;
      }>;
    }>;
    charges: Array<{
      date?: string;
      category: string;
      description: string;
      quantity?: number;
      rate?: number;
      final_amount: number;
    }>;
    adjustments: Array<{
      date: string;
      adjustment_type: string;
      description: string;
      amount: number;
    }>;
  }>;
  supplierBills: Array<{
    supplier_name: string;
    work_description: string;
    gross_amount: number;
    advance_paid: number;
    net_payable: number;
  }>;
  grandTotals: {
    labour: number;
    overtime: number;
    additionalCharges: number;
    gross: number;
    credits: number;
    deductions: number;
    advancesApplied: number;
    finalPayable: number;
  };
}

/**
 * Generate and download professional A4 PDF Weekly Payment & Attendance Report
 */
export function exportWeeklyReportPDF(data: WeeklyReportExportData) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Document Title & Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(data.companyName.toUpperCase(), 14, 15);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Weekly Labour Attendance & Payment Report (${data.weekRangeDisplay})`, 14, 22);

  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Official Period: Saturday ${formatDateDisplay(data.startDate)} to Friday ${formatDateDisplay(data.endDate)} | Generated: ${new Date().toLocaleString('en-IN')}`, 14, 28);
  doc.setTextColor(0);

  // Section 1: Consolidated Weekly Payment Summary
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('1. CONSOLIDATED PAYMENT SUMMARY', 14, 36);

  const summaryRows = data.teamSummaries.map((team, idx) => [
    idx + 1,
    team.teamName,
    team.workCategory,
    formatINR(team.labourSubtotal),
    formatINR(team.overtimeSubtotal),
    formatINR(team.additionalChargesSubtotal),
    formatINR(team.grossAmount),
    formatINR(team.deductionsSubtotal),
    formatINR(team.advancesAppliedSubtotal),
    formatINR(team.finalPayable),
  ]);

  // Append supplier bills if any
  if (data.supplierBills && data.supplierBills.length > 0) {
    data.supplierBills.forEach((bill, idx) => {
      summaryRows.push([
        data.teamSummaries.length + idx + 1,
        `[Supplier/Bill] ${bill.supplier_name}`,
        bill.work_description,
        formatINR(0),
        formatINR(0),
        formatINR(0),
        formatINR(bill.gross_amount),
        formatINR(0),
        formatINR(bill.advance_paid),
        formatINR(bill.net_payable),
      ]);
    });
  }

  // Grand Total Row
  summaryRows.push([
    '',
    'GRAND TOTAL',
    '',
    formatINR(data.grandTotals.labour),
    formatINR(data.grandTotals.overtime),
    formatINR(data.grandTotals.additionalCharges),
    formatINR(data.grandTotals.gross),
    formatINR(data.grandTotals.deductions),
    formatINR(data.grandTotals.advancesApplied),
    formatINR(data.grandTotals.finalPayable),
  ]);

  autoTable(doc, {
    startY: 40,
    head: [[
      'S.No', 'Team / Contractor', 'Category', 'Labour (₹)', 'Overtime (₹)',
      'Extra Charges (₹)', 'Gross Total (₹)', 'Deductions (₹)', 'Advances (₹)', 'Net Payable (₹)'
    ]],
    body: summaryRows,
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 50 },
      2: { cellWidth: 35 },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right', fontStyle: 'bold' },
      7: { halign: 'right' },
      8: { halign: 'right' },
      9: { halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (hookData) => {
      if (hookData.row.index === summaryRows.length - 1) {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.fillColor = [241, 245, 249];
      }
    },
  });

  // Section 2: Detailed Team Breakdown
  let currentY = (doc as any).lastAutoTable.finalY + 10;

  for (const team of data.teamSummaries) {
    if (currentY > 170) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Team: ${team.teamName} (${team.workCategory}) — Total Payable: ${formatINR(team.finalPayable)}`, 14, currentY);
    currentY += 4;

    const teamRows: any[] = [];
    for (const entry of team.entries) {
      const lineDescriptions = entry.lines.map(l => `${l.category_name}: ${l.count} @ ₹${l.rate} = ₹${l.final_amount}`).join(' | ');
      const totalDayLabour = entry.lines.reduce((s, l) => s + l.final_amount, 0);

      teamRows.push([
        formatDateDisplay(entry.date),
        entry.shift_batch,
        entry.in_time && entry.out_time ? `${entry.in_time} - ${entry.out_time}` : 'Regular Shift',
        lineDescriptions || 'No lines',
        formatINR(entry.overtime_amount),
        formatINR(totalDayLabour + entry.overtime_amount),
      ]);
    }

    if (teamRows.length > 0) {
      autoTable(doc, {
        startY: currentY,
        head: [['Date', 'Shift', 'Timings', 'Labour Breakdown', 'OT Amount', 'Day Total']],
        body: teamRows,
        theme: 'striped',
        headStyles: { fillColor: [71, 85, 105], fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 20 },
          2: { cellWidth: 26 },
          3: { cellWidth: 'auto' },
          4: { cellWidth: 25, halign: 'right' },
          5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
        },
      });
      currentY = (doc as any).lastAutoTable.finalY + 8;
    }
  }

  // Add Page Numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Page ${i} of ${totalPages} — Company Labour Attendance & Payment ERP`, pageWidth - 80, 202);
  }

  doc.save(`Weekly_Report_${data.startDate}_to_${data.endDate}.pdf`);
}

/**
 * Generate and download multi-sheet Excel Workbook with numeric amount cells
 */
export function exportWeeklyReportExcel(data: WeeklyReportExportData) {
  const wb = XLSX.utils.book_new();

  // 1. Sheet 1: Consolidated Summary
  const summaryHeaders = [
    'S.No', 'Team / Contractor', 'Category', 'Labour Amount', 'Overtime Amount',
    'Additional Charges', 'Gross Total', 'Deductions', 'Advances Applied', 'Net Payable'
  ];

  const summarySheetData: any[] = [
    [data.companyName],
    [`Weekly Payment Report: ${data.weekRangeDisplay}`],
    [`Official Reporting Period: ${formatDateDisplay(data.startDate)} to ${formatDateDisplay(data.endDate)}`],
    [],
    summaryHeaders,
  ];

  data.teamSummaries.forEach((team, idx) => {
    summarySheetData.push([
      idx + 1,
      team.teamName,
      team.workCategory,
      team.labourSubtotal,
      team.overtimeSubtotal,
      team.additionalChargesSubtotal,
      team.grossAmount,
      team.deductionsSubtotal,
      team.advancesAppliedSubtotal,
      team.finalPayable,
    ]);
  });

  if (data.supplierBills) {
    data.supplierBills.forEach((b, idx) => {
      summarySheetData.push([
        data.teamSummaries.length + idx + 1,
        `[Supplier/Bill] ${b.supplier_name}`,
        b.work_description,
        0,
        0,
        0,
        b.gross_amount,
        0,
        b.advance_paid,
        b.net_payable,
      ]);
    });
  }

  // Grand Total Row
  summarySheetData.push([
    '',
    'GRAND TOTAL',
    '',
    data.grandTotals.labour,
    data.grandTotals.overtime,
    data.grandTotals.additionalCharges,
    data.grandTotals.gross,
    data.grandTotals.deductions,
    data.grandTotals.advancesApplied,
    data.grandTotals.finalPayable,
  ]);

  const wsSummary = XLSX.utils.aoa_to_sheet(summarySheetData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Consolidated Summary');

  // 2. Sheet 2: Daily Attendance Details
  const attendanceHeaders = [
    'Date (DD/MM/YYYY)', 'Team Name', 'Work Category', 'Shift / Batch',
    'In Time', 'Out Time', 'Labour Category', 'Count', 'Rate', 'Calculated Amount', 'Final Amount', 'Overtime Amount'
  ];

  const attendanceData: any[] = [attendanceHeaders];

  for (const team of data.teamSummaries) {
    for (const entry of team.entries) {
      for (const line of entry.lines) {
        attendanceData.push([
          formatDateDisplay(entry.date),
          team.teamName,
          team.workCategory,
          entry.shift_batch,
          entry.in_time || 'N/A',
          entry.out_time || 'N/A',
          line.category_name,
          line.count,
          line.rate,
          line.count * line.rate,
          line.final_amount,
          entry.overtime_amount,
        ]);
      }
    }
  }

  const wsAttendance = XLSX.utils.aoa_to_sheet(attendanceData);
  XLSX.utils.book_append_sheet(wb, wsAttendance, 'Daily Attendance');

  // 3. Sheet 3: Additional Charges
  const chargesHeaders = ['Team Name', 'Date', 'Charge Category', 'Description', 'Quantity', 'Rate', 'Final Amount'];
  const chargesData: any[] = [chargesHeaders];

  for (const team of data.teamSummaries) {
    for (const chg of team.charges) {
      chargesData.push([
        team.teamName,
        chg.date ? formatDateDisplay(chg.date) : 'Weekly',
        chg.category,
        chg.description,
        chg.quantity || '',
        chg.rate || '',
        chg.final_amount,
      ]);
    }
  }

  const wsCharges = XLSX.utils.aoa_to_sheet(chargesData);
  XLSX.utils.book_append_sheet(wb, wsCharges, 'Additional Charges');

  XLSX.writeFile(wb, `Weekly_Report_${data.startDate}_to_${data.endDate}.xlsx`);
}
