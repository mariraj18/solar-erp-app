import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  UserCheck,
  UserPlus,
  AlertCircle,
  CheckCircle2,
  Lock,
  Users,
  Mail,
  KeyRound,
  UserCog,
  X,
  Building,
  Briefcase,
  MapPin,
  RefreshCw,
  Pencil,
  Phone,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { formatDateDisplay } from '../lib/dateUtils';
import { CustomSelect } from '../components/CustomSelect';

export function StaffManagementPage() {
  const { user: currentUser, isMasterAdmin, isSecondaryAdmin } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New staff form state (Master Admin only)
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<'staff' | 'secondary_admin' | 'master_admin'>('staff');
  const [newPassword, setNewPassword] = useState('');
  const [newDesignation, setNewDesignation] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newAssignedAdminId, setNewAssignedAdminId] = useState('');

  // Password reset state
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [resettingUserName, setResettingUserName] = useState('');
  const [resetPasswordVal, setResetPasswordVal] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // Edit staff state (accessible to Master Admin and Secondary Admin for assigned staff)
  const [editingStaff, setEditingStaff] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    fullName: '',
    designation: '',
    assignedLocation: '',
    mobileNumber: '',
  });
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const list = await api.users.list();
      setUsers(list);
    } catch (err: any) {
      setError(err.message || 'Failed to load user accounts');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!newEmail || !newFullName || !newPassword) {
      setError('Please fill in all mandatory fields.');
      return;
    }

    try {
      await api.users.create({
        email: newEmail.trim(),
        fullName: newFullName.trim(),
        role: newRole,
        password: newPassword,
        designation: newDesignation.trim() || undefined,
        assignedLocation: newLocation.trim() || undefined,
        assignedAdminId: newAssignedAdminId || undefined,
      });

      setSuccess(`Account for ${newFullName} created successfully as ${newRole.replace('_', ' ')}.`);
      setShowAddForm(false);
      setNewEmail('');
      setNewFullName('');
      setNewPassword('');
      setNewDesignation('');
      setNewLocation('');
      setNewAssignedAdminId('');
      loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to create user account');
    }
  };

  const handleToggleStatus = async (targetUser: any) => {
    const newStatus = targetUser.status === 'active' ? 'inactive' : 'active';
    if (!window.confirm(`${newStatus === 'inactive' ? 'Deactivate' : 'Activate'} account for ${targetUser.full_name}?`)) {
      return;
    }
    try {
      await api.users.update(targetUser.id, { status: newStatus });
      loadUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to update user status');
    }
  };

  const handleResetPassword = async () => {
    if (!resetPasswordVal || resetPasswordVal.length < 6) {
      alert('Password must be at least 6 characters long.');
      return;
    }
    if (!resettingUserId) return;

    setIsResetting(true);
    try {
      await api.users.resetPassword(resettingUserId, resetPasswordVal);
      alert('Password updated successfully.');
      setResettingUserId(null);
      setResetPasswordVal('');
    } catch (err: any) {
      alert(err.message || 'Failed to reset password.');
    } finally {
      setIsResetting(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;
    setIsEditing(true);
    try {
      await api.users.update(editingStaff.id, {
        fullName: editForm.fullName.trim(),
        designation: editForm.designation.trim() || undefined,
        assignedLocation: editForm.assignedLocation.trim() || undefined,
        mobileNumber: editForm.mobileNumber.trim() || undefined,
      });
      setEditingStaff(null);
      setSuccess(`Account details for ${editForm.fullName} updated successfully.`);
      loadUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to update account details.');
    } finally {
      setIsEditing(false);
    }
  };

  const secondaryAdminsList = users.filter((u) => u.role === 'secondary_admin');

  // Secondary Admins can ONLY see staff accounts assigned to them - NO admins or other secondary admins
  const displayedUsers = isSecondaryAdmin
    ? users.filter((u) => u.role === 'staff')
    : users;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#696969]/20 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#014025] tracking-tight">
            {isMasterAdmin ? 'Staff & Account Management' : 'My Assigned Staff Accounts'}
          </h1>
          <p className="text-xs sm:text-sm text-[#696969] mt-0.5">
            {isMasterAdmin
              ? 'Manage company accounts, designations, locations, roles, and credential security'
              : 'View and update staff details for operations team members assigned to you'}
          </p>
        </div>

        {isMasterAdmin && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="self-start sm:self-auto flex items-center space-x-1.5 px-3.5 py-2 bg-[#014025] hover:bg-[#014025]/85 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>{showAddForm ? 'Close Account Form' : 'New User Account'}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{success}</span>
        </div>
      )}

      {/* Add User Form Drawer */}
      {showAddForm && isMasterAdmin && (
        <div className="bg-white rounded-xl border border-[#456B5A]/40 shadow-md p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#696969]/15 pb-3">
            <h2 className="font-bold text-sm text-[#014025] flex items-center space-x-2">
              <UserPlus className="w-4 h-4 text-[#456B5A]" />
              <span>Provision New Employee or Administrator Account</span>
            </h2>
            <button onClick={() => setShowAddForm(false)} className="text-[#696969] hover:text-[#014025]">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleCreateStaff} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#014025] mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-xs text-[#014025] focus:outline-none focus:ring-1 focus:ring-[#456B5A]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#014025] mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="ramesh@company.erp"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-xs text-[#014025] focus:outline-none focus:ring-1 focus:ring-[#456B5A]"
                />
              </div>

              <div>
                <CustomSelect
                  label="Account Role"
                  required
                  value={newRole}
                  onChange={(val) => setNewRole(val as any)}
                  options={[
                    { value: 'staff', label: 'Staff (Operational Attendance & Reports)', badge: 'Staff', badgeColor: 'green' },
                    { value: 'secondary_admin', label: 'Secondary Admin / Manager (Reviewer)', badge: 'Manager', badgeColor: 'blue' },
                    { value: 'master_admin', label: 'Master Administrator (Full Access)', badge: 'Master', badgeColor: 'red' },
                  ]}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#014025] mb-1">Designation / Staff Type</label>
                <input
                  type="text"
                  placeholder="e.g. Site Supervisor, Junior Engineer"
                  value={newDesignation}
                  onChange={(e) => setNewDesignation(e.target.value)}
                  className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-xs text-[#014025] focus:outline-none focus:ring-1 focus:ring-[#456B5A]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#014025] mb-1">Assigned Site / Location</label>
                <input
                  type="text"
                  placeholder="e.g. Lumia Building Site"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-xs text-[#014025] focus:outline-none focus:ring-1 focus:ring-[#456B5A]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#014025] mb-1">Initial Password</label>
                <input
                  type="password"
                  required
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-xs text-[#014025] focus:outline-none focus:ring-1 focus:ring-[#456B5A]"
                />
              </div>
            </div>

            {newRole === 'staff' && secondaryAdminsList.length > 0 && (
              <div className="w-full sm:w-1/2">
                <CustomSelect
                  label="Assign to Secondary Admin (Manager)"
                  value={newAssignedAdminId}
                  onChange={(val) => setNewAssignedAdminId(String(val))}
                  options={[
                    { value: '', label: '-- No Direct Secondary Admin --' },
                    ...secondaryAdminsList.map((a) => ({
                      value: a.id,
                      label: a.full_name,
                      sublabel: a.email,
                    })),
                  ]}
                  placeholder="Select manager..."
                />
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-2 border-t border-[#696969]/15">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3.5 py-1.5 border border-[#696969]/30 rounded-md text-[#696969] hover:bg-[#696969]/10"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-[#014025] hover:bg-[#014025]/85 text-white rounded-md font-semibold shadow-xs"
              >
                Create Account
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-[#696969]/20 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#696969]/10 text-[#014025] font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Name &amp; Designation</th>
                <th className="py-2.5 px-3">Email</th>
                <th className="py-2.5 px-3">Role</th>
                <th className="py-2.5 px-3">Project / Location</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3">Joined Date</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#696969]/15">
              {displayedUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-[#696969]">
                    {isSecondaryAdmin
                      ? 'No staff members currently assigned to you.'
                      : 'No user accounts found.'}
                  </td>
                </tr>
              ) : (
                displayedUsers.map((u) => {
                const isMaster = u.role === 'master_admin' || u.role === 'admin';
                const isSecAdmin = u.role === 'secondary_admin';

                return (
                  <tr key={u.id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-3">
                      <div className="font-semibold text-[#014025]">{u.full_name}</div>
                      <div className="text-[11px] text-[#696969]">{u.designation || 'Staff Member'}</div>
                    </td>
                    <td className="py-3 px-3 text-[#696969]">{u.email}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          isMaster
                            ? 'bg-[#014025] text-white'
                            : isSecAdmin
                            ? 'bg-[#456B5A] text-white'
                            : 'bg-[#696969]/15 text-[#014025]'
                        }`}
                      >
                        {isMaster ? 'Master Admin' : isSecAdmin ? 'Secondary Admin' : 'Staff'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-[#696969]">{u.assigned_location || 'General Site'}</td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          u.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-[#696969]">{formatDateDisplay(u.created_at)}</td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        {/* Edit Staff details: Master Admin can edit any user; Secondary Admin can edit their assigned staff */}
                        {(isMasterAdmin || (isSecondaryAdmin && u.role === 'staff')) && (
                          <button
                            onClick={() => {
                              setEditingStaff(u);
                              setEditForm({
                                fullName: u.full_name,
                                designation: u.designation || '',
                                assignedLocation: u.assigned_location || '',
                                mobileNumber: u.mobile_number || '',
                              });
                            }}
                            className="px-2 py-1 text-xs border border-[#696969]/30 rounded text-[#014025] hover:bg-[#696969]/10 inline-flex items-center space-x-1 cursor-pointer"
                            title="Edit Staff Details"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                        )}

                        {/* Reset Password */}
                        {(isMasterAdmin || (isSecondaryAdmin && u.role === 'staff')) && (
                          <button
                            onClick={() => {
                              setResettingUserId(u.id);
                              setResettingUserName(u.full_name);
                              setResetPasswordVal('');
                            }}
                            className="px-2 py-1 text-xs border border-[#696969]/30 rounded text-[#014025] hover:bg-[#696969]/10 cursor-pointer"
                            title="Reset Password Securely"
                          >
                            Reset Password
                          </button>
                        )}

                        {/* Deactivate/Activate: ONLY Master Admin ("secondary admin can view and edit staffs not deactivate") */}
                        {isMasterAdmin && u.id !== currentUser?.id && (
                          <button
                            onClick={() => handleToggleStatus(u)}
                            className={`px-2 py-1 text-xs rounded font-medium cursor-pointer ${
                              u.status === 'active'
                                ? 'text-red-700 hover:bg-red-50'
                                : 'text-emerald-700 hover:bg-emerald-50'
                            }`}
                          >
                            {u.status === 'active' ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Password Reset Modal */}
      {resettingUserId && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-[#696969]/20 w-full max-w-sm overflow-hidden">
            <div className="px-5 py-3.5 bg-[#014025] text-white font-bold text-sm flex items-center justify-between">
              <span>Secure Password Reset</span>
              <button onClick={() => setResettingUserId(null)} className="text-white/70 hover:text-white">
                ✕
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <p className="text-[#696969]">
                Set a new password for <strong className="text-[#014025]">{resettingUserName}</strong>. Passwords are
                safely hashed on the backend with bcrypt.
              </p>
              <div>
                <label className="block text-xs font-semibold text-[#014025] mb-1">
                  New Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  placeholder="Minimum 6 characters"
                  value={resetPasswordVal}
                  onChange={(e) => setResetPasswordVal(e.target.value)}
                  className="w-full border border-[#696969]/30 rounded p-2 text-xs text-[#014025]"
                />
              </div>
            </div>
            <div className="px-5 py-3 bg-[#696969]/5 border-t border-[#696969]/15 flex items-center justify-end space-x-2">
              <button
                onClick={() => setResettingUserId(null)}
                className="px-3 py-1.5 text-xs border border-[#696969]/30 rounded text-[#696969]"
              >
                Cancel
              </button>
              <button
                onClick={handleResetPassword}
                disabled={isResetting || !resetPasswordVal}
                className="px-4 py-1.5 bg-[#014025] hover:bg-[#014025]/85 text-white rounded text-xs font-semibold disabled:opacity-50"
              >
                {isResetting ? 'Saving...' : 'Update Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Staff Modal */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-[#696969]/20 w-full max-w-md overflow-hidden">
            <div className="px-5 py-3.5 bg-[#014025] text-white font-bold text-sm flex items-center justify-between">
              <span className="flex items-center space-x-2">
                <Pencil className="w-4 h-4" />
                <span>Edit Staff: {editingStaff.full_name}</span>
              </span>
              <button onClick={() => setEditingStaff(null)} className="text-white/70 hover:text-white font-bold cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block text-xs font-semibold text-[#014025] mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-xs text-[#014025] focus:ring-1 focus:ring-[#456B5A]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#014025] mb-1">Designation</label>
                <input
                  type="text"
                  placeholder="e.g. Site Supervisor"
                  value={editForm.designation}
                  onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })}
                  className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-xs text-[#014025] focus:ring-1 focus:ring-[#456B5A]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#014025] mb-1">Assigned Site / Location</label>
                <input
                  type="text"
                  placeholder="e.g. Lumia Infrastructure Phase 2"
                  value={editForm.assignedLocation}
                  onChange={(e) => setEditForm({ ...editForm, assignedLocation: e.target.value })}
                  className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-xs text-[#014025] focus:ring-1 focus:ring-[#456B5A]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#014025] mb-1">Mobile Number</label>
                <input
                  type="tel"
                  placeholder="10-digit mobile"
                  value={editForm.mobileNumber}
                  onChange={(e) => setEditForm({ ...editForm, mobileNumber: e.target.value })}
                  className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-xs text-[#014025] focus:ring-1 focus:ring-[#456B5A]"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-[#696969]/15">
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="px-3 py-1.5 border border-[#696969]/30 rounded-md text-[#696969] hover:bg-[#696969]/10 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isEditing}
                  className="px-4 py-1.5 bg-[#014025] hover:bg-[#014025]/85 text-white rounded-md font-semibold cursor-pointer disabled:opacity-50"
                >
                  {isEditing ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}