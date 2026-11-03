import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { round2, formatINR } from '../lib/calculations';
import { CustomSelect } from './CustomSelect';

interface ChargeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  weekStartDate: string;
  defaultDate?: string;
  defaultTeamId?: string;
}

const COMMON_CATEGORIES = [
  'Machine rental',
  'Grinding machine',
  'Wheelbarrow hire',
  'Materials',
  'Steel blades',
  'Nails and cutting wheels',
  'Transport trips',
  'Water loads',
  'Auto charge',
  'Fixed service charge',
  'Miscellaneous expense',
];

export function ChargeModal({
  isOpen,
  onClose,
  onSuccess,
  weekStartDate,
  defaultDate,
  defaultTeamId,
}: ChargeModalProps) {
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState(defaultTeamId || '');
  const [date, setDate] = useState(defaultDate || weekStartDate);
  const [category, setCategory] = useState('Machine rental');
  const [customCategory, setCustomCategory] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState<string>('');
  const [unit, setUnit] = useState('');
  const [rate, setRate] = useState<string>('');
  const [manualAmount, setManualAmount] = useState<string>('');
  const [isOverridden, setIsOverridden] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [remarks, setRemarks] = useState('');
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
      setDate(defaultDate || weekStartDate);
      setSelectedTeamId(defaultTeamId || '');
      setDescription('');
      setQuantity('');
      setRate('');
      setManualAmount('');
      setIsOverridden(false);
      setOverrideReason('');
      setRemarks('');
      setError(null);
    }
  }, [isOpen, weekStartDate, defaultDate, defaultTeamId]);

  // Compute calculated amount
  const qtyNum = quantity !== '' ? Number(quantity) : null;
  const rateNum = rate !== '' ? Number(rate) : null;
  let calculatedAmount = 0;
  if (qtyNum !== null && rateNum !== null) {
    calculatedAmount = round2(qtyNum * rateNum);
  } else {
    calculatedAmount = round2(Number(manualAmount) || 0);
  }

  const finalAmount = isOverridden && manualAmount !== '' ? round2(Number(manualAmount)) : calculatedAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeamId) {
      setError('Please select a team.');
      return;
    }

    const finalCategory = category === 'Other / Custom' ? customCategory.trim() : category;
    if (!finalCategory) {
      setError('Please provide a charge category.');
      return;
    }
    if (!description.trim()) {
      setError('Please enter a description for the charge.');
      return;
    }
    if (finalAmount <= 0) {
      setError('Charge amount must be greater than zero.');
      return;
    }
    if (isOverridden && !overrideReason.trim()) {
      setError('Please provide a reason for the manual financial override.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await api.charges.create({
        teamId: selectedTeamId,
        weekStartDate,
        date: date || null,
        category: finalCategory,
        description: description.trim(),
        quantity: qtyNum,
        unit: unit.trim() || null,
        rate: rateNum,
        amount: finalAmount,
        remarks: remarks.trim() || null,
        isOverridden,
        overrideReason: isOverridden ? overrideReason.trim() : null,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save charge item');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-[#696969]/20 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-3.5 bg-white border-b-2 border-[#456B5A] flex items-center justify-between">
          <h2 className="font-bold text-sm sm:text-base tracking-tight text-[#014025]">Add Additional Charge / Expense</h2>
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
              <label className="block text-xs font-semibold text-[#014025] mb-1.5">Date (Optional / Specific)</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white text-slate-800 focus:ring-2 focus:ring-[#0E6037]/20 focus:border-[#0E6037] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <CustomSelect
              label="Expense Category"
              required
              value={category}
              onChange={(val) => setCategory(String(val))}
              options={[
                ...COMMON_CATEGORIES.map((cat) => ({ value: cat, label: cat })),
                { value: 'Other / Custom', label: 'Other / Custom Category...' },
              ]}
              placeholder="Select category..."
            />
            {category === 'Other / Custom' && (
              <input
                type="text"
                placeholder="Type new category name"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                className="mt-2 w-full border border-[#696969]/30 rounded-md px-3 py-1.5 text-xs bg-white text-[#014025] focus:ring-1 focus:ring-[#456B5A] focus:outline-none"
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#014025] mb-1">Description *</label>
            <input
              type="text"
              required
              placeholder="e.g. Grinding machine hire, Steel blade 4-inch, Auto trip to hardware shop"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-xs bg-white text-[#014025] focus:ring-1 focus:ring-[#456B5A] focus:outline-none"
            />
          </div>

          <div className="bg-[#696969]/5 p-3 rounded-lg border border-[#696969]/15 grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-[#014025] mb-1">Qty (Optional)</label>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="e.g. 4"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full border border-[#696969]/20 rounded px-2 py-1 text-xs text-right font-mono bg-white text-[#014025]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#014025] mb-1">Unit</label>
              <input
                type="text"
                placeholder="Nos, Trips, Days"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full border border-[#696969]/20 rounded px-2 py-1 text-xs bg-white text-[#014025]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#014025] mb-1">Rate (₹)</label>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="e.g. 100"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="w-full border border-[#696969]/20 rounded px-2 py-1 text-xs text-right font-mono bg-white text-[#014025]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#014025] mb-1">
              Fixed Amount / Calculated Total (₹)
            </label>
            <input
              type="number"
              step="any"
              min="0"
              placeholder="0.00"
              value={manualAmount || (calculatedAmount > 0 ? calculatedAmount : '')}
              onChange={(e) => {
                setManualAmount(e.target.value);
                if (qtyNum && rateNum) {
                  setIsOverridden(true);
                }
              }}
              className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-sm font-mono font-bold bg-white text-[#014025]"
            />
            {isOverridden && (
              <div className="mt-2 space-y-1">
                <span className="text-[11px] text-[#456B5A] font-semibold">Override Reason Required *</span>
                <input
                  type="text"
                  placeholder="Reason for rate/amount adjustment..."
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full border border-[#456B5A]/30 rounded px-2 py-1 text-xs bg-white text-[#014025] placeholder:text-[#696969]"
                />
              </div>
            )}
          </div>

          <div className="bg-[#456B5A] text-white rounded-lg p-3 flex items-center justify-between">
            <span className="text-xs text-white/70">Total Charge:</span>
            <span className="text-base font-bold font-mono text-white">{formatINR(finalAmount)}</span>
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
              {isSubmitting ? 'Saving...' : 'Add Charge'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
