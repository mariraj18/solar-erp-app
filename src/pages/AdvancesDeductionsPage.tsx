import React, { useState, useEffect } from 'react';
import { Plus, BadgePercent, Trash2, TrendingDown, TrendingUp, Wallet, Search, X, Building, Filter } from 'lucide-react';
import { api } from '../lib/api';
import { formatINR } from '../lib/calculations';
import { getTodayKolkataISO, getWeekBounds, formatDateDisplay } from '../lib/dateUtils';
import { WeekNavigator } from '../components/WeekNavigator';
import { AdjustmentModal } from '../components/AdjustmentModal';
import { useAuth } from '../context/AuthContext';
import { CustomSelect } from '../components/CustomSelect';

export function AdvancesDeductionsPage() {
  const { isMasterAdmin } = useAuth();
  const [currentWeekStart, setCurrentWeekStart] = useState<string>(() => {
    return getWeekBounds(getTodayKolkataISO()).startDate;
  });
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [offices, setOffices] = useState<any[]>([]);
  const [selectedOffice, setSelectedOffice] = useState<string>('all');
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (isMasterAdmin) {
      api.users.list().then((uList: any[]) => {
        setOffices(uList.filter((u) => u.role === 'secondary_admin'));
      }).catch(console.error);
    }
  }, [isMasterAdmin]);

  useEffect(() => {
    loadData();
  }, [currentWeekStart, selectedOffice]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [adjList, teamList] = await Promise.all([
        api.adjustments.list({
          weekStart: currentWeekStart,
          secondaryAdminId: selectedOffice !== 'all' ? selectedOffice : undefined,
        }),
        api.teams.list(),
      ]);
      setAdjustments(adjList);
      setTeams(teamList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this adjustment? It will be logged in the audit trail.')) return;
    try {
      await api.adjustments.delete(id);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete adjustment');
    }
  };

  // Filter adjustments in-memory
  const filteredAdjustments = adjustments.filter((adj) => {
    if (selectedTeam !== 'all' && adj.team_id !== selectedTeam) return false;
    if (selectedType === 'advance' && adj.adjustment_type !== 'advance_deduction') return false;
    if (
      selectedType === 'deduction' &&
      adj.adjustment_type !== 'fixed_deduction' &&
      adj.adjustment_type !== 'percentage_deduction'
    )
      return false;
    if (selectedType === 'credit' && adj.adjustment_type !== 'credit' && adj.adjustment_type !== 'addition')
      return false;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const team = teams.find((t) => t.id === adj.team_id);
      const matches =
        (adj.description || '').toLowerCase().includes(term) ||
        (adj.adjustment_type || '').toLowerCase().includes(term) ||
        (team?.name || '').toLowerCase().includes(term);
      if (!matches) return false;
    }
    return true;
  });

  const totalDeductions = filteredAdjustments
    .filter((a) => a.adjustment_type === 'fixed_deduction' || a.adjustment_type === 'percentage_deduction')
    .reduce((s, a) => s + (a.amount || 0), 0);

  const totalAdvances = filteredAdjustments
    .filter((a) => a.adjustment_type === 'advance_deduction')
    .reduce((s, a) => s + (a.amount || 0), 0);

  const totalCredits = filteredAdjustments
    .filter((a) => a.adjustment_type === 'credit' || a.adjustment_type === 'addition')
    .reduce((s, a) => s + (a.amount || 0), 0);

  const metrics = [
    {
      label: 'Advances Applied',
      value: `-${formatINR(totalAdvances)}`,
      description: 'Deducted from weekly payable balance',
      icon: Wallet,
      accent: 'text-[#014025]',
      bg: 'bg-[#014025]/10',
      border: 'border-[#014025]/15',
    },
    {
      label: 'Fixed & % Deductions',
      value: `-${formatINR(totalDeductions)}`,
      description: 'Withholdings and penalties',
      icon: TrendingDown,
      accent: 'text-[#696969]',
      bg: 'bg-[#696969]/10',
      border: 'border-[#696969]/15',
    },
    {
      label: 'Authorized Credits',
      value: `+${formatINR(totalCredits)}`,
      description: 'Bonus and compensation credits',
      icon: TrendingUp,
      accent: 'text-[#456B5A]',
      bg: 'bg-[#456B5A]/10',
      border: 'border-[#456B5A]/15',
    },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300 animate-slide-in">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-[#456B5A]/10 flex items-center justify-center">
              <BadgePercent className="w-4 h-4 text-[#456B5A]" />
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-[#014025] tracking-tight">
              Advances, Deductions &amp; Credits
            </h1>
          </div>
          <p className="text-xs text-[#696969] mt-1.5 ml-10">
            Mid-week advances, percentage withholdings (e.g. 6.25% TDS), and authorized credit bonuses
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <WeekNavigator
            currentWeekStart={currentWeekStart}
            onWeekChange={(newWeek) => setCurrentWeekStart(newWeek)}
          />

          <button
            onClick={() => setModalOpen(true)}
            className="group flex items-center space-x-1.5 px-4 py-2 bg-[#014025] hover:bg-[#013520] text-white rounded-lg text-xs font-semibold shadow-sm hover:shadow-md transition-all duration-200 active:scale-95"
          >
            <Plus className="w-4 h-4 transition-transform duration-200 group-hover:rotate-90" />
            <span>Add Adjustment</span>
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white p-3.5 rounded-xl border border-gray-100 shadow-sm space-y-3">
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${isMasterAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-2.5`}>
          {/* Office Filter for Master Admin */}
          {isMasterAdmin && (
            <div>
              <CustomSelect
                value={selectedOffice}
                onChange={(val) => setSelectedOffice(val)}
                options={[
                  { value: 'all', label: 'All Offices / Admins' },
                  ...offices.map((o) => ({
                    value: o.id,
                    label: `${o.full_name} (${o.assigned_location || 'Office'})`,
                  })),
                ]}
                size="sm"
                placeholder="Filter by Office"
                leadingIcon={<Building className="w-3.5 h-3.5" />}
              />
            </div>
          )}

          {/* Team Filter */}
          <div>
            <CustomSelect
              value={selectedTeam}
              onChange={(val) => setSelectedTeam(val)}
              options={[
                { value: 'all', label: 'All Teams' },
                ...teams.map((t) => ({ value: t.id, label: t.name })),
              ]}
              size="sm"
              placeholder="Filter by Team"
            />
          </div>

          {/* Adjustment Type Filter */}
          <div>
            <CustomSelect
              value={selectedType}
              onChange={(val) => setSelectedType(val)}
              options={[
                { value: 'all', label: 'All Types' },
                { value: 'advance', label: 'Advances Only' },
                { value: 'deduction', label: 'Deductions & Withholdings' },
                { value: 'credit', label: 'Credits & Additions' },
              ]}
              size="sm"
              placeholder="Filter by Type"
            />
          </div>

          {/* Search Input */}
          <div className="relative group">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search description, team..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#014025]/20 focus:border-[#014025]"
            />
          </div>
        </div>

        {/* Reset filter pill */}
        {(selectedOffice !== 'all' || selectedTeam !== 'all' || selectedType !== 'all' || searchTerm.trim()) && (
          <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-xs text-slate-500">
            <span>
              Showing <strong>{filteredAdjustments.length}</strong> of {adjustments.length} adjustments
            </span>
            <button
              onClick={() => {
                setSelectedOffice('all');
                setSelectedTeam('all');
                setSelectedType('all');
                setSearchTerm('');
              }}
              className="text-xs text-[#014025] hover:text-[#013520] font-semibold flex items-center space-x-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          </div>
        )}
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {metrics.map((m, idx) => {
          const Icon = m.icon;
          return (
            <div
              key={m.label}
              className={`bg-white p-4 rounded-xl border ${m.border} shadow-sm hover:shadow-md transition-all duration-300 animate-slide-in`}
              style={{ animationDelay: `${0.05 * (idx + 1)}s` }}
            >
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold text-[#696969] uppercase tracking-wide">
                  {m.label}
                </div>
                <div className={`w-7 h-7 rounded-lg ${m.bg} flex items-center justify-center`}>
                  <Icon className={`w-3.5 h-3.5 ${m.accent}`} />
                </div>
              </div>
              <div className={`text-lg font-bold font-mono ${m.accent} mt-2`}>
                {m.value}
              </div>
              <div className="text-[10px] text-[#696969]/80 mt-1">{m.description}</div>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300 animate-slide-in" style={{ animationDelay: '0.2s' }}>
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center space-y-3">
            <div className="w-8 h-8 border-2 border-[#456B5A]/20 border-t-[#456B5A] rounded-full animate-spin" />
            <p className="text-xs text-[#696969]">Loading adjustments...</p>
          </div>
        ) : filteredAdjustments.length === 0 ? (
          <div className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#456B5A]/10 mb-3">
              <BadgePercent className="w-6 h-6 text-[#456B5A]" />
            </div>
            <p className="text-sm font-semibold text-[#014025]">No advances or deductions match the selected filter</p>
            <p className="text-xs text-[#696969] mt-1">Try resetting your filters or add a new adjustment for this week.</p>
            <button
              onClick={() => setModalOpen(true)}
              className="mt-4 inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#456B5A]/10 hover:bg-[#456B5A]/20 text-[#014025] rounded-lg text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Adjustment</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#456B5A]/5 text-[#014025] font-bold border-b border-gray-100">
                  <th className="py-3 px-3 font-semibold">Date</th>
                  <th className="py-3 px-3 font-semibold">Team</th>
                  <th className="py-3 px-3 font-semibold">Type</th>
                  <th className="py-3 px-3 font-semibold">Description</th>
                  <th className="py-3 px-3 text-right font-semibold">Base / Percentage</th>
                  <th className="py-3 px-3 text-right font-semibold">Adjustment Amount (₹)</th>
                  <th className="py-3 px-3 text-center font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 font-mono text-[11px] sm:text-xs">
                {filteredAdjustments.map((adj, idx) => {
                  const team = teams.find((t) => t.id === adj.team_id);
                  const isNegative = adj.adjustment_type.includes('deduction');

                  return (
                    <tr
                      key={adj.id}
                      className="hover:bg-[#456B5A]/5 transition-colors duration-150 animate-row-in"
                      style={{ animationDelay: `${idx * 0.03}s` }}
                    >
                      <td className="py-3 px-3 font-sans text-[#696969]">
                        {formatDateDisplay(adj.date)}
                      </td>
                      <td className="py-3 px-3 font-sans font-semibold text-[#014025]">
                        {team?.name || 'Team'}
                      </td>
                      <td className="py-3 px-3 font-sans">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold capitalize ${
                          isNegative
                            ? 'bg-[#696969]/10 text-[#696969]'
                            : 'bg-[#456B5A]/10 text-[#014025]'
                        }`}>
                          {adj.adjustment_type.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-sans text-gray-800">
                        {adj.description}
                      </td>
                      <td className="py-3 px-3 text-right text-[#696969]">
                        {adj.rate_percentage ? `${adj.rate_percentage}% of ${formatINR(adj.base_amount)}` : '—'}
                      </td>
                      <td
                        className={`py-3 px-3 text-right font-bold ${
                          isNegative ? 'text-[#696969]' : 'text-[#456B5A]'
                        }`}
                      >
                        {isNegative ? `-${formatINR(adj.amount)}` : `+${formatINR(adj.amount)}`}
                      </td>
                      <td className="py-3 px-3 text-center font-sans">
                        <button
                          onClick={() => handleDelete(adj.id)}
                          className="text-gray-300 hover:text-red-600 p-1.5 rounded-md hover:bg-red-50 transition-colors duration-150"
                          title="Delete adjustment"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AdjustmentModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={loadData}
        weekStartDate={currentWeekStart}
      />

      {/* Custom animations */}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-in {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes row-in {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease forwards;
        }
        .animate-slide-in {
          opacity: 0;
          animation: slide-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-row-in {
          opacity: 0;
          animation: row-in 0.35s ease forwards;
        }
      `}</style>
    </div>
  );
}