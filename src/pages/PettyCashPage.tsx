import React, { useState, useEffect } from 'react';
import {
  Wallet,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  FileSpreadsheet,
  FileText,
  Calendar,
  AlertCircle,
  Building,
  Trash2,
  Search,
  Building2,
  Filter,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { api } from '../lib/api';
import { formatINR, round2 } from '../lib/calculations';
import { formatDateDisplay, getTodayKolkataISO } from '../lib/dateUtils';
import { useAuth } from '../context/AuthContext';
import { CustomSelect } from '../components/CustomSelect';

export function PettyCashPage() {
  const { user, isMasterAdmin, isSecondaryAdmin } = useAuth();
  const [data, setData] = useState<{
    openingBalances: { openingInAccount: number; openingInHand: number };
    entries: any[];
    currentAccountBalance: number;
    currentHandBalance: number;
    totalAvailableFunds: number;
    officeBreakdowns?: any[];
    office?: any;
  }>({
    openingBalances: { openingInAccount: 75000, openingInHand: 25000 },
    entries: [],
    currentAccountBalance: 75000,
    currentHandBalance: 25000,
    totalAvailableFunds: 100000,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Office isolation & categorisation state
  const [offices, setOffices] = useState<any[]>([]);
  const [selectedOffice, setSelectedOffice] = useState<string>('all');
  const [modalOfficeId, setModalOfficeId] = useState<string>('head_office');

  // Month & Year state
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState('');

  // New Transaction Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [date, setDate] = useState(getTodayKolkataISO());
  const [serialNo, setSerialNo] = useState('');
  const [description, setDescription] = useState('');
  const [txType, setTxType] = useState<'credit' | 'debit'>('debit');
  const [channel, setChannel] = useState<'cash' | 'online'>('cash');
  const [amount, setAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadPettyCash = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [res, offList] = await Promise.all([
        api.pettyCash.get({
          month: selectedMonth,
          year: selectedYear,
          secondaryAdminId: selectedOffice !== 'all' ? selectedOffice : undefined,
        }),
        isMasterAdmin ? api.offices.list().catch(() => []) : Promise.resolve([]),
      ]);
      setData(res);
      if (offList && offList.length > 0) {
        setOffices(offList);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load petty cash data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPettyCash();
  }, [selectedMonth, selectedYear, selectedOffice]);

  const handleCreateTransaction = async () => {
    if (!description.trim()) {
      alert('Please enter a transaction description.');
      return;
    }
    if (amount <= 0) {
      alert('Please enter a valid amount.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.pettyCash.create({
        date,
        serialNo,
        description,
        creditAmount: txType === 'credit' ? amount : 0,
        debitAmount: txType === 'debit' ? amount : 0,
        onlineAmount: channel === 'online' ? amount : 0,
        channel,
        notes,
        secondaryAdminId: isMasterAdmin ? modalOfficeId : undefined,
      });

      setModalOpen(false);
      setDescription('');
      setAmount(0);
      setNotes('');
      await loadPettyCash();
    } catch (err: any) {
      alert(err.message || 'Failed to record petty cash entry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this petty cash entry?')) return;
    try {
      await api.pettyCash.delete(id);
      await loadPettyCash();
    } catch (err: any) {
      alert(err.message || 'Failed to delete entry.');
    }
  };

  // Export to Excel matching "Petty Cash - Oct 2026" sheet structure
  const exportToExcel = () => {
    const rows = data.entries.map((e, idx) => ({
      'S.No': idx + 1,
      'Date': formatDateDisplay(e.date),
      'Ref / Serial No': e.serial_no || '',
      'Description': e.description,
      'Credit (Received ₹)': e.credit_amount || 0,
      'Debit (Paid ₹)': e.debit_amount || 0,
      'Online Tx (₹)': e.online_amount || 0,
      'Channel': e.channel === 'online' ? 'Online / Account' : 'Cash in Hand',
      'Day Balance (₹)': e.dayBalance || 0,
      'Cash in Account (₹)': e.cashInAccount || 0,
      'Cash in Hand (₹)': e.cashInHand || 0,
      'Total Available Funds (₹)': e.totalFunds || 0,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Petty Cash - ${selectedMonth}-${selectedYear}`);
    XLSX.writeFile(wb, `Petty_Cash_${selectedMonth}_${selectedYear}.xlsx`);
  };

  // Export to PDF
  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text(`Company Petty Cash Ledger — ${selectedMonth}/${selectedYear}`, 14, 15);
    doc.setFontSize(9);
    doc.text(`Opening Account: ₹${data.openingBalances.openingInAccount} | Opening Hand: ₹${data.openingBalances.openingInHand}`, 14, 22);

    const tableData = data.entries.map((e, idx) => [
      idx + 1,
      formatDateDisplay(e.date),
      e.description,
      e.credit_amount ? formatINR(e.credit_amount) : '-',
      e.debit_amount ? formatINR(e.debit_amount) : '-',
      e.channel === 'online' ? 'Online' : 'Cash',
      formatINR(e.cashInAccount),
      formatINR(e.cashInHand),
      formatINR(e.totalFunds),
    ]);

    autoTable(doc, {
      startY: 26,
      head: [['#', 'Date', 'Description', 'Credit', 'Debit', 'Mode', 'In Account', 'In Hand', 'Total Funds']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [1, 64, 37] },
    });

    doc.save(`Petty_Cash_${selectedMonth}_${selectedYear}.pdf`);
  };

  const filteredEntries = data.entries.filter((e) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      e.description?.toLowerCase().includes(term) ||
      e.serial_no?.toLowerCase().includes(term) ||
      e.notes?.toLowerCase().includes(term)
    );
  });

  const totalCredits = filteredEntries.reduce((sum, e) => sum + (e.credit_amount || 0), 0);
  const totalDebits = filteredEntries.reduce((sum, e) => sum + (e.debit_amount || 0), 0);
  const totalOnline = filteredEntries.reduce((sum, e) => sum + (e.online_amount || 0), 0);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#696969]/20 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-[#014025] tracking-tight">
              Petty Cash &amp; Office Expenses Ledger
            </h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-[#014025]">
              {isMasterAdmin
                ? 'Master Admin • Company'
                : `Branch • ${data.office?.name || user?.assignedLocation || 'My Office'}`}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#696969] mt-0.5">
            {isMasterAdmin
              ? 'Categorised company-wide petty cash by office location and secondary admin, with independent branch accounts.'
              : 'Independent branch office petty cash register, daily cash-in-hand, and bank balance movement.'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Master Admin Office Filter in Header */}
          {isMasterAdmin && offices.length > 0 && (
            <div className="w-full sm:w-56">
              <CustomSelect
                value={selectedOffice}
                onChange={(val) => setSelectedOffice(String(val))}
                options={[
                  { value: 'all', label: 'All Offices (Combined)' },
                  ...offices.map((o) => ({ value: o.id, label: o.name })),
                ]}
                placeholder="Select Office"
                size="sm"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={exportToExcel}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-1 px-2.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-[#014025] bg-white hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span>Excel</span>
            </button>

            <button
              onClick={exportToPDF}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-1 px-2.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-[#014025] bg-white hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-red-700 shrink-0" />
              <span>PDF</span>
            </button>

            <button
              onClick={() => setModalOpen(true)}
              className="flex-2 sm:flex-none flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-xl bg-[#014025] hover:bg-[#014025]/85 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>New Entry</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Master Admin Office-Wise Balances Breakdown Cards */}
      {isMasterAdmin && selectedOffice === 'all' && data.officeBreakdowns && data.officeBreakdowns.length > 0 && (
        <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-[#014025]" />
              <h2 className="text-sm font-bold text-[#014025]">Office-Wise Petty Cash Breakdown</h2>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-[#014025] font-semibold">
                {data.officeBreakdowns.length} Branch Offices
              </span>
            </div>
            <span className="text-xs text-slate-500">Separate balances maintained per branch location</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.officeBreakdowns.map((b: any) => (
              <div
                key={b.officeId}
                className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/20 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-slate-900 text-xs sm:text-sm">{b.officeName}</div>
                      <div className="text-[11px] text-slate-500">Manager: {b.adminName}</div>
                    </div>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-700">
                      {b.entryCount} entries
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-slate-200/60 font-mono text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">Cash in Hand</span>
                      <strong className="text-emerald-700">{formatINR(b.handBalance)}</strong>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block font-sans">Bank/Account</span>
                      <strong className="text-blue-800">{formatINR(b.accountBalance)}</strong>
                    </div>
                    <div className="col-span-2 pt-1 border-t border-dashed border-slate-200 flex justify-between items-center">
                      <span className="text-[11px] font-sans text-slate-600 font-semibold">Total Funds:</span>
                      <span className="font-bold text-[#014025] text-sm">{formatINR(b.totalFunds)}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 mt-2 border-t border-slate-200/60 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setSelectedOffice(b.officeId)}
                    className="text-xs font-semibold text-[#0E6037] hover:underline flex items-center space-x-1 cursor-pointer"
                  >
                    <span>View this office ledger &rarr;</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Balances Card Grid matching "for software.xlsx" */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="col-span-2 lg:col-span-1 bg-[#014025] text-white p-4 rounded-xl shadow-xs ring-2 ring-[#014025]/30">
          <div className="text-xs text-emerald-200 font-semibold flex items-center justify-between">
            <span>Total Available Funds</span>
            <span className="text-[10px] bg-white/20 text-white px-1.5 py-0.5 rounded font-bold">Hand + Account</span>
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-1.5">
            {formatINR(data.totalAvailableFunds)}
          </div>
          <div className="text-[11px] text-white/80 mt-0.5">Combined Liquid Petty Cash</div>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-emerald-200/80 shadow-xs ring-1 ring-emerald-500/10">
          <div className="text-xs text-emerald-800 font-semibold flex items-center justify-between">
            <span>Amount in Hand</span>
            <span className="text-[10px] bg-emerald-100 text-emerald-900 px-1.5 py-0.5 rounded font-bold">Cash</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-700 mt-1.5">
            {formatINR(data.currentHandBalance)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">Running Cash in Hand</div>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-blue-200/80 shadow-xs ring-1 ring-blue-500/10">
          <div className="text-xs text-blue-800 font-semibold flex items-center justify-between">
            <span>Amount in Account</span>
            <span className="text-[10px] bg-blue-100 text-blue-900 px-1.5 py-0.5 rounded font-bold">Bank</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-blue-800 mt-1.5">
            {formatINR(data.currentAccountBalance)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">Running Bank Balance</div>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs text-slate-500 font-medium">Opening (In Hand)</div>
          <div className="text-base sm:text-lg font-bold font-mono text-[#014025] mt-1.5">
            {formatINR(data.openingBalances.openingInHand)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5">Month Initial Cash</div>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs text-slate-500 font-medium">Opening (In Account)</div>
          <div className="text-base sm:text-lg font-bold font-mono text-[#014025] mt-1.5">
            {formatINR(data.openingBalances.openingInAccount)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5">Month Initial Bank</div>
        </div>
      </div>

      {/* Month Filter & Search Bar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2 text-xs w-full sm:w-auto">
          <Calendar className="w-4 h-4 text-[#456B5A] shrink-0" />
          <span className="font-semibold text-[#014025] shrink-0">Period:</span>
          <div className="flex-1 sm:w-36">
            <CustomSelect
              value={selectedMonth}
              onChange={(val) => setSelectedMonth(Number(val))}
              options={Array.from({ length: 12 }, (_, i) => ({
                value: i + 1,
                label: new Date(2026, i, 1).toLocaleString('default', { month: 'long' }),
              }))}
              size="sm"
            />
          </div>

          <div className="w-24 shrink-0">
            <CustomSelect
              value={selectedYear}
              onChange={(val) => setSelectedYear(Number(val))}
              options={[
                { value: 2025, label: '2025' },
                { value: 2026, label: '2026' },
                { value: 2027, label: '2027' },
              ]}
              size="sm"
            />
          </div>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Search description or ref..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg text-[#014025] focus:outline-none focus:ring-1 focus:ring-[#456B5A]"
          />
        </div>
      </div>

      {/* Mobile Card List (md:hidden) */}
      <div className="md:hidden bg-white rounded-xl border border-slate-200 shadow-2xs divide-y divide-slate-100 overflow-hidden">
        {filteredEntries.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No petty cash records found for this period. Tap &quot;New Entry&quot; to add transactions.
          </div>
        ) : (
          filteredEntries.map((e) => (
            <div key={e.id} className="p-3.5 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-slate-900 leading-snug">{e.description}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded border ${
                      e.channel === 'online'
                        ? 'bg-blue-50 text-blue-800 border-blue-200'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    }`}>
                      {e.channel === 'online' ? 'Online' : 'Cash'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                    <span>{formatDateDisplay(e.date)}</span>
                    {e.serial_no && (
                      <>
                        <span>•</span>
                        <span className="font-mono text-slate-600 bg-slate-100 px-1 py-0.2 rounded text-[10px]">{e.serial_no}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className={`font-mono font-bold text-sm ${e.credit_amount ? 'text-emerald-700' : 'text-red-700'}`}>
                    {e.credit_amount ? `+${formatINR(e.credit_amount)}` : `-${formatINR(e.debit_amount)}`}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    Total: <span className="font-semibold text-slate-700">{formatINR(e.totalFunds)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px] text-slate-500 font-mono">
                <div className="flex items-center gap-2">
                  <span>Hand: <strong className="text-emerald-800">{formatINR(e.cashInHand)}</strong></span>
                  <span>•</span>
                  <span>Bank: <strong className="text-blue-800">{formatINR(e.cashInAccount)}</strong></span>
                </div>
                <button
                  onClick={() => handleDelete(e.id)}
                  className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                  title="Delete entry"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Ledger Table (hidden md:block) */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#696969]/10 text-[#014025] font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Office</th>
                <th className="py-2.5 px-3">Ref No</th>
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-3 text-right text-emerald-800">Credit (Received)</th>
                <th className="py-2.5 px-3 text-right text-red-800">Debit (Paid)</th>
                <th className="py-2.5 px-3 text-center">Channel</th>
                <th className="py-2.5 px-3 text-right">Day Balance</th>
                <th className="py-2.5 px-3 text-right">Cash in Account</th>
                <th className="py-2.5 px-3 text-right">Cash in Hand</th>
                <th className="py-2.5 px-2 text-center w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#696969]/15">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-xs text-[#696969]">
                    No petty cash transactions recorded for this period. Click &quot;New Transaction&quot; to add.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/60 font-mono">
                    <td className="py-2 px-3 text-[#014025] font-sans font-medium">{formatDateDisplay(e.date)}</td>
                    <td className="py-2 px-3 text-[#014025] font-sans text-xs">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-[#0E6037] border border-emerald-200">
                        {e.office_name || 'Head Office'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-[#696969]">{e.serial_no || '--'}</td>
                    <td className="py-2 px-3 text-[#014025] font-sans max-w-xs truncate">{e.description}</td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-700">
                      {e.credit_amount > 0 ? formatINR(e.credit_amount) : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-red-700">
                      {e.debit_amount > 0 ? formatINR(e.debit_amount) : '-'}
                    </td>
                    <td className="py-2 px-3 text-center font-sans">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          e.channel === 'online' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {e.channel === 'online' ? 'Online' : 'Cash'}
                      </span>
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-semibold ${
                        e.dayBalance >= 0 ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {formatINR(e.dayBalance)}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-[#014025]">
                      {formatINR(e.cashInAccount)}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-[#014025]">
                      {formatINR(e.cashInHand)}
                    </td>
                    <td className="py-2 px-2 text-center font-sans">
                      <button
                        onClick={() => handleDelete(e.id)}
                        className="text-[#696969] hover:text-red-500 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredEntries.length > 0 && (
              <tfoot className="bg-[#696969]/10 font-bold font-mono text-[#014025]">
                <tr>
                  <td colSpan={4} className="py-2.5 px-3 font-sans text-xs">Period Movement Totals</td>
                  <td className="py-2.5 px-3 text-right text-emerald-800">{formatINR(totalCredits)}</td>
                  <td className="py-2.5 px-3 text-right text-red-800">{formatINR(totalDebits)}</td>
                  <td className="py-2.5 px-3 text-right text-slate-700">{formatINR(totalOnline)}</td>
                  <td className="py-2.5 px-3 text-right text-emerald-800">{formatINR(data.currentHandBalance)}</td>
                  <td className="py-2.5 px-3 text-right text-blue-800">{formatINR(data.currentAccountBalance)}</td>
                  <td className="py-2.5 px-3 text-right text-[#014025] font-extrabold">{formatINR(data.totalAvailableFunds)}</td>
                  <td></td>
                </tr>
                <tr className="bg-emerald-50/80 border-t border-emerald-200/60 text-xs">
                  <td colSpan={4} className="py-2.5 px-3 font-sans text-emerald-950 font-bold">
                    Running Balances Closing:
                  </td>
                  <td colSpan={2} className="py-2.5 px-3 text-emerald-900">
                    Total Amount in Hand: <span className="font-mono font-extrabold text-emerald-800">{formatINR(data.currentHandBalance)}</span>
                  </td>
                  <td colSpan={2} className="py-2.5 px-3 text-blue-900">
                    Total Amount in Account: <span className="font-mono font-extrabold text-blue-800">{formatINR(data.currentAccountBalance)}</span>
                  </td>
                  <td colSpan={3} className="py-2.5 px-3 text-[#014025]">
                    Total Combined: <span className="font-mono font-extrabold text-[#014025]">{formatINR(data.totalAvailableFunds)}</span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* New Transaction Dialog */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg relative">
            <div className="px-5 py-4 bg-[#014025] text-white font-bold text-sm flex items-center justify-between rounded-t-2xl">
              <span className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-300" />
                <span>New Petty Cash Entry</span>
              </span>
              <button
                onClick={() => setModalOpen(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2 font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0E6037]/20 focus:border-[#0E6037]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Serial / Ref No</label>
                  <input
                    type="text"
                    placeholder="e.g. PC-01"
                    value={serialNo}
                    onChange={(e) => setSerialNo(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0E6037]/20 focus:border-[#0E6037]"
                  />
                </div>
              </div>

              {isMasterAdmin && offices.length > 0 && (
                <div>
                  <CustomSelect
                    label="Office / Branch Location"
                    required
                    value={modalOfficeId}
                    onChange={(val) => setModalOfficeId(String(val))}
                    options={[
                      { value: 'head_office', label: 'Head Office (Central)' },
                      ...offices.filter((o) => !o.isHeadOffice).map((o) => ({ value: o.id, label: o.name })),
                    ]}
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Site tea and snacks for labour team"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0E6037]/20 focus:border-[#0E6037]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <CustomSelect
                    label="Transaction Type"
                    value={txType}
                    onChange={(val) => setTxType(val as any)}
                    options={[
                      { value: 'debit', label: 'Debit (Paid Out)', badge: 'Expense', badgeColor: 'red' },
                      { value: 'credit', label: 'Credit (Received In)', badge: 'Inflow', badgeColor: 'green' },
                    ]}
                  />
                </div>

                <div>
                  <CustomSelect
                    label="Channel"
                    value={channel}
                    onChange={(val) => setChannel(val as any)}
                    align="right"
                    options={[
                      { value: 'cash', label: 'Cash in Hand', sublabel: 'Physical cash' },
                      { value: 'online', label: 'Online / Account Transfer', sublabel: 'Bank / UPI' },
                    ]}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Amount (₹) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={amount || ''}
                  placeholder="0"
                  onChange={(e) => setAmount(Number(e.target.value) || 0)}
                  className="w-full border border-slate-200 rounded-xl p-2 font-mono text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0E6037]/20 focus:border-[#0E6037]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="Optional notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0E6037]/20 focus:border-[#0E6037]"
                />
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-2 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-3.5 py-2 text-xs border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateTransaction}
                disabled={isSubmitting}
                className="px-4 py-2 bg-[#014025] hover:bg-[#014025]/85 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? 'Saving...' : 'Record Transaction'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
