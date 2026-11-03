import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  RefreshCw,
  Search,
  Calendar,
  Building,
  AlertCircle,
  FileSpreadsheet,
  Building2,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatINR, round2 } from '../lib/calculations';
import { formatDateDisplay, getTodayKolkataISO } from '../lib/dateUtils';
import { useAuth } from '../context/AuthContext';
import { CustomSelect } from '../components/CustomSelect';

export function OfficeAccountsPage() {
  const { user, isMasterAdmin, isSecondaryAdmin } = useAuth();
  const [entries, setEntries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Office isolation & categorisation state
  const [offices, setOffices] = useState<any[]>([]);
  const [selectedOffice, setSelectedOffice] = useState<string>('all');
  const [modalOfficeId, setModalOfficeId] = useState<string>('head_office');
  const [officeBreakdowns, setOfficeBreakdowns] = useState<any[]>([]);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // New Ledger Entry Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [entryDate, setEntryDate] = useState(getTodayKolkataISO());
  const [referenceNo, setReferenceNo] = useState('');
  const [category, setCategory] = useState('Labour Payment');
  const [description, setDescription] = useState('');
  const [entryType, setEntryType] = useState<'credit' | 'debit'>('debit');
  const [amount, setAmount] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState('Bank Transfer');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadLedger = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [res, offList] = await Promise.all([
        api.officeLedger.list({
          category: categoryFilter || undefined,
          secondaryAdminId: selectedOffice !== 'all' ? selectedOffice : undefined,
        }),
        isMasterAdmin ? api.offices.list().catch(() => []) : Promise.resolve([]),
      ]);
      const list = Array.isArray(res) ? res : (res.entries || []);
      setEntries(list);
      if (res.officeBreakdowns) {
        setOfficeBreakdowns(res.officeBreakdowns);
      }
      if (offList && offList.length > 0) {
        setOffices(offList);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load accounts ledger.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLedger();
  }, [categoryFilter, selectedOffice]);

  const handleCreateEntry = async () => {
    if (!description.trim() || amount <= 0) {
      alert('Please enter a description and valid amount.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.officeLedger.create({
        entryDate,
        referenceNo,
        category,
        description,
        entryType,
        amount,
        paymentMode,
        notes,
        secondaryAdminId: isMasterAdmin ? modalOfficeId : undefined,
      });

      setModalOpen(false);
      setDescription('');
      setAmount(0);
      setNotes('');
      await loadLedger();
    } catch (err: any) {
      alert(err.message || 'Failed to record ledger entry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredEntries = entries.filter((e) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      e.description?.toLowerCase().includes(term) ||
      e.category?.toLowerCase().includes(term) ||
      e.reference_no?.toLowerCase().includes(term)
    );
  });

  const totalDebits = filteredEntries.filter((e) => e.entry_type === 'debit').reduce((s, e) => s + e.amount, 0);
  const totalCredits = filteredEntries.filter((e) => e.entry_type === 'credit').reduce((s, e) => s + e.amount, 0);
  const currentRunningBalance = entries.length > 0 ? entries[entries.length - 1].runningBalance : 0;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#696969]/20 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-[#014025] tracking-tight">
              Office Accounts Ledger
            </h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-[#014025]">
              {isMasterAdmin
                ? 'Master Admin • Company'
                : `Branch • ${user?.assignedLocation || 'My Office'}`}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#696969] mt-0.5">
            {isMasterAdmin
              ? 'Double-entry company ledger categorised by branch office and secondary admin.'
              : 'Branch office double-entry ledger with running balances, disbursements, and receipts.'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
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

          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-xl bg-[#014025] hover:bg-[#014025]/85 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Ledger Entry</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Master Admin Office-Wise Breakdown Cards */}
      {isMasterAdmin && selectedOffice === 'all' && officeBreakdowns.length > 0 && (
        <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-[#014025]" />
              <h2 className="text-sm font-bold text-[#014025]">Office-Wise Ledger Breakdown</h2>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-[#014025] font-semibold">
                {officeBreakdowns.length} Branch Offices
              </span>
            </div>
            <span className="text-xs text-slate-500">Separate ledgers maintained per branch location</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {officeBreakdowns.map((b: any) => (
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
                      {b.count} entries
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-slate-200/60 font-mono text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">Total Inflows</span>
                      <strong className="text-emerald-700">{formatINR(b.totalCredit)}</strong>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block font-sans">Disbursements</span>
                      <strong className="text-red-700">{formatINR(b.totalDebit)}</strong>
                    </div>
                    <div className="col-span-2 pt-1 border-t border-dashed border-slate-200 flex justify-between items-center">
                      <span className="text-[11px] font-sans text-slate-600 font-semibold">Net Balance:</span>
                      <span className={`font-bold text-sm ${b.netBalance >= 0 ? 'text-[#014025]' : 'text-red-700'}`}>
                        {formatINR(b.netBalance)}
                      </span>
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs">
          <div className="text-xs text-[#696969] font-medium">Total Inflows (Credits)</div>
          <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">{formatINR(totalCredits)}</div>
          <div className="text-[11px] text-emerald-600 mt-1">Capital deposits, client additions</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs">
          <div className="text-xs text-[#696969] font-medium">Total Disbursements (Debits)</div>
          <div className="text-2xl font-bold font-mono text-red-700 mt-1">{formatINR(totalDebits)}</div>
          <div className="text-[11px] text-red-600 mt-1">Labour payouts, supplier bills, advances</div>
        </div>

        <div className="bg-[#014025] text-white p-4 rounded-xl shadow-xs">
          <div className="text-xs text-white/70 font-medium">Current Ledger Balance</div>
          <div className="text-2xl font-bold font-mono text-white mt-1">{formatINR(currentRunningBalance)}</div>
          <div className="text-[11px] text-white/80 mt-1">Calculated running balance</div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2 text-xs w-full sm:w-auto">
          <Filter className="w-4 h-4 text-[#456B5A] shrink-0" />
          <span className="font-semibold text-[#014025] shrink-0">Category:</span>
          <div className="flex-1 sm:w-52">
            <CustomSelect
              value={categoryFilter}
              onChange={(val) => setCategoryFilter(String(val))}
              options={[
                { value: '', label: 'All Categories' },
                { value: 'Labour Payment', label: 'Labour Payment' },
                { value: 'Supplier Bill', label: 'Supplier Bill' },
                { value: 'Advance Paid', label: 'Advance Paid' },
                { value: 'Advance Settlement', label: 'Advance Settlement' },
                { value: 'Material Purchase', label: 'Material Purchase' },
                { value: 'Client Inflow', label: 'Client Inflow' },
                { value: 'Office Expense', label: 'Office Expense' },
              ]}
              size="sm"
            />
          </div>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-[#696969] absolute left-2.5 top-2.5" />
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
            No ledger records found. Tap &quot;New Ledger Entry&quot; to add transactions.
          </div>
        ) : (
          filteredEntries.map((e) => (
            <div key={e.id} className="p-3.5 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-slate-900 leading-snug">{e.description}</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-[#0E6037] border border-emerald-200">
                      {e.category}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                    <span>{formatDateDisplay(e.entry_date)}</span>
                    <span>•</span>
                    <span className="font-medium text-slate-700">{e.payment_mode || 'Bank'}</span>
                    {e.reference_no && (
                      <>
                        <span>•</span>
                        <span className="font-mono text-slate-600 bg-slate-100 px-1 py-0.2 rounded text-[10px]">{e.reference_no}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className={`font-mono font-bold text-sm ${e.entry_type === 'credit' ? 'text-emerald-700' : 'text-red-700'}`}>
                    {e.entry_type === 'credit' ? `+${formatINR(e.amount)}` : `-${formatINR(e.amount)}`}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    Bal: <span className="font-semibold text-slate-700">{formatINR(e.runningBalance)}</span>
                  </div>
                </div>
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
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-3">Payment Mode</th>
                <th className="py-2.5 px-3 text-right text-emerald-800">Credit (₹)</th>
                <th className="py-2.5 px-3 text-right text-red-800">Debit (₹)</th>
                <th className="py-2.5 px-3 text-right font-bold">Running Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-xs text-[#696969]">
                    No ledger records found. Click &quot;New Ledger Entry&quot; to add transactions.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/60 font-mono">
                    <td className="py-2.5 px-3 text-[#014025] font-sans font-medium">{formatDateDisplay(e.entry_date)}</td>
                    <td className="py-2.5 px-3 text-[#014025] font-sans text-xs">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-[#0E6037] border border-emerald-200">
                        {e.office_name || 'Head Office'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[#696969]">{e.reference_no || '--'}</td>
                    <td className="py-2.5 px-3 font-sans text-[#014025] font-semibold">{e.category}</td>
                    <td className="py-2.5 px-3 font-sans text-[#014025] max-w-xs truncate">{e.description}</td>
                    <td className="py-2.5 px-3 font-sans text-[#696969]">{e.payment_mode || 'Bank'}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                      {e.entry_type === 'credit' ? formatINR(e.amount) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-red-700">
                      {e.entry_type === 'debit' ? formatINR(e.amount) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-[#014025]">
                      {formatINR(e.runningBalance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Entry Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg relative">
            <div className="px-5 py-4 bg-[#014025] text-white font-bold text-sm flex items-center justify-between rounded-t-2xl">
              <span className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-emerald-300" />
                <span>Record Ledger Transaction</span>
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
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2 font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0E6037]/20 focus:border-[#0E6037]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Ref / UTR No</label>
                  <input
                    type="text"
                    placeholder="e.g. UTR-998822"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0E6037]/20 focus:border-[#0E6037]"
                  />
                </div>
              </div>

              {isMasterAdmin && offices.length > 0 && (
                <div>
                  <CustomSelect
                    label="Target Office / Branch"
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <CustomSelect
                    label="Category"
                    value={category}
                    onChange={(val) => setCategory(String(val))}
                    options={[
                      { value: 'Labour Payment', label: 'Labour Payment', badge: 'Disbursement' },
                      { value: 'Supplier Bill', label: 'Supplier Bill', badge: 'Bill' },
                      { value: 'Advance Paid', label: 'Advance Paid', badge: 'Advance' },
                      { value: 'Advance Settlement', label: 'Advance Settlement', badge: 'Settlement' },
                      { value: 'Material Purchase', label: 'Material Purchase', badge: 'Material' },
                      { value: 'Client Inflow', label: 'Client Inflow', badge: 'Inflow', badgeColor: 'green' },
                      { value: 'Office Expense', label: 'Office Expense', badge: 'Expense' },
                    ]}
                  />
                </div>

                <div>
                  <CustomSelect
                    label="Type"
                    value={entryType}
                    onChange={(val) => setEntryType(val as any)}
                    options={[
                      { value: 'debit', label: 'Debit (Payment Out)', badge: 'Debit', badgeColor: 'red' },
                      { value: 'credit', label: 'Credit (Inflow)', badge: 'Credit', badgeColor: 'green' },
                    ]}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Weekly labour disbursement for Centring Murugan"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0E6037]/20 focus:border-[#0E6037]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <CustomSelect
                    label="Payment Mode"
                    value={paymentMode}
                    onChange={(val) => setPaymentMode(String(val))}
                    align="right"
                    options={[
                      { value: 'Bank Transfer', label: 'Bank Transfer (NEFT/RTGS)', badge: 'Digital', badgeColor: 'blue' },
                      { value: 'UPI', label: 'UPI', badge: 'Instant', badgeColor: 'green' },
                      { value: 'Cheque', label: 'Cheque', badge: 'Bank', badgeColor: 'slate' },
                      { value: 'Cash', label: 'Cash', badge: 'Cash', badgeColor: 'amber' },
                    ]}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="Optional notes or voucher link"
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
                onClick={handleCreateEntry}
                disabled={isSubmitting}
                className="px-4 py-2 bg-[#014025] hover:bg-[#014025]/85 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? 'Recording...' : 'Record Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
