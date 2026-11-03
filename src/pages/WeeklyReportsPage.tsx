import React, { useState, useEffect, useCallback } from 'react';
import {
  FileSpreadsheet,
  FileDown,
  Printer,
  ChevronRight,
  ChevronDown,
  Building,
  ReceiptIndianRupee,
  BadgePercent,
  TrendingUp,
  Wallet,
  Banknote,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatINR, round2 } from '../lib/calculations';
import { getWeekBounds, getTodayKolkataISO, formatDateDisplay } from '../lib/dateUtils';
import { WeekNavigator } from '../components/WeekNavigator';
import { exportWeeklyReportPDF, exportWeeklyReportExcel } from '../lib/exportUtils';
import { useAuth } from '../context/AuthContext';
import { CreditCard, CheckCircle2, Clock, Search, X, Filter } from 'lucide-react';
import { CustomSelect } from '../components/CustomSelect';

const EMPTY_TOTALS = {
  labour: 0,
  overtime: 0,
  additionalCharges: 0,
  gross: 0,
  credits: 0,
  deductions: 0,
  advancesApplied: 0,
  finalPayable: 0,
};

export function WeeklyReportsPage() {
  // Safe initial week start with fallback to today's ISO date
  const [currentWeekStart, setCurrentWeekStart] = useState<string>(() => {
    try {
      const today = getTodayKolkataISO();
      const bounds = getWeekBounds(today);
      return bounds?.startDate || today;
    } catch (e) {
      console.error('Failed to compute week bounds:', e);
      return getTodayKolkataISO();
    }
  });

  const { user, isMasterAdmin, isAdminAny } = useAuth();
  const [reportData, setReportData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>({});

  // Filter states
  const [offices, setOffices] = useState<any[]>([]);
  const [selectedOffice, setSelectedOffice] = useState<string>('all');
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  useEffect(() => {
    if (isMasterAdmin) {
      api.users.list().then((uList: any[]) => {
        setOffices(uList.filter((u) => u.role === 'secondary_admin'));
      }).catch(console.error);
    }
  }, [isMasterAdmin]);

  // Payment Settlement Dialog State
  const [markPaidModalOpen, setMarkPaidModalOpen] = useState(false);
  const [paymentTeam, setPaymentTeam] = useState<any | null>(null);
  const [amountPaidInput, setAmountPaidInput] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState(getTodayKolkataISO());
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
  const [voucherRef, setVoucherRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  const bounds = (() => {
    try {
      return getWeekBounds(currentWeekStart);
    } catch (e) {
      console.error('Failed to compute bounds for', currentWeekStart, e);
      return { displayRange: '—', startDate: currentWeekStart, endDate: currentWeekStart };
    }
  })();

  const loadReport = useCallback(async (signal?: AbortSignal) => {
    // Guard: don't fire request with invalid week start
    if (!currentWeekStart || currentWeekStart.length < 8) {
      setError('Invalid week start date. Please navigate to a valid week.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await api.reports.getWeekly(currentWeekStart, {
        secondaryAdminId: selectedOffice !== 'all' ? selectedOffice : undefined,
        signal,
      });

      // Defensive: normalize shape so downstream rendering never crashes
      const normalized = {
        teamSummaries: Array.isArray(data?.teamSummaries) ? data.teamSummaries : [],
        supplierBills: Array.isArray(data?.supplierBills) ? data.supplierBills : [],
        grandTotals: { ...EMPTY_TOTALS, ...(data?.grandTotals || {}) },
      };
      setReportData(normalized);
    } catch (err: any) {
      // Ignore aborted requests (user switched weeks quickly)
      if (err?.name === 'AbortError') return;
      const message =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to generate weekly report';
      setError(message);
      setReportData(null);
    } finally {
      setLoading(false);
    }
  }, [currentWeekStart, selectedOffice]);

  useEffect(() => {
    const controller = new AbortController();
    loadReport(controller.signal);
    return () => controller.abort();
  }, [loadReport]);

  const toggleTeam = (teamId: string) => {
    setExpandedTeams((prev) => ({ ...prev, [teamId]: !prev[teamId] }));
  };

  const handlePrint = () => window.print();

  const handleRetry = () => loadReport();

  const teamSummaries = reportData?.teamSummaries || [];
  const supplierBills = reportData?.supplierBills || [];

  // Filter team summaries based on selected filters
  const filteredTeamSummaries = teamSummaries.filter((team: any) => {
    if (selectedTeam !== 'all' && team.teamId !== selectedTeam) return false;
    if (paymentStatusFilter !== 'all') {
      const status = team.paymentRecord?.status || 'Pending';
      if (paymentStatusFilter === 'Paid' && status !== 'Paid') return false;
      if (paymentStatusFilter === 'Pending' && status !== 'Pending' && status !== 'Not Paid') return false;
      if (paymentStatusFilter === 'Partially Paid' && status !== 'Partially Paid') return false;
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matches =
        (team.teamName || '').toLowerCase().includes(term) ||
        (team.workCategory || '').toLowerCase().includes(term);
      if (!matches) return false;
    }
    return true;
  });

  const availableTeams = Array.from(
    new Map(teamSummaries.map((t: any) => [t.teamId, t.teamName])).entries()
  ).map(([id, name]) => ({ value: id, label: name as string }));

  const isFiltered =
    selectedTeam !== 'all' || paymentStatusFilter !== 'all' || searchTerm.trim() !== '';

  const activeTotals = isFiltered
    ? filteredTeamSummaries.reduce(
        (acc, t: any) => ({
          labour: acc.labour + (t.labourSubtotal || 0),
          overtime: acc.overtime + (t.overtimeSubtotal || 0),
          additionalCharges: acc.additionalCharges + (t.additionalChargesSubtotal || 0),
          gross: acc.gross + (t.grossAmount || 0),
          credits: acc.credits + (t.creditsSubtotal || 0),
          deductions: acc.deductions + (t.deductionsSubtotal || 0),
          advancesApplied: acc.advancesApplied + (t.advancesAppliedSubtotal || 0),
          finalPayable: acc.finalPayable + (t.finalPayable || 0),
        }),
        { ...EMPTY_TOTALS }
      )
    : (reportData?.grandTotals || EMPTY_TOTALS);

  const handleExportPDF = () => {
    if (!reportData) return;
    exportWeeklyReportPDF({
      companyName: 'Lumia Infrastructure & Construction Ltd.',
      weekRangeDisplay: bounds.displayRange,
      startDate: bounds.startDate,
      endDate: bounds.endDate,
      teamSummaries: filteredTeamSummaries,
      supplierBills: reportData.supplierBills || [],
      grandTotals: activeTotals,
    });
  };

  const handleExportExcel = () => {
    if (!reportData) return;
    exportWeeklyReportExcel({
      companyName: 'Lumia Infrastructure & Construction Ltd.',
      weekRangeDisplay: bounds.displayRange,
      startDate: bounds.startDate,
      endDate: bounds.endDate,
      teamSummaries: filteredTeamSummaries,
      supplierBills: reportData.supplierBills || [],
      grandTotals: activeTotals,
    });
  };

  const summaryStats = [
    {
      label: 'Gross Total',
      value: formatINR(activeTotals.gross),
      icon: TrendingUp,
      accent: 'text-[#014025]',
      bg: 'bg-[#014025]/10',
    },
    {
      label: 'Total Deductions',
      value: `-${formatINR(activeTotals.deductions)}`,
      icon: BadgePercent,
      accent: 'text-[#696969]',
      bg: 'bg-[#696969]/10',
    },
    {
      label: 'Advances Applied',
      value: `-${formatINR(activeTotals.advancesApplied)}`,
      icon: Wallet,
      accent: 'text-[#696969]',
      bg: 'bg-[#696969]/10',
    },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300 animate-slide-in">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-[#456B5A]/10 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-[#456B5A]" />
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-[#014025] tracking-tight">
              Weekly Reports &amp; Payment Summary
            </h1>
          </div>
          <p className="text-xs text-[#696969] mt-1.5 ml-10">
            Official reporting period: {bounds.displayRange} (Saturday through Friday)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <WeekNavigator
            currentWeekStart={currentWeekStart}
            onWeekChange={(newWeek) => setCurrentWeekStart(newWeek)}
          />

          <button
            onClick={handleExportPDF}
            disabled={!reportData}
            className="group flex items-center space-x-1.5 px-3 py-2 bg-[#014025] hover:bg-[#013520] text-white rounded-lg text-xs font-semibold shadow-sm hover:shadow-md transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileDown className="w-4 h-4" />
            <span>Export PDF</span>
          </button>

          <button
            onClick={handleExportExcel}
            disabled={!reportData}
            className="flex items-center space-x-1.5 px-3 py-2 bg-[#456B5A] hover:bg-[#3a5a4d] text-white rounded-lg text-xs font-semibold shadow-sm hover:shadow-md transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Excel</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center space-x-1 px-2.5 py-2 border border-gray-200 text-[#014025] hover:bg-[#456B5A]/5 hover:border-[#456B5A]/30 rounded-lg text-xs font-medium transition-colors"
          >
            <Printer className="w-4 h-4 text-[#456B5A]" />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* Loading / Error states */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 flex flex-col items-center justify-center space-y-3 shadow-sm">
          <div className="w-8 h-8 border-2 border-[#456B5A]/20 border-t-[#456B5A] rounded-full animate-spin" />
          <p className="text-xs text-[#696969]">Generating weekly report...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 shadow-sm animate-slide-in">
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
              <AlertCircle className="w-4 h-4 text-red-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">Could not load weekly report</p>
              <p className="text-xs text-red-700 mt-1 break-words">{error}</p>
              <p className="text-[11px] text-red-500 mt-2">
                Week: {currentWeekStart} · Range: {bounds.displayRange}
              </p>
              <button
                onClick={handleRetry}
                className="mt-3 inline-flex items-center space-x-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Pending Approval Warning Banner */}
          {Boolean(reportData?.pendingSubmissionsCount > 0) && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between text-xs text-amber-900 shadow-xs">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>{reportData.pendingSubmissionsCount} attendance entry/entries</strong> for this week are awaiting approval and are excluded from the approved weekly payable totals.
                </span>
              </div>
            </div>
          )}

          {/* Filters Toolbar */}
          <div className="bg-white p-3.5 rounded-xl border border-gray-100 shadow-sm space-y-3">
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${isMasterAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-2.5`}>
              {/* Office Filter for Master Admin */}
              {isMasterAdmin && (
                <div>
                  <CustomSelect
                    value={selectedOffice}
                    onChange={(val) => setSelectedOffice(val)}
                    options={[
                      { value: 'all', label: 'All Offices / Admins' },
                      ...offices.map((o) => ({
                        value: o.id,
                        label: `${o.full_name} (${o.assigned_location || 'Office'})`,
                      })),
                    ]}
                    size="sm"
                    placeholder="Filter by Office"
                    leadingIcon={<Building className="w-3.5 h-3.5" />}
                  />
                </div>
              )}

              {/* Team Filter */}
              <div>
                <CustomSelect
                  value={selectedTeam}
                  onChange={(val) => setSelectedTeam(val)}
                  options={[
                    { value: 'all', label: 'All Teams' },
                    ...availableTeams,
                  ]}
                  size="sm"
                  placeholder="Filter by Team"
                />
              </div>

              {/* Payment Status Filter */}
              <div>
                <CustomSelect
                  value={paymentStatusFilter}
                  onChange={(val) => setPaymentStatusFilter(val)}
                  options={[
                    { value: 'all', label: 'All Payment Statuses' },
                    { value: 'Paid', label: 'Paid in Full' },
                    { value: 'Partially Paid', label: 'Partially Paid' },
                    { value: 'Pending', label: 'Pending / Unpaid' },
                  ]}
                  size="sm"
                  placeholder="Filter by Payment Status"
                />
              </div>

              {/* Search Input */}
              <div className="relative group">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search team or scope..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#014025]/20 focus:border-[#014025]"
                />
              </div>
            </div>

            {/* Reset filter pill */}
            {(selectedOffice !== 'all' || selectedTeam !== 'all' || paymentStatusFilter !== 'all' || searchTerm.trim()) && (
              <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-xs text-slate-500">
                <span>
                  Showing <strong>{filteredTeamSummaries.length}</strong> of {teamSummaries.length} teams
                </span>
                <button
                  onClick={() => {
                    setSelectedOffice('all');
                    setSelectedTeam('all');
                    setPaymentStatusFilter('all');
                    setSearchTerm('');
                  }}
                  className="text-xs text-[#014025] hover:text-[#013520] font-semibold flex items-center space-x-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Reset Filters</span>
                </button>
              </div>
            )}
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {summaryStats.map((stat, idx) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 animate-slide-in"
                  style={{ animationDelay: `${0.05 * (idx + 1)}s` }}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-semibold text-[#696969] uppercase tracking-wide">
                      {stat.label}
                    </div>
                    <div className={`w-7 h-7 rounded-lg ${stat.bg} flex items-center justify-center`}>
                      <Icon className={`w-3.5 h-3.5 ${stat.accent}`} />
                    </div>
                  </div>
                  <div className={`text-base sm:text-lg font-bold font-mono ${stat.accent} mt-2`}>
                    {stat.value}
                  </div>
                </div>
              );
            })}

            <div
              className="relative overflow-hidden bg-gradient-to-br from-[#014025] to-[#456B5A] p-4 rounded-xl text-white shadow-md animate-slide-in"
              style={{ animationDelay: '0.2s' }}
            >
              <div className="absolute inset-0 opacity-10">
                <div className="absolute -top-8 -right-8 w-24 h-24 bg-white rounded-full blur-2xl" />
              </div>
              <div className="relative">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold text-white/70 uppercase tracking-wide">
                    Final Net Payable
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center">
                    <Banknote className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>
                <div className="text-lg sm:text-xl font-bold font-mono text-white mt-2">
                  {formatINR(activeTotals.finalPayable)}
                </div>
                <div className="text-[10px] text-white/60 mt-1">Reconciled week total</div>
              </div>
            </div>
          </div>

          {/* SECTION 1 */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm animate-slide-in" style={{ animationDelay: '0.25s' }}>
            <div className="px-4 py-3.5 bg-[#014025] text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="w-4 h-4 text-white/80" />
                <h2 className="font-bold text-xs sm:text-sm tracking-tight uppercase">
                  1. Consolidated Weekly Payment Summary
                </h2>
              </div>
              <span className="text-xs text-white/60 font-mono">All Amounts in INR (₹)</span>
            </div>

            {filteredTeamSummaries.length === 0 && supplierBills.length === 0 ? (
              <div className="p-12 text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#456B5A]/10 mb-3">
                  <FileSpreadsheet className="w-6 h-6 text-[#456B5A]" />
                </div>
                <p className="text-sm font-semibold text-[#014025]">No active attendance or bills recorded</p>
                <p className="text-xs text-[#696969] mt-1">
                  Entries will appear here once attendance or bills are recorded for this week.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#456B5A]/5 text-[#014025] border-b border-gray-100 font-bold">
                      <th className="py-3 px-3 w-12 text-center font-semibold">S.No</th>
                      <th className="py-3 px-3 font-semibold">Team / Contractor Name</th>
                      <th className="py-3 px-3 font-semibold">Category</th>
                      <th className="py-3 px-3 text-right font-semibold">Labour (₹)</th>
                      <th className="py-3 px-3 text-right font-semibold">Overtime (₹)</th>
                      <th className="py-3 px-3 text-right font-semibold">Extra Charges (₹)</th>
                      <th className="py-3 px-3 text-right font-semibold">Gross Total (₹)</th>
                      <th className="py-3 px-3 text-right font-semibold">Deductions (₹)</th>
                      <th className="py-3 px-3 text-right font-semibold">Advances (₹)</th>
                      <th className="py-3 px-3 text-right font-semibold">Final Payable (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 font-mono text-[11px] sm:text-xs">
                    {filteredTeamSummaries.map((team: any, idx: number) => (
                      <tr key={team.teamId || idx} className="hover:bg-[#456B5A]/5 transition-colors duration-150">
                        <td className="py-3 px-3 text-center text-[#696969] font-sans">{idx + 1}</td>
                        <td className="py-3 px-3 font-sans font-semibold text-[#014025]">{team.teamName}</td>
                        <td className="py-3 px-3 font-sans text-[#696969]">{team.workCategory}</td>
                        <td className="py-3 px-3 text-right text-[#696969]">{formatINR(team.labourSubtotal || 0)}</td>
                        <td className="py-3 px-3 text-right text-[#696969]">{formatINR(team.overtimeSubtotal || 0)}</td>
                        <td className="py-3 px-3 text-right text-[#696969]">{formatINR(team.additionalChargesSubtotal || 0)}</td>
                        <td className="py-3 px-3 text-right font-bold text-[#014025]">{formatINR(team.grossAmount || 0)}</td>
                        <td className="py-3 px-3 text-right text-[#696969]">
                          {(team.deductionsSubtotal || 0) > 0 ? `-${formatINR(team.deductionsSubtotal)}` : '₹0.00'}
                        </td>
                        <td className="py-3 px-3 text-right text-[#696969]">
                          {(team.advancesAppliedSubtotal || 0) > 0 ? `-${formatINR(team.advancesAppliedSubtotal)}` : '₹0.00'}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-[#456B5A] bg-[#456B5A]/5">
                          {formatINR(team.finalPayable || 0)}
                        </td>
                      </tr>
                    ))}

                    {supplierBills.map((bill: any, bIdx: number) => (
                      <tr key={bill.id || `bill-${bIdx}`} className="bg-[#696969]/5 hover:bg-[#696969]/10 transition-colors duration-150">
                        <td className="py-3 px-3 text-center text-[#696969] font-sans">
                          {filteredTeamSummaries.length + bIdx + 1}
                        </td>
                        <td className="py-3 px-3 font-sans font-semibold text-[#014025]">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-md bg-[#456B5A]/10 text-[#456B5A]">
                              Supplier Bill
                            </span>
                            <span>{bill.supplier_name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 font-sans text-[#696969]">{bill.work_description}</td>
                        <td className="py-3 px-3 text-right text-[#696969]/50">—</td>
                        <td className="py-3 px-3 text-right text-[#696969]/50">—</td>
                        <td className="py-3 px-3 text-right text-[#696969]/50">—</td>
                        <td className="py-3 px-3 text-right font-bold text-[#014025]">{formatINR(bill.gross_amount || 0)}</td>
                        <td className="py-3 px-3 text-right text-[#696969]">₹0.00</td>
                        <td className="py-3 px-3 text-right text-[#696969]">-{formatINR(bill.advance_paid || 0)}</td>
                        <td className="py-3 px-3 text-right font-bold text-[#456B5A] bg-[#456B5A]/5">
                          {formatINR(bill.net_payable || 0)}
                        </td>
                      </tr>
                    ))}

                    <tr className="bg-[#014025] text-white font-bold text-xs">
                      <td colSpan={3} className="py-3.5 px-3 uppercase tracking-wider font-sans text-white/80">
                        Grand Total (Reconciled)
                      </td>
                      <td className="py-3.5 px-3 text-right">{formatINR(activeTotals.labour)}</td>
                      <td className="py-3.5 px-3 text-right">{formatINR(activeTotals.overtime)}</td>
                      <td className="py-3.5 px-3 text-right">{formatINR(activeTotals.additionalCharges)}</td>
                      <td className="py-3.5 px-3 text-right text-white">{formatINR(activeTotals.gross)}</td>
                      <td className="py-3.5 px-3 text-right text-white/70">
                        {activeTotals.deductions > 0 ? `-${formatINR(activeTotals.deductions)}` : '₹0.00'}
                      </td>
                      <td className="py-3.5 px-3 text-right text-white/70">
                        {activeTotals.advancesApplied > 0 ? `-${formatINR(activeTotals.advancesApplied)}` : '₹0.00'}
                      </td>
                      <td className="py-3.5 px-3 text-right text-sm bg-[#456B5A]">
                        {formatINR(activeTotals.finalPayable)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* SECTION 2 */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2 animate-slide-in" style={{ animationDelay: '0.3s' }}>
              <div className="w-7 h-7 rounded-lg bg-[#456B5A]/10 flex items-center justify-center">
                <Building className="w-4 h-4 text-[#456B5A]" />
              </div>
              <h2 className="font-bold text-sm sm:text-base text-[#014025] tracking-tight">
                2. Team-Wise Attendance &amp; Expense Breakdown
              </h2>
            </div>

            {filteredTeamSummaries.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm">
                <p className="text-xs text-[#696969]">No team breakdowns available for this week.</p>
              </div>
            ) : (
              filteredTeamSummaries.map((team: any, teamIdx: number) => {
                const isExpanded = expandedTeams[team.teamId] !== false;

                return (
                  <div
                    key={team.teamId || teamIdx}
                    className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 animate-slide-in"
                    style={{ animationDelay: `${0.35 + 0.04 * teamIdx}s` }}
                  >
                    <div
                      className="p-4 bg-[#014025] text-white flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none hover:bg-[#013520] transition-colors"
                      onClick={() => toggleTeam(team.teamId)}
                    >
                      <div className="flex items-center space-x-2.5">
                        <button className="text-white/70 hover:text-white transition-colors">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        <span className="font-bold text-sm">{team.teamName}</span>
                        <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md bg-white/10 text-white/80">
                          {team.workCategory}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                        <span className="text-white/70">Labour: {formatINR(team.labourSubtotal || 0)}</span>
                        {team.overtimeSubtotal > 0 && (
                          <span className="text-white/70">OT: {formatINR(team.overtimeSubtotal)}</span>
                        )}
                        {team.additionalChargesSubtotal > 0 && (
                          <span className="text-white/70">Charges: {formatINR(team.additionalChargesSubtotal)}</span>
                        )}
                        <span className="font-bold text-white bg-white/15 px-2 py-0.5 rounded-md text-sm">
                          Payable: {formatINR(team.finalPayable || 0)}
                        </span>

                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-sans ${
                            team.paymentStatus === 'Paid'
                              ? 'bg-emerald-200 text-emerald-950'
                              : team.paymentStatus === 'Partially Paid'
                              ? 'bg-blue-200 text-blue-950'
                              : 'bg-amber-200 text-amber-950'
                          }`}
                        >
                          Payment: {team.paymentStatus || 'Pending'}
                        </span>

                        {isAdminAny && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPaymentTeam(team);
                              const balance = round2((team.finalPayable || 0) - (team.amountPaid || 0));
                              setAmountPaidInput(balance > 0 ? balance : team.finalPayable || 0);
                              setPaymentDate(getTodayKolkataISO());
                              setPaymentMethod('Bank Transfer');
                              setVoucherRef(team.paymentRecord?.voucher_ref || '');
                              setPaymentNotes(team.paymentRecord?.notes || '');
                              setMarkPaidModalOpen(true);
                            }}
                            className="px-2.5 py-1 bg-white/20 hover:bg-white text-white hover:text-[#014025] rounded text-xs font-sans font-semibold transition-colors"
                          >
                            Mark as Paid
                          </button>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-4 space-y-4 bg-[#456B5A]/3">
                        <div className="overflow-x-auto border border-gray-100 rounded-lg bg-white">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-[#456B5A]/5 text-[#014025] font-semibold border-b border-gray-100">
                                <th className="py-2.5 px-3">Date (DD/MM/YYYY)</th>
                                <th className="py-2.5 px-3">Shift</th>
                                <th className="py-2.5 px-3">Timing</th>
                                <th className="py-2.5 px-3">Labour Category Breakdown</th>
                                <th className="py-2.5 px-3 text-right">OT Amount</th>
                                <th className="py-2.5 px-3 text-right">Day Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 font-mono text-[11px]">
                              {(team.entries || []).map((entry: any, eIdx: number) => {
                                const dayLabour = (entry.lines || []).reduce(
                                  (acc: number, l: any) => acc + (l.final_amount || 0),
                                  0
                                );
                                const dayTotal = round2(dayLabour + (entry.overtime_amount || 0));

                                return (
                                  <tr key={entry.id || eIdx} className="hover:bg-[#456B5A]/5 transition-colors">
                                    <td className="py-2.5 px-3 font-sans font-semibold text-[#014025]">
                                      {formatDateDisplay(entry.date)}
                                    </td>
                                    <td className="py-2.5 px-3 font-sans text-[#696969]">{entry.shift_batch}</td>
                                    <td className="py-2.5 px-3 text-[#696969]">
                                      {entry.in_time && entry.out_time
                                        ? `${entry.in_time}–${entry.out_time}`
                                        : 'Regular'}
                                    </td>
                                    <td className="py-2.5 px-3 font-sans">
                                      <div className="space-y-1">
                                        {(entry.lines || []).map((line: any, idx: number) => (
                                          <div key={idx} className="flex items-center space-x-2">
                                            <span className="font-semibold text-[#014025]">{line.category_name}:</span>
                                            <span className="font-mono text-[#696969]">
                                              {line.count} @ ₹{line.rate}
                                            </span>
                                            <span className="text-gray-300">=</span>
                                            <span className="font-mono font-bold text-[#014025]">
                                              {formatINR(line.final_amount || 0)}
                                            </span>
                                            {line.is_overridden && (
                                              <span className="text-[9px] text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                                Override
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-3 text-right text-[#696969]">
                                      {entry.overtime_amount > 0 ? formatINR(entry.overtime_amount) : '—'}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-bold text-[#014025]">
                                      {formatINR(dayTotal)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {team.charges && team.charges.length > 0 && (
                          <div className="border border-[#456B5A]/15 rounded-lg p-3 bg-[#456B5A]/5">
                            <div className="font-semibold text-xs text-[#014025] mb-2 flex items-center space-x-1.5">
                              <ReceiptIndianRupee className="w-3.5 h-3.5 text-[#456B5A]" />
                              <span>Additional Charges &amp; Expenses:</span>
                            </div>
                            <div className="divide-y divide-[#456B5A]/10 text-xs">
                              {team.charges.map((chg: any, cIdx: number) => (
                                <div key={chg.id || cIdx} className="py-2 flex justify-between items-center">
                                  <div>
                                    <span className="font-semibold text-[#014025]">{chg.category}:</span>{' '}
                                    <span className="text-[#696969]">{chg.description}</span>{' '}
                                    {chg.quantity && (
                                      <span className="text-[#696969] font-mono">
                                        ({chg.quantity} {chg.unit || ''} @ ₹{chg.rate})
                                      </span>
                                    )}
                                  </div>
                                  <div className="font-mono font-bold text-[#014025]">
                                    {formatINR(chg.final_amount || 0)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {team.adjustments && team.adjustments.length > 0 && (
                          <div className="border border-amber-200 rounded-lg p-3 bg-amber-50/50">
                            <div className="font-semibold text-xs text-[#014025] mb-2 flex items-center space-x-1.5">
                              <BadgePercent className="w-3.5 h-3.5 text-amber-700" />
                              <span>Financial Adjustments (Advances &amp; Deductions):</span>
                            </div>
                            <div className="divide-y divide-amber-200/50 text-xs">
                              {team.adjustments.map((adj: any, aIdx: number) => (
                                <div key={adj.id || aIdx} className="py-2 flex justify-between items-center">
                                  <div>
                                    <span className="font-semibold text-amber-900 capitalize">
                                      {String(adj.adjustment_type || '').replace('_', ' ')}:
                                    </span>{' '}
                                    <span className="text-[#696969]">{adj.description}</span>
                                    {adj.rate_percentage && (
                                      <span className="text-[#696969] font-mono">
                                        {' '}({adj.rate_percentage}% of ₹{adj.base_amount})
                                      </span>
                                    )}
                                  </div>
                                  <div className="font-mono font-bold text-amber-800">
                                    -{formatINR(adj.amount || 0)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Mark as Paid Modal */}
      {markPaidModalOpen && paymentTeam && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-[#696969]/20 w-full max-w-lg overflow-hidden">
            <div className="px-5 py-3.5 bg-[#014025] text-white font-bold text-sm flex items-center justify-between">
              <span>Weekly Payment Settlement</span>
              <button onClick={() => setMarkPaidModalOpen(false)} className="text-white/70 hover:text-white">
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="bg-[#696969]/5 p-3 rounded-lg space-y-1">
                <div className="text-xs text-[#014025] font-semibold">{paymentTeam.teamName}</div>
                <div className="text-[11px] text-[#696969]">Category: {paymentTeam.workCategory}</div>
                <div className="flex items-center justify-between pt-1 border-t border-[#696969]/15">
                  <span className="text-[#696969]">Approved Net Payable:</span>
                  <span className="font-mono font-bold text-[#014025]">{formatINR(paymentTeam.finalPayable)}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#014025] mb-1">
                    Amount Paid (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    disabled={isSubmittingPayment}
                    value={amountPaidInput}
                    onChange={(e) => setAmountPaidInput(Number(e.target.value) || 0)}
                    className="w-full border border-[#696969]/30 rounded-md px-3 py-1.5 font-mono text-sm font-bold text-[#014025]"
                  />
                  <div className="text-[10px] text-[#696969] mt-0.5">
                    Remaining balance: <span className="font-mono font-semibold">{formatINR(round2(paymentTeam.finalPayable - amountPaidInput))}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#014025] mb-1">Payment Date</label>
                  <input
                    type="date"
                    disabled={isSubmittingPayment}
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full border border-[#696969]/30 rounded-md px-3 py-1.5 font-mono text-xs text-[#014025]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <CustomSelect
                    label="Payment Method"
                    disabled={isSubmittingPayment}
                    value={paymentMethod}
                    onChange={(val) => setPaymentMethod(String(val))}
                    options={[
                      { value: 'Bank Transfer', label: 'Bank Transfer (NEFT/RTGS)', badge: 'Digital', badgeColor: 'blue' },
                      { value: 'UPI', label: 'UPI / GPay / PhonePe', badge: 'Instant', badgeColor: 'green' },
                      { value: 'Cash', label: 'Cash in Hand', badge: 'Cash', badgeColor: 'amber' },
                      { value: 'Cheque', label: 'Cheque', badge: 'Bank', badgeColor: 'slate' },
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#014025] mb-1">Voucher / UTR Reference</label>
                  <input
                    type="text"
                    disabled={isSubmittingPayment}
                    placeholder="e.g. UTR-20261028-0912 or Chq #4401"
                    value={voucherRef}
                    onChange={(e) => setVoucherRef(e.target.value)}
                    className="w-full border border-[#696969]/30 rounded-md px-3 py-1.5 text-xs text-[#014025]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#014025] mb-1">Payment Notes</label>
                <input
                  type="text"
                  disabled={isSubmittingPayment}
                  placeholder="e.g. Settled via Lumia account"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full border border-[#696969]/30 rounded-md px-3 py-1.5 text-xs text-[#014025]"
                />
              </div>
            </div>

            <div className="px-5 py-3 bg-[#696969]/5 border-t border-[#696969]/15 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setMarkPaidModalOpen(false)}
                className="px-3 py-1.5 text-xs border border-[#696969]/30 rounded-md text-[#696969] hover:bg-[#696969]/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (amountPaidInput <= 0) {
                    alert('Please enter an amount paid.');
                    return;
                  }
                  setIsSubmittingPayment(true);
                  try {
                    await api.payments.markPaid({
                      weekStartDate: currentWeekStart,
                      teamId: paymentTeam.teamId,
                      staffUserId: paymentTeam.entries?.[0]?.owner_user_id || user?.id,
                      grossAmount: paymentTeam.grossAmount,
                      chargesAmount: paymentTeam.additionalChargesSubtotal,
                      deductionsAmount: paymentTeam.deductionsSubtotal,
                      netPayable: paymentTeam.finalPayable,
                      amountPaid: amountPaidInput,
                      paymentDate,
                      paymentMethod,
                      voucherRef,
                      notes: paymentNotes,
                    });
                    setMarkPaidModalOpen(false);
                    loadReport();
                  } catch (err: any) {
                    alert(err.message || 'Payment recording failed.');
                  } finally {
                    setIsSubmittingPayment(false);
                  }
                }}
                disabled={isSubmittingPayment}
                className="px-4 py-1.5 bg-[#014025] hover:bg-[#014025]/85 text-white rounded-md text-xs font-semibold shadow-xs disabled:opacity-50"
              >
                {isSubmittingPayment ? 'Recording...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slide-in {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fade-in 0.5s ease forwards; }
        .animate-slide-in { opacity: 0; animation: slide-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>
    </div>
  );
}