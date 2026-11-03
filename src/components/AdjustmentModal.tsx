import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { round2, formatINR, calculatePercentageDeduction } from '../lib/calculations';
import { CustomSelect } from './CustomSelect';

interface AdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  weekStartDate: string;
  defaultTeamId?: string;
}

export function AdjustmentModal({
  isOpen,
  onClose,
  onSuccess,
  weekStartDate,
  defaultTeamId,
}: AdjustmentModalProps) {
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState(defaultTeamId || '');
  const [date, setDate] = useState(weekStartDate);
  const [adjustmentType, setAdjustmentType] = useState<string>('advance_deduction');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [percentage, setPercentage] = useState<string>('');
  const [baseAmount, setBaseAmount] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      api.teams.list().then((list) => {
        setTeams(list);
        if (!selectedTeamId && list.length > 0) {
          setSelectedTeamId(list[0].id);
        }
      });
      setDate(weekStartDate);
      setSelectedTeamId(defaultTeamId || '');
      setAdjustmentType('advance_deduction');
      setDescription('');
      setAmount('');
      setPercentage('');
      setBaseAmount('');
      setError(null);
    }
  }, [isOpen, weekStartDate, defaultTeamId]);

  // Handle percentage deduction auto-calc
  useEffect(() => {
    if (adjustmentType === 'percentage_deduction') {
      const p = Number(percentage) || 0;
      const b = Number(baseAmount) || 0;
      if (p > 0 && b > 0) {
        const calculatedDeduction = calculatePercentageDeduction(b, p);
        setAmount(String(calculatedDeduction));
      }
    }
  }, [percentage, baseAmount, adjustmentType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeamId) {
      setError('Please select a team.');
      return;
    }
    if (!description.trim()) {
      setError('Please provide a description.');
      return;
    }
    const finalAmt = round2(Number(amount) || 0);
    if (finalAmt <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await api.adjustments.create({
        teamId: selectedTeamId,
        weekStartDate,
        date: date || weekStartDate,
        adjustmentType,
        description: description.trim(),
        amount: finalAmt,
        ratePercentage: percentage ? Number(percentage) : null,
        baseAmount: baseAmount ? Number(baseAmount) : null,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record financial adjustment');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-[#696969]/20 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-3.5 bg-white border-b-2 border-[#456B5A] flex items-center justify-between">
          <h2 className="font-bold text-sm sm:text-base tracking-tight text-[#014025]">Advances, Deductions &amp; Credits</h2>
          <button onClick={onClose} className="p-1.5 text-[#696969] hover:text-[#014025] hover:bg-[#696969]/10 rounded-md transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs sm:text-sm">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <CustomSelect
                label="Team"
                required
                value={selectedTeamId}
                onChange={(val) => setSelectedTeamId(String(val))}
                options={teams.map((t) => ({ value: t.id, label: t.name }))}
                placeholder="Choose Team..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#014025] mb-1.5">Transaction Date *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white text-slate-800 focus:ring-2 focus:ring-[#0E6037]/20 focus:border-[#0E6037] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <CustomSelect
              label="Adjustment Type"
              required
              value={adjustmentType}
              onChange={(val) => {
                const aType = String(val);
                setAdjustmentType(aType);
                if (aType === 'percentage_deduction' && !percentage) {
                  setPercentage('6.25');
                }
              }}
              options={[
                { value: 'advance_deduction', label: 'Advance Deduction (Subtracted from Weekly Payable)', badge: 'Deduction', badgeColor: 'red' },
                { value: 'fixed_deduction', label: 'Fixed Deduction (Penalties, Uniform, Insurance)', badge: 'Deduction', badgeColor: 'red' },
                { value: 'percentage_deduction', label: 'Percentage Deduction (e.g. 6.25% TDS or Retainage)', badge: 'Deduction', badgeColor: 'amber' },
                { value: 'credit', label: 'Authorized Credit (Bonus, Allowance, Adjustment)', badge: 'Credit', badgeColor: 'green' },
                { value: 'advance_paid', label: 'Advance Disbursed (Informational cash record)', badge: 'Info', badgeColor: 'slate' },
              ]}
            />
          </div>

          {adjustmentType === 'percentage_deduction' && (
            <div className="bg-[#696969]/5 border border-[#696969]/15 p-3 rounded-lg grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#014025] mb-1">Percentage Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="e.g. 6.25"
                  value={percentage}
                  onChange={(e) => setPercentage(e.target.value)}
                  className="w-full border border-[#696969]/25 rounded px-2 py-1 text-xs font-mono font-bold bg-white text-[#014025]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#014025] mb-1">Base Amount (₹)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="e.g. 17100"
                  value={baseAmount}
                  onChange={(e) => setBaseAmount(e.target.value)}
                  className="w-full border border-[#696969]/25 rounded px-2 py-1 text-xs font-mono font-bold bg-white text-[#014025]"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#014025] mb-1">Description / Reason *</label>
            <input
              type="text"
              required
              placeholder="e.g. Mid-week cash advance, 6.25% Retention deduction, Tool deposit"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-xs bg-white text-[#014025] focus:ring-1 focus:ring-[#456B5A] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#014025] mb-1">Amount to Adjust (₹) *</label>
            <input
              type="number"
              step="any"
              min="0"
              required
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-sm font-mono font-bold bg-white text-[#014025]"
            />
          </div>

          <div className="bg-[#456B5A] text-white rounded-lg p-3 flex items-center justify-between">
            <span className="text-xs text-white/70">Adjustment Amount:</span>
            <span className="text-base font-bold font-mono text-white">
              {formatINR(Number(amount) || 0)}
            </span>
          </div>

          <div className="pt-3 border-t border-[#696969]/15 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#696969]/30 text-[#696969] rounded-md text-xs font-medium hover:bg-[#696969]/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-[#014025] hover:bg-[#014025]/80 text-white rounded-md text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Record Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
