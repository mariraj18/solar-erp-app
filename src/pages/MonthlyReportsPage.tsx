import React, { useState, useEffect } from 'react';
import {
  Calendar,
  FileSpreadsheet,
  Download,
  Users,
  Clock,
  TrendingUp,
  Receipt,
  Layers,
  ArrowRight,
  Filter,
  Search,
  X,
  Building,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../lib/api';
import { formatINR } from '../lib/calculations';
import { formatDateDisplay } from '../lib/dateUtils';
import { useAuth } from '../context/AuthContext';
import { CustomSelect } from '../components/CustomSelect';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function MonthlyReportsPage() {
  const { user, isMasterAdmin } = useAuth();
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(10); // Default to October 2026
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [offices, setOffices] = useState<any[]>([]);
  const [selectedOffice, setSelectedOffice] = useState<string>('all');
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  useEffect(() => {
    if (isMasterAdmin) {
      api.users.list().then((uList: any[]) => {
        setOffices(uList.filter((u) => u.role === 'secondary_admin'));
      }).catch(console.error);
    }
  }, [isMasterAdmin]);

  useEffect(() => {
    loadMonthlyReport();
  }, [selectedYear, selectedMonth, selectedOffice]);

  const loadMonthlyReport = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.reports.getMonthly(selectedYear, selectedMonth, {
        secondaryAdminId: selectedOffice !== 'all' ? selectedOffice : undefined,
      });
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load monthly reports.');
    } finally {
      setIsLoading(false);
    }
  };

  const teamSummaries = data?.teamSummaries || [];
  const categoryBreakdown = data?.categoryBreakdown || [];

  const availableTeams = Array.from(
    new Map(teamSummaries.map((t: any) => [t.teamId, t.teamName])).entries()
  ).map(([id, name]) => ({ value: id, label: name as string }));

  const availableCategories = Array.from(
    new Set(teamSummaries.map((t: any) => t.workCategory).filter(Boolean))
  ) as string[];

  const filteredTeamSummaries = teamSummaries.filter((t: any) => {
    if (selectedTeam !== 'all' && t.teamId !== selectedTeam) return false;
    if (selectedCategory !== 'all' && t.workCategory !== selectedCategory) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matches =
        (t.teamName || '').toLowerCase().includes(term) ||
        (t.workCategory || '').toLowerCase().includes(term);
      if (!matches) return false;
    }
    return true;
  });

  const isFiltered =
    selectedTeam !== 'all' || selectedCategory !== 'all' || searchTerm.trim() !== '';

  const activeTotals = isFiltered
    ? filteredTeamSummaries.reduce(
        (acc, t: any) => ({
          totalLabour: acc.totalLabour + (t.labourSubtotal || 0),
          totalOvertime: acc.totalOvertime + (t.overtimeSubtotal || 0),
          totalCharges: acc.totalCharges + (t.chargesSubtotal || 0),
          gross: acc.gross + (t.grossAmount || 0),
          advances: acc.advances + (t.advancesSubtotal || 0),
          deductions: acc.deductions + (t.deductionsSubtotal || 0),
          payable: acc.payable + (t.finalPayable || 0),
        }),
        {
          totalLabour: 0,
          totalOvertime: 0,
          totalCharges: 0,
          gross: 0,
          advances: 0,
          deductions: 0,
          payable: 0,
        }
      )
    : (data?.totals || {});

  const handleExportExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    // 1. Monthly Summary Sheet
    const summaryRows = [
      ['COMPANY MONTHLY LABOUR & PAYMENT SUMMARY'],
      [`Month: ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`],
      [`Reporting Date Range: ${formatDateDisplay(data.startDate)} to ${formatDateDisplay(data.endDate)}`],
      [],
      ['Metric', 'Amount (INR)'],
      ['Total Labour Wages', activeTotals?.totalLabour || 0],
      ['Total Overtime Amount', activeTotals?.totalOvertime || 0],
      ['Total Additional Site Charges', activeTotals?.totalCharges || 0],
      ['Gross Expenditure', activeTotals?.gross || 0],
      ['Recovered Advances', activeTotals?.advances || 0],
      ['Statutory & Other Deductions', activeTotals?.deductions || 0],
      ['Net Payable Amount', activeTotals?.payable || 0],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive Summary');

    // 2. Team Breakdown Sheet
    const teamHeaders = [
      'S.No', 'Team / Contractor', 'Work Category', 'Days Worked',
      'Man-Days', 'Labour Amount', 'Overtime Amount', 'Additional Charges',
      'Gross Total', 'Deductions', 'Net Payable'
    ];
    const teamRows: any[] = [teamHeaders];
    filteredTeamSummaries.forEach((t: any, idx: number) => {
      teamRows.push([
        idx + 1,
        t.teamName,
        t.workCategory,
        t.daysCount,
        t.manDays,
        t.labourSubtotal,
        t.overtimeSubtotal,
        t.chargesSubtotal,
        t.grossAmount,
        t.deductionsSubtotal,
        t.finalPayable,
      ]);
    });
    const wsTeams = XLSX.utils.aoa_to_sheet(teamRows);
    XLSX.utils.book_append_sheet(wb, wsTeams, 'Team Wise Breakdown');

    // 3. Category Breakdown Sheet
    const catHeaders = ['S.No', 'Labour Category', 'Total Man-Days / Shifts', 'Total Expenditure (INR)'];
    const catRows: any[] = [catHeaders];
    (data.categoryBreakdown || []).forEach((c: any, idx: number) => {
      catRows.push([idx + 1, c.categoryName, c.totalCount, c.totalAmount]);
    });
    const wsCats = XLSX.utils.aoa_to_sheet(catRows);
    XLSX.utils.book_append_sheet(wb, wsCats, 'Category Breakdown');

    XLSX.writeFile(wb, `Monthly_Report_${MONTH_NAMES[selectedMonth - 1]}_${selectedYear}.xlsx`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl sm:text-2xl font-bold text-[#014025] tracking-tight">
              Monthly Consolidated Reports &amp; Analytics
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#456B5A]/15 text-[#3B5E4F] border border-[#456B5A]/30">
              Executive View
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#696969] mt-0.5">
            Full-month aggregation across all teams, categories, overtime, and financial settlements.
          </p>
        </div>

        {/* Month & Year Selectors and Export */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-2">
            <div className="w-36">
              <CustomSelect
                value={selectedMonth}
                onChange={(val) => setSelectedMonth(Number(val))}
                options={MONTH_NAMES.map((name, idx) => ({
                  value: idx + 1,
                  label: name,
                }))}
                size="sm"
                leadingIcon={<Calendar className="w-3.5 h-3.5" />}
              />
            </div>
            <div className="w-24">
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

          <button
            onClick={handleExportExcel}
            disabled={isLoading || !data}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-[#014025] hover:bg-[#014025]/90 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Date Range Badge */}
      {data && (
        <div className="flex items-center space-x-2 text-xs text-[#696969]">
          <span className="font-medium">Active Calendar Period:</span>
          <span className="font-mono text-[#014025] font-semibold bg-[#456B5A]/10 px-2.5 py-0.5 rounded-md border border-[#456B5A]/20">
            {formatDateDisplay(data.startDate)} – {formatDateDisplay(data.endDate)}
          </span>
          <span>• Approved Shifts: {data.entriesCount}</span>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="bg-white p-3.5 rounded-xl border border-[#456B5A]/20 shadow-xs space-y-3">
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

          {/* Category Filter */}
          <div>
            <CustomSelect
              value={selectedCategory}
              onChange={(val) => setSelectedCategory(val)}
              options={[
                { value: 'all', label: 'All Work Categories' },
                ...availableCategories.map((c) => ({ value: c, label: c })),
              ]}
              size="sm"
              placeholder="Filter by Category"
            />
          </div>

          {/* Search Input */}
          <div className="relative group">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search team or category..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#014025]/20 focus:border-[#014025]"
            />
          </div>
        </div>

        {/* Reset filter pill */}
        {(selectedOffice !== 'all' || selectedTeam !== 'all' || selectedCategory !== 'all' || searchTerm.trim()) && (
          <div className="flex items-center justify-between pt-1 border-t border-[#456B5A]/15 text-xs text-slate-500">
            <span>
              Showing <strong>{filteredTeamSummaries.length}</strong> of {teamSummaries.length} teams
            </span>
            <button
              onClick={() => {
                setSelectedOffice('all');
                setSelectedTeam('all');
                setSelectedCategory('all');
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-xl border border-[#456B5A]/20 shadow-xs">
          <span className="text-[11px] text-[#696969] uppercase font-semibold">Labour Wages</span>
          <div className="text-base sm:text-lg font-bold text-[#014025] font-mono mt-1">
            {formatINR(activeTotals.totalLabour || 0)}
          </div>
          <span className="text-[10px] text-[#456B5A]">Base shift rates</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#456B5A]/20 shadow-xs">
          <span className="text-[11px] text-[#696969] uppercase font-semibold">Overtime Cost</span>
          <div className="text-base sm:text-lg font-bold text-amber-700 font-mono mt-1">
            {formatINR(activeTotals.totalOvertime || 0)}
          </div>
          <span className="text-[10px] text-[#696969]">Late &amp; extra hours</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#456B5A]/20 shadow-xs">
          <span className="text-[11px] text-[#696969] uppercase font-semibold">Extra Charges</span>
          <div className="text-base sm:text-lg font-bold text-[#3B5E4F] font-mono mt-1">
            {formatINR(activeTotals.totalCharges || 0)}
          </div>
          <span className="text-[10px] text-[#696969]">Transport, tools, etc.</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#456B5A]/20 shadow-xs">
          <span className="text-[11px] text-[#696969] uppercase font-semibold">Gross Total</span>
          <div className="text-base sm:text-lg font-bold text-slate-800 font-mono mt-1">
            {formatINR(activeTotals.gross || 0)}
          </div>
          <span className="text-[10px] text-[#696969]">Total gross cost</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#456B5A]/20 shadow-xs">
          <span className="text-[11px] text-[#696969] uppercase font-semibold">Recoveries &amp; Ded.</span>
          <div className="text-base sm:text-lg font-bold text-red-600 font-mono mt-1">
            -{formatINR((activeTotals.advances || 0) + (activeTotals.deductions || 0))}
          </div>
          <span className="text-[10px] text-[#696969]">Advances + penalties</span>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-[#456B5A]/15 p-4 rounded-xl border border-[#456B5A]/30 shadow-xs">
          <span className="text-[11px] text-[#014025] uppercase font-bold">Net Monthly Payable</span>
          <div className="text-base sm:text-lg font-bold text-[#014025] font-mono mt-1">
            {formatINR(activeTotals.payable || 0)}
          </div>
          <span className="text-[10px] text-[#456B5A] font-medium">Final disbursement</span>
        </div>
      </div>

      {/* Main Content: Team-Wise Breakdown & Category Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Team Breakdown Table (2 Columns) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-[#456B5A]/20 shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#456B5A]/15 pb-3">
            <div>
              <h2 className="text-sm font-bold text-[#014025]">Team &amp; Contractor Monthly Summary</h2>
              <p className="text-[11px] text-[#696969]">Consolidated monthly progress and net disbursements</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#456B5A]/10 text-[#3B5E4F]">
              {filteredTeamSummaries.length} Teams
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#456B5A]/10 text-[#014025] font-semibold text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Team / Contractor</th>
                  <th className="py-2.5 px-3 text-center">Days</th>
                  <th className="py-2.5 px-3 text-center">Man-Days</th>
                  <th className="py-2.5 px-3 text-right">Labour</th>
                  <th className="py-2.5 px-3 text-right">OT</th>
                  <th className="py-2.5 px-3 text-right">Charges</th>
                  <th className="py-2.5 px-3 text-right">Gross Total</th>
                  <th className="py-2.5 px-3 text-right text-emerald-800">Net Payable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#456B5A]/15">
                {filteredTeamSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-[#696969] text-xs">
                      No matching approved attendance records for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}.
                    </td>
                  </tr>
                ) : (
                  filteredTeamSummaries.map((t: any) => (
                    <tr key={t.teamId} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-[#014025]">{t.teamName}</div>
                        <div className="text-[10px] text-[#696969]">{t.workCategory}</div>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono">{t.daysCount}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-medium">{t.manDays}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{formatINR(t.labourSubtotal)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-700">{formatINR(t.overtimeSubtotal)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-[#3B5E4F]">{formatINR(t.chargesSubtotal)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-medium">{formatINR(t.grossAmount)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800">
                        {formatINR(t.finalPayable)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Category Breakdown (1 Column) */}
        <div className="bg-white rounded-xl border border-[#456B5A]/20 shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#456B5A]/15 pb-3">
            <div>
              <h2 className="text-sm font-bold text-[#014025]">Labour Category Utilization</h2>
              <p className="text-[11px] text-[#696969]">Workforce distribution for {MONTH_NAMES[selectedMonth - 1]}</p>
            </div>
            <Layers className="w-4 h-4 text-[#456B5A]" />
          </div>

          <div className="space-y-3">
            {categoryBreakdown.length === 0 ? (
              <p className="py-8 text-center text-[#696969] text-xs">No category data recorded.</p>
            ) : (
              categoryBreakdown.map((cat: any) => {
                const percent = activeTotals.totalLabour > 0 ? ((cat.totalAmount / activeTotals.totalLabour) * 100).toFixed(1) : 0;
                return (
                  <div key={cat.categoryId} className="p-3 rounded-lg bg-slate-50 border border-[#456B5A]/15 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#014025]">{cat.categoryName}</span>
                      <span className="font-mono font-bold text-[#014025]">{formatINR(cat.totalAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[#696969]">
                      <span>{cat.totalCount} Shifts / Man-Days</span>
                      <span className="font-semibold text-[#456B5A]">{percent}% of wages</span>
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[#456B5A] h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(5, Number(percent)))}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}