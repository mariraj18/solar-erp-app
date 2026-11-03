import React, { useState, useEffect } from 'react';
import {
  Plus,
  Building,
  Search,
  Edit2,
  Pencil,
  Trash2,
  ShieldAlert,
  Users,
  Tag,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Coins,
  X,
  Layers,
  MapPin,
  Clock,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatINR } from '../lib/calculations';
import { TeamModal } from '../components/TeamModal';
import { useAuth } from '../context/AuthContext';
import { CustomSelect } from '../components/CustomSelect';

export function TeamsPage() {
  const { user, isMasterAdmin, isAdminAny } = useAuth();
  const [activeTab, setActiveTab] = useState<'teams' | 'categories'>('teams');
  const [teams, setTeams] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [catSearch, setCatSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<any | null>(null);

  // Category Modal State (for both Add and Edit)
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any | null>(null);
  const [catName, setCatName] = useState('');
  const [catCode, setCatCode] = useState('');
  const [catRate, setCatRate] = useState('1000');
  const [catRateType, setCatRateType] = useState('daily');
  const [catDisplayOrder, setCatDisplayOrder] = useState('0');
  const [catIsSubmitting, setCatIsSubmitting] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);
  const [catSuccessMsg, setCatSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tList, cList] = await Promise.all([api.teams.list(), api.categories.list()]);
      setTeams(tList);
      setCategories(cList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNewTeam = () => {
    setEditingTeam(null);
    setModalOpen(true);
  };

  const handleEditTeam = (team: any) => {
    setEditingTeam(team);
    setModalOpen(true);
  };

  const openAddCategoryModal = () => {
    setEditingCategory(null);
    setCatName('');
    setCatCode('');
    setCatRate('1000');
    setCatRateType('daily');
    setCatDisplayOrder(String(categories.length + 1));
    setCatError(null);
    setCatSuccessMsg(null);
    setCatModalOpen(true);
  };

  const openEditCategoryModal = (cat: any) => {
    setEditingCategory(cat);
    setCatName(cat.name || '');
    setCatCode(cat.code || '');
    setCatRate(String(cat.default_rate ?? 0));
    setCatRateType(cat.rate_type || 'daily');
    setCatDisplayOrder(String(cat.display_order ?? 0));
    setCatError(null);
    setCatSuccessMsg(null);
    setCatModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) {
      setCatError('Category name is required.');
      return;
    }

    const finalCode = (catCode.trim() || catName.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8));
    setCatIsSubmitting(true);
    setCatError(null);

    try {
      if (editingCategory) {
        await api.categories.update(editingCategory.id, {
          name: catName.trim(),
          code: finalCode,
          defaultRate: Number(catRate) || 0,
          rateType: catRateType,
          displayOrder: Number(catDisplayOrder) || 0,
          isShared: true,
        });
        setCatSuccessMsg(`Labour category "${catName.trim()}" updated successfully.`);
      } else {
        await api.categories.create({
          name: catName.trim(),
          code: finalCode,
          defaultRate: Number(catRate) || 0,
          rateType: catRateType,
          displayOrder: Number(catDisplayOrder) || 0,
          isShared: true,
        });
        setCatSuccessMsg(`Labour category "${catName.trim()}" created successfully.`);
      }

      await loadData();
      setTimeout(() => {
        setCatModalOpen(false);
        setCatSuccessMsg(null);
      }, 700);
    } catch (err: any) {
      setCatError(err.message || 'Failed to save labour category');
    } finally {
      setCatIsSubmitting(false);
    }
  };

  const handleDeleteCategory = async (cat: any) => {
    if (!window.confirm(`Are you sure you want to delete labour category "${cat.name}" (${cat.code})?`)) {
      return;
    }

    try {
      await api.categories.delete(cat.id);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete category.');
    }
  };

  const uniqueCategories = Array.from(new Set(teams.map((t) => t.work_category).filter(Boolean)));
  const uniqueProjects = Array.from(new Set(teams.map((t) => t.location_project).filter(Boolean)));

  const filteredTeams = teams.filter((t) => {
    if (selectedCategory !== 'all' && t.work_category !== selectedCategory) return false;
    if (selectedProject !== 'all' && (t.location_project || '') !== selectedProject) return false;
    if (selectedStatus === 'active' && t.status !== 'active') return false;
    if (selectedStatus === 'inactive' && t.status === 'active') return false;
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      t.name.toLowerCase().includes(term) ||
      (t.work_category || '').toLowerCase().includes(term) ||
      (t.location_project || '').toLowerCase().includes(term)
    );
  });

  const filteredCategories = categories.filter((c) => {
    if (!catSearch) return true;
    const term = catSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(term) ||
      c.code.toLowerCase().includes(term) ||
      String(c.default_rate).includes(term)
    );
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow duration-300">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#0E6037]/10 flex items-center justify-center text-[#0E6037]">
              {activeTab === 'teams' ? <Users className="w-5 h-5" /> : <Tag className="w-5 h-5" />}
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight">
                {activeTab === 'teams' ? 'Teams & Work Categories' : 'Labour Categories & Standard Rates'}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {activeTab === 'teams'
                  ? 'Operational team templates, work scopes, and default role configurations'
                  : 'Manage master worker trades, wage rates (Mason, Helper, Painter, etc.), and billing classifications'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeTab === 'teams' ? (
            <>
              <button
                onClick={() => setActiveTab('categories')}
                className="flex items-center space-x-1.5 px-3 py-2 border border-slate-200 text-[#0E6037] hover:bg-[#0E6037]/5 hover:border-[#0E6037]/30 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                <Tag className="w-3.5 h-3.5" />
                <span>Manage Categories ({categories.length})</span>
              </button>

              <button
                onClick={handleCreateNewTeam}
                className="group flex items-center space-x-1.5 px-4 py-2 bg-[#0E6037] hover:bg-[#0B4D2C] text-white rounded-xl text-xs font-semibold shadow-xs hover:shadow-md transition-all duration-200 active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4 transition-transform duration-200 group-hover:rotate-90" />
                <span>Create Team Template</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setActiveTab('teams')}
                className="flex items-center space-x-1.5 px-3 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Back to Teams ({teams.length})</span>
              </button>

              <button
                onClick={openAddCategoryModal}
                className="group flex items-center space-x-1.5 px-4 py-2 bg-[#0E6037] hover:bg-[#0B4D2C] text-white rounded-xl text-xs font-semibold shadow-xs hover:shadow-md transition-all duration-200 active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4 transition-transform duration-200 group-hover:rotate-90" />
                <span>Add Labour Category</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Navigation Switcher Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200/80 pb-1">
        <button
          onClick={() => setActiveTab('teams')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'teams'
              ? 'bg-[#0E6037] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Teams &amp; Templates</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            activeTab === 'teams' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {teams.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('categories')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'categories'
              ? 'bg-[#0E6037] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white'
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>Labour Categories</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            activeTab === 'categories' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {categories.length}
          </span>
        </button>
      </div>

      {/* Snapshot Preservation Policy Notice */}
      <div className="bg-[#EBF3EE] border border-[#CFE1D6] rounded-xl p-3.5 text-xs text-slate-600 flex items-start space-x-2.5 shadow-2xs">
        <div className="w-6 h-6 rounded-lg bg-[#0E6037]/15 flex items-center justify-center shrink-0 mt-0.5">
          <ShieldAlert className="w-3.5 h-3.5 text-[#0E6037]" />
        </div>
        <div className="leading-relaxed">
          <span className="font-bold text-[#0E6037]">Historical Snapshot Policy:</span> Changes to labour categories or team default rates apply to future daily attendance and weekly assignments. Past finalized attendance and payment records remain immutably preserved.
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: TEAMS & TEMPLATES VIEW */}
      {/* ========================================================================= */}
      {activeTab === 'teams' && (
        <div className="space-y-4">
          {/* Filter Toolbar */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {/* Search bar */}
              <div className="relative group">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none transition-colors duration-200 group-focus-within:text-[#0E6037]" />
                <input
                  type="text"
                  placeholder="Search teams, scope, project..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-800 placeholder-slate-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#0E6037]/20 focus:border-[#0E6037] hover:border-slate-300"
                />
              </div>

              {/* Work Category Filter */}
              <div>
                <CustomSelect
                  value={selectedCategory}
                  onChange={(val) => setSelectedCategory(val)}
                  options={[
                    { value: 'all', label: 'All Work Categories' },
                    ...uniqueCategories.map((c) => ({ value: c, label: c })),
                  ]}
                  size="sm"
                  placeholder="Filter by Category"
                />
              </div>

              {/* Project / Location Filter */}
              <div>
                <CustomSelect
                  value={selectedProject}
                  onChange={(val) => setSelectedProject(val)}
                  options={[
                    { value: 'all', label: 'All Projects / Sites' },
                    ...uniqueProjects.map((p) => ({ value: p, label: p })),
                  ]}
                  size="sm"
                  placeholder="Filter by Project"
                />
              </div>

              {/* Status Filter */}
              <div>
                <CustomSelect
                  value={selectedStatus}
                  onChange={(val) => setSelectedStatus(val)}
                  options={[
                    { value: 'all', label: 'All Statuses' },
                    { value: 'active', label: 'Active Teams Only' },
                    { value: 'inactive', label: 'Inactive / Archived' },
                  ]}
                  size="sm"
                  placeholder="Filter by Status"
                />
              </div>
            </div>

            {/* Active filters status / reset */}
            {(search || selectedCategory !== 'all' || selectedProject !== 'all' || selectedStatus !== 'all') && (
              <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs text-slate-500">
                <span>
                  Showing <strong>{filteredTeams.length}</strong> of {teams.length} teams
                </span>
                <button
                  onClick={() => {
                    setSearch('');
                    setSelectedCategory('all');
                    setSelectedProject('all');
                    setSelectedStatus('all');
                  }}
                  className="text-xs text-[#0E6037] hover:text-[#0B4D2C] font-semibold flex items-center space-x-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Reset Filters</span>
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-12 flex flex-col items-center justify-center space-y-3 shadow-xs">
              <div className="w-8 h-8 border-2 border-[#0E6037]/20 border-t-[#0E6037] rounded-full animate-spin" />
              <p className="text-xs text-slate-500">Loading team templates...</p>
            </div>
          ) : filteredTeams.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0E6037]/10 mb-3 text-[#0E6037]">
                <Users className="w-7 h-7" />
              </div>
              <p className="text-sm font-semibold text-slate-800">
                {search ? 'No teams match your search' : 'No team templates yet'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {search ? 'Try a different keyword or clear search.' : 'Create your first team template to assign weekly attendance.'}
              </p>
              {!search && (
                <button
                  onClick={handleCreateNewTeam}
                  className="mt-4 inline-flex items-center space-x-1.5 px-4 py-2 bg-[#0E6037] hover:bg-[#0B4D2C] text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Team Template</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTeams.map((team, idx) => (
                <div
                  key={team.id}
                  className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-[#0E6037]/40 hover:shadow-md transition-all duration-200 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-sm text-slate-800">{team.name}</h3>
                        <span className="inline-block text-[10px] uppercase font-semibold px-2.5 py-0.5 rounded-full bg-[#E5EFE9] text-[#134E35] border border-[#CFE1D6] mt-1.5">
                          {team.work_category}
                        </span>
                      </div>
                      <button
                        onClick={() => handleEditTeam(team)}
                        className="p-1.5 text-slate-400 hover:text-[#0E6037] hover:bg-[#0E6037]/10 rounded-lg transition-colors cursor-pointer"
                        title="Edit team template"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>

                    {team.location_project && (
                      <div className="text-xs text-slate-600 mt-2.5">
                        <span className="font-semibold text-slate-700">Project / Site:</span>{' '}
                        {team.location_project}
                      </div>
                    )}

                    {/* Geofence info */}
                    <div className="mt-2 text-xs flex items-center space-x-1.5 text-slate-600">
                      <MapPin className="w-3.5 h-3.5 text-[#0E6037] shrink-0" />
                      {team.latitude && team.longitude ? (
                        <span className="font-mono text-[11px]">
                          {team.latitude.toFixed(4)}, {team.longitude.toFixed(4)} ({team.geofence_radius_meters || 150}m radius)
                        </span>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">No GPS boundary assigned</span>
                      )}
                    </div>

                    {/* Pending Geofence Change Badge */}
                    {team.pending_geofence_request_id && (
                      <div className="mt-2.5 p-2 rounded-xl bg-amber-50 border border-amber-200/80 text-[11px] text-amber-800 flex items-center space-x-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="font-medium">Site relocation pending Admin approval</span>
                      </div>
                    )}

                    {team.notes && (
                      <div className="text-xs text-slate-500 italic mt-1.5">{team.notes}</div>
                    )}

                    {/* Roles & Default Rates */}
                    <div className="mt-3.5 pt-3 border-t border-slate-100">
                      <div className="text-[11px] font-semibold text-slate-500 mb-1.5">
                        Default Labour Roles &amp; Rates:
                      </div>
                      {team.roles && team.roles.length > 0 ? (
                        <div className="space-y-1">
                          {team.roles.map((r: any, rIdx: number) => (
                            <div key={rIdx} className="flex justify-between text-xs font-mono">
                              <span className="text-slate-600 font-sans">{r.category_name}:</span>
                              <span className="font-bold text-[#0E6037]">{formatINR(r.default_rate)}/day</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400">No default roles configured.</div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span className="capitalize px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                      {team.status}
                    </span>
                    <button
                      onClick={() => handleEditTeam(team)}
                      className="flex items-center space-x-1 text-[#0E6037] font-semibold hover:text-[#0B4D2C] transition-colors cursor-pointer"
                    >
                      <span>Configure Template</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: LABOUR CATEGORIES VIEW (WITH FULL EDIT & DELETE) */}
      {/* ========================================================================= */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          {/* Search bar and Category counters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Search categories by name, code, or rate..."
                value={catSearch}
                onChange={(e) => setCatSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-800 placeholder-slate-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#0E6037]/20 focus:border-[#0E6037] hover:border-slate-300"
              />
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Showing <span className="font-bold text-[#0E6037]">{filteredCategories.length}</span> of {categories.length} categories
            </div>
          </div>

          {/* Categories Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#F8FAF9] text-slate-700 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Order</th>
                    <th className="py-3 px-4">Trade Code</th>
                    <th className="py-3 px-4">Labour Category Name</th>
                    <th className="py-3 px-4 text-right">Default Rate (₹)</th>
                    <th className="py-3 px-4 text-center">Rate Unit</th>
                    <th className="py-3 px-4 text-center">Master Scope</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCategories.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-xs text-slate-400">
                        No labour categories match your search.
                      </td>
                    </tr>
                  ) : (
                    filteredCategories.map((cat, idx) => (
                      <tr key={cat.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono text-slate-400 font-medium">
                          #{cat.display_order ?? idx + 1}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200">
                            {cat.code}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800">
                          <div className="flex items-center space-x-2">
                            <span className="w-2 h-2 rounded-full bg-[#0E6037]" />
                            <span>{cat.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">
                          {formatINR(cat.default_rate)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize bg-[#E5EFE9] text-[#134E35] border border-[#CFE1D6]">
                            {cat.rate_type === 'hourly' ? 'Per Hour' : 'Per Day (Daily)'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                            {cat.is_shared ? 'Shared Template' : 'Private'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              type="button"
                              onClick={() => openEditCategoryModal(cat)}
                              className="px-2.5 py-1 text-[#0E6037] hover:bg-[#0E6037]/10 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-colors cursor-pointer"
                              title={`Edit category ${cat.name}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCategory(cat)}
                              className="px-2.5 py-1 text-red-600 hover:bg-red-50 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-colors cursor-pointer"
                              title={`Delete category ${cat.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ADD / EDIT LABOUR CATEGORY MODAL */}
      {/* ========================================================================= */}
      {catModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-slide-in">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-[#0E6037] text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Tag className="w-4 h-4 text-emerald-200" />
                <span className="font-bold text-sm">
                  {editingCategory ? `Edit Labour Category: ${editingCategory.name}` : 'Add New Labour Category'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCatModalOpen(false)}
                className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveCategory} className="p-5 space-y-4">
              {catError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <span>{catError}</span>
                </div>
              )}

              {catSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{catSuccessMsg}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Category Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mason, Helper, Painter, Barbender, Welder"
                  value={catName}
                  onChange={(e) => {
                    setCatName(e.target.value);
                    if (!editingCategory && !catCode) {
                      setCatCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8));
                    }
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0E6037]/20 focus:border-[#0E6037]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Trade Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. MASON"
                    value={catCode}
                    onChange={(e) => setCatCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 font-mono text-xs border border-slate-200 rounded-xl bg-white text-slate-800 uppercase focus:outline-none focus:ring-2 focus:ring-[#0E6037]/20 focus:border-[#0E6037]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Default Rate (₹) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-mono font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      required
                      value={catRate}
                      onChange={(e) => setCatRate(e.target.value)}
                      className="w-full pl-7 pr-3 py-2 font-mono text-xs font-bold border border-slate-200 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0E6037]/20 focus:border-[#0E6037]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <CustomSelect
                    label="Rate Basis"
                    value={catRateType}
                    onChange={(val) => setCatRateType(String(val))}
                    options={[
                      { value: 'daily', label: 'Daily Wage (Standard)', badge: 'Day' },
                      { value: 'hourly', label: 'Hourly Rate', badge: 'Hour' },
                    ]}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Display Order
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={catDisplayOrder}
                    onChange={(e) => setCatDisplayOrder(e.target.value)}
                    className="w-full px-3 py-2 font-mono text-xs border border-slate-200 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0E6037]/20 focus:border-[#0E6037]"
                  />
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setCatModalOpen(false)}
                  className="px-3 py-2 text-xs border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={catIsSubmitting}
                  className="px-4 py-2 bg-[#0E6037] hover:bg-[#0B4D2C] text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 flex items-center space-x-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {catIsSubmitting ? 'Saving...' : editingCategory ? 'Update Category' : 'Save Category'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Team Template Modal */}
      <TeamModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={loadData}
        editTeam={editingTeam}
      />

      {/* Custom animations */}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.4s ease forwards;
        }
        .animate-slide-in {
          animation: slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
}