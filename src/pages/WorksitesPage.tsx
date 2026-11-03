import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle2,
  ShieldAlert,
  Users,
  Navigation,
  Crosshair,
  Building2,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { MapLocationPicker } from '../components/MapLocationPicker';
import { CustomSelect } from '../components/CustomSelect';

export function WorksitesPage() {
  const { user, isMasterAdmin, isAdminAny } = useAuth();
  const isStaff = !isAdminAny;
  const [worksites, setWorksites] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Office location filter for Master Admin
  const [offices, setOffices] = useState<any[]>([]);
  const [selectedOffice, setSelectedOffice] = useState<string>('all');
  const [modalOfficeId, setModalOfficeId] = useState<string>('head_office');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalForm, setModalForm] = useState({
    name: '',
    projectName: '',
    address: '',
    latitude: 12.971598,
    longitude: 77.594562,
    allowedRadiusMeters: 150,
    accuracyThresholdMeters: 50,
    assignedTeams: [] as string[],
    status: 'active',
    reason: '',
  });
  const [modalError, setModalError] = useState<string | null>(null);
  const [isLocatingCurrent, setIsLocatingCurrent] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [ws, tm, offList] = await Promise.all([
        api.worksites.list({ secondaryAdminId: selectedOffice !== 'all' ? selectedOffice : undefined }),
        api.teams.list(),
        isMasterAdmin ? api.offices.list().catch(() => []) : Promise.resolve([]),
      ]);
      setWorksites(ws || []);
      setTeams(tm || []);
      if (offList && offList.length > 0) setOffices(offList);
    } catch (err: any) {
      console.error('Failed to load worksites:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedOffice]);

  const openCreateModal = () => {
    setEditingId(null);
    setModalOfficeId('head_office');
    setModalForm({
      name: '',
      projectName: '',
      address: '',
      latitude: 12.971598,
      longitude: 77.594562,
      allowedRadiusMeters: 150,
      accuracyThresholdMeters: 50,
      assignedTeams: [],
      status: 'active',
      reason: '',
    });
    setModalError(null);
    setShowModal(true);
  };

  const openEditModal = (ws: any) => {
    setEditingId(ws.id);
    setModalOfficeId(ws.secondary_admin_id || 'head_office');
    setModalForm({
      name: ws.name,
      projectName: ws.project_name,
      address: ws.address || '',
      latitude: ws.latitude,
      longitude: ws.longitude,
      allowedRadiusMeters: ws.allowed_radius_meters,
      accuracyThresholdMeters: ws.accuracy_threshold_meters,
      assignedTeams: ws.assignedTeams || [],
      status: ws.status || 'active',
      reason: '',
    });
    setModalError(null);
    setShowModal(true);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setModalError('Geolocation is not supported by your browser.');
      return;
    }
    setIsLocatingCurrent(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setModalForm((prev) => ({
          ...prev,
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
          accuracyThresholdMeters: Math.max(30, Math.round(pos.coords.accuracy)),
        }));
        setIsLocatingCurrent(false);
      },
      (err) => {
        setModalError('Could not detect location: ' + err.message);
        setIsLocatingCurrent(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!modalForm.name || !modalForm.projectName) {
      setModalError('Worksite name and project name are required.');
      return;
    }

    if (isStaff && !modalForm.reason.trim()) {
      setModalError('Please enter a mandatory reason for this worksite change request.');
      return;
    }

    try {
      const payload = {
        ...modalForm,
        secondaryAdminId: isMasterAdmin ? modalOfficeId : undefined,
      };

      if (editingId) {
        const res: any = await api.worksites.update(editingId, payload);
        if (res?.pendingApproval) {
          alert(res.message || 'Worksite change request submitted for Administrator approval.');
        }
      } else {
        const res: any = await api.worksites.create(payload);
        if (res?.pendingApproval) {
          alert(res.message || 'New worksite request submitted for Administrator approval.');
        }
      }
      setShowModal(false);
      await loadData();
    } catch (err: any) {
      setModalError(err.message || 'Failed to save worksite.');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete worksite "${name}"?`)) return;
    try {
      await api.worksites.delete(id);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete worksite.');
    }
  };

  const filtered = worksites.filter(
    (w) =>
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.project_name.toLowerCase().includes(search.toLowerCase()) ||
      (w.address && w.address.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-slate-900 flex items-center space-x-2 tracking-tight">
            <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-[#0E6037] shrink-0" />
            <span>Worksites &amp; GPS Geofence</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Configure project coordinates, allowed check-in radius (metres), and GPS accuracy threshold.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-4 py-2 sm:py-2.5 bg-[#0E6037] hover:bg-[#0B4D2C] text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>{isAdminAny ? 'Add Worksite' : 'Request Worksite'}</span>
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-white p-2.5 sm:p-3 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by worksite name, project, or address..."
            className="w-full pl-9 pr-4 py-1.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0E6037]/20 focus:border-[#0E6037]"
          />
        </div>

        {isMasterAdmin && offices.length > 0 && (
          <div className="w-full sm:w-64">
            <CustomSelect
              value={selectedOffice}
              onChange={(val) => setSelectedOffice(String(val))}
              options={[
                { value: 'all', label: 'All Offices (Combined)' },
                ...offices.map((o) => ({ value: o.id, label: o.name })),
              ]}
              placeholder="Filter by Office Location"
              size="sm"
            />
          </div>
        )}
      </div>

      {/* Worksites Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Loading worksites...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-8">
          <MapPin className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500 font-semibold">No worksites found.</p>
          <p className="text-xs text-slate-400 mt-1">Add a new worksite to enable GPS attendance geofencing.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((ws) => (
            <div
              key={ws.id}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#0E6037] bg-emerald-50 px-2 py-0.5 rounded-md">
                      {ws.project_name}
                    </span>
                    <h3 className="text-base font-bold text-slate-900 mt-1">{ws.name}</h3>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      ws.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {ws.status}
                  </span>
                </div>

                <p className="text-xs text-slate-500 line-clamp-2">{ws.address || 'No street address specified'}</p>

                {/* Coordinates & Geofence Badges */}
                <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 border border-slate-100 font-mono text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>GPS Coordinates:</span>
                    <span className="font-semibold text-slate-800">
                      {ws.latitude.toFixed(4)}, {ws.longitude.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Allowed Radius:</span>
                    <span className="font-bold text-[#0E6037]">{ws.allowed_radius_meters}m</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Max Accuracy:</span>
                    <span className="font-bold text-slate-800">{ws.accuracy_threshold_meters}m</span>
                  </div>
                </div>

                {/* Office Location Badge */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span className="flex items-center space-x-1">
                    <Building2 className="w-3.5 h-3.5 text-[#0E6037]" />
                    <span>Office Location:</span>
                  </span>
                  <span className="font-semibold text-slate-800 bg-emerald-50 text-[#0E6037] px-2 py-0.5 rounded border border-emerald-200 text-[11px]">
                    {ws.office_name || 'Head Office (Central)'}
                  </span>
                </div>

                {!isMasterAdmin && (
                  <div className="pt-1 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center space-x-1">
                      <Users className="w-3 h-3 text-slate-400" />
                      <span>Teams assigned:</span>
                    </span>
                    <span className="font-semibold text-slate-700">{ws.assignedTeams?.length || 0}</span>
                  </div>
                )}

                {/* Pending Change Request Banner */}
                {ws.pendingRequest && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl space-y-1 mt-2">
                    <div className="flex items-center space-x-1.5 text-amber-900 font-bold text-xs">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Changes Pending Admin Approval</span>
                    </div>
                    <p className="text-[11px] text-amber-800 line-clamp-2">
                      Submitted by <strong>{ws.pendingRequest.requested_by_name}</strong>: "{ws.pendingRequest.reason}"
                    </p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  onClick={() => openEditModal(ws)}
                  className="p-1.5 text-slate-500 hover:text-[#0E6037] hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                  title={isStaff ? 'Request changes to worksite' : 'Edit worksite'}
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                {isMasterAdmin && (
                  <button
                    onClick={() => handleDelete(ws.id, ws.name)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    title="Delete worksite"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center space-x-2">
                <Crosshair className="w-5 h-5 text-[#0E6037] shrink-0" />
                <span>{isStaff ? (editingId ? 'Request Worksite Changes' : 'Request New Worksite') : (editingId ? 'Edit Worksite Geofence' : 'New Worksite Geofence')}</span>
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center font-bold text-xs transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {isStaff && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                <div className="flex items-center space-x-1.5 text-amber-900 font-bold text-xs">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Admin Approval Required</span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  As an operations staff member, your changes to worksites and GPS geofence perimeters will not take effect immediately. Submitting will send an approval request to your assigned Administrator (<strong>{user?.assignedAdmin?.fullName || 'Assigned Administrator'}</strong>).
                </p>
              </div>
            )}

            {modalError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Worksite Name *</label>
                <input
                  type="text"
                  required
                  value={modalForm.name}
                  onChange={(e) => setModalForm({ ...modalForm, name: e.target.value })}
                  placeholder="e.g. Lumia Building Main Tower"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#0E6037]/20 focus:border-[#0E6037]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Project Name *</label>
                <input
                  type="text"
                  required
                  value={modalForm.projectName}
                  onChange={(e) => setModalForm({ ...modalForm, projectName: e.target.value })}
                  placeholder="e.g. Lumia Infrastructure Phase 2"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#0E6037]/20 focus:border-[#0E6037]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Street Address</label>
                <input
                  type="text"
                  value={modalForm.address}
                  onChange={(e) => setModalForm({ ...modalForm, address: e.target.value })}
                  placeholder="e.g. 42, Brigade Road, Bengaluru"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#0E6037]/20 focus:border-[#0E6037]"
                />
              </div>

              {/* Real Map Geofence Location & In-Map Radius Picker */}
              <div className="space-y-1">
                <MapLocationPicker
                  latitude={modalForm.latitude}
                  longitude={modalForm.longitude}
                  radiusMeters={modalForm.allowedRadiusMeters}
                  accuracyThreshold={modalForm.accuracyThresholdMeters}
                  onChange={(coords) => {
                    setModalForm((prev) => ({
                      ...prev,
                      latitude: coords.latitude,
                      longitude: coords.longitude,
                      allowedRadiusMeters: coords.radiusMeters,
                      accuracyThresholdMeters: coords.accuracyThreshold || prev.accuracyThresholdMeters,
                    }));
                  }}
                  height="260px"
                  label="Worksite Location & Geofence Radius"
                />
              </div>

              {/* Office / Branch Location (Master Admin) */}
              {isMasterAdmin && offices.length > 0 && (
                <div>
                  <CustomSelect
                    label="Office / Branch Location"
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

              {/* Assigned Teams Multi-Select (Staff / Secondary Admin only - no need for Master Admin) */}
              {!isMasterAdmin && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Assigned Teams (Optional)
                  </label>
                  <div className="max-h-32 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    {teams.map((t) => {
                      const checked = modalForm.assignedTeams.includes(t.id);
                      return (
                        <label key={t.id} className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setModalForm({ ...modalForm, assignedTeams: [...modalForm.assignedTeams, t.id] });
                              } else {
                                setModalForm({
                                  ...modalForm,
                                  assignedTeams: modalForm.assignedTeams.filter((id) => id !== t.id),
                                });
                              }
                            }}
                            className="rounded text-[#0E6037] focus:ring-[#0E6037]"
                          />
                          <span>{t.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Status */}
              <div>
                <CustomSelect
                  label="Status"
                  value={modalForm.status}
                  onChange={(val) => setModalForm({ ...modalForm, status: String(val) })}
                  options={[
                    { value: 'active', label: 'Active', badge: 'Operational', badgeColor: 'green' },
                    { value: 'inactive', label: 'Inactive', badge: 'Archived', badgeColor: 'slate' },
                  ]}
                />
              </div>

              {/* Mandatory Reason for Staff */}
              {isStaff && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Reason for Change / Request *
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={modalForm.reason}
                    onChange={(e) => setModalForm({ ...modalForm, reason: e.target.value })}
                    placeholder="Provide a mandatory reason for this worksite change request for admin review..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#0E6037]/20 focus:border-[#0E6037] text-xs sm:text-sm"
                  />
                </div>
              )}

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#0E6037] hover:bg-[#0B4D2C] text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer"
                >
                  {isStaff ? 'Submit for Admin Approval' : (editingId ? 'Save Changes' : 'Create Worksite')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
