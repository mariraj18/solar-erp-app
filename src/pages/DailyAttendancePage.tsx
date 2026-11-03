import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Calendar,
  Clock,
  Edit2,
  Trash2,
  Copy,
  AlertTriangle,
  Users,
  Banknote,
  TrendingUp,
  MapPin,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ShieldAlert,
  Crosshair,
  Navigation,
  Eye,
  AlertCircle,
  FileCheck2,
  Building2,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatINR, round2 } from '../lib/calculations';
import { getTodayKolkataISO, formatDateDisplay } from '../lib/dateUtils';
import { AttendanceModal } from '../components/AttendanceModal';
import { useAuth } from '../context/AuthContext';
import { CustomSelect } from '../components/CustomSelect';

export function DailyAttendancePage() {
  const { user, isAdminAny, isMasterAdmin, isSecondaryAdmin } = useAuth();
  const [selectedDate, setSelectedDate] = useState<string>(getTodayKolkataISO());
  const [entries, setEntries] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [gpsRecords, setGpsRecords] = useState<any[]>([]);
  const [verifications, setVerifications] = useState<any[]>([]);
  const [labourers, setLabourers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Multi-office filtering & view mode
  const [offices, setOffices] = useState<any[]>([]);
  const [selectedOffice, setSelectedOffice] = useState<string>('all');
  const [attendanceViewMode, setAttendanceViewMode] = useState<'combined' | 'office_wise'>('combined');

  // Active view section: 'entries' | 'gps' | 'verifications'
  const [activeSection, setActiveSection] = useState<'entries' | 'gps' | 'verifications'>('entries');

  // Re-request location modal state
  const [reRequestModalOpen, setReRequestModalOpen] = useState(false);
  const [targetGpsRecord, setTargetGpsRecord] = useState<any | null>(null);
  const [reRequestReason, setReRequestReason] = useState('Location fix was outside site geofence perimeter.');
  const [isSubmittingReRequest, setIsSubmittingReRequest] = useState(false);

  // New spot verification modal state
  const [spotModalOpen, setSpotModalOpen] = useState(false);
  const [spotTargetType, setSpotTargetType] = useState<'individual' | 'team'>('individual');
  const [spotTargetUserId, setSpotTargetUserId] = useState('');
  const [spotTargetTeamId, setSpotTargetTeamId] = useState('');
  const [spotNotes, setSpotNotes] = useState('Routine 30-minute spot check');
  const [isSubmittingSpot, setIsSubmittingSpot] = useState(false);

  useEffect(() => {
    loadData();
  }, [selectedDate, selectedOffice]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [entryList, teamList, gpsList, verifList, labList, offList] = await Promise.all([
        api.attendance.list({
          date: selectedDate,
          secondaryAdminId: selectedOffice !== 'all' ? selectedOffice : undefined,
        }),
        api.teams.list(),
        api.gpsAttendance.getAll({
          date: selectedDate,
          secondaryAdminId: selectedOffice !== 'all' ? selectedOffice : undefined,
        }),
        api.verifications.list({ date: selectedDate }),
        api.labourers.list().catch(() => []),
        isMasterAdmin ? api.offices.list().catch(() => []) : Promise.resolve([]),
      ]);
      setEntries(entryList);
      setTeams(teamList);
      setGpsRecords(gpsList);
      setVerifications(verifList);
      setLabourers(labList);
      if (offList && offList.length > 0) setOffices(offList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNew = () => {
    setEditingEntry(null);
    setModalOpen(true);
  };

  const handleEdit = (entry: any) => {
    setEditingEntry(entry);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this attendance entry? It will be logged in the audit trail.')) return;
    try {
      await api.attendance.delete(id);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete');
    }
  };

  const handleDuplicate = async (entry: any) => {
    try {
      await api.attendance.create({
        date: entry.date,
        teamId: entry.team_id,
        locationProject: entry.location_project,
        shiftBatch: `${entry.shift_batch} (Batch 2)`,
        inTime: entry.in_time,
        outTime: entry.out_time,
        overtimeHours: entry.overtime_hours,
        overtimeRate: entry.overtime_rate,
        overtimeAmount: entry.overtime_amount,
        remarks: entry.remarks ? `Duplicate: ${entry.remarks}` : '',
        lines: entry.lines?.map((l: any) => ({
          categoryId: l.category_id,
          categoryName: l.category_name,
          count: l.count,
          rate: l.rate,
          rateType: l.rate_type,
          calculatedAmount: l.calculated_amount,
          finalAmount: l.final_amount,
          isOverridden: l.is_overridden,
          overrideReason: l.override_reason,
        })),
      });
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to duplicate');
    }
  };

  // Re-request location for outside-radius attendance
  const openReRequestDialog = (record: any) => {
    setTargetGpsRecord(record);
    setReRequestReason(`Worker checked in ${record.check_in_distance_meters || 'outside'}m from worksite. Re-verify within 30 minutes.`);
    setReRequestModalOpen(true);
  };

  const handleConfirmReRequest = async () => {
    if (!targetGpsRecord) return;
    setIsSubmittingReRequest(true);
    try {
      await api.gpsAttendance.reRequestLocation(targetGpsRecord.id, {
        reason: reRequestReason.trim(),
        notes: `Supervisor ${user?.fullName || 'Staff'} requested 30-min location re-check.`,
      });
      alert(`Re-verification request dispatched to ${targetGpsRecord.user_name}. Worker has 30 minutes to confirm location inside site geofence.`);
      setReRequestModalOpen(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to send location re-request');
    } finally {
      setIsSubmittingReRequest(false);
    }
  };

  const handleApproveGps = async (id: string) => {
    try {
      await api.gpsAttendance.approve(id);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to approve attendance');
    }
  };

  const handleRejectGps = async (id: string) => {
    const reason = window.prompt('Enter reason for rejecting this attendance record:');
    if (!reason || !reason.trim()) return;
    try {
      await api.gpsAttendance.reject(id, reason.trim());
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to reject attendance');
    }
  };

  // Create spot verification
  const handleCreateSpotVerification = async () => {
    if (spotTargetType === 'individual' && !spotTargetUserId) {
      alert('Please select a labourer to verify.');
      return;
    }
    if (spotTargetType === 'team' && !spotTargetTeamId) {
      alert('Please select a team to verify.');
      return;
    }

    setIsSubmittingSpot(true);
    try {
      await api.verifications.request({
        targetType: spotTargetType,
        targetUserId: spotTargetType === 'individual' ? spotTargetUserId : undefined,
        targetTeamId: spotTargetType === 'team' ? spotTargetTeamId : undefined,
        notes: spotNotes.trim(),
      });
      alert('30-Minute Spot Verification request sent successfully.');
      setSpotModalOpen(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to create spot verification request');
    } finally {
      setIsSubmittingSpot(false);
    }
  };

  const totalWorkers = entries.reduce(
    (acc, e) => acc + (e.lines || []).reduce((s: number, l: any) => s + (l.count || 0), 0),
    0
  );
  const totalLabour = entries.reduce(
    (acc, e) => acc + (e.lines || []).reduce((s: number, l: any) => s + (l.final_amount || 0), 0),
    0
  );
  const totalOvertime = entries.reduce((acc, e) => acc + (e.overtime_amount || 0), 0);
  const dayNet = round2(totalLabour + totalOvertime);

  const filtered = entries.filter((e) => {
    if (teamFilter !== 'all' && e.team_id !== teamFilter) return false;
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (!search) return true;
    const term = search.toLowerCase();
    const t = teams.find((item) => item.id === e.team_id);
    return (
      (t?.name || '').toLowerCase().includes(term) ||
      (e.location_project || '').toLowerCase().includes(term) ||
      (e.remarks || '').toLowerCase().includes(term)
    );
  });

  const filteredGps = gpsRecords.filter((r) => {
    if (teamFilter !== 'all' && r.team_id !== teamFilter) return false;
    if (statusFilter !== 'all') {
      if (statusFilter === 'outside_radius' && r.check_in_status !== 'outside_radius') return false;
      if (statusFilter === 'valid_location' && r.check_in_status !== 'valid_location') return false;
      if (statusFilter !== 'outside_radius' && statusFilter !== 'valid_location' && r.status !== statusFilter) return false;
    }
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      (r.user_name || '').toLowerCase().includes(term) ||
      (r.worksite_name || '').toLowerCase().includes(term) ||
      (r.check_in_status || '').toLowerCase().includes(term) ||
      (r.status || '').toLowerCase().includes(term)
    );
  });

  const filteredVerifications = verifications.filter((v) => {
    if (teamFilter !== 'all' && v.target_team_id !== teamFilter) return false;
    if (statusFilter !== 'all' && v.status !== statusFilter) return false;
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      (v.target_user_name || '').toLowerCase().includes(term) ||
      (v.target_team_name || '').toLowerCase().includes(term) ||
      (v.status || '').toLowerCase().includes(term)
    );
  });

  const outsideRadiusCount = gpsRecords.filter((r) => r.check_in_status === 'outside_radius').length;
  const verifiedLocationCount = gpsRecords.filter((r) => r.check_in_status === 'valid_location').length;

  const overviewCards = [
    {
      label: 'Selected Date',
      value: formatDateDisplay(selectedDate),
      sub: 'Asia/Kolkata timezone',
      icon: Calendar,
      accent: 'text-[#014025]',
      bg: 'bg-[#014025]/10',
      border: 'border-gray-100',
      dark: false,
    },
    {
      label: 'Total Headcount',
      value: `${totalWorkers} Workers`,
      sub: `${entries.length} teams recorded`,
      icon: Users,
      accent: 'text-[#456B5A]',
      bg: 'bg-[#456B5A]/10',
      border: 'border-gray-100',
      dark: false,
    },
    {
      label: 'GPS Check-ins',
      value: `${gpsRecords.length} Workers`,
      sub: `${verifiedLocationCount} inside • ${outsideRadiusCount} outside`,
      icon: MapPin,
      accent: outsideRadiusCount > 0 ? 'text-amber-700' : 'text-emerald-700',
      bg: outsideRadiusCount > 0 ? 'bg-amber-100' : 'bg-emerald-100',
      border: 'border-gray-100',
      dark: false,
    },
    {
      label: 'Spot Checks Today',
      value: `${verifications.length} Requests`,
      sub: `${verifications.filter((v) => v.status === 'valid_location').length} verified on site`,
      icon: Crosshair,
      accent: 'text-indigo-700',
      bg: 'bg-indigo-100',
      border: 'border-gray-100',
      dark: false,
    },
    {
      label: 'Daily Net Payable',
      value: formatINR(dayNet),
      sub: `Labour: ${formatINR(totalLabour)} | OT: ${formatINR(totalOvertime)}`,
      icon: Banknote,
      accent: 'text-white',
      bg: 'bg-white/20',
      border: 'border-transparent',
      dark: true,
    },
  ];

  const renderSingleEntryCard = (entry: any) => {
    const team = teams.find((t) => t.id === entry.team_id);
    const teamLabourTotal = (entry.lines || []).reduce(
      (acc: number, l: any) => acc + (l.final_amount || 0),
      0
    );
    const hasOverrides = (entry.lines || []).some((l: any) => l.is_overridden);
    const teamVerifs = verifications.filter((v) => v.target_team_id === entry.team_id);

    return (
      <div
        key={entry.id}
        className="bg-white rounded-xl border border-gray-200 p-4 hover:border-[#456B5A]/40 hover:shadow-md transition-all shadow-xs space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-sm text-[#014025]">{team?.name || 'Team'}</span>
            <span className="text-[10px] text-[#696969] bg-[#696969]/10 px-2 py-0.5 rounded-md font-medium">
              {team?.work_category}
            </span>
            <span className="text-[10px] font-semibold text-[#456B5A] bg-[#456B5A]/10 px-2 py-0.5 rounded-md">
              {entry.shift_batch}
            </span>

            {/* Office Badge for Master Admin */}
            {isMasterAdmin && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-800 border border-slate-200">
                <Building2 className="w-3 h-3 mr-1 text-[#456B5A]" />
                {entry.office_name || (entry.secondary_admin_name ? `${entry.secondary_admin_name} Branch` : 'Head Office')}
              </span>
            )}

            {/* GPS Self-Marked vs Staff Headcount breakdown */}
            {Boolean(entry.gps_count && entry.gps_count > 0) && (
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                <MapPin className="w-3 h-3 text-emerald-700" />
                <span>{entry.gps_count} GPS Self-Marked + {entry.manual_count ?? 0} Staff Headcount</span>
              </span>
            )}

            {/* Team Spot Verification Badge */}
            {teamVerifs.length > 0 && (
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-900 border border-indigo-200">
                <Crosshair className="w-3 h-3 text-indigo-600" />
                <span>{teamVerifs.length} Spot Checks Today</span>
              </span>
            )}

            {/* Status Badge */}
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                entry.status === 'approved'
                  ? 'bg-emerald-100 text-emerald-800'
                  : entry.status === 'change_pending_approval'
                  ? 'bg-amber-100 text-amber-800'
                  : entry.status === 'rejected'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-blue-100 text-blue-800'
              }`}
            >
              {entry.status === 'approved'
                ? 'Approved'
                : entry.status === 'change_pending_approval'
                ? 'Revision Pending'
                : entry.status === 'rejected'
                ? 'Rejected'
                : 'Pending Approval'}
            </span>

            {Boolean(entry.admin_modified) && (
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300"
                title={`Modified after submission: ${entry.admin_modification_reason || 'Administrative change'}`}
              >
                Admin Modified
              </span>
            )}
            {hasOverrides && (
              <span className="flex items-center space-x-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                <AlertTriangle className="w-3 h-3 text-amber-600" />
                <span>Override</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3 text-xs">
            {entry.in_time && entry.out_time && (
              <div className="flex items-center space-x-1 text-[#696969] font-mono text-[11px]">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                <span>{entry.in_time} – {entry.out_time}</span>
              </div>
            )}

            <div className="flex items-center space-x-1">
              <button
                onClick={() => handleDuplicate(entry)}
                title="Duplicate"
                className="p-1.5 text-gray-400 hover:text-[#456B5A] rounded-md hover:bg-[#456B5A]/10 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleEdit(entry)}
                title="Edit"
                className="p-1.5 text-gray-400 hover:text-[#014025] rounded-md hover:bg-[#014025]/10 transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleDelete(entry.id)}
                title="Delete"
                className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Category Lines */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {(entry.lines || []).map((line: any, idx: number) => (
            <div
              key={idx}
              className={`p-2.5 rounded-lg border text-xs ${
                line.is_overridden
                  ? 'bg-amber-50/60 border-amber-200'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex justify-between font-semibold text-[#014025]">
                <span>{line.category_name}</span>
                <span className="font-mono">{line.count} Workers</span>
              </div>
              <div className="flex justify-between text-[11px] text-[#696969] mt-1">
                <span>Rate: ₹{line.rate}/day</span>
                <span className="font-mono font-bold text-[#014025]">{formatINR(line.final_amount)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Remarks & Totals */}
        <div className="flex flex-wrap items-center justify-between text-xs pt-2 border-t border-gray-100">
          <div className="text-[#696969] italic text-[11px]">
            {entry.remarks ? `Notes: ${entry.remarks}` : 'No notes'}
          </div>
          <div className="font-mono text-[#014025]">
            Labour: <span className="font-bold">{formatINR(teamLabourTotal)}</span>
            {entry.overtime_amount > 0 && (
              <span className="text-[#456B5A] ml-2">
                + OT: <span className="font-bold">{formatINR(entry.overtime_amount)}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#014025] tracking-tight">
            Daily Attendance &amp; GPS Geofence Verification
          </h1>
          <p className="text-xs sm:text-sm text-[#696969] mt-0.5">
            Muster roll entries, self-marked labourer GPS perimeters, and 30-minute spot check requests
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isMasterAdmin && offices.length > 0 && (
            <div className="w-52">
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

          {isMasterAdmin && selectedOffice === 'all' && (
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs">
              <button
                onClick={() => setAttendanceViewMode('combined')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  attendanceViewMode === 'combined' ? 'bg-[#014025] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Combined
              </button>
              <button
                onClick={() => setAttendanceViewMode('office_wise')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  attendanceViewMode === 'office_wise' ? 'bg-[#014025] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Office-Wise
              </button>
            </div>
          )}

          <div className="relative">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white text-[#014025] font-semibold focus:outline-none focus:ring-2 focus:ring-[#456B5A]/20 focus:border-[#456B5A]"
            />
          </div>

          <button
            onClick={() => setSpotModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-900 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <Crosshair className="w-3.5 h-3.5 text-indigo-700" />
            <span>Request Spot Verification</span>
          </button>

          <button
            onClick={handleOpenNew}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-[#014025] hover:bg-[#014025]/90 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Attendance Entry</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {overviewCards.map((card, idx) => {
          const Icon = card.icon;
          const isDark = card.dark;
          return (
            <div
              key={card.label}
              className={`p-3.5 rounded-xl border shadow-xs transition-all ${
                isDark
                  ? 'bg-gradient-to-br from-[#014025] to-[#456B5A] text-white border-transparent'
                  : `bg-white ${card.border}`
              }`}
            >
              <div className="flex items-center justify-between">
                <div className={`text-[10px] font-bold uppercase tracking-wide ${isDark ? 'text-white/70' : 'text-[#696969]'}`}>
                  {card.label}
                </div>
                <div className={`w-6 h-6 rounded-lg ${card.bg} flex items-center justify-center`}>
                  <Icon className={`w-3.5 h-3.5 ${card.accent}`} />
                </div>
              </div>
              <div className={`text-base font-bold font-mono mt-1.5 ${isDark ? 'text-white' : 'text-[#014025]'}`}>
                {card.value}
              </div>
              <div className={`text-[10px] mt-0.5 truncate ${isDark ? 'text-white/60' : 'text-[#696969]/80'}`}>
                {card.sub}
              </div>
            </div>
          );
        })}
      </div>

      {/* Section Switcher & Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-1 p-1 bg-slate-100 rounded-lg text-xs font-semibold">
          <button
            onClick={() => setActiveSection('entries')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeSection === 'entries'
                ? 'bg-[#014025] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>Team Muster Rolls ({entries.length})</span>
          </button>

          <button
            onClick={() => setActiveSection('gps')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeSection === 'gps'
                ? 'bg-[#014025] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Labourer GPS Attendance ({gpsRecords.length})</span>
            {outsideRadiusCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveSection('verifications')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeSection === 'verifications'
                ? 'bg-[#014025] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>Spot Checks ({verifications.length})</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Team Filter Dropdown */}
          <div className="w-full sm:w-48">
            <CustomSelect
              value={teamFilter}
              onChange={(val) => setTeamFilter(String(val))}
              options={[
                { value: 'all', label: 'All Teams' },
                ...teams.map((t) => ({
                  value: t.id,
                  label: t.name,
                  sublabel: t.work_category,
                })),
              ]}
              size="sm"
            />
          </div>

          {/* Status Filter Dropdown */}
          <div className="w-full sm:w-44">
            <CustomSelect
              value={statusFilter}
              onChange={(val) => setStatusFilter(String(val))}
              options={[
                { value: 'all', label: 'All Statuses' },
                { value: 'approved', label: 'Approved' },
                { value: 'pending_approval', label: 'Pending Approval' },
                { value: 'change_pending_approval', label: 'Revision Pending' },
                { value: 'rejected', label: 'Rejected' },
                { value: 'valid_location', label: 'Inside Geofence' },
                { value: 'outside_radius', label: 'Outside Radius' },
              ]}
              size="sm"
            />
          </div>

          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search details..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-[#014025] focus:bg-white"
            />
          </div>
        </div>
      </div>

      {/* SECTION 1: TEAM MUSTER ROLL ENTRIES */}
      {activeSection === 'entries' && (
        <div className="space-y-3">
          {loading ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm">
              <div className="w-8 h-8 border-2 border-[#456B5A]/20 border-t-[#456B5A] rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-[#696969]">Loading attendance entries...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#456B5A]/10 mb-2">
                <Calendar className="w-6 h-6 text-[#456B5A]" />
              </div>
              <p className="text-sm font-semibold text-[#014025]">
                No attendance entries found for {formatDateDisplay(selectedDate)}
              </p>
              <p className="text-xs text-[#696969] mt-0.5">Create your first entry or check GPS attendance tab.</p>
              <button
                onClick={handleOpenNew}
                className="mt-3 inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#014025] text-white rounded-lg text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Attendance Entry</span>
              </button>
            </div>
          ) : isMasterAdmin && attendanceViewMode === 'office_wise' && selectedOffice === 'all' && offices.length > 0 ? (
            <div className="space-y-6">
              {offices.map((off) => {
                const offEntries = filtered.filter((e) => {
                  if (off.id === 'head_office') {
                    return !e.secondary_admin_id || e.secondary_admin_id === 'head_office';
                  }
                  return e.secondary_admin_id === off.id;
                });
                const offWorkers = offEntries.reduce((sum, e) => sum + (e.total_workers || 0), 0);
                const offWage = offEntries.reduce((sum, e) => {
                  const lTotal = (e.lines || []).reduce((acc: number, l: any) => acc + (l.final_amount || 0), 0);
                  return sum + lTotal + (e.overtime_amount || 0);
                }, 0);

                return (
                  <div key={off.id} className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                      <div className="flex items-center space-x-2">
                        <Building2 className="w-4 h-4 text-[#014025]" />
                        <h3 className="font-bold text-sm text-[#014025]">{off.name}</h3>
                        {off.location && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-[#014025] font-semibold">
                            {off.location}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-4 text-xs font-mono">
                        <span className="text-slate-600">
                          Teams: <strong className="text-slate-900">{offEntries.length}</strong>
                        </span>
                        <span className="text-slate-600">
                          Workers: <strong className="text-slate-900">{offWorkers}</strong>
                        </span>
                        <span className="text-slate-600">
                          Daily Wage: <strong className="text-emerald-700">{formatINR(offWage)}</strong>
                        </span>
                      </div>
                    </div>

                    {offEntries.length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-3 text-center">
                        No muster roll entries for this office on {formatDateDisplay(selectedDate)}.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {offEntries.map((entry) => renderSingleEntryCard(entry))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            filtered.map((entry) => renderSingleEntryCard(entry))
          )}
        </div>
      )}

      {/* SECTION 2: LABOURER GPS ATTENDANCE & OUTSIDE-RADIUS RE-REQUEST */}
      {activeSection === 'gps' && (
        <div className="space-y-3">
          {outsideRadiusCount > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 flex items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                <span>
                  <strong>{outsideRadiusCount} worker(s)</strong> checked in outside their designated worksite geofence perimeter. Use the <strong>"Re-request Location Update"</strong> button to prompt a 30-minute location re-verification.
                </span>
              </div>
            </div>
          )}

          {loading ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm">
              <div className="w-8 h-8 border-2 border-[#456B5A]/20 border-t-[#456B5A] rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-[#696969]">Loading GPS attendance...</p>
            </div>
          ) : filteredGps.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 mb-2">
                <MapPin className="w-6 h-6 text-emerald-700" />
              </div>
              <p className="text-sm font-semibold text-[#014025]">No self-marked GPS records for this date</p>
              <p className="text-xs text-[#696969] mt-0.5">
                Workers check in via their mobile dashboard when on site. Records will appear here in real-time.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-gray-200 text-slate-700 font-semibold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Labourer / Worker</th>
                      {isMasterAdmin && <th className="py-2.5 px-3">Office / Branch</th>}
                      <th className="py-2.5 px-3">Team &amp; Worksite</th>
                      <th className="py-2.5 px-3">Check-in Time</th>
                      <th className="py-2.5 px-3">Geofence Status</th>
                      <th className="py-2.5 px-3">Distance to Site</th>
                      <th className="py-2.5 px-3">Approval Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredGps.map((record) => {
                      const isOutside = record.check_in_status === 'outside_radius';
                      const isPoorAcc = record.check_in_status === 'poor_accuracy';
                      const isReCheckPending = Boolean(record.re_check_requested);

                      return (
                        <tr key={record.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900">{record.user_name}</div>
                            <div className="text-[11px] text-slate-500 font-mono">ID: {record.user_id}</div>
                          </td>

                          {isMasterAdmin && (
                            <td className="py-3 px-3">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-800 border border-slate-200">
                                <Building2 className="w-3 h-3 mr-1 text-[#456B5A]" />
                                {record.office_name || (record.secondary_admin_name ? `${record.secondary_admin_name} Branch` : 'Head Office')}
                              </span>
                            </td>
                          )}

                          <td className="py-3 px-3">
                            <div className="font-semibold text-[#014025]">{record.worksite_name}</div>
                            <div className="text-[11px] text-slate-500">
                              {teams.find((t) => t.id === record.team_id)?.name || 'Direct Worksite'}
                            </div>
                          </td>

                          <td className="py-3 px-3 font-mono text-[11px]">
                            {record.check_in_time ? new Date(record.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                            {record.check_out_time && (
                              <div className="text-slate-400 text-[10px]">
                                Out: {new Date(record.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-3">
                            {isReCheckPending ? (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-300">
                                <RotateCcw className="w-3 h-3 animate-spin text-purple-700" />
                                <span>Re-check Requested</span>
                              </span>
                            ) : isOutside ? (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-900 border border-red-300">
                                <AlertTriangle className="w-3 h-3 text-red-600" />
                                <span>Outside Geofence</span>
                              </span>
                            ) : isPoorAcc ? (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                <Crosshair className="w-3 h-3 text-amber-600" />
                                <span>Low GPS Accuracy</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                                <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                                <span>Inside Geofence</span>
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3 font-mono text-[11px]">
                            <span className={isOutside ? 'font-bold text-red-700' : 'text-slate-700'}>
                              {record.check_in_distance_meters !== null ? `${record.check_in_distance_meters}m` : '-'}
                            </span>
                            <div className="text-[10px] text-slate-400">
                              Accuracy: ±{record.check_in_accuracy ? Math.round(record.check_in_accuracy) : 10}m
                            </div>
                          </td>

                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                record.status === 'approved'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : record.status === 'rejected'
                                  ? 'bg-red-100 text-red-800'
                                  : record.status === 'overridden'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {record.status}
                            </span>
                          </td>

                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end space-x-1.5">
                              {/* Re-request Location button for outside radius or re-check */}
                              <button
                                onClick={() => openReRequestDialog(record)}
                                title="Re-request worker to update and re-verify their location within 30 minutes"
                                className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center space-x-1 transition-colors cursor-pointer ${
                                  isOutside || isReCheckPending
                                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-2xs'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                }`}
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>{isReCheckPending ? 'Re-requested' : 'Re-request Location'}</span>
                              </button>

                              {record.status !== 'approved' && (
                                <button
                                  onClick={() => handleApproveGps(record.id)}
                                  className="px-2 py-1 rounded text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                                >
                                  Approve
                                </button>
                              )}

                              {record.status !== 'rejected' && (
                                <button
                                  onClick={() => handleRejectGps(record.id)}
                                  className="px-2 py-1 rounded text-[11px] font-semibold bg-slate-100 hover:bg-red-50 text-red-700 cursor-pointer"
                                >
                                  Reject
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
            </div>
          )}
        </div>
      )}

      {/* SECTION 3: SPOT VERIFICATION REQUESTS OF THE DAY */}
      {activeSection === 'verifications' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-indigo-50/70 border border-indigo-100 p-3 rounded-xl text-xs">
            <div className="flex items-center space-x-2 text-indigo-900">
              <Crosshair className="w-4 h-4 text-indigo-700 shrink-0" />
              <span>
                <strong>Random 30-Minute Spot Verifications:</strong> When requested, designated workers or teams must confirm their GPS coordinates on their phone within a strict 30-minute countdown window.
              </span>
            </div>
            <button
              onClick={() => setSpotModalOpen(true)}
              className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg font-semibold text-xs shrink-0 cursor-pointer"
            >
              + New Spot Verification
            </button>
          </div>

          {loading ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm">
              <div className="w-8 h-8 border-2 border-[#456B5A]/20 border-t-[#456B5A] rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-[#696969]">Loading spot verifications...</p>
            </div>
          ) : filteredVerifications.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-50 mb-2">
                <Crosshair className="w-6 h-6 text-indigo-600" />
              </div>
              <p className="text-sm font-semibold text-[#014025]">No spot verifications requested for this date</p>
              <p className="text-xs text-[#696969] mt-0.5">
                Click "+ New Spot Verification" above to send a random 30-minute attendance check to any worker or team.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-gray-200 text-slate-700 font-semibold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Target Worker / Team</th>
                      <th className="py-2.5 px-3">Requested By &amp; Time</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Expires At</th>
                      <th className="py-2.5 px-3">Responded Details</th>
                      <th className="py-2.5 px-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredVerifications.map((v) => {
                      const isPending = v.status === 'pending';
                      const isValid = v.status === 'valid_location';
                      const isOutside = v.status === 'outside_radius';
                      const isExpired = v.status === 'expired';

                      return (
                        <tr key={v.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900">
                              {v.target_type === 'individual' ? v.target_user_name || 'Individual Worker' : v.target_team_name || 'Entire Team'}
                            </div>
                            <div className="text-[10px] text-slate-400 capitalize">
                              Scope: {v.target_type} {v.worksite_name ? `• ${v.worksite_name}` : ''}
                            </div>
                          </td>

                          <td className="py-3 px-3">
                            <div className="font-semibold text-slate-800">{v.requested_by_name}</div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {new Date(v.requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>

                          <td className="py-3 px-3">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                isValid
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : isOutside
                                  ? 'bg-red-100 text-red-800'
                                  : isExpired
                                  ? 'bg-gray-100 text-gray-700'
                                  : 'bg-amber-100 text-amber-800 animate-pulse'
                              }`}
                            >
                              {isValid
                                ? '✅ Verified on Site'
                                : isOutside
                                ? '⚠️ Outside Radius'
                                : isExpired
                                ? 'Expired (No Fix)'
                                : 'Pending Worker Fix'}
                            </span>
                          </td>

                          <td className="py-3 px-3 font-mono text-[11px] text-slate-600">
                            {new Date(v.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>

                          <td className="py-3 px-3">
                            {v.responded_at ? (
                              <div className="text-[11px] font-mono">
                                <div className="text-slate-800 font-bold">
                                  {new Date(v.responded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                <div className="text-slate-500 text-[10px]">
                                  {v.distance_meters !== null ? `${v.distance_meters}m from site` : 'Location captured'} (±{Math.round(v.responded_accuracy || 10)}m)
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">Awaiting worker submission...</span>
                            )}
                          </td>

                          <td className="py-3 px-3 text-[11px] text-slate-600 max-w-xs truncate">
                            {v.response_notes || 'Spot check'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* RE-REQUEST LOCATION MODAL */}
      {reRequestModalOpen && targetGpsRecord && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden">
            <div className="px-5 py-3.5 bg-red-800 text-white font-bold text-sm flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <RotateCcw className="w-4 h-4 text-white" />
                <span>Re-request Location for Outside Radius</span>
              </div>
              <button onClick={() => setReRequestModalOpen(false)} className="text-white/70 hover:text-white cursor-pointer">
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-slate-700">
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-1">
                <div className="font-bold text-red-950">{targetGpsRecord.user_name}</div>
                <div className="text-[11px] text-red-800">
                  Current check-in recorded at <strong>{targetGpsRecord.check_in_distance_meters || 'outside'}m away</strong> from {targetGpsRecord.worksite_name}.
                </div>
                <div className="text-[10px] text-red-700">
                  Sending this request gives the worker a 30-minute window to re-provide their location inside the geofence perimeter. Their attendance will be set to pending re-check.
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Reason for Re-request / Instructions to Worker:
                </label>
                <textarea
                  rows={3}
                  value={reRequestReason}
                  onChange={(e) => setReRequestReason(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2 text-xs focus:outline-none focus:ring-1 focus:ring-red-600"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setReRequestModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmittingReRequest}
                  onClick={handleConfirmReRequest}
                  className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white font-semibold flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isSubmittingReRequest ? 'animate-spin' : ''}`} />
                  <span>{isSubmittingReRequest ? 'Sending Request...' : 'Send 30-Min Re-request'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NEW SPOT VERIFICATION MODAL */}
      {spotModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden">
            <div className="px-5 py-3.5 bg-indigo-900 text-white font-bold text-sm flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Crosshair className="w-4 h-4 text-indigo-300" />
                <span>Request Spot Verification</span>
              </div>
              <button onClick={() => setSpotModalOpen(false)} className="text-white/70 hover:text-white cursor-pointer">
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-slate-700">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Target Scope</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSpotTargetType('individual')}
                    className={`py-1.5 px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                      spotTargetType === 'individual'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-900'
                        : 'border-gray-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    Individual Labourer
                  </button>
                  <button
                    type="button"
                    onClick={() => setSpotTargetType('team')}
                    className={`py-1.5 px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                      spotTargetType === 'team'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-900'
                        : 'border-gray-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    Entire Team
                  </button>
                </div>
              </div>

              {spotTargetType === 'individual' ? (
                <div>
                  <CustomSelect
                    label="Select Labourer"
                    required
                    value={spotTargetUserId}
                    onChange={(val) => setSpotTargetUserId(String(val))}
                    options={labourers.map((lab) => ({
                      value: lab.id,
                      label: lab.full_name,
                      sublabel: lab.mobile_number || lab.designation || 'Worker',
                    }))}
                    placeholder="Choose Worker"
                  />
                </div>
              ) : (
                <div>
                  <CustomSelect
                    label="Select Team"
                    required
                    value={spotTargetTeamId}
                    onChange={(val) => setSpotTargetTeamId(String(val))}
                    options={teams.map((tm) => ({
                      value: tm.id,
                      label: tm.name,
                      sublabel: tm.work_category,
                    }))}
                    placeholder="Choose Team"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Spot Check Reason / Notes</label>
                <input
                  type="text"
                  value={spotNotes}
                  onChange={(e) => setSpotNotes(e.target.value)}
                  placeholder="e.g. Afternoon attendance verification"
                  className="w-full border border-gray-300 rounded-lg p-2 text-xs"
                />
              </div>

              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-500">
                Workers will receive an instant notification on their mobile device and have <strong>30 minutes</strong> to submit their location fix.
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setSpotModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmittingSpot}
                  onClick={handleCreateSpotVerification}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white font-semibold flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                >
                  <Crosshair className={`w-3.5 h-3.5 ${isSubmittingSpot ? 'animate-spin' : ''}`} />
                  <span>{isSubmittingSpot ? 'Requesting...' : 'Send Spot Verification'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Entry Modal */}
      <AttendanceModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={loadData}
        initialDate={selectedDate}
        editEntry={editingEntry}
      />
    </div>
  );
}