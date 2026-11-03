import React, { useState, useEffect } from 'react';
import {
  CalendarCheck2,
  Clock,
  CheckCircle2,
  AlertCircle,
  ReceiptIndianRupee,
  CalendarRange,
  Users,
  Paperclip,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  Building,
  RefreshCw,
  Plus,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatINR, round2 } from '../lib/calculations';
import {
  getWeekBounds,
  getTodayKolkataISO,
  formatDateDisplay,
  getDayName,
} from '../lib/dateUtils';
import { WeekNavigator } from '../components/WeekNavigator';
import { useAuth } from '../context/AuthContext';

interface DashboardPageProps {
  onNavigate?: (tab: any, params?: any) => void;
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { user, isMasterAdmin, isSecondaryAdmin, isAdminAny } = useAuth();
  const [currentWeekStart, setCurrentWeekStart] = useState<string>(() => {
    return getWeekBounds(getTodayKolkataISO()).startDate;
  });

  const [weeklyReport, setWeeklyReport] = useState<any | null>(null);
  const [todayAttendance, setTodayAttendance] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [recentAudits, setRecentAudits] = useState<any[]>([]);
  const [monthlyTotals, setMonthlyTotals] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const todayKolkata = getTodayKolkataISO();
  const weekBounds = getWeekBounds(currentWeekStart);

  const loadDashboardData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const todayDate = new Date();
      const auditPromise = isAdminAny ? api.audit.list({ limit: 6 }).catch(() => []) : Promise.resolve([]);
      const [weekly, todayAtt, auditLogs, monthly] = await Promise.all([
        api.reports.getWeekly(currentWeekStart),
        api.attendance.list({ date: todayKolkata }),
        auditPromise,
        api.reports.getMonthly(todayDate.getFullYear(), todayDate.getMonth() + 1),
      ]);

      setWeeklyReport(weekly);
      setTodayAttendance(todayAtt);
      setRecentAudits(auditLogs);
      setMonthlyTotals(monthly?.totals || null);

      if (isAdminAny) {
        try {
          const queue = await api.attendance.getQueue();
          setPendingApprovals(queue);
        } catch {}
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard analytics');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [currentWeekStart]);

  // Day by day breakdown for the 7 days of the selected Saturday–Friday week
  const dayBreakdown = weekBounds.days.map((d) => {
    const dayEntries = weeklyReport?.teamSummaries?.flatMap((t: any) =>
      t.entries?.filter((e: any) => e.date === d) || []
    ) || [];

    const dayLabourAmt = dayEntries.reduce((sum: number, e: any) => {
      const linesAmt = e.lines?.reduce((lSum: number, l: any) => lSum + (l.final_amount || 0), 0) || 0;
      return sum + linesAmt + (e.overtime_amount || 0);
    }, 0);

    const workerCount = dayEntries.reduce((sum: number, e: any) => {
      return sum + (e.lines?.reduce((cnt: number, l: any) => cnt + (l.count || 0), 0) || 0);
    }, 0);

    return {
      date: d,
      dayName: getDayName(d),
      entriesCount: dayEntries.length,
      workerCount,
      totalAmount: round2(dayLabourAmt),
      isToday: d === todayKolkata,
    };
  });

  const grandTotals = weeklyReport?.grandTotals || {
    labour: 0,
    additionalCharges: 0,
    gross: 0,
    finalPayable: 0,
    paid: 0,
    outstanding: 0,
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#696969]/20 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl sm:text-2xl font-bold text-[#014025] tracking-tight">
              {isMasterAdmin ? 'Company Executive Dashboard' : isSecondaryAdmin ? 'Manager Operations Dashboard' : 'Staff Operations Dashboard'}
            </h1>
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#456B5A]/20 text-[#014025]">
              {user?.role === 'master_admin' ? 'Master Admin' : user?.role === 'secondary_admin' ? 'Manager' : 'Staff'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#696969] mt-0.5">
            Saturday–Friday reporting cycle analytics • Today: <span className="text-[#014025] font-semibold font-mono">{formatDateDisplay(todayKolkata)}</span>
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <WeekNavigator currentWeekStart={currentWeekStart} onWeekChange={setCurrentWeekStart} />
          <button
            onClick={loadDashboardData}
            disabled={isLoading}
            className="p-2 rounded-lg border border-[#696969]/20 text-[#014025] hover:bg-[#696969]/10"
            title="Refresh analytics"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Action Shortcuts Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-xl border border-[#456B5A]/20 shadow-xs flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-[#3B5E4F] mr-1 hidden sm:inline">Shortcuts:</span>

        <button
          onClick={() => onNavigate && onNavigate('attendance', { date: todayKolkata })}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#014025] hover:bg-[#014025]/90 text-white rounded-lg font-semibold shadow-xs transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Attendance</span>
        </button>

        {isAdminAny && (
          <button
            onClick={() => onNavigate && onNavigate('approvals')}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#456B5A] hover:bg-[#3B5E4F] text-white rounded-lg font-semibold shadow-xs transition-colors relative"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Review Queue</span>
            {pendingApprovals.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-amber-400 text-[#014025] font-bold rounded-full text-[10px]">
                {pendingApprovals.length}
              </span>
            )}
          </button>
        )}

        <button
          onClick={() => onNavigate && onNavigate('weekly-reports', { weekStart: currentWeekStart })}
          className="flex items-center space-x-1.5 px-3 py-1.5 border border-[#456B5A]/30 text-[#3B5E4F] hover:bg-[#456B5A]/10 rounded-lg font-medium transition-colors"
        >
          <span>Weekly Report</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => onNavigate && onNavigate('payments', { weekStart: currentWeekStart })}
          className="flex items-center space-x-1.5 px-3 py-1.5 border border-[#456B5A]/30 text-[#3B5E4F] hover:bg-[#456B5A]/10 rounded-lg font-medium transition-colors"
        >
          <span>Payment Status</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => onNavigate && onNavigate('attachments')}
          className="flex items-center space-x-1.5 px-3 py-1.5 border border-[#456B5A]/30 text-[#3B5E4F] hover:bg-[#456B5A]/10 rounded-lg font-medium transition-colors"
        >
          <Paperclip className="w-3.5 h-3.5 text-[#456B5A]" />
          <span>Attachments</span>
        </button>

        {isMasterAdmin && (
          <button
            onClick={() => onNavigate && onNavigate('petty-cash')}
            className="flex items-center space-x-1.5 px-3 py-1.5 border border-[#456B5A]/30 text-[#3B5E4F] hover:bg-[#456B5A]/10 rounded-lg font-medium transition-colors"
          >
            <span>Petty Cash</span>
          </button>
        )}
      </div>

      {/* KPI Cards: Current Week Financial Snapshot */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#696969] font-medium">Reporting Week</span>
            <CalendarRange className="w-4 h-4 text-[#456B5A]" />
          </div>
          <div className="text-sm font-bold font-mono text-[#014025] mt-2">{weekBounds.displayRange}</div>
          <div className="text-[11px] text-[#696969] mt-1">Saturday through Friday cycle</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#696969] font-medium">Approved Payable</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#014025] mt-1">{formatINR(grandTotals.finalPayable)}</div>
          <div className="text-[11px] text-[#696969] mt-1">
            Labour: {formatINR(grandTotals.labour)} | Charges: {formatINR(grandTotals.additionalCharges)}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#696969] font-medium">Week Settled (Paid)</span>
            <ReceiptIndianRupee className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">{formatINR(grandTotals.paid)}</div>
          <div className="text-[11px] text-emerald-600 mt-1">Disbursed with voucher refs</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#696969] font-medium">Current Week Outstanding</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-600 mt-1">{formatINR(grandTotals.outstanding)}</div>
          <div className="text-[11px] text-amber-700 mt-1">Pending payment disbursement</div>
        </div>
      </div>

      {/* Day by Day Payment & Worker Summary for the Week */}
      <div className="bg-white rounded-xl border border-[#696969]/20 shadow-xs p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-sm text-[#014025]">Day-by-Day Attendance &amp; Amount Breakdown</h2>
            <p className="text-xs text-[#696969]">Saturday to Friday distribution for reporting week {weekBounds.displayRange}</p>
          </div>
          <button
            onClick={() => onNavigate && onNavigate('weekly-reports', { weekStart: currentWeekStart })}
            className="text-xs text-[#456B5A] hover:text-[#014025] font-semibold flex items-center space-x-1"
          >
            <span>Full Weekly Report</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-7 gap-2.5">
          {dayBreakdown.map((day) => (
            <div
              key={day.date}
              onClick={() => onNavigate && onNavigate('attendance', { date: day.date })}
              className={`p-3 rounded-lg border text-center transition-all cursor-pointer ${
                day.isToday
                  ? 'bg-[#456B5A]/10 border-[#456B5A] ring-1 ring-[#456B5A]'
                  : 'bg-[#696969]/5 border-[#696969]/15 hover:bg-[#696969]/10'
              }`}
            >
              <div className="text-[11px] font-semibold uppercase text-[#696969]">{day.dayName.substring(0, 3)}</div>
              <div className="font-mono text-xs font-bold text-[#014025] mt-0.5">{formatDateDisplay(day.date).substring(0, 5)}</div>
              <div className="font-mono text-xs font-bold text-[#014025] mt-2">{formatINR(day.totalAmount)}</div>
              <div className="text-[10px] text-[#696969] mt-0.5">{day.workerCount} Workers</div>
              {day.isToday && (
                <div className="mt-1 text-[9px] font-bold text-[#014025] bg-[#456B5A]/20 px-1 py-0.2 rounded">
                  Today
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Today's Attendance Snapshot & Admin Audit Feed */}
      <div className={`grid grid-cols-1 ${isAdminAny ? 'lg:grid-cols-2' : ''} gap-6`}>
        {/* Today's Attendance Snapshot */}
        <div className="bg-white rounded-xl border border-[#696969]/20 shadow-xs p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-[#696969]/15 pb-2.5">
            <div className="flex items-center space-x-2">
              <CalendarCheck2 className="w-4 h-4 text-[#0E6037]" />
              <h2 className="font-bold text-sm text-[#0E6037]">Today&apos;s Attendance Submissions</h2>
            </div>
            <span className="text-xs text-[#696969] font-mono">{formatDateDisplay(todayKolkata)}</span>
          </div>

          {todayAttendance.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#696969]">
              No attendance entries submitted yet for today. Click &quot;Add Attendance&quot; to begin.
            </div>
          ) : (
            <div className="space-y-2">
              {todayAttendance.slice(0, 5).map((entry) => (
                <div
                  key={entry.id}
                  className="p-2.5 rounded-lg border border-[#696969]/15 bg-[#696969]/5 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-[#014025]">{entry.team_name}</div>
                    <div className="text-[11px] text-[#696969]">
                      Staff: {entry.staff_name} • Shift: {entry.shift_batch}
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        entry.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : entry.status === 'change_pending_approval'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {entry.status === 'approved' ? 'Approved' : 'Pending Review'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Audit History & Admin Alterations — STRICTLY FOR ADMINS ONLY */}
        {isAdminAny && (
          <div className="bg-white rounded-xl border border-[#696969]/20 shadow-xs p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-[#696969]/15 pb-2.5">
              <div className="flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-[#0E6037]" />
                <h2 className="font-bold text-sm text-[#0E6037]">Recent Audit &amp; Activity Log</h2>
              </div>
              <button
                onClick={() => onNavigate && onNavigate('audit')}
                className="text-xs text-[#0E6037] hover:text-[#0B4D2C] font-semibold flex items-center space-x-1 cursor-pointer"
              >
                <span>Full Audit</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {recentAudits.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#696969]">No recent activity entries recorded.</div>
            ) : (
              <div className="space-y-2">
                {recentAudits.map((log) => (
                  <div key={log.id} className="p-2 rounded-lg border border-[#696969]/15 text-xs space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">{log.action.replace(/_/g, ' ')}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{formatDateDisplay(log.created_at)}</span>
                    </div>
                    <div className="text-[11px] text-[#696969]">
                      By <span className="font-medium text-[#0E6037]">{log.actor_name}</span> ({log.actor_role})
                      {log.reason && <span className="italic ml-1">— &quot;{log.reason}&quot;</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}