import React, { useState, useEffect } from 'react';
import {
  FileText,
  CalendarCheck2,
  Calendar,
  ReceiptIndianRupee,
  RefreshCw,
  AlertCircle,
  Building,
  CheckCircle2,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatINR, round2 } from '../lib/calculations';
import { formatDateDisplay, getTodayKolkataISO, getWeekBounds } from '../lib/dateUtils';
import { useAuth } from '../context/AuthContext';
import { WeekNavigator } from '../components/WeekNavigator';

export function MyReportsPage() {
  const { user } = useAuth();
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = getTodayKolkataISO();
    return getWeekBounds(today).startDate;
  });

  const [weeklyData, setWeeklyData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMyReport = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.reports.getWeekly(currentWeekStart, user?.id);
      setWeeklyData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load your personal weekly report.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMyReport();
  }, [currentWeekStart]);

  const bounds = getWeekBounds(currentWeekStart);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#696969]/20 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#014025] tracking-tight">
            My Operational Attendance &amp; Reports
          </h1>
          <p className="text-xs sm:text-sm text-[#696969] mt-0.5">
            Private workspace report for <span className="text-[#014025] font-semibold">{user?.fullName}</span>
          </p>
        </div>

        <WeekNavigator currentWeekStart={currentWeekStart} onWeekChange={setCurrentWeekStart} />
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards */}
      {weeklyData && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs">
            <div className="text-xs text-[#696969] font-medium">Approved Labour Total</div>
            <div className="text-xl font-bold font-mono text-[#014025] mt-1">
              {formatINR(weeklyData.grandTotals?.labour || 0)}
            </div>
            <div className="text-[11px] text-[#696969] mt-0.5">Count-based labour</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs">
            <div className="text-xs text-[#696969] font-medium">Additional Charges</div>
            <div className="text-xl font-bold font-mono text-[#014025] mt-1">
              {formatINR(weeklyData.grandTotals?.additionalCharges || 0)}
            </div>
            <div className="text-[11px] text-[#696969] mt-0.5">Transport, food, materials</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs">
            <div className="text-xs text-[#696969] font-medium">Approved Net Payable</div>
            <div className="text-xl font-bold font-mono text-emerald-700 mt-1">
              {formatINR(weeklyData.grandTotals?.finalPayable || 0)}
            </div>
            <div className="text-[11px] text-emerald-600 mt-0.5">Approved disbursements</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs">
            <div className="text-xs text-[#696969] font-medium">Pending Approvals</div>
            <div className="text-xl font-bold font-mono text-amber-600 mt-1">
              {weeklyData.pendingSubmissionsCount || 0}
            </div>
            <div className="text-[11px] text-amber-700 mt-0.5">Awaiting admin review</div>
          </div>
        </div>
      )}

      {/* Team Breakdown Table */}
      {isLoading ? (
        <div className="bg-white p-12 text-center rounded-xl border border-[#696969]/20 text-xs text-[#696969]">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#456B5A] mb-2" />
          Loading your weekly summary...
        </div>
      ) : !weeklyData || weeklyData.teamSummaries?.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-xl border border-[#696969]/20 space-y-2">
          <CalendarCheck2 className="w-10 h-10 text-[#696969]/40 mx-auto" />
          <div className="font-semibold text-sm text-[#014025]">No Attendance Recorded</div>
          <div className="text-xs text-[#696969]">
            You have no attendance entries recorded for reporting week {bounds.displayRange}.
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {weeklyData.teamSummaries.map((teamSummary: any) => (
            <div key={teamSummary.teamId} className="bg-white rounded-xl border border-[#696969]/20 shadow-xs overflow-hidden">
              <div className="px-5 py-3.5 bg-[#696969]/5 border-b border-[#696969]/15 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-sm text-[#014025]">{teamSummary.teamName}</span>
                  <span className="text-[11px] bg-[#456B5A]/15 text-[#014025] px-2 py-0.5 rounded font-medium">
                    {teamSummary.workCategory}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      teamSummary.paymentStatus === 'Paid'
                        ? 'bg-emerald-100 text-emerald-800'
                        : teamSummary.paymentStatus === 'Partially Paid'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    Payment: {teamSummary.paymentStatus}
                  </span>
                </div>
              </div>

              <div className="p-5 space-y-4 text-xs">
                {/* Financial Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#696969]/5 p-3 rounded-lg font-mono">
                  <div>
                    <div className="text-[11px] text-[#696969] font-sans">Labour Subtotal</div>
                    <div className="font-bold text-[#014025]">{formatINR(teamSummary.labourSubtotal)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#696969] font-sans">Overtime Subtotal</div>
                    <div className="font-bold text-[#014025]">{formatINR(teamSummary.overtimeSubtotal)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#696969] font-sans">Extra Charges</div>
                    <div className="font-bold text-[#014025]">{formatINR(teamSummary.additionalChargesSubtotal)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#696969] font-sans">Net Payable</div>
                    <div className="font-bold text-base text-emerald-700">{formatINR(teamSummary.finalPayable)}</div>
                  </div>
                </div>

                {/* Daily Entries */}
                <div className="border border-[#696969]/15 rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#696969]/10 text-[#014025] font-semibold text-[11px]">
                      <tr>
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Shift</th>
                        <th className="py-2 px-3">Category Headcounts</th>
                        <th className="py-2 px-3 text-right">OT (₹)</th>
                        <th className="py-2 px-3 text-right">Payable</th>
                        <th className="py-2 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#696969]/10">
                      {teamSummary.entries?.map((e: any) => (
                        <tr key={e.id} className="hover:bg-slate-50/50">
                          <td className="py-2 px-3 font-mono font-medium text-[#014025]">
                            {formatDateDisplay(e.date)}
                          </td>
                          <td className="py-2 px-3 text-[#696969]">{e.shift_batch}</td>
                          <td className="py-2 px-3 text-[#014025]">
                            {e.lines?.map((l: any, i: number) => (
                              <span key={i} className="mr-2">
                                {l.count}× {l.category_name}
                              </span>
                            ))}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-[#696969]">
                            {e.overtime_amount > 0 ? formatINR(e.overtime_amount) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-[#014025]">
                            {formatINR((e.lines?.reduce((s: number, l: any) => s + l.final_amount, 0) || 0) + (e.overtime_amount || 0))}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                e.status === 'approved'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : e.status === 'change_pending_approval'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {e.status === 'approved' ? 'Approved' : e.status === 'change_pending_approval' ? 'Revision Pending' : 'Pending'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
