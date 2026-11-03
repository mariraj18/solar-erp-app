import React, { useState, useEffect } from 'react';
import {
  ReceiptIndianRupee,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileSpreadsheet,
  Filter,
  RefreshCw,
  Search,
  Calendar,
  Building,
  User,
  PlusCircle,
  Download,
  Building2,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatINR, round2 } from '../lib/calculations';
import { formatDateDisplay, getTodayKolkataISO, getWeekBounds } from '../lib/dateUtils';
import { useAuth } from '../context/AuthContext';
import { WeekNavigator } from '../components/WeekNavigator';
import { CustomSelect } from '../components/CustomSelect';

export function PaymentTrackerPage() {
  const { user, isMasterAdmin, isSecondaryAdmin, isAdminAny } = useAuth();
  const [payments, setPayments] = useState<any[]>([]);
  const [historicalOutstanding, setHistoricalOutstanding] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Office isolation & categorisation state
  const [offices, setOffices] = useState<any[]>([]);
  const [selectedOffice, setSelectedOffice] = useState<string>('all');
  const [staffUsers, setStaffUsers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);

  // Week selection filters
  const [weekFilterMode, setWeekFilterMode] = useState<'week' | 'all'>('week');
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(
    getWeekBounds(getTodayKolkataISO()).startDate
  );

  // Filters
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'paid' | 'partially_paid' | 'outstanding'>('all');
  const [selectedStaff, setSelectedStaff] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Mark as Paid Modal State
  const [markPaidModalOpen, setMarkPaidModalOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState<any | null>(null);
  const [amountPaidInput, setAmountPaidInput] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState(getTodayKolkataISO());
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
  const [voucherRef, setVoucherRef] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadPayments = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const today = getTodayKolkataISO();
      const bounds = getWeekBounds(today);

      const [pList, hList, offList, uList, tList] = await Promise.all([
        api.payments.list({
          weekStart: weekFilterMode === 'week' ? selectedWeekStart : undefined,
          staffUserId: selectedStaff || undefined,
          teamId: selectedTeam || undefined,
          secondaryAdminId: selectedOffice !== 'all' ? selectedOffice : undefined,
        }),
        api.payments.getHistoricalOutstanding(bounds.startDate, selectedStaff || undefined),
        isMasterAdmin ? api.offices.list().catch(() => []) : Promise.resolve([]),
        api.users.list().catch(() => []),
        api.teams.list().catch(() => []),
      ]);
      setPayments(pList);
      setHistoricalOutstanding(hList);
      if (offList && offList.length > 0) setOffices(offList);
      if (uList && uList.length > 0) setStaffUsers(uList.filter((u: any) => u.role === 'staff'));
      if (tList && tList.length > 0) setTeams(tList);
    } catch (err: any) {
      setError(err.message || 'Failed to load payment tracking records.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, [weekFilterMode, selectedWeekStart, selectedStaff, selectedTeam, selectedOffice]);

  const openMarkPaidDialog = (record: any) => {
    setActiveRecord(record);
    const balance = round2((record.net_payable || 0) - (record.amount_paid || 0));
    setAmountPaidInput(balance > 0 ? balance : record.net_payable || 0);
    setPaymentDate(getTodayKolkataISO());
    setPaymentMethod('Bank Transfer');
    setVoucherRef(record.voucher_ref || '');
    setNotes(record.notes || '');
    setMarkPaidModalOpen(true);
  };

  const handleMarkPaidSubmit = async () => {
    if (!activeRecord) return;
    if (amountPaidInput <= 0) {
      alert('Please enter a valid amount paid.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.payments.markPaid({
        weekStartDate: activeRecord.week_start_date,
        teamId: activeRecord.team_id,
        staffUserId: activeRecord.staff_user_id,
        grossAmount: activeRecord.gross_amount,
        chargesAmount: activeRecord.charges_amount,
        deductionsAmount: activeRecord.deductions_amount,
        netPayable: activeRecord.net_payable,
        amountPaid: Number(amountPaidInput),
        paymentDate,
        paymentMethod,
        voucherRef,
        notes,
      });

      setMarkPaidModalOpen(false);
      await loadPayments();
    } catch (err: any) {
      alert(err.message || 'Failed to record payment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter payments
  const filtered = payments.filter((p) => {
    if (activeTab === 'pending' && p.status !== 'Pending') return false;
    if (activeTab === 'paid' && p.status !== 'Paid') return false;
    if (activeTab === 'partially_paid' && p.status !== 'Partially Paid') return false;
    if (activeTab === 'outstanding' && (p.status === 'Paid' || (p.net_payable - p.amount_paid) <= 0)) return false;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const teamMatch = p.team_name?.toLowerCase().includes(term);
      const staffMatch = p.staff_name?.toLowerCase().includes(term);
      const voucherMatch = p.voucher_ref?.toLowerCase().includes(term);
      const officeMatch = p.office_name?.toLowerCase().includes(term) || p.secondary_admin_name?.toLowerCase().includes(term);
      if (!teamMatch && !staffMatch && !voucherMatch && !officeMatch) return false;
    }
    return true;
  });

  const totalApprovedPayable = filtered.reduce((acc, p) => acc + (p.net_payable || 0), 0);
  const totalSettledPaid = filtered.reduce((acc, p) => acc + (p.amount_paid || 0), 0);
  const totalOutstanding = round2(totalApprovedPayable - totalSettledPaid);

  // Office breakdowns for master admin
  const officePaymentBreakdowns = React.useMemo(() => {
    if (!isMasterAdmin || offices.length === 0) return [];
    return offices.map((off) => {
      const offPayments = payments.filter((p) => {
        if (off.id === 'head_office') {
          return !p.secondary_admin_id || p.secondary_admin_id === 'head_office';
        }
        return p.secondary_admin_id === off.id;
      });
      const payable = offPayments.reduce((s, p) => s + (p.net_payable || 0), 0);
      const paid = offPayments.reduce((s, p) => s + (p.amount_paid || 0), 0);
      const pending = round2(payable - paid);
      return {
        ...off,
        recordCount: offPayments.length,
        payable,
        paid,
        pending,
      };
    });
  }, [isMasterAdmin, offices, payments]);

  const filteredStaffUsers = React.useMemo(() => {
    if (!isMasterAdmin || selectedOffice === 'all') return staffUsers;
    const targetOffice = offices.find((o) => o.id === selectedOffice);
    if (!targetOffice) return staffUsers;
    return staffUsers.filter((s) => targetOffice.assignedStaffIds?.includes(s.id));
  }, [isMasterAdmin, selectedOffice, offices, staffUsers]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#696969]/20 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl sm:text-2xl font-bold text-[#014025] tracking-tight">
              Weekly Payment Tracker
            </h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-[#014025]">
              {isMasterAdmin
                ? 'Master Admin • Company Overview'
                : `Assigned Admin • ${user?.assignedLocation || 'Branch Office'}`}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#696969] mt-0.5">
            {isMasterAdmin
              ? 'Consolidated company payment tracker categorised by office location, secondary admin, and staff.'
              : 'Track team weekly payouts, settlements, and vouchers for your assigned staff.'}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {isMasterAdmin && offices.length > 0 && (
            <div className="w-56">
              <CustomSelect
                value={selectedOffice}
                onChange={(val) => {
                  setSelectedOffice(String(val));
                  setSelectedStaff('');
                }}
                options={[
                  { value: 'all', label: 'All Offices (Combined)' },
                  ...offices.map((o) => ({ value: o.id, label: o.name })),
                ]}
                placeholder="Filter by Office"
                size="sm"
              />
            </div>
          )}
          <button
            onClick={loadPayments}
            disabled={isLoading}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-[#456B5A]/30 text-xs font-semibold text-[#014025] hover:bg-[#456B5A]/10 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Week Navigator & Scope Switcher (Saturday - Friday Cycle) */}
      <div className="bg-white p-3.5 rounded-xl border border-[#696969]/20 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold text-[#014025]">Payment Period:</span>
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs">
            <button
              onClick={() => setWeekFilterMode('week')}
              className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                weekFilterMode === 'week' ? 'bg-[#014025] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Selected Week
            </button>
            <button
              onClick={() => setWeekFilterMode('all')}
              className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                weekFilterMode === 'all' ? 'bg-[#014025] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Weeks Combined
            </button>
          </div>
        </div>

        {weekFilterMode === 'week' ? (
          <div className="flex items-center space-x-2">
            <WeekNavigator
              currentWeekStart={selectedWeekStart}
              onWeekChange={(newWeek) => setSelectedWeekStart(newWeek)}
            />
            <button
              onClick={() => setSelectedWeekStart(getWeekBounds(getTodayKolkataISO()).startDate)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Current Week
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-500 italic">Showing consolidated lifetime payment disbursement history across all cycles.</span>
        )}
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs">
          <div className="text-xs text-[#696969] font-medium">Approved Payable</div>
          <div className="text-2xl font-bold font-mono text-[#014025] mt-1">{formatINR(totalApprovedPayable)}</div>
          <div className="text-[11px] text-[#696969] mt-1">Total approved weekly amounts</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs">
          <div className="text-xs text-[#696969] font-medium">Settled / Paid Amount</div>
          <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">{formatINR(totalSettledPaid)}</div>
          <div className="text-[11px] text-emerald-600 mt-1">Confirmed payments with voucher refs</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs">
          <div className="text-xs text-[#696969] font-medium">Outstanding Balance</div>
          <div className="text-2xl font-bold font-mono text-amber-600 mt-1">{formatINR(totalOutstanding)}</div>
          <div className="text-[11px] text-[#696969] mt-1">Net pending disbursement</div>
        </div>
      </div>

      {/* Master Admin: Office-Wise Payment Categorisation Breakdown */}
      {isMasterAdmin && selectedOffice === 'all' && officePaymentBreakdowns.length > 0 && (
        <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-[#014025]" />
              <h2 className="text-sm font-bold text-[#014025]">Office-Wise Payment Breakdown</h2>
            </div>
            <span className="text-[11px] text-slate-500">Categorised by Branch Office & Secondary Admin</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {officePaymentBreakdowns.map((off) => (
              <div
                key={off.id}
                className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-[#456B5A]/40 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-[#014025]">{off.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 font-medium">
                      {off.recordCount} payouts
                    </span>
                  </div>
                  {off.admin && (
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Admin: <span className="font-medium text-slate-700">{off.admin.name}</span> ({off.location})
                    </div>
                  )}
                  <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center border-t border-slate-200/80 pt-2 font-mono">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">Payable</div>
                      <div className="text-xs font-semibold text-slate-800">{formatINR(off.payable)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-emerald-600 uppercase">Paid</div>
                      <div className="text-xs font-bold text-emerald-700">{formatINR(off.paid)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-amber-600 uppercase">Pending</div>
                      <div className="text-xs font-bold text-amber-600">{formatINR(off.pending)}</div>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedOffice(off.id)}
                  className="mt-3 text-[11px] font-semibold text-[#014025] hover:text-[#0E6037] flex items-center justify-end space-x-1 cursor-pointer"
                >
                  <span>Filter this office &rarr;</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historical Unpaid Alert Banner */}
      {historicalOutstanding.length > 0 && (
        <div className="p-4 bg-amber-50 rounded-xl border border-amber-300 text-xs text-amber-900 flex items-start justify-between gap-3">
          <div className="flex items-start space-x-2.5">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-sm">
                Historical Outstanding Payments Detected ({historicalOutstanding.length} prior weeks)
              </div>
              <p className="text-[11px] text-amber-800 mt-0.5">
                There are unpaid or partially settled balances from earlier Saturday–Friday cycles. Outstanding balances
                remain tracked across reporting periods until explicitly marked as paid.
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('outstanding')}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shrink-0"
          >
            Review Outstanding
          </button>
        </div>
      )}

      {/* Tabs & Filters */}
      <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#696969]/15 pb-3">
          <div className="flex items-center space-x-1 overflow-x-auto text-xs">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                activeTab === 'all' ? 'bg-[#014025] text-white' : 'text-[#696969] hover:bg-[#696969]/10'
              }`}
            >
              All Records ({payments.length})
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                activeTab === 'pending' ? 'bg-[#014025] text-white' : 'text-[#696969] hover:bg-[#696969]/10'
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setActiveTab('partially_paid')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                activeTab === 'partially_paid' ? 'bg-[#014025] text-white' : 'text-[#696969] hover:bg-[#696969]/10'
              }`}
            >
              Partially Paid
            </button>
            <button
              onClick={() => setActiveTab('paid')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                activeTab === 'paid' ? 'bg-[#014025] text-white' : 'text-[#696969] hover:bg-[#696969]/10'
              }`}
            >
              Paid
            </button>
            <button
              onClick={() => setActiveTab('outstanding')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                activeTab === 'outstanding' ? 'bg-amber-600 text-white' : 'text-amber-700 hover:bg-amber-100'
              }`}
            >
              Unpaid Balances
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Staff Filter (Master Admin or Secondary Admin can filter their staff) */}
            <div className="w-44">
              <CustomSelect
                value={selectedStaff}
                onChange={(val) => setSelectedStaff(String(val))}
                options={[
                  { value: '', label: 'All Staff Members' },
                  ...filteredStaffUsers.map((s) => ({ value: s.id, label: s.full_name || s.username })),
                ]}
                placeholder="Filter by Staff"
                size="sm"
              />
            </div>

            {/* Team Filter */}
            <div className="w-40">
              <CustomSelect
                value={selectedTeam}
                onChange={(val) => setSelectedTeam(String(val))}
                options={[
                  { value: '', label: 'All Teams' },
                  ...teams.map((t) => ({ value: t.id, label: t.name })),
                ]}
                placeholder="Filter by Team"
                size="sm"
              />
            </div>

            <div className="relative w-48 sm:w-56">
              <Search className="w-3.5 h-3.5 text-[#696969] absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search voucher, team..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#696969]/30 rounded-lg text-[#014025] focus:outline-none focus:ring-1 focus:ring-[#456B5A]"
              />
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#696969]/10 text-[#014025] font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Week Cycle</th>
                {isMasterAdmin && <th className="py-2.5 px-3">Office / Branch</th>}
                <th className="py-2.5 px-3">Team</th>
                <th className="py-2.5 px-3">Staff Owner</th>
                <th className="py-2.5 px-3 text-right">Net Payable</th>
                <th className="py-2.5 px-3 text-right">Amount Paid</th>
                <th className="py-2.5 px-3 text-right">Balance Due</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3">Payment Voucher</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#696969]/15">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isMasterAdmin ? 10 : 9} className="py-8 text-center text-xs text-[#696969]">
                    No payment records matching the selected filters.
                  </td>
                </tr>
              ) : (
                filtered.map((record) => {
                  const bounds = getWeekBounds(record.week_start_date);
                  const balance = round2((record.net_payable || 0) - (record.amount_paid || 0));

                  return (
                    <tr key={record.id} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-3 font-mono font-medium text-[#014025]">
                        <div>{bounds.displayRange}</div>
                        <div className="text-[10px] text-[#696969]">Start: {formatDateDisplay(record.week_start_date)}</div>
                      </td>
                      {isMasterAdmin && (
                        <td className="py-2.5 px-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-800 border border-slate-200">
                            <Building2 className="w-3 h-3 mr-1 text-[#456B5A]" />
                            {record.office_name || (record.secondary_admin_name ? `${record.secondary_admin_name} Branch` : 'Head Office')}
                          </span>
                        </td>
                      )}
                      <td className="py-2.5 px-3 font-semibold text-[#014025]">{record.team_name}</td>
                      <td className="py-2.5 px-3 text-[#696969]">{record.staff_name}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#014025]">
                        {formatINR(record.net_payable || 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                        {formatINR(record.amount_paid || 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-600">
                        {formatINR(balance)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            record.status === 'Paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : record.status === 'Partially Paid'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {record.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[#696969]">
                        {record.voucher_ref ? (
                          <div>
                            <div className="font-mono text-[#014025] font-medium">{record.voucher_ref}</div>
                            <div className="text-[10px]">{record.payment_method} ({formatDateDisplay(record.payment_date)})</div>
                          </div>
                        ) : (
                          <span className="text-[#696969]/60 italic">No voucher ref</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => openMarkPaidDialog(record)}
                          className={`px-2.5 py-1 text-white rounded-lg text-xs font-medium shadow-xs transition-colors cursor-pointer ${
                            record.status === 'Paid'
                              ? isAdminAny
                                ? 'bg-amber-700 hover:bg-amber-800'
                                : 'bg-[#0E6037] hover:bg-[#0B4D2C]'
                              : 'bg-[#0E6037] hover:bg-[#0B4D2C]'
                          }`}
                        >
                          {record.status === 'Paid'
                            ? isAdminAny
                              ? 'Admin Override'
                              : 'Update Settlement'
                            : 'Mark as Paid'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mark as Paid Dialog */}
      {markPaidModalOpen && activeRecord && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-[#696969]/20 w-full max-w-lg overflow-hidden">
            <div className="px-5 py-3.5 bg-[#0E6037] text-white font-bold text-sm flex items-center justify-between">
              <span>
                {isAdminAny && activeRecord.status === 'Paid'
                  ? 'Weekly Payment Settlement (Admin Override)'
                  : 'Weekly Payment Settlement'}
              </span>
              <button onClick={() => setMarkPaidModalOpen(false)} className="text-white/70 hover:text-white cursor-pointer">
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="bg-[#696969]/5 p-3 rounded-lg space-y-1">
                <div className="text-xs text-[#014025] font-semibold">{activeRecord.team_name}</div>
                <div className="text-[11px] text-[#696969]">Staff: {activeRecord.staff_name}</div>
                <div className="flex items-center justify-between pt-1 border-t border-[#696969]/15">
                  <span className="text-[#696969]">Approved Net Payable:</span>
                  <span className="font-mono font-bold text-[#014025]">{formatINR(activeRecord.net_payable)}</span>
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
                    disabled={isSubmitting}
                    value={amountPaidInput}
                    onChange={(e) => setAmountPaidInput(Number(e.target.value) || 0)}
                    className="w-full border border-[#696969]/30 rounded-md px-3 py-1.5 font-mono text-sm font-bold text-[#014025]"
                  />
                  <div className="text-[10px] text-[#696969] mt-0.5">
                    Remaining balance: <span className="font-mono font-semibold">{formatINR(round2(activeRecord.net_payable - amountPaidInput))}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#014025] mb-1">Payment Date</label>
                  <input
                    type="date"
                    disabled={isSubmitting}
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
                    disabled={isSubmitting}
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
                    disabled={isSubmitting}
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
                  disabled={isSubmitting}
                  placeholder="e.g. Settled via Lumia account by Master Admin"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-[#696969]/30 rounded-md px-3 py-1.5 text-xs text-[#014025]"
                />
              </div>
            </div>

            <div className="px-5 py-3 bg-[#696969]/5 border-t border-[#696969]/15 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setMarkPaidModalOpen(false)}
                className="px-3 py-1.5 text-xs border border-[#696969]/30 rounded-lg text-[#696969] hover:bg-[#696969]/10 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleMarkPaidSubmit}
                disabled={isSubmitting}
                className="px-4 py-1.5 bg-[#0E6037] hover:bg-[#0B4D2C] text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting
                  ? 'Recording...'
                  : isAdminAny && activeRecord.status === 'Paid'
                  ? 'Confirm Admin Override'
                  : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
