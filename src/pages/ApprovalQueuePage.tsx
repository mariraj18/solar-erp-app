import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  FileText,
  ChevronRight,
  RefreshCw,
  Paperclip,
  MessageSquare,
  MapPin,
  Layers,
  Navigation,
  Crosshair,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatINR, round2 } from '../lib/calculations';
import { formatDateDisplay } from '../lib/dateUtils';
import { useAuth } from '../context/AuthContext';
import { MapLocationPicker } from '../components/MapLocationPicker';
import { CustomSelect } from '../components/CustomSelect';

export function ApprovalQueuePage() {
  const { user, isMasterAdmin, isSecondaryAdmin } = useAuth();
  const [queue, setQueue] = useState<any[]>([]);
  const [geofenceRequests, setGeofenceRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<any | null>(null);

  // Tab state: 'attendance' | 'geofence' - Master Admin approves Geofence requests; Secondary Admin approves Attendance
  const [activeTab, setActiveTab] = useState<'attendance' | 'geofence'>(
    isMasterAdmin ? 'geofence' : 'attendance'
  );

  // Filters
  const [attendanceTypeFilter, setAttendanceTypeFilter] = useState<'all' | 'pending_approval' | 'change_pending_approval'>('all');
  const [geofenceStatusFilter, setGeofenceStatusFilter] = useState<string>('pending');

  // Rejection modal state
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const loadQueue = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const gfcParams = geofenceStatusFilter !== 'all' ? { status: geofenceStatusFilter } : {};
      const [data, gfcList] = await Promise.all([
        api.attendance.getQueue(),
        api.geofenceRequests.list(gfcParams).catch(() => []),
      ]);
      setQueue(data);
      setGeofenceRequests(gfcList);
    } catch (err: any) {
      setError(err.message || 'Failed to load approval queue.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, [geofenceStatusFilter]);

  const handleApprove = async (entry: any) => {
    if (!window.confirm(`Approve attendance entry for ${entry.team_name} on ${formatDateDisplay(entry.date)}?`)) {
      return;
    }
    setIsProcessing(true);
    try {
      await api.attendance.approve(entry.id);
      await loadQueue();
      setSelectedEntry(null);
    } catch (err: any) {
      alert(err.message || 'Approval failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectionReason.trim()) {
      alert('Please enter a mandatory rejection reason.');
      return;
    }
    if (!selectedEntry) return;

    setIsProcessing(true);
    try {
      await api.attendance.reject(selectedEntry.id, rejectionReason.trim());
      setRejectModalOpen(false);
      setRejectionReason('');
      setSelectedEntry(null);
      await loadQueue();
    } catch (err: any) {
      alert(err.message || 'Rejection failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Geofence Approve / Reject Handlers
  const handleApproveGeofence = async (req: any) => {
    if (!window.confirm(`Approve and apply new geofence location for "${req.entity_name}"?`)) {
      return;
    }
    setIsProcessing(true);
    try {
      await api.geofenceRequests.approve(req.id);
      alert(`Geofence location change for "${req.entity_name}" has been approved and applied to live site perimeters.`);
      await loadQueue();
    } catch (err: any) {
      alert(err.message || 'Failed to approve geofence request.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectGeofence = async (req: any) => {
    const reason = window.prompt(`Enter rejection reason for "${req.entity_name}" location request:`);
    if (!reason || !reason.trim()) return;

    setIsProcessing(true);
    try {
      await api.geofenceRequests.reject(req.id, reason.trim());
      alert(`Geofence location request rejected.`);
      await loadQueue();
    } catch (err: any) {
      alert(err.message || 'Failed to reject geofence request.');
    } finally {
      setIsProcessing(false);
    }
  };

  const pendingSubmissions = queue.filter((e) => e.status === 'pending_approval');
  const pendingRevisions = queue.filter((e) => e.status === 'change_pending_approval');

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#696969]/20 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#014025] tracking-tight">
            Administrative Approval Queue
          </h1>
          <p className="text-xs sm:text-sm text-[#696969] mt-0.5">
            Review and authorize labour attendance submissions, proposed revisions, and staff geofence site location change requests
          </p>
        </div>
        <button
          onClick={loadQueue}
          disabled={isLoading}
          className="self-start sm:self-auto flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-[#456B5A]/30 text-xs font-semibold text-[#014025] hover:bg-[#456B5A]/10 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-[#696969] font-medium">
              {isMasterAdmin ? 'Attendance Approvals' : 'Pending Attendance Items'}
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-[#014025] mt-1">
              {isMasterAdmin
                ? 'Assigned Sec Admins'
                : pendingSubmissions.length + pendingRevisions.length}
            </div>
            <div className="text-[10px] text-[#696969] mt-0.5">
              {isMasterAdmin
                ? 'Muster rolls authorized by branch managers'
                : 'Submissions awaiting your review'}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#456B5A]/10 text-[#456B5A] flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-indigo-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-indigo-900 font-medium">Pending Geofence Location Requests</div>
            <div className="text-2xl font-bold font-mono text-indigo-700 mt-1">{geofenceRequests.length}</div>
            <div className="text-[10px] text-indigo-600 mt-0.5">
              {isMasterAdmin ? 'Requires Master Admin Approval' : 'Site geofence re-configurations'}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
            <MapPin className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-[#696969] font-medium">Assigned Authority Scope</div>
            <div className="text-sm font-semibold text-[#014025] mt-1">
              {isMasterAdmin ? 'Master Admin (Geo & System)' : `Branch Admin • ${user?.assignedLocation || 'Assigned Scope'}`}
            </div>
            <div className="text-[10px] text-[#696969] mt-0.5">
              {isMasterAdmin ? 'Dedicated to GPS & perimeter approvals' : 'Authorized for assigned staff attendance'}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#014025]/10 text-[#014025] flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center space-x-1 p-1 bg-slate-100 rounded-lg text-xs font-semibold max-w-fit">
        {!isMasterAdmin && (
          <button
            onClick={() => setActiveTab('attendance')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'attendance'
                ? 'bg-[#014025] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Attendance Submissions &amp; Revisions ({pendingSubmissions.length + pendingRevisions.length})</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('geofence')}
          className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center space-x-1.5 ${
            activeTab === 'geofence'
              ? 'bg-[#014025] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>Geofence &amp; Site Location Requests ({geofenceRequests.length})</span>
        </button>

        {isMasterAdmin && (
          <span className="px-2.5 py-1 text-[11px] text-[#696969] italic">
            (Attendance muster roll approvals delegated exclusively to assigned Secondary Admins)
          </span>
        )}
      </div>

      {/* TAB 1: ATTENDANCE APPROVALS */}
      {activeTab === 'attendance' && (
        <>
          <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-xl border border-[#696969]/20 shadow-2xs">
            <div className="flex items-center space-x-2 text-xs text-[#014025] font-semibold">
              <Clock className="w-4 h-4 text-[#456B5A]" />
              <span>Filter Attendance Submissions:</span>
            </div>
            <div className="w-64">
              <CustomSelect
                value={attendanceTypeFilter}
                onChange={(val) => setAttendanceTypeFilter(val as any)}
                options={[
                  { value: 'all', label: `All Pending Items (${pendingSubmissions.length + pendingRevisions.length})` },
                  { value: 'pending_approval', label: `New Submissions Only (${pendingSubmissions.length})` },
                  { value: 'change_pending_approval', label: `Proposed Revisions Only (${pendingRevisions.length})` },
                ]}
                size="sm"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="bg-white rounded-xl border border-[#696969]/20 p-12 text-center text-xs text-[#696969]">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#456B5A] mb-2" />
              Loading pending attendance items...
            </div>
          ) : queue.filter((e) => attendanceTypeFilter === 'all' || e.status === attendanceTypeFilter).length === 0 ? (
            <div className="bg-white rounded-xl border border-[#696969]/20 p-12 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <div className="font-semibold text-sm text-[#014025]">All Caught Up!</div>
              <div className="text-xs text-[#696969]">
                There are no attendance submissions or revisions matching this filter in your assigned scope.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {queue
                .filter((e) => attendanceTypeFilter === 'all' || e.status === attendanceTypeFilter)
                .map((entry) => {
                const isRevision = entry.status === 'change_pending_approval';
                const totalLinesCount = entry.lines ? entry.lines.reduce((acc: number, l: any) => acc + l.count, 0) : 0;
                const totalLabourAmt = entry.lines ? entry.lines.reduce((acc: number, l: any) => acc + (l.final_amount || 0), 0) : 0;
                const totalEntryPayable = round2(totalLabourAmt + (entry.overtime_amount || 0));

                return (
                  <div
                    key={entry.id}
                    className={`bg-white rounded-xl border shadow-xs transition-all overflow-hidden ${
                      isRevision ? 'border-amber-300' : 'border-[#696969]/20'
                    }`}
                  >
                    {/* Entry Banner */}
                    <div className="px-4 py-3 bg-[#696969]/5 border-b border-[#696969]/15 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            isRevision ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {isRevision ? 'Proposed Revision' : 'New Submission'}
                        </span>
                        <span className="font-semibold text-xs text-[#014025]">
                          Staff: <span className="text-[#456B5A]">{entry.staff_name}</span>
                        </span>
                        <span className="text-[#696969]/60 text-xs">•</span>
                        <span className="text-xs text-[#696969]">
                          Date: <span className="font-mono font-medium text-[#014025]">{formatDateDisplay(entry.date)}</span>
                        </span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleApprove(entry)}
                          disabled={isProcessing}
                          className="px-3 py-1 bg-[#014025] hover:bg-[#014025]/85 text-white rounded-md text-xs font-semibold shadow-xs flex items-center space-x-1 disabled:opacity-50 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                        <button
                          onClick={() => {
                            setSelectedEntry(entry);
                            setRejectionReason('');
                            setRejectModalOpen(true);
                          }}
                          disabled={isProcessing}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-semibold shadow-xs flex items-center space-x-1 disabled:opacity-50 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>

                    {/* Entry Details */}
                    <div className="p-4 space-y-3 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <div className="text-[11px] text-[#696969]">Team &amp; Location</div>
                          <div className="font-semibold text-[#014025]">{entry.team_name}</div>
                          <div className="text-[11px] text-[#696969]">{entry.location_project || 'General Site'} ({entry.shift_batch})</div>
                        </div>

                        <div>
                          <div className="text-[11px] text-[#696969]">Workforce &amp; Overtime</div>
                          <div className="font-semibold text-[#014025] font-mono">{totalLinesCount} Workers Recorded</div>
                          <div className="text-[11px] text-[#696969]">
                            {entry.in_time && entry.out_time ? `${entry.in_time} – ${entry.out_time}` : 'Regular Shift'}
                            {entry.overtime_hours > 0 && ` • OT: ${entry.overtime_hours} hrs (${formatINR(entry.overtime_amount)})`}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] text-[#696969]">Total Net Amount</div>
                          <div className="text-base font-bold font-mono text-[#014025]">{formatINR(totalEntryPayable)}</div>
                          <div className="text-[11px] text-[#696969]">Labour Wages: {formatINR(totalLabourAmt)}</div>
                        </div>
                      </div>

                      {/* Line breakdown */}
                      <div className="bg-[#696969]/5 rounded-lg p-2.5 space-y-1.5">
                        <div className="text-[11px] font-semibold text-[#014025]">Labour Category Breakdown:</div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {(entry.lines || []).map((l: any, idx: number) => (
                            <div key={idx} className="bg-white p-2 rounded border border-[#696969]/15 text-[11px]">
                              <div className="font-semibold text-[#014025] truncate">{l.category_name}</div>
                              <div className="text-[#696969] flex justify-between mt-0.5">
                                <span>{l.count} workers</span>
                                <span className="font-mono font-medium text-[#014025]">{formatINR(l.final_amount)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {entry.change_reason && (
                        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start space-x-2">
                          <MessageSquare className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold">Revision Justification:</span> {entry.change_reason}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* TAB 2: GEOFENCE & SITE LOCATION REQUESTS */}
      {activeTab === 'geofence' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-indigo-200 shadow-2xs">
            <div className="flex items-center space-x-2 text-xs text-[#014025] font-semibold">
              <MapPin className="w-4 h-4 text-indigo-600" />
              <span>Filter Geofence Requests by Status:</span>
            </div>
            <div className="w-64">
              <CustomSelect
                value={geofenceStatusFilter}
                onChange={(val) => setGeofenceStatusFilter(String(val))}
                options={[
                  { value: 'pending', label: 'Pending Review (Action Required)' },
                  { value: 'approved', label: 'Approved Changes' },
                  { value: 'rejected', label: 'Rejected Changes' },
                  { value: 'all', label: 'All Requests' },
                ]}
                size="sm"
              />
            </div>
          </div>

          {geofenceRequests.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#696969]/20 p-12 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <div className="font-semibold text-sm text-[#014025]">
                {geofenceStatusFilter === 'pending'
                  ? 'No Pending Geofence Requests'
                  : 'No Requests Found'}
              </div>
              <div className="text-xs text-[#696969]">
                {geofenceStatusFilter === 'pending'
                  ? 'There are no staff-requested site coordinate or radius changes awaiting your review.'
                  : 'No location requests match the selected status filter.'}
              </div>
            </div>
          ) : (
            geofenceRequests.map((req) => {
              const isPending = req.status === 'pending';
              const isApproved = req.status === 'approved';

              return (
                <div
                  key={req.id}
                  className={`bg-white rounded-xl border shadow-xs overflow-hidden space-y-3 ${
                    isPending ? 'border-indigo-200' : isApproved ? 'border-emerald-200' : 'border-rose-200'
                  }`}
                >
                  {/* Request Header Banner */}
                  <div
                    className={`px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2 ${
                      isPending
                        ? 'bg-indigo-50/70 border-indigo-100'
                        : isApproved
                        ? 'bg-emerald-50/60 border-emerald-100'
                        : 'bg-rose-50/60 border-rose-100'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          isPending
                            ? 'bg-indigo-100 text-indigo-900 border-indigo-200'
                            : isApproved
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
                            : 'bg-rose-100 text-rose-900 border-rose-200'
                        }`}
                      >
                        {req.status === 'pending' ? 'Pending Review' : req.status === 'approved' ? 'Approved' : 'Rejected'}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {req.entity_type === 'worksite' ? 'Worksite' : 'Team'}
                      </span>
                      <span className="font-bold text-sm text-[#014025]">{req.entity_name}</span>
                      <span className="text-xs text-slate-600">
                        • Requester: <strong className="text-slate-800">{req.requested_by_name}</strong>
                      </span>
                      <span className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                        Target Admin: {req.target_admin_id === user?.id ? 'You (Assigned)' : req.target_admin_id}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        ({new Date(req.created_at).toLocaleDateString()})
                      </span>
                    </div>

                    {isPending && (
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleApproveGeofence(req)}
                          disabled={isProcessing}
                          className="px-3.5 py-1.5 bg-[#014025] hover:bg-[#014025]/90 text-white rounded-md text-xs font-semibold shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approve Location</span>
                        </button>
                        <button
                          onClick={() => handleRejectGeofence(req)}
                          disabled={isProcessing}
                          className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-semibold shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="p-4 space-y-3 text-xs">
                    {/* Reason Box */}
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-950 flex items-start space-x-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Staff Reason:</span> {req.reason}
                      </div>
                    </div>

                    {/* Proposed Changes Preview if available */}
                    {(() => {
                      if (!req.proposed_changes_json) return null;
                      try {
                        const proposed = JSON.parse(req.proposed_changes_json);
                        return (
                          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs space-y-1.5">
                            <div className="text-[11px] font-bold text-blue-900 uppercase tracking-wider">
                              Proposed Worksite Details
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
                              <div>Worksite Name: <strong className="text-slate-900">{proposed.name}</strong></div>
                              <div>Project Name: <strong className="text-slate-900">{proposed.projectName}</strong></div>
                              {proposed.address && <div>Address: <strong className="text-slate-900">{proposed.address}</strong></div>}
                              {Array.isArray(proposed.assignedTeams) && (
                                <div>Assigned Teams: <strong className="text-slate-900">{proposed.assignedTeams.length} selected</strong></div>
                              )}
                            </div>
                          </div>
                        );
                      } catch {
                        return null;
                      }
                    })()}

                    {/* Review Note if already reviewed */}
                    {!isPending && req.reviewed_by_name && (
                      <div
                        className={`p-2.5 rounded-lg border text-xs ${
                          isApproved ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
                        }`}
                      >
                        <strong>Review Note:</strong> Reviewed by {req.reviewed_by_name} on{' '}
                        {new Date(req.reviewed_at || req.updated_at).toLocaleString()}
                        {req.review_notes && <span> — "{req.review_notes}"</span>}
                      </div>
                    )}

                    {/* Previous vs Requested Location Stats */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          Current Approved Location
                        </div>
                        <div className="font-mono text-slate-800">
                          Latitude: {req.previous_latitude?.toFixed(6) || 'None'} • Longitude:{' '}
                          {req.previous_longitude?.toFixed(6) || 'None'}
                        </div>
                        <div className="text-slate-600">
                          Allowed Radius: <strong className="text-slate-900">{req.previous_radius_meters || 150}m</strong>
                        </div>
                      </div>

                      <div className="p-3 bg-emerald-50/70 rounded-lg border border-emerald-200 space-y-1">
                        <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                          Requested New Location &amp; Radius
                        </div>
                        <div className="font-mono text-emerald-950 font-bold">
                          Latitude: {req.requested_latitude?.toFixed(6)} • Longitude: {req.requested_longitude?.toFixed(6)}
                        </div>
                        <div className="text-emerald-900">
                          Requested Radius: <strong className="text-emerald-950 font-mono text-sm">{req.requested_radius_meters}m</strong>
                          <span className="text-[11px] text-emerald-700 ml-2">(Accuracy: ±{req.requested_accuracy_threshold || 50}m)</span>
                        </div>
                      </div>
                    </div>

                    {/* Interactive Real Map Preview of Requested Location */}
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <MapLocationPicker
                        readOnly={true}
                        latitude={req.requested_latitude}
                        longitude={req.requested_longitude}
                        radiusMeters={req.requested_radius_meters}
                        accuracyThreshold={req.requested_accuracy_threshold}
                        height="230px"
                        label={`Requested Geofence Perimeter for ${req.entity_name}`}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Attendance Rejection Modal */}
      {rejectModalOpen && selectedEntry && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-[#696969]/20 w-full max-w-md overflow-hidden">
            <div className="px-5 py-3.5 bg-red-600 text-white font-bold text-sm flex items-center justify-between">
              <span>Reject Attendance Submission</span>
              <button onClick={() => setRejectModalOpen(false)} className="text-white/70 hover:text-white cursor-pointer">
                ✕
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div>
                <span className="text-[#696969]">Team: </span>
                <span className="font-semibold text-[#014025]">{selectedEntry.team_name}</span>
                <span className="text-[#696969] ml-2">({formatDateDisplay(selectedEntry.date)})</span>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#014025] mb-1">
                  Mandatory Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Mismatch in mason count with site log / Overtime not pre-approved..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full border border-[#696969]/30 rounded p-2 text-xs text-[#014025] focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>
              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#696969]/15">
                <button
                  type="button"
                  onClick={() => setRejectModalOpen(false)}
                  className="px-3 py-1.5 rounded border border-[#696969]/30 text-xs font-semibold text-[#696969] hover:bg-[#696969]/10 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleRejectSubmit}
                  className="px-3.5 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  Confirm Rejection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
