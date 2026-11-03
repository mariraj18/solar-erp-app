import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Clock, AlertCircle, CheckCircle2, Paperclip, Loader2, Calendar, MapPin, Users, Check } from 'lucide-react';
import { api } from '../lib/api';
import { formatINR, round2, calculateTimeAndOvertime } from '../lib/calculations';
import { formatDateDisplay, getTodayKolkataISO, getWeekBounds } from '../lib/dateUtils';
import { useAuth } from '../context/AuthContext';
import { CustomSelect } from './CustomSelect';

interface CategoryLineInput {
  categoryId: string;
  categoryName: string;
  count: number;
  rate: number;
  rateType: string;
  calculatedAmount: number;
  finalAmount: number;
  isOverridden: boolean;
  overrideReason?: string;
}

interface AttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialDate?: string; // YYYY-MM-DD
  initialTeamId?: string;
  editEntry?: any; // If editing an existing entry
}

export function AttendanceModal({
  isOpen,
  onClose,
  onSuccess,
  initialDate,
  initialTeamId,
  editEntry,
}: AttendanceModalProps) {
  const { user, isMasterAdmin, isSecondaryAdmin } = useAuth();
  const [teams, setTeams] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId || '');

  // Default to today in Asia/Kolkata timezone if not provided
  const [date, setDate] = useState(() => (editEntry ? editEntry.date : initialDate || getTodayKolkataISO()));
  const [locationProject, setLocationProject] = useState('');
  const [shiftBatch, setShiftBatch] = useState('Regular');
  const [inTime, setInTime] = useState('08:30');
  const [outTime, setOutTime] = useState('17:30');
  const [overtimeHours, setOvertimeHours] = useState(0);
  const [overtimeRate, setOvertimeRate] = useState(150);
  const [overtimeAmount, setOvertimeAmount] = useState(0);
  const [remarks, setRemarks] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [lines, setLines] = useState<CategoryLineInput[]>([]);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentDescription, setAttachmentDescription] = useState('');

  // Self-marked GPS attendees for this team today
  const [teamGpsAttendees, setTeamGpsAttendees] = useState<any[]>([]);
  const [selectedGpsAttendeeIds, setSelectedGpsAttendeeIds] = useState<string[]>([]);
  const [isLoadingGpsAttendees, setIsLoadingGpsAttendees] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load teams and categories on open
  useEffect(() => {
    if (isOpen) {
      loadInitialData();
    }
  }, [isOpen, initialDate, initialTeamId, editEntry]);

  const loadInitialData = async () => {
    setError(null);
    setSuccessMessage(null);
    try {
      const [tList, cList] = await Promise.all([api.teams.list(), api.categories.list()]);
      setTeams(tList);
      setCategories(cList);

      if (editEntry) {
        setDate(editEntry.date);
        setSelectedTeamId(editEntry.team_id);
        setLocationProject(editEntry.location_project || '');
        setShiftBatch(editEntry.shift_batch || 'Regular');
        setInTime(editEntry.in_time || '08:30');
        setOutTime(editEntry.out_time || '17:30');
        setOvertimeHours(editEntry.overtime_hours || 0);
        setOvertimeRate(editEntry.overtime_rate || 150);
        setOvertimeAmount(editEntry.overtime_amount || 0);
        setRemarks(editEntry.remarks || '');
        setChangeReason('');

        if (editEntry.lines && editEntry.lines.length > 0) {
          setLines(
            editEntry.lines.map((l: any) => ({
              categoryId: l.category_id,
              categoryName: l.category_name,
              count: l.count,
              rate: l.rate,
              rateType: l.rate_type || 'daily',
              calculatedAmount: l.calculated_amount,
              finalAmount: l.final_amount,
              isOverridden: Boolean(l.is_overridden),
              overrideReason: l.override_reason || '',
            }))
          );
        }
      } else {
        // ALWAYS default to today's date in Asia/Kolkata for new entry
        const todayKolkata = getTodayKolkataISO();
        setDate(initialDate || todayKolkata);
        setChangeReason('');
        setAttachmentFile(null);
        setAttachmentDescription('');

        const teamIdToUse = initialTeamId || (tList.length > 0 ? tList[0].id : '');
        setSelectedTeamId(teamIdToUse);
        if (teamIdToUse) {
          applyTeamDefaultRoles(teamIdToUse, tList);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load team data');
    }
  };

  const applyTeamDefaultRoles = (teamId: string, teamList = teams) => {
    const team = teamList.find((t) => t.id === teamId);
    if (team) {
      setLocationProject(team.location_project || '');
      if (team.roles && team.roles.length > 0) {
        const defaultLines: CategoryLineInput[] = team.roles.map((r: any) => ({
          categoryId: r.category_id,
          categoryName: r.category_name || 'Labour',
          count: 0,
          rate: r.default_rate || 0,
          rateType: r.rate_type || 'daily',
          calculatedAmount: 0,
          finalAmount: 0,
          isOverridden: false,
          overrideReason: '',
        }));
        setLines(defaultLines);
      } else {
        setLines([]);
      }
    }
  };

  const handleTeamChange = (teamId: string) => {
    setSelectedTeamId(teamId);
    applyTeamDefaultRoles(teamId);
  };

  // Load self-marked GPS attendees whenever team or date changes
  useEffect(() => {
    if (selectedTeamId && date) {
      fetchTeamGpsAttendees(selectedTeamId, date);
    } else {
      setTeamGpsAttendees([]);
      setSelectedGpsAttendeeIds([]);
    }
  }, [selectedTeamId, date]);

  const fetchTeamGpsAttendees = async (tId: string, attDate: string) => {
    setIsLoadingGpsAttendees(true);
    try {
      const attendees = await api.gpsAttendance.getTeamToday(tId, attDate);
      setTeamGpsAttendees(attendees || []);
      setSelectedGpsAttendeeIds((attendees || []).map((a: any) => a.id));
    } catch (e) {
      console.error('Failed to load team GPS attendees:', e);
    } finally {
      setIsLoadingGpsAttendees(false);
    }
  };

  const toggleGpsAttendee = (id: string) => {
    setSelectedGpsAttendeeIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleAutoMergeGpsAttendees = () => {
    if (teamGpsAttendees.length === 0) return;

    const attendeesToInclude = teamGpsAttendees.filter((a) =>
      selectedGpsAttendeeIds.includes(a.id)
    );

    // Group by category
    const catCounts: { [catId: string]: number } = {};
    attendeesToInclude.forEach((a) => {
      const cId = a.labour_category_id || categories[0]?.id;
      if (cId) catCounts[cId] = (catCounts[cId] || 0) + 1;
    });

    setLines((prev) => {
      const next = [...prev];
      Object.entries(catCounts).forEach(([cId, count]) => {
        const idx = next.findIndex((l) => l.categoryId === cId);
        if (idx >= 0) {
          const currentCount = next[idx].count || 0;
          const mergedCount = Math.max(currentCount, count);
          const rate = next[idx].rate;
          next[idx].count = mergedCount;
          next[idx].calculatedAmount = round2(mergedCount * rate);
          if (!next[idx].isOverridden) {
            next[idx].finalAmount = next[idx].calculatedAmount;
          }
        } else {
          const cat = categories.find((c) => c.id === cId);
          if (cat) {
            next.push({
              categoryId: cat.id,
              categoryName: cat.name,
              count: count,
              rate: cat.default_rate || 0,
              rateType: cat.rate_type || 'daily',
              calculatedAmount: round2(count * (cat.default_rate || 0)),
              finalAmount: round2(count * (cat.default_rate || 0)),
              isOverridden: false,
              overrideReason: '',
            });
          }
        }
      });
      return next;
    });
  };

  // Recalculate overtime when times change
  useEffect(() => {
    if (inTime && outTime) {
      const timeCalc = calculateTimeAndOvertime(inTime, outTime, undefined, overtimeRate);
      setOvertimeHours(timeCalc.overtimeHours);
      setOvertimeAmount(timeCalc.overtimeAmount);
    }
  }, [inTime, outTime, overtimeRate]);

  // Update line item
  const updateLine = (index: number, field: keyof CategoryLineInput, value: any) => {
    setLines((prev) => {
      const next = [...prev];
      const item = { ...next[index], [field]: value };

      if (field === 'count' || field === 'rate') {
        const count = Math.max(0, parseInt(String(item.count), 10) || 0);
        const rate = Math.max(0, Number(item.rate) || 0);
        item.calculatedAmount = round2(count * rate);
        if (!item.isOverridden) {
          item.finalAmount = item.calculatedAmount;
        }
      } else if (field === 'isOverridden') {
        if (!value) {
          item.finalAmount = item.calculatedAmount;
          item.overrideReason = '';
        }
      }

      next[index] = item;
      return next;
    });
  };

  const addLine = () => {
    if (categories.length === 0) return;
    const cat = categories[0];
    setLines((prev) => [
      ...prev,
      {
        categoryId: cat.id,
        categoryName: cat.name,
        count: 0,
        rate: cat.default_rate || 0,
        rateType: cat.rate_type || 'daily',
        calculatedAmount: 0,
        finalAmount: 0,
        isOverridden: false,
        overrideReason: '',
      },
    ]);
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const totalLabourAmount = lines.reduce((sum, l) => sum + (l.finalAmount || 0), 0);
  const totalPayable = round2(totalLabourAmount + overtimeAmount);

  // Week bounds display
  const weekBounds = getWeekBounds(date || getTodayKolkataISO());

  const handleSubmit = async (andAddAnother = false) => {
    if (isSubmitting) return;

    setError(null);
    setSuccessMessage(null);

    if (!selectedTeamId) {
      setError('Please select a team.');
      return;
    }
    if (!date) {
      setError('Please choose a valid attendance date.');
      return;
    }

    // If editing an approved entry as staff: mandatory change reason
    if (editEntry && editEntry.status === 'approved' && !isMasterAdmin && !isSecondaryAdmin) {
      if (!changeReason.trim()) {
        setError('A mandatory change reason is required to submit revisions for approved attendance.');
        return;
      }
    }

    // Check that if any line is overridden, reason is provided
    for (const line of lines) {
      if (line.isOverridden && !line.overrideReason?.trim()) {
        setError(`Please enter an override reason for ${line.categoryName}.`);
        return;
      }
    }

    setIsSubmitting(true);
    const clientRequestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    try {
      const totalWorkersCount = lines.reduce((sum, l) => sum + (parseInt(String(l.count), 10) || 0), 0);
      const activeGpsCount = selectedGpsAttendeeIds.length;
      const manualWorkersCount = Math.max(0, totalWorkersCount - activeGpsCount);

      const payload = {
        date,
        teamId: selectedTeamId,
        locationProject,
        shiftBatch,
        inTime,
        outTime,
        overtimeHours,
        overtimeRate,
        overtimeAmount,
        remarks: remarks || (activeGpsCount > 0 ? `Includes ${activeGpsCount} self-marked GPS worker(s)` : undefined),
        changeReason: changeReason.trim() || undefined,
        clientRequestId,
        selfMarkedLabourerIds: selectedGpsAttendeeIds,
        gpsCount: activeGpsCount,
        manualCount: manualWorkersCount,
        lines: lines.map((l) => ({
          categoryId: l.categoryId,
          categoryName: l.categoryName,
          count: l.count,
          rate: l.rate,
          rateType: l.rateType,
          calculatedAmount: l.calculatedAmount,
          finalAmount: l.finalAmount,
          isOverridden: l.isOverridden,
          overrideReason: l.overrideReason,
        })),
      };

      let savedEntryId: string;
      if (editEntry) {
        const res = await api.attendance.update(editEntry.id, payload);
        savedEntryId = editEntry.id;
        setSuccessMessage(res.message || 'Entry updated successfully.');
      } else {
        const res = await api.attendance.create(payload);
        savedEntryId = res.id;
        setSuccessMessage(
          res.status === 'pending_approval'
            ? 'Attendance submitted for administrator approval.'
            : 'Attendance recorded successfully.'
        );
      }

      // Handle optional attachment upload
      if (attachmentFile && savedEntryId) {
        try {
          const reader = new FileReader();
          reader.onload = async () => {
            const base64 = reader.result as string;
            await api.attachments.upload({
              recordType: 'attendance',
              recordId: savedEntryId,
              fileName: attachmentFile.name,
              fileSize: attachmentFile.size,
              mimeType: attachmentFile.type,
              fileDataBase64: base64,
              description: attachmentDescription || `Attendance chit for ${formatDateDisplay(date)}`,
              teamId: selectedTeamId,
              date,
              weekStartDate: weekBounds.startDate,
            });
          };
          reader.readAsDataURL(attachmentFile);
        } catch (attErr) {
          console.warn('Attachment upload failed:', attErr);
        }
      }

      onSuccess();

      if (andAddAnother && !editEntry) {
        // Reset counts for rapid entry of next batch
        setLines((prev) =>
          prev.map((l) => ({
            ...l,
            count: 0,
            calculatedAmount: 0,
            finalAmount: 0,
            isOverridden: false,
            overrideReason: '',
          }))
        );
        setRemarks('');
        setAttachmentFile(null);
        setAttachmentDescription('');
      } else {
        setTimeout(() => {
          onClose();
        }, 350);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save attendance entry');
    } finally {
      // Guarantee submitting state is ALWAYS released
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const isEditingApproved = editEntry && editEntry.status === 'approved' && !isMasterAdmin && !isSecondaryAdmin;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-[#696969]/20 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-white border-b-2 border-[#456B5A] flex items-center justify-between">
          <div>
            <h2 className="font-bold text-sm sm:text-base tracking-tight text-[#014025]">
              {editEntry ? 'Edit Labour Attendance Entry' : 'New Daily Attendance Entry'}
            </h2>
            <div className="flex items-center space-x-2 mt-0.5 text-xs text-[#696969]">
              <span>Date:</span>
              <span className="text-[#456B5A] font-mono font-semibold">{formatDateDisplay(date)}</span>
              <span className="text-[#696969]/60">|</span>
              <span className="text-[11px] bg-[#456B5A]/10 text-[#014025] px-1.5 py-0.5 rounded font-medium">
                Week: {weekBounds.displayRange}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-[#696969] hover:text-[#014025] hover:bg-[#696969]/10 rounded-md transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs sm:text-sm">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 text-red-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center space-x-2 text-emerald-800 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMessage}</span>
            </div>
          )}

          {isEditingApproved && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-xs space-y-1">
              <div className="font-semibold flex items-center space-x-1.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Editing Approved Attendance (Approval Required)</span>
              </div>
              <p className="text-[11px] text-amber-800">
                This record is currently approved. Submitting changes will create a proposed revision and notify the approver.
                The existing approved version remains active in reports until changes are verified.
              </p>
            </div>
          )}

          {/* Form Row 1: Team & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <CustomSelect
                label="Select Team / Subcontractor"
                required
                disabled={isSubmitting || Boolean(editEntry)}
                value={selectedTeamId}
                onChange={(val) => handleTeamChange(String(val))}
                options={teams.map((t) => ({
                  value: t.id,
                  label: t.name,
                  sublabel: t.work_category,
                }))}
                placeholder="Choose Team..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#014025] mb-1">
                Attendance Date (DD/MM/YYYY) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  disabled={isSubmitting}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-xs bg-white text-[#014025] focus:ring-1 focus:ring-[#456B5A] focus:outline-none font-mono"
                />
              </div>
              <div className="text-[10px] text-[#696969] mt-0.5">
                Current selection: <span className="font-medium text-[#014025]">{formatDateDisplay(date)}</span> (defaults to today in Kolkata)
              </div>
            </div>
          </div>

          {/* Form Row 2: Location & Shift Batch */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#014025] mb-1">
                Site / Project Location
              </label>
              <input
                type="text"
                disabled={isSubmitting}
                placeholder="e.g. Lumia Building / Block A"
                value={locationProject}
                onChange={(e) => setLocationProject(e.target.value)}
                className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-xs bg-white text-[#014025] focus:ring-1 focus:ring-[#456B5A] focus:outline-none"
              >
              </input>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#014025] mb-1">
                Shift / Batch Identifier
              </label>
              <CustomSelect
                value={shiftBatch || 'Regular'}
                onChange={(val) => setShiftBatch(String(val))}
                options={[
                  { value: 'Regular', label: 'Regular Day Shift' },
                  { value: 'Batch 1 (Morning)', label: 'Batch 1 (Morning Shift)' },
                  { value: 'Batch 2 (Afternoon)', label: 'Batch 2 (Afternoon Shift)' },
                  { value: 'Night Shift', label: 'Night Pouring / Special Shift' },
                  { value: 'Overtime Extended', label: 'Overtime Extended Batch' },
                ]}
                disabled={isSubmitting}
                size="sm"
              />
            </div>
          </div>

          {/* Form Row 3: Timings & Overtime */}
          <div className="bg-[#696969]/5 rounded-lg p-3 border border-[#696969]/15 space-y-2">
            <div className="text-xs font-semibold text-[#014025] flex items-center space-x-1">
              <Clock className="w-3.5 h-3.5 text-[#456B5A]" />
              <span>Shift Timing &amp; Overtime Calculation</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div>
                <label className="block text-[11px] text-[#696969] mb-0.5">In Time</label>
                <input
                  type="time"
                  disabled={isSubmitting}
                  value={inTime}
                  onChange={(e) => setInTime(e.target.value)}
                  className="w-full border border-[#696969]/30 rounded px-2 py-1 bg-white font-mono text-xs text-[#014025]"
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#696969] mb-0.5">Out Time</label>
                <input
                  type="time"
                  disabled={isSubmitting}
                  value={outTime}
                  onChange={(e) => setOutTime(e.target.value)}
                  className="w-full border border-[#696969]/30 rounded px-2 py-1 bg-white font-mono text-xs text-[#014025]"
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#696969] mb-0.5">OT Hours</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  disabled={isSubmitting}
                  value={overtimeHours}
                  onChange={(e) => {
                    const h = parseFloat(e.target.value) || 0;
                    setOvertimeHours(h);
                    setOvertimeAmount(round2(h * overtimeRate));
                  }}
                  className="w-full border border-[#696969]/30 rounded px-2 py-1 bg-white font-mono text-xs text-[#014025]"
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#696969] mb-0.5">OT Total (₹)</label>
                <div className="w-full px-2 py-1 bg-[#456B5A]/10 border border-[#456B5A]/20 rounded font-mono font-semibold text-xs text-[#014025] flex items-center justify-end">
                  {formatINR(overtimeAmount)}
                </div>
              </div>
            </div>
          </div>

          {/* Team Member Self-Marked GPS Attendance Panel */}
          {teamGpsAttendees.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-300/80 rounded-xl p-3.5 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200 pb-2">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded-full bg-[#014025] text-white flex items-center justify-center font-bold text-xs shrink-0">
                    {teamGpsAttendees.length}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#014025] flex items-center space-x-1.5">
                      <span>Self-Marked GPS Attendance for this Team</span>
                      <span className="text-[10px] bg-emerald-100 text-[#014025] px-2 py-0.5 rounded-full font-semibold">
                        {selectedGpsAttendeeIds.length} Included
                      </span>
                    </h4>
                    <p className="text-[11px] text-emerald-800">
                      Team members marked their physical location via GPS check-in today.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAutoMergeGpsAttendees}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#014025] hover:bg-[#456B5A] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors shrink-0 cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Auto-Merge into Headcount</span>
                </button>
              </div>

              {/* Attendee Badges List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                {teamGpsAttendees.map((att) => {
                  const isChecked = selectedGpsAttendeeIds.includes(att.id);
                  return (
                    <div
                      key={att.id}
                      onClick={() => toggleGpsAttendee(att.id)}
                      className={`p-2 rounded-lg border text-xs cursor-pointer flex items-center justify-between transition-colors ${
                        isChecked
                          ? 'bg-white border-emerald-400 shadow-2xs'
                          : 'bg-emerald-50/50 border-emerald-200 opacity-60'
                      }`}
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            isChecked ? 'bg-[#014025] border-[#014025] text-white' : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isChecked && <Check className="w-3 h-3" />}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 truncate">{att.worker_name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {att.category_name || 'Worker'} • In: {att.check_in_time ? new Date(att.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                            att.check_in_status === 'valid_location'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {att.check_in_status === 'valid_location' ? 'Verified' : 'Flagged'}
                        </span>
                        {att.check_in_distance_meters !== null && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            {att.check_in_distance_meters}m
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Form Row 4: Count-based Labour Category Lines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-[#014025]">Labour Category Headcounts &amp; Rates</span>
                <span className="text-[11px] text-[#696969] ml-2">(Count-based labour model)</span>
              </div>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={addLine}
                className="text-xs flex items-center space-x-1 text-[#456B5A] hover:text-[#014025] font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Category</span>
              </button>
            </div>

            {lines.length === 0 ? (
              <div className="text-center py-6 border-2 border-dashed border-[#696969]/20 rounded-lg text-xs text-[#696969]">
                No labour categories assigned. Click &quot;Add Category&quot; to add masons, helpers, etc.
              </div>
            ) : (
              <div className="border border-[#696969]/20 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-[#696969]/10 text-[#014025] border-b border-[#696969]/20 font-semibold">
                    <tr>
                      <th className="py-2 px-3 text-left">Category</th>
                      <th className="py-2 px-3 text-center w-28">Worker Count</th>
                      <th className="py-2 px-3 text-right w-24">Rate (₹)</th>
                      <th className="py-2 px-3 text-right w-28">Amount (₹)</th>
                      <th className="py-2 px-2 text-center w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#696969]/10">
                    {lines.map((line, idx) => {
                      const catGpsCount = teamGpsAttendees.filter(
                        (a) => selectedGpsAttendeeIds.includes(a.id) && (a.labour_category_id === line.categoryId || (!a.labour_category_id && idx === 0))
                      ).length;

                      return (
                        <React.Fragment key={idx}>
                          <tr className="hover:bg-slate-50/50">
                            <td className="py-2 px-3">
                              <CustomSelect
                                disabled={isSubmitting}
                                value={line.categoryId}
                                onChange={(val) => {
                                  const cId = String(val);
                                  const selectedCat = categories.find((c) => c.id === cId);
                                  updateLine(idx, 'categoryId', cId);
                                  if (selectedCat) {
                                    updateLine(idx, 'categoryName', selectedCat.name);
                                    updateLine(idx, 'rate', selectedCat.default_rate);
                                  }
                                }}
                                options={categories.map((c) => ({
                                  value: c.id,
                                  label: c.name,
                                  sublabel: `${formatINR(c.default_rate)}/day`,
                                }))}
                                placeholder="Select category..."
                                size="sm"
                              />
                              {catGpsCount > 0 && (
                                <div className="mt-1 flex items-center space-x-1 text-[10px] text-emerald-700 font-semibold">
                                  <MapPin className="w-3 h-3 text-emerald-600" />
                                  <span>{catGpsCount} self-marked via GPS</span>
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <input
                                type="number"
                                min="0"
                                disabled={isSubmitting}
                                value={line.count === 0 ? '' : line.count}
                                placeholder="0"
                                onChange={(e) => updateLine(idx, 'count', e.target.value)}
                                className="w-20 text-center border border-[#696969]/30 rounded px-1.5 py-1 text-xs font-mono font-bold text-[#014025]"
                              />
                              {catGpsCount > 0 && (
                                <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                                  {catGpsCount} GPS + {Math.max(0, (line.count || 0) - catGpsCount)} staff
                                </div>
                              )}
                            </td>
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              min="0"
                              disabled={isSubmitting}
                              value={line.rate}
                              onChange={(e) => updateLine(idx, 'rate', e.target.value)}
                              className="w-20 text-right border border-[#696969]/30 rounded px-1.5 py-1 text-xs font-mono text-[#014025]"
                            />
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-[#014025]">
                            {formatINR(line.finalAmount)}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => removeLine(idx)}
                              className="text-[#696969] hover:text-red-500 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>

                        {/* Rate Override Option */}
                        {line.isOverridden && (
                          <tr className="bg-amber-50/50">
                            <td colSpan={5} className="px-3 py-2 space-y-1">
                              <div className="flex items-center justify-between text-[11px] text-amber-800">
                                <span>Rate Override Applied:</span>
                                <div className="flex items-center space-x-1">
                                  <span>Final Amount: ₹</span>
                                  <input
                                    type="number"
                                    disabled={isSubmitting}
                                    value={line.finalAmount}
                                    onChange={(e) => updateLine(idx, 'finalAmount', Number(e.target.value) || 0)}
                                    className="border border-[#456B5A]/30 rounded px-2 py-0.5 text-xs font-mono font-bold bg-white text-[#014025]"
                                  />
                                </div>
                              </div>
                              <input
                                type="text"
                                disabled={isSubmitting}
                                placeholder="Mandatory reason for override"
                                value={line.overrideReason || ''}
                                onChange={(e) => updateLine(idx, 'overrideReason', e.target.value)}
                                className="w-full border border-[#456B5A]/30 rounded px-2 py-1 text-xs bg-white text-[#014025]"
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* If editing approved attendance: mandatory Change Reason box */}
          {isEditingApproved && (
            <div>
              <label className="block text-xs font-semibold text-amber-900 mb-1">
                Mandatory Reason for Editing Approved Attendance <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={2}
                disabled={isSubmitting}
                placeholder="Explain the reason for changing previously approved attendance..."
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                className="w-full border border-amber-300 rounded-md px-3 py-2 text-xs bg-amber-50/30 text-[#014025] focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
            </div>
          )}

          {/* Remarks */}
          <div>
            <label className="block text-xs font-semibold text-[#014025] mb-1">
              Remarks / Work Done Notes
            </label>
            <input
              type="text"
              disabled={isSubmitting}
              placeholder="e.g. 5th floor column casting completed on schedule"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-xs bg-white text-[#014025] focus:ring-1 focus:ring-[#456B5A] focus:outline-none"
            />
          </div>

          {/* Optional Attachment File (Photo / Chit / Timesheet) */}
          <div className="bg-[#696969]/5 rounded-lg p-3 border border-[#696969]/15 space-y-2">
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-[#014025]">
              <Paperclip className="w-3.5 h-3.5 text-[#456B5A]" />
              <span>Attach Timesheet / Chit / Site Photo (PDF, JPG, PNG, XLSX)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <input
                type="file"
                disabled={isSubmitting}
                accept=".pdf,.jpg,.jpeg,.png,.xlsx"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setAttachmentFile(e.target.files[0]);
                  }
                }}
                className="border border-[#696969]/30 rounded px-2 py-1 bg-white text-xs text-[#014025]"
              />
              <input
                type="text"
                disabled={isSubmitting}
                placeholder="File description / note"
                value={attachmentDescription}
                onChange={(e) => setAttachmentDescription(e.target.value)}
                className="border border-[#696969]/30 rounded px-2 py-1 bg-white text-xs text-[#014025]"
              />
            </div>
          </div>

          {/* Daily Total Summary Card */}
          <div className="bg-[#456B5A] text-white rounded-lg p-3 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs text-white/70">Day Entry Total</div>
              <div className="text-xs text-white/80">
                Labour: <span className="font-mono text-white">{formatINR(totalLabourAmount)}</span> + OT:{' '}
                <span className="font-mono text-white">{formatINR(overtimeAmount)}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-white/80 font-semibold">Total Payable</div>
              <div className="text-base font-bold font-mono text-white">{formatINR(totalPayable)}</div>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="px-5 py-3 bg-[#696969]/5 border-t border-[#696969]/15 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="px-4 py-2 border border-[#696969]/30 text-[#696969] rounded-md text-xs font-medium hover:bg-[#696969]/10 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          {!editEntry && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit(true)}
              className="px-4 py-2 bg-[#456B5A] hover:bg-[#456B5A]/80 text-white rounded-md text-xs font-medium transition-colors disabled:opacity-50 flex items-center space-x-1.5"
            >
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>Save &amp; Add Another</span>
            </button>
          )}

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleSubmit(false)}
            className="px-5 py-2 bg-[#014025] hover:bg-[#014025]/80 text-white rounded-md text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 flex items-center space-x-1.5"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : editEntry ? (
              <span>{isEditingApproved ? 'Submit Change for Approval' : 'Update Entry'}</span>
            ) : (
              <span>Save Attendance</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
