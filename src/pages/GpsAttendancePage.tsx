import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  Search,
  Filter,
  RefreshCw,
  Sliders,
  Send,
  UserCheck,
  Building2,
  Calendar,
  Layers,
  ArrowRight,
  UserCog,
  Check,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { CustomSelect } from '../components/CustomSelect';

export function GpsAttendancePage() {
  const { user, isMasterAdmin, isAdminAny } = useAuth();
  const [activeTab, setActiveTab] = useState<'records' | 'verifications' | 'participants' | 'reconciliation'>('records');

  // Attendance Records State
  const [records, setRecords] = useState<any[]>([]);
  const [worksites, setWorksites] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [labourers, setLabourers] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Office isolation & categorisation state
  const [offices, setOffices] = useState<any[]>([]);
  const [selectedOffice, setSelectedOffice] = useState<string>('all');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [worksiteFilter, setWorksiteFilter] = useState('');

  // Verifications State
  const [verifications, setVerifications] = useState<any[]>([]);
  const [showTriggerVerifModal, setShowTriggerVerifModal] = useState(false);
  const [verifTargetType, setVerifTargetType] = useState<'individual' | 'team'>('individual');
  const [verifTargetUserId, setVerifTargetUserId] = useState('');
  const [verifTargetTeamId, setVerifTargetTeamId] = useState('');
  const [verifNotes, setVerifNotes] = useState('');

  // Override Modal State
  const [overrideTarget, setOverrideTarget] = useState<any | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideStatus, setOverrideStatus] = useState('approved');
  const [overrideHours, setOverrideHours] = useState(8);
  const [overrideOt, setOverrideOt] = useState(0);

  // Supervisors & Participants State
  const [participants, setParticipants] = useState<any[]>([]);
  const [showAssignPartModal, setShowAssignPartModal] = useState(false);
  const [partUserId, setPartUserId] = useState('');
  const [partSupervisorId, setPartSupervisorId] = useState('');
  const [partTeamId, setPartTeamId] = useState('');
  const [partWorksiteId, setPartWorksiteId] = useState('');

  // Reconciliation State
  const [reconciliation, setReconciliation] = useState<any | null>(null);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [recs, ws, tms, labs, usrs, vrfs, sups, recon, offList] = await Promise.all([
        api.gpsAttendance.getAll({
          secondaryAdminId: selectedOffice !== 'all' ? selectedOffice : undefined,
        }),
        api.worksites.list(),
        api.teams.list(),
        api.labourers.list(),
        api.users.list(),
        api.verifications.list(),
        api.attendanceSupervisors.list(),
        api.gpsAttendance.getReconciliation(),
        isMasterAdmin ? api.offices.list().catch(() => []) : Promise.resolve([]),
      ]);

      setRecords(recs || []);
      setWorksites(ws || []);
      setTeams(tms || []);
      setLabourers(labs || []);
      setUsersList(usrs || []);
      setVerifications(vrfs || []);
      setParticipants(sups || []);
      setReconciliation(recon || null);
      if (offList && offList.length > 0) setOffices(offList);

      if (labs && labs.length > 0 && !verifTargetUserId) {
        setVerifTargetUserId(labs[0].id);
      }
      if (tms && tms.length > 0 && !verifTargetTeamId) {
        setVerifTargetTeamId(tms[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load GPS attendance data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [selectedOffice]);

  // Approve Record
  const handleApprove = async (id: string) => {
    try {
      await api.gpsAttendance.approve(id);
      await loadAll();
    } catch (err: any) {
      alert(err.message || 'Failed to approve attendance.');
    }
  };

  // Reject Record
  const handleReject = async (id: string) => {
    const reason = window.prompt('Enter mandatory rejection reason:');
    if (!reason || !reason.trim()) return;
    try {
      await api.gpsAttendance.reject(id, reason.trim());
      await loadAll();
    } catch (err: any) {
      alert(err.message || 'Failed to reject attendance.');
    }
  };

  // Submit Admin Override
  const handleSubmitOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideTarget || !overrideReason.trim()) {
      alert('A mandatory reason is required for manual override.');
      return;
    }

    try {
      await api.gpsAttendance.override(overrideTarget.id, {
        reason: overrideReason.trim(),
        status: overrideStatus,
        payableHours: Number(overrideHours),
        overtimeHours: Number(overrideOt),
      });
      setOverrideTarget(null);
      setOverrideReason('');
      await loadAll();
    } catch (err: any) {
      alert(err.message || 'Failed to apply override.');
    }
  };

  // Trigger 30-min Spot Verification
  const handleTriggerVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.verifications.request({
        targetType: verifTargetType,
        targetUserId: verifTargetType === 'individual' ? verifTargetUserId : undefined,
        targetTeamId: verifTargetType === 'team' ? verifTargetTeamId : undefined,
        notes: verifNotes || 'Random spot check request',
      });
      setShowTriggerVerifModal(false);
      setVerifNotes('');
      alert('30-Minute Random Attendance Verification request dispatched successfully.');
      await loadAll();
    } catch (err: any) {
      alert(err.message || 'Failed to trigger verification request.');
    }
  };

  // Assign Participant to Supervisor
  const handleAssignParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partUserId || !partSupervisorId) {
      alert('Please select both participant and designated supervisor.');
      return;
    }

    try {
      await api.attendanceSupervisors.assign({
        participantId: partUserId,
        supervisorId: partSupervisorId,
        assignedTeamId: partTeamId || undefined,
        assignedWorksiteId: partWorksiteId || undefined,
      });
      setShowAssignPartModal(false);
      await loadAll();
    } catch (err: any) {
      alert(err.message || 'Failed to assign supervisor.');
    }
  };

  // Remove Participant Assignment
  const handleRemoveParticipant = async (id: string) => {
    if (!window.confirm('Remove this attendance supervisor assignment?')) return;
    try {
      await api.attendanceSupervisors.delete(id);
      await loadAll();
    } catch (err: any) {
      alert(err.message || 'Failed to remove assignment.');
    }
  };

  const filteredRecords = records.filter((r) => {
    const matchesSearch =
      r.user_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.worksite_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.date?.includes(search);
    const matchesStatus = !statusFilter || r.status === statusFilter;
    const matchesWorksite = !worksiteFilter || r.worksite_id === worksiteFilter;
    return matchesSearch && matchesStatus && matchesWorksite;
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-slate-900 flex items-center space-x-2 tracking-tight">
            <MapPin className="w-5 h-5 sm:w-6 sm:h-6 text-[#0E6037] shrink-0" />
            <span>GPS Geofenced Attendance</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Review individual labourer GPS check-ins, resolve exceptions, and dispatch spot verifications.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTriggerVerifModal(true)}
            className="flex-1 sm:flex-none inline-flex items-center justify-center space-x-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>Spot Check</span>
          </button>

          <button
            onClick={loadAll}
            className="p-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-600 transition-colors cursor-pointer"
            title="Refresh records"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto gap-2 text-xs sm:text-sm font-semibold no-scrollbar">
        <button
          onClick={() => setActiveTab('records')}
          className={`pb-2.5 px-2.5 sm:px-3 border-b-2 transition-colors cursor-pointer flex items-center space-x-1.5 shrink-0 ${
            activeTab === 'records'
              ? 'border-[#0E6037] text-[#0E6037]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-4 h-4 shrink-0" />
          <span>GPS Queue <span className="text-[11px] font-mono font-normal opacity-75">({records.length})</span></span>
        </button>

        <button
          onClick={() => setActiveTab('verifications')}
          className={`pb-2.5 px-2.5 sm:px-3 border-b-2 transition-colors cursor-pointer flex items-center space-x-1.5 shrink-0 ${
            activeTab === 'verifications'
              ? 'border-[#0E6037] text-[#0E6037]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>Spot Checks <span className="text-[11px] font-mono font-normal opacity-75">({verifications.length})</span></span>
        </button>

        <button
          onClick={() => setActiveTab('participants')}
          className={`pb-2.5 px-2.5 sm:px-3 border-b-2 transition-colors cursor-pointer flex items-center space-x-1.5 shrink-0 ${
            activeTab === 'participants'
              ? 'border-[#0E6037] text-[#0E6037]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <UserCog className="w-4 h-4 shrink-0" />
          <span>Supervisors <span className="text-[11px] font-mono font-normal opacity-75">({participants.length})</span></span>
        </button>

        <button
          onClick={() => setActiveTab('reconciliation')}
          className={`pb-2.5 px-2.5 sm:px-3 border-b-2 transition-colors cursor-pointer flex items-center space-x-1.5 shrink-0 ${
            activeTab === 'reconciliation'
              ? 'border-[#0E6037] text-[#0E6037]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4 shrink-0" />
          <span>Reconciliation</span>
          {reconciliation?.overlapsCount > 0 && (
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
          )}
        </button>
      </div>

      {/* TAB 1: GPS ATTENDANCE QUEUE */}
      {activeTab === 'records' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search worker, site, or date..."
                className="w-full pl-9 pr-4 py-1.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>

            {isMasterAdmin && offices.length > 0 && (
              <div className="w-full">
                <CustomSelect
                  value={selectedOffice}
                  onChange={(val) => setSelectedOffice(String(val))}
                  options={[
                    { value: 'all', label: 'All Offices (Combined)' },
                    ...offices.map((o) => ({ value: o.id, label: o.name })),
                  ]}
                  placeholder="Filter by Office"
                  size="sm"
                />
              </div>
            )}

            <div className="w-full">
              <CustomSelect
                value={statusFilter}
                onChange={(val) => setStatusFilter(String(val))}
                options={[
                  { value: '', label: 'All Statuses' },
                  { value: 'pending', label: 'Pending Approval', badge: 'Review', badgeColor: 'amber' },
                  { value: 'approved', label: 'Approved', badge: 'Valid', badgeColor: 'green' },
                  { value: 'rejected', label: 'Rejected', badge: 'Denied', badgeColor: 'red' },
                ]}
                placeholder="All Statuses"
                size="sm"
              />
            </div>

            <div className="w-full">
              <CustomSelect
                value={worksiteFilter}
                onChange={(val) => setWorksiteFilter(String(val))}
                options={[
                  { value: '', label: 'All Worksites' },
                  ...worksites.map((ws) => ({ value: ws.id, label: ws.name })),
                ]}
                placeholder="All Worksites"
                size="sm"
              />
            </div>
          </div>

          {/* Records Display: Mobile Cards (md:hidden) + Desktop Table (hidden md:block) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            {filteredRecords.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">No GPS attendance records found.</div>
            ) : (
              <>
                {/* Mobile Cards View */}
                <div className="md:hidden divide-y divide-slate-100">
                  {filteredRecords.map((r) => {
                    const isOverridden = Boolean(r.is_overridden);
                    const isSelf = user?.id === r.user_id;

                    return (
                      <div key={r.id} className="p-3.5 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-slate-900 text-sm">{r.user_name}</div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                {r.date}
                              </span>
                              <span>•</span>
                              <span className="font-semibold text-slate-700">{r.worksite_name}</span>
                              {isMasterAdmin && (
                                <>
                                  <span>•</span>
                                  <span className="text-slate-600 bg-slate-100 px-1 py-0.2 rounded text-[10px]">
                                    {r.office_name || 'Head Office'}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                r.status === 'approved'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : r.status === 'rejected'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {r.status}
                            </span>
                            {isOverridden && (
                              <span className="block text-[9px] font-bold text-purple-700 mt-0.5">
                                Override
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="p-2.5 bg-slate-50 rounded-xl space-y-1 text-xs">
                          <div className="flex justify-between items-center text-slate-600">
                            <span className="text-[11px]">Check-In / Out:</span>
                            <span className="font-mono font-medium text-slate-800 text-[11px]">
                              {r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                              {' → '}
                              {r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Pending'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-slate-600">
                            <span className="text-[11px]">Distance:</span>
                            <span className="font-mono text-slate-700 text-[11px]">
                              <strong className={r.check_in_distance_meters > 150 ? 'text-amber-700' : 'text-emerald-800'}>
                                {r.check_in_distance_meters || 0}m
                              </strong>
                              {' '}(Acc: {r.check_in_accuracy ? Math.round(r.check_in_accuracy) + 'm' : '—'})
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-slate-600 pt-1 border-t border-slate-200/60">
                            <span className="text-[11px]">Duration &amp; Pay:</span>
                            <span className="font-bold text-slate-900 text-[11px]">
                              {r.payable_hours ? `${r.payable_hours} hrs` : 'In Progress'}
                              {r.calculated_wages ? ` • ₹${r.calculated_wages}` : ''}
                            </span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center justify-end gap-2 pt-1">
                          {r.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(r.id)}
                                disabled={isSelf}
                                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Approve</span>
                              </button>
                              <button
                                onClick={() => handleReject(r.id)}
                                disabled={isSelf}
                                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>Reject</span>
                              </button>
                            </>
                          )}

                          {isAdminAny && (
                            <button
                              onClick={() => {
                                setOverrideTarget(r);
                                setOverrideHours(r.payable_hours || 8);
                                setOverrideOt(r.overtime_hours || 0);
                                setOverrideStatus(r.status || 'approved');
                                setOverrideReason('');
                              }}
                              className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Sliders className="w-3.5 h-3.5" />
                              <span>Override</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold text-[11px] uppercase tracking-wider">
                        <th className="py-3 px-4">Date &amp; Worker</th>
                        {isMasterAdmin && <th className="py-3 px-4">Office / Branch</th>}
                        <th className="py-3 px-4">Worksite &amp; Geofence</th>
                        <th className="py-3 px-4">Check-In / Out Times</th>
                        <th className="py-3 px-4">Duration &amp; Pay</th>
                        <th className="py-3 px-4">Validation Status</th>
                        <th className="py-3 px-4 text-right">Approval Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRecords.map((r) => {
                        const isOverridden = Boolean(r.is_overridden);
                        const isSelf = user?.id === r.user_id;

                        return (
                          <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900">{r.user_name}</div>
                              <div className="text-[11px] text-slate-500 font-mono flex items-center space-x-1 mt-0.5">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                <span>{r.date}</span>
                              </div>
                            </td>

                            {isMasterAdmin && (
                              <td className="py-3 px-4">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-800 border border-slate-200">
                                  <Building2 className="w-3 h-3 mr-1 text-[#456B5A]" />
                                  {r.office_name || (r.secondary_admin_name ? `${r.secondary_admin_name} Branch` : 'Head Office')}
                                </span>
                              </td>
                            )}

                            <td className="py-3 px-4">
                              <div className="font-semibold text-slate-800">{r.worksite_name}</div>
                              <div className="text-[11px] text-slate-500 space-x-2 mt-0.5">
                                <span>Distance: <strong className={r.check_in_distance_meters > 150 ? 'text-amber-700' : 'text-slate-800'}>{r.check_in_distance_meters || 0}m</strong></span>
                                <span>• Acc: {r.check_in_accuracy ? Math.round(r.check_in_accuracy) + 'm' : '—'}</span>
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <div className="font-mono text-xs text-slate-800">
                                In: {r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                              </div>
                              <div className="font-mono text-xs text-slate-500 mt-0.5">
                                Out: {r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Pending'}
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900">
                                {r.payable_hours ? `${r.payable_hours} hrs` : 'In Progress'}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                Est. ₹{r.calculated_wages || 0}
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <div className="space-y-1">
                                <span
                                  className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                    r.status === 'approved'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : r.status === 'rejected'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {r.status}
                                </span>

                                {isOverridden && (
                                  <span className="block text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                                    Admin Override
                                  </span>
                                )}

                                {r.check_in_status === 'outside_radius' && (
                                  <span className="block text-[10px] text-amber-700 font-semibold">
                                    Outside Radius
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end space-x-1.5">
                                {r.status === 'pending' && (
                                  <>
                                    <button
                                      onClick={() => handleApprove(r.id)}
                                      disabled={isSelf}
                                      title={isSelf ? 'Self-approval forbidden' : 'Approve attendance'}
                                      className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-[#0E6037] rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleReject(r.id)}
                                      disabled={isSelf}
                                      title={isSelf ? 'Cannot reject self' : 'Reject attendance'}
                                      className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </>
                                )}

                                {isAdminAny && (
                                  <button
                                    onClick={() => {
                                      setOverrideTarget(r);
                                      setOverrideHours(r.payable_hours || 8);
                                      setOverrideOt(r.overtime_hours || 0);
                                      setOverrideStatus(r.status || 'approved');
                                      setOverrideReason('');
                                    }}
                                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer text-[11px] font-semibold flex items-center space-x-1"
                                    title="Admin Override with mandatory reason"
                                  >
                                    <Sliders className="w-3.5 h-3.5" />
                                    <span>Override</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: RANDOM 30-MINUTE VERIFICATIONS */}
      {activeTab === 'verifications' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start space-x-3 text-xs text-amber-900">
            <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-sm">30-Minute Random Attendance Verification Policy</h4>
              <p className="mt-0.5 leading-relaxed text-amber-800">
                Authorized administrators and supervisors can trigger random spot verifications for any individual worker or entire team. The worker's mobile application shows a live countdown and requires a fresh GPS fix within 30 minutes. Requests unfulfilled within 30 minutes are automatically marked as expired and flagged for review.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            {verifications.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">No verification requests found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold text-[11px] uppercase tracking-wider">
                      <th className="py-3 px-4">Requested At</th>
                      <th className="py-3 px-4">Target (Worker/Team)</th>
                      <th className="py-3 px-4">Requester</th>
                      <th className="py-3 px-4">Deadline (30 Min)</th>
                      <th className="py-3 px-4">Result / Status</th>
                      <th className="py-3 px-4">Distance &amp; Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {verifications.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs text-slate-800">
                          {new Date(v.requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          <span className="block text-[10px] text-slate-400">{v.requested_at.slice(0, 10)}</span>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">
                            {v.target_type === 'individual' ? v.target_user_name || 'Individual Worker' : `Team: ${v.target_team_name}`}
                          </div>
                          <div className="text-[10px] text-slate-400 capitalize">{v.target_type} Verification</div>
                        </td>

                        <td className="py-3 px-4 text-slate-700">
                          {v.requested_by_name}
                        </td>

                        <td className="py-3 px-4 font-mono text-xs">
                          {new Date(v.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>

                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              v.status === 'valid_location'
                                ? 'bg-emerald-100 text-emerald-800'
                                : v.status === 'pending'
                                ? 'bg-amber-100 text-amber-800 animate-pulse'
                                : v.status === 'expired'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-purple-100 text-purple-800'
                            }`}
                          >
                            {v.status.replace('_', ' ')}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-xs text-slate-600">
                          {v.distance_meters !== null ? `${v.distance_meters}m from site` : 'No response fix'}
                          {v.response_notes && <span className="block text-[10px] text-slate-400">{v.response_notes}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: ADMIN & STAFF ATTENDANCE PARTICIPATION */}
      {activeTab === 'participants' && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex items-start justify-between text-xs text-emerald-950">
            <div className="space-y-1">
              <h4 className="font-bold text-sm">Attendance Participation Without Changing Administrative Roles</h4>
              <p className="text-emerald-800 leading-relaxed max-w-2xl">
                Secondary admins or staff members who are also required to submit daily muster attendance can participate under designated supervisors. They retain their complete administrative role, but must submit attendance to their assigned supervisor. Self-approval is strictly prohibited.
              </p>
            </div>

            {isMasterAdmin && (
              <button
                onClick={() => setShowAssignPartModal(true)}
                className="px-3 py-2 bg-[#0E6037] hover:bg-[#0B4D2C] text-white rounded-xl text-xs font-semibold shadow-xs shrink-0 cursor-pointer"
              >
                Assign Supervisor
              </button>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            {participants.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">No participant assignments found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold text-[11px] uppercase tracking-wider">
                      <th className="py-3 px-4">Participant Account</th>
                      <th className="py-3 px-4">Actual Account Role</th>
                      <th className="py-3 px-4">Designated Supervisor</th>
                      <th className="py-3 px-4">Assigned Site / Team</th>
                      <th className="py-3 px-4">Attendance Method</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {participants.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900">{p.participant_name}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-bold uppercase">
                            {p.participant_actual_role}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-800 font-semibold">
                          {p.supervisor_name} ({p.supervisor_role})
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          {p.worksite_name || 'Lumia Main Site'} • {p.team_name || 'General'}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-[#0E6037] text-[10px] font-bold uppercase">
                            {p.attendance_method}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {isMasterAdmin && (
                            <button
                              onClick={() => handleRemoveParticipant(p.id)}
                              className="text-red-600 hover:text-red-800 text-xs font-semibold cursor-pointer"
                            >
                              Unassign
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: DOUBLE-COUNT RECONCILIATION */}
      {activeTab === 'reconciliation' && (
        <div className="space-y-4">
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-start space-x-3 text-xs text-slate-700">
            <Layers className="w-5 h-5 text-[#0E6037] shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-sm text-slate-900">Muster Roll vs. GPS Attendance Reconciliation</h4>
              <p className="mt-0.5 leading-relaxed text-slate-500">
                To prevent paying for the same labour hours twice, the system verifies that a team is not simultaneously claiming headcount wages through count-based muster entries while also submitting individual GPS attendance for the same work period.
              </p>
            </div>
          </div>

          {reconciliation?.overlapsCount === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <h4 className="font-bold text-slate-800 text-sm">No Double-Counting Overlaps Detected</h4>
              <p className="text-xs text-slate-500">
                Count-based entries and individual GPS attendance records for week starting{' '}
                <span className="font-mono font-bold text-slate-800">{reconciliation?.weekStartDate}</span> are completely isolated and reconciled.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>Found {reconciliation?.overlapsCount} potential double-counting overlaps for this week.</span>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 uppercase text-[10px]">
                      <th className="py-2.5 px-4">Date</th>
                      <th className="py-2.5 px-4">Team</th>
                      <th className="py-2.5 px-4">Count-Based Headcount</th>
                      <th className="py-2.5 px-4">Individual GPS Workers</th>
                      <th className="py-2.5 px-4">Flag</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reconciliation?.overlaps?.map((o: any, idx: number) => (
                      <tr key={idx} className="hover:bg-amber-50/50">
                        <td className="py-3 px-4 font-mono font-bold">{o.date}</td>
                        <td className="py-3 px-4 font-semibold">{o.teamName}</td>
                        <td className="py-3 px-4">{o.countBasedHeadcount} workers</td>
                        <td className="py-3 px-4">{o.individualGpsCount} GPS check-ins</td>
                        <td className="py-3 px-4 text-amber-700 font-semibold">{o.warning}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Trigger Spot Verification Modal */}
      {showTriggerVerifModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <ShieldAlert className="w-5 h-5 text-amber-600" />
              <span>Request 30-Minute Attendance Verification</span>
            </h3>

            <p className="text-xs text-slate-500">
              Dispatches an immediate spot verification request to the selected worker or team. They must provide fresh GPS coordinates within 30 minutes.
            </p>

            <form onSubmit={handleTriggerVerification} className="space-y-3.5 text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Type</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setVerifTargetType('individual')}
                    className={`flex-1 py-2 text-xs font-semibold rounded-xl border cursor-pointer ${
                      verifTargetType === 'individual'
                        ? 'bg-[#0E6037] text-white border-[#0E6037]'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Individual Labourer
                  </button>
                  <button
                    type="button"
                    onClick={() => setVerifTargetType('team')}
                    className={`flex-1 py-2 text-xs font-semibold rounded-xl border cursor-pointer ${
                      verifTargetType === 'team'
                        ? 'bg-[#0E6037] text-white border-[#0E6037]'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Entire Team
                  </button>
                </div>
              </div>

              {verifTargetType === 'individual' ? (
                <div>
                  <CustomSelect
                    label="Select Labourer"
                    required
                    value={verifTargetUserId}
                    onChange={(val) => setVerifTargetUserId(String(val))}
                    options={labourers.map((l) => ({
                      value: l.id,
                      label: l.full_name,
                      sublabel: `+91 ${l.mobile_number || ''} · ${l.team_name || 'No team'}`,
                    }))}
                    placeholder="Choose Labourer"
                  />
                </div>
              ) : (
                <div>
                  <CustomSelect
                    label="Select Team"
                    required
                    value={verifTargetTeamId}
                    onChange={(val) => setVerifTargetTeamId(String(val))}
                    options={teams.map((t) => ({
                      value: t.id,
                      label: t.name,
                      sublabel: t.work_category,
                    }))}
                    placeholder="Choose Team"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason / Notes</label>
                <input
                  type="text"
                  value={verifNotes}
                  onChange={(e) => setVerifNotes(e.target.value)}
                  placeholder="e.g. Afternoon shift spot verification"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowTriggerVerifModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold shadow-xs cursor-pointer flex items-center space-x-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send 30-Min Verification</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Manual Override Modal */}
      {overrideTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <Sliders className="w-5 h-5 text-purple-700" />
              <span>Admin Override: {overrideTarget.user_name}</span>
            </h3>

            <p className="text-xs text-slate-500">
              Manual administrative adjustments require a mandatory reason and are recorded permanently in the system audit history.
            </p>

            <form onSubmit={handleSubmitOverride} className="space-y-3.5 text-xs sm:text-sm">
              <div>
                <CustomSelect
                  label="Attendance Status"
                  required
                  value={overrideStatus}
                  onChange={(val) => setOverrideStatus(String(val))}
                  options={[
                    { value: 'approved', label: 'Approved (Valid)', badge: 'Approved', badgeColor: 'green' },
                    { value: 'pending', label: 'Pending Review', badge: 'Pending', badgeColor: 'amber' },
                    { value: 'rejected', label: 'Rejected', badge: 'Rejected', badgeColor: 'red' },
                  ]}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payable Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    value={overrideHours}
                    onChange={(e) => setOverrideHours(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Overtime Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    value={overrideOt}
                    onChange={(e) => setOverrideOt(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mandatory Override Reason *
                </label>
                <textarea
                  required
                  rows={3}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. Worker was physically present at sub-station boundary where cellular GPS drifted 25m outside fence."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setOverrideTarget(null)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl font-semibold shadow-xs cursor-pointer"
                >
                  Apply Override
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Supervisor Modal */}
      {showAssignPartModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <UserCog className="w-5 h-5 text-[#0E6037]" />
              <span>Assign Attendance Supervisor</span>
            </h3>

            <p className="text-xs text-slate-500">
              Configure attendance participation for staff or secondary admin accounts under a supervisor without changing their administrative role.
            </p>

            <form onSubmit={handleAssignParticipant} className="space-y-3.5 text-xs sm:text-sm">
              <div>
                <CustomSelect
                  label="Participant Account"
                  required
                  value={partUserId}
                  onChange={(val) => setPartUserId(String(val))}
                  options={usersList.map((u) => ({
                    value: u.id,
                    label: u.full_name,
                    sublabel: u.role,
                  }))}
                  placeholder="Select participant..."
                />
              </div>

              <div>
                <CustomSelect
                  label="Designated Supervisor"
                  required
                  value={partSupervisorId}
                  onChange={(val) => setPartSupervisorId(String(val))}
                  options={usersList
                    .filter((u) => u.id !== partUserId)
                    .map((u) => ({
                      value: u.id,
                      label: u.full_name,
                      sublabel: u.role,
                    }))}
                  placeholder="Select supervisor..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <CustomSelect
                    label="Worksite"
                    value={partWorksiteId}
                    onChange={(val) => setPartWorksiteId(String(val))}
                    options={[
                      { value: '', label: 'Select worksite...' },
                      ...worksites.map((ws) => ({ value: ws.id, label: ws.name })),
                    ]}
                    placeholder="Select worksite..."
                  />
                </div>

                <div>
                  <CustomSelect
                    label="Team"
                    value={partTeamId}
                    onChange={(val) => setPartTeamId(String(val))}
                    options={[
                      { value: '', label: 'Select team...' },
                      ...teams.map((t) => ({ value: t.id, label: t.name, sublabel: t.work_category })),
                    ]}
                    placeholder="Select team..."
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAssignPartModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#0E6037] hover:bg-[#0B4D2C] text-white rounded-xl font-semibold shadow-xs cursor-pointer"
                >
                  Save Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
