import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { round2, formatINR } from '../lib/calculations';

interface SupplierBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  weekStartDate: string;
}

export function SupplierBillModal({
  isOpen,
  onClose,
  onSuccess,
  weekStartDate,
}: SupplierBillModalProps) {
  const [supplierName, setSupplierName] = useState('');
  const [workDescription, setWorkDescription] = useState('');
  const [grossAmount, setGrossAmount] = useState<string>('');
  const [advancePaid, setAdvancePaid] = useState<string>('0');
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSupplierName('');
      setWorkDescription('');
      setGrossAmount('');
      setAdvancePaid('0');
      setRemarks('');
      setError(null);
    }
  }, [isOpen]);

  const grossNum = round2(Number(grossAmount) || 0);
  const advanceNum = round2(Number(advancePaid) || 0);
  const netPayable = round2(grossNum - advanceNum);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim() || !workDescription.trim() || grossNum <= 0) {
      setError('Please provide supplier name, work description, and gross amount.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await api.supplierBills.create({
        weekStartDate,
        supplierName: supplierName.trim(),
        workDescription: workDescription.trim(),
        grossAmount: grossNum,
        advancePaid: advanceNum,
        remarks: remarks.trim() || null,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record supplier bill');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-[#696969]/20 w-full max-w-lg overflow-hidden flex flex-col">
        <div className="px-5 py-3.5 bg-white border-b-2 border-[#456B5A] flex items-center justify-between">
          <div>
            <h2 className="font-bold text-sm sm:text-base tracking-tight text-[#014025]">Contractor &amp; Supplier Bill</h2>
            <p className="text-xs text-[#696969] mt-0.5">Separate from count-based labour; reconciled in weekly summary</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-[#696969] hover:text-[#014025] hover:bg-[#696969]/10 rounded-md transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs sm:text-sm">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#014025] mb-1">
              Contractor / Supplier Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Pankaj AAC Block Works, Balaji Sand Suppliers"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-xs bg-white text-[#014025] focus:ring-1 focus:ring-[#456B5A] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#014025] mb-1">
              Work Description / Bill Scope *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. PCC / AAC blocks supply and laying work"
              value={workDescription}
              onChange={(e) => setWorkDescription(e.target.value)}
              className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-xs bg-white text-[#014025] focus:ring-1 focus:ring-[#456B5A] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#014025] mb-1">Gross Bill Amount (₹) *</label>
              <input
                type="number"
                step="any"
                min="0"
                required
                placeholder="e.g. 284800"
                value={grossAmount}
                onChange={(e) => setGrossAmount(e.target.value)}
                className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-xs font-mono font-bold bg-white text-[#014025]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#014025] mb-1">Advance Already Paid (₹)</label>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="e.g. 210000"
                value={advancePaid}
                onChange={(e) => setAdvancePaid(e.target.value)}
                className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-xs font-mono bg-white text-[#014025]"
              />
            </div>
          </div>

          <div className="bg-[#456B5A] text-white rounded-lg p-3 flex items-center justify-between">
            <div>
              <div className="text-xs text-white/70">Net Payable Balance</div>
              <div className="text-xs text-white/80">
                Gross: <span className="font-mono">{formatINR(grossNum)}</span> - Advance: <span className="font-mono">{formatINR(advanceNum)}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-white/80 font-semibold">Total Payable</div>
              <div className="text-base font-bold font-mono text-white">{formatINR(netPayable)}</div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#014025] mb-1">Remarks / Reference</label>
            <input
              type="text"
              placeholder="e.g. Invoice #2026/PCC-88, payment approved"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-xs bg-white text-[#014025] focus:ring-1 focus:ring-[#456B5A] focus:outline-none"
            />
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
              {isSubmitting ? 'Saving...' : 'Add Supplier Bill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
