import React, { useState, useEffect } from 'react';
import { X, Layers, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { formatINR } from '../lib/calculations';
import { CustomSelect } from './CustomSelect';

interface MergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  weekStartDate: string;
}

export function MergeModal({ isOpen, onClose, onSuccess, weekStartDate }: MergeModalProps) {
  const [activeMode, setActiveMode] = useState<'summary' | 'attendance'>('summary');
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [destinationTeamId, setDestinationTeamId] = useState('');
  const [mergeReason, setMergeReason] = useState('');
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      api.teams.list().then((list) => {
        setTeams(list);
        if (list.length > 0) {
          setDestinationTeamId(list[0].id);
        }
      });
      setSelectedTeamIds([]);
      setGroupName('');
      setMergeReason('');
      setPreviewData(null);
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, weekStartDate]);

  const toggleTeamSelection = (teamId: string) => {
    setSelectedTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    );
    setPreviewData(null);
  };

  const handlePreviewAttendanceMerge = async () => {
    if (selectedTeamIds.length === 0 || !destinationTeamId) {
      setError('Please select source teams and a destination team.');
      return;
    }
    setError(null);
    try {
      const data = await api.merges.previewAttendanceMerge({
        sourceTeamIds: selectedTeamIds,
        destinationTeamId,
        weekStartDate,
      });
      setPreviewData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch merge preview');
    }
  };

  const handleSaveSummaryMerge = async () => {
    if (!groupName.trim() || selectedTeamIds.length < 2) {
      setError('Please provide a group name and select at least two teams.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await api.merges.createSummaryGroup({
        weekStartDate,
        groupName: groupName.trim(),
        teamIds: selectedTeamIds,
      });

      setSuccess('Summary merge group created.');
      onSuccess();
      setTimeout(onClose, 600);
    } catch (err: any) {
      setError(err.message || 'Failed to create summary group');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExecuteAttendanceMerge = async () => {
    if (selectedTeamIds.length === 0 || !destinationTeamId) {
      setError('Please select source teams and destination team.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await api.merges.executeAttendanceMerge({
        sourceTeamIds: selectedTeamIds,
        destinationTeamId,
        weekStartDate,
        reason: mergeReason.trim() || 'Consolidated operational attendance merge',
      });

      setSuccess('Attendance entries successfully merged.');
      onSuccess();
      setTimeout(onClose, 700);
    } catch (err: any) {
      setError(err.message || 'Failed to execute attendance merge');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-[#696969]/20 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-3.5 bg-white border-b-2 border-[#456B5A] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-[#456B5A]" />
            <div>
              <h2 className="font-bold text-sm sm:text-base tracking-tight text-[#014025]">Team Merging</h2>
              <p className="text-xs text-[#696969] mt-0.5">Mode A (Summary Grouping) or Mode B (Attendance Reassignment)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-[#696969] hover:text-[#014025] hover:bg-[#696969]/10 rounded-md transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-[#696969]/20 bg-[#696969]/5 text-xs">
          <button
            onClick={() => {
              setActiveMode('summary');
              setPreviewData(null);
            }}
            className={`flex-1 py-2.5 px-4 font-semibold text-center transition-colors border-b-2 ${
              activeMode === 'summary'
                ? 'border-[#456B5A] text-[#014025] bg-white'
                : 'border-transparent text-[#696969] hover:text-[#014025]'
            }`}
          >
            Mode A: Summary-Only Merge
          </button>
          <button
            onClick={() => {
              setActiveMode('attendance');
              setPreviewData(null);
            }}
            className={`flex-1 py-2.5 px-4 font-semibold text-center transition-colors border-b-2 ${
              activeMode === 'attendance'
                ? 'border-[#456B5A] text-[#014025] bg-white'
                : 'border-transparent text-[#696969] hover:text-[#014025]'
            }`}
          >
            Mode B: Attendance Entry Merge
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs sm:text-sm">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {activeMode === 'summary' ? (
            <div className="space-y-3">
              <div className="p-3 bg-[#456B5A]/[0.08] border border-[#456B5A]/20 rounded-lg text-[#014025] text-xs">
                <strong>Mode A (Summary-Only):</strong> Groups selected teams under one consolidated display row on the weekly payment summary (e.g. Vishnu Civil + Vishnu Painter). Original team attendance remains untouched.
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#014025] mb-1">
                  Consolidated Display Group Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Combined Vishnu Teams (Civil + Painter)"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-xs bg-white text-[#014025] focus:ring-1 focus:ring-[#456B5A] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#014025] mb-1">
                  Select Teams to Group (Minimum 2) *
                </label>
                <div className="border border-[#696969]/20 rounded-lg max-h-48 overflow-y-auto divide-y divide-[#696969]/10">
                  {teams.map((t) => (
                    <label key={t.id} className="flex items-center space-x-2 px-3 py-2 hover:bg-[#696969]/5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedTeamIds.includes(t.id)}
                        onChange={() => toggleTeamSelection(t.id)}
                        className="rounded border-[#696969]/30 text-[#456B5A] focus:ring-[#456B5A]"
                      />
                      <span className="text-xs text-[#014025] font-medium">{t.name}</span>
                      <span className="text-[10px] text-[#696969]">({t.work_category})</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3 bg-[#696969]/[0.08] border border-[#696969]/20 rounded-lg text-[#014025] text-xs">
                <strong>Mode B (Attendance Reassignment):</strong> Reassigns attendance entries from source teams to a destination team. Preserves audit history.
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#014025] mb-1">Select Source Teams *</label>
                <div className="border border-[#696969]/20 rounded-lg max-h-36 overflow-y-auto divide-y divide-[#696969]/10">
                  {teams.map((t) => (
                    <label key={t.id} className="flex items-center space-x-2 px-3 py-1.5 hover:bg-[#696969]/5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedTeamIds.includes(t.id)}
                        onChange={() => toggleTeamSelection(t.id)}
                        className="rounded border-[#696969]/30 text-[#456B5A] focus:ring-[#456B5A]"
                      />
                      <span className="text-xs text-[#014025] font-medium">{t.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <CustomSelect
                  label="Destination Team"
                  required
                  value={destinationTeamId}
                  onChange={(val) => setDestinationTeamId(String(val))}
                  options={teams.map((t) => ({
                    value: t.id,
                    label: t.name,
                    sublabel: t.work_category,
                  }))}
                  placeholder="Select Destination Team..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#014025] mb-1">Reason for Merge</label>
                <input
                  type="text"
                  placeholder="e.g. Consolidated operational attendance merge"
                  value={mergeReason}
                  onChange={(e) => setMergeReason(e.target.value)}
                  className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-xs bg-white text-[#014025] focus:ring-1 focus:ring-[#456B5A] focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={handlePreviewAttendanceMerge}
                className="w-full py-1.5 bg-[#696969]/10 hover:bg-[#696969]/20 text-[#014025] rounded text-xs font-medium border border-[#696969]/25 transition-colors"
              >
                Preview Affected Records &amp; Amounts
              </button>

              {previewData && (
                <div className="bg-[#696969]/5 p-3 rounded-lg border border-[#696969]/15 text-xs space-y-1">
                  <div className="font-semibold text-[#014025]">Merge Impact Preview:</div>
                  <div>Entries to be merged: <span className="font-mono font-bold">{previewData.affectedEntriesCount}</span></div>
                  <div>Labour category lines: <span className="font-mono font-bold">{previewData.affectedLinesCount}</span></div>
                  <div>Total affected labour: <span className="font-mono font-bold text-[#456B5A]">{formatINR(previewData.totalLabourAmount)}</span></div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 bg-[#696969]/5 border-t border-[#696969]/15 flex justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-[#696969]/30 text-[#696969] rounded-md text-xs font-medium hover:bg-[#696969]/10 transition-colors"
          >
            Cancel
          </button>
          {activeMode === 'summary' ? (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSaveSummaryMerge}
              className="px-5 py-2 bg-[#014025] hover:bg-[#014025]/80 text-white rounded-md text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create Summary Group'}
            </button>
          ) : (
            <button
              type="button"
              disabled={isSubmitting || !previewData}
              onClick={handleExecuteAttendanceMerge}
              className="px-5 py-2 bg-[#014025] hover:bg-[#014025]/80 text-white rounded-md text-xs font-semibold disabled:opacity-50"
            >
              {isSubmitting ? 'Merging...' : 'Confirm & Execute Merge'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
