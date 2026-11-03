import React, { useState, useEffect } from 'react';
import {
  Settings,
  Building,
  Clock,
  Wallet,
  Database,
  ShieldCheck,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FileText,
  Sparkles,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { formatINR } from '../lib/calculations';

export function SettingsPage() {
  const { user, isMasterAdmin } = useAuth();

  // Settings State
  const [companyProfile, setCompanyProfile] = useState({
    companyName: 'Lumia Infrastructure & Construction Ltd.',
    projectCode: 'LUMIA-ERP',
    timezone: 'Asia/Kolkata',
    weekStartDay: 'Saturday',
    weekEndDay: 'Friday',
    currency: 'INR',
  });

  const [timeRules, setTimeRules] = useState({
    standardStartTime: '08:30',
    standardEndTime: '17:30',
    standardHours: 8,
    unpaidBreakMinutes: 60,
    graceMinutes: 15,
    overtimeRatePerHour: 150,
  });

  const [pettyCashOpening, setPettyCashOpening] = useState({
    openingInAccount: 75000,
    openingInHand: 25000,
    asOfDate: '2026-10-01',
  });

  const [systemStats, setSystemStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [settingsData, statsData] = await Promise.all([
        api.settings.get(),
        api.status.get(),
      ]);

      if (settingsData.company_profile) {
        setCompanyProfile((prev) => ({ ...prev, ...settingsData.company_profile }));
      }
      if (settingsData.time_rules) {
        setTimeRules((prev) => ({ ...prev, ...settingsData.time_rules }));
      }
      if (settingsData.petty_cash_opening) {
        setPettyCashOpening((prev) => ({ ...prev, ...settingsData.petty_cash_opening }));
      }
      setSystemStats(statsData);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load configuration settings.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMasterAdmin) return;
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await api.settings.save('company_profile', companyProfile);
      setSuccessMsg('Company profile settings updated successfully.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update company settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTimeRules = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMasterAdmin) return;
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await api.settings.save('time_rules', timeRules);
      setSuccessMsg('Time & Overtime calculation rules updated successfully.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update time rules.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePettyCash = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMasterAdmin) return;
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await api.settings.save('petty_cash_opening', pettyCashOpening);
      setSuccessMsg('Petty cash opening balances saved.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update petty cash opening balance.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSeedSampleData = async () => {
    if (!isMasterAdmin) return;
    setIsSeeding(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.settings.seedSampleData();
      setSuccessMsg(res.message || 'Complete sample data seeded successfully for all modules!');
      await loadSettings();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to seed sample data.');
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl sm:text-2xl font-bold text-[#014025] tracking-tight">
              System Configuration &amp; Settings
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#456B5A]/15 text-[#3B5E4F] border border-[#456B5A]/30">
              {isMasterAdmin ? 'Master Administrator' : 'Read Only'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#696969] mt-0.5">
            Operational rules, Saturday–Friday calendar governance, calculation thresholds, and system health.
          </p>
        </div>

        {isMasterAdmin && (
          <button
            onClick={handleSeedSampleData}
            disabled={isSeeding}
            className="inline-flex items-center space-x-2 px-3.5 py-2 bg-gradient-to-r from-[#456B5A] to-[#014025] hover:opacity-95 text-white rounded-lg text-xs font-semibold shadow-xs transition-all disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-emerald-200" />
            <span>{isSeeding ? 'Seeding Demo Data...' : 'Populate Sample Data'}</span>
          </button>
        )}
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Grid of Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Company Profile */}
        <div className="bg-white rounded-xl border border-[#456B5A]/20 shadow-xs p-5 space-y-4">
          <div className="flex items-center space-x-2.5 border-b border-[#456B5A]/15 pb-3">
            <div className="p-2 bg-[#456B5A]/10 rounded-lg text-[#3B5E4F]">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#014025]">Company &amp; Project Profile</h2>
              <p className="text-[11px] text-[#696969]">Organization identifiers and reporting parameters</p>
            </div>
          </div>

          <form onSubmit={handleSaveCompany} className="space-y-3.5 text-xs">
            <div>
              <label className="block text-[#696969] font-medium mb-1">Company Legal Name</label>
              <input
                type="text"
                disabled={!isMasterAdmin}
                value={companyProfile.companyName}
                onChange={(e) => setCompanyProfile({ ...companyProfile, companyName: e.target.value })}
                className="w-full px-3 py-2 border border-[#456B5A]/30 rounded-lg text-[#014025] focus:outline-none focus:ring-1 focus:ring-[#456B5A] disabled:bg-slate-50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[#696969] font-medium mb-1">Project Code</label>
                <input
                  type="text"
                  disabled={!isMasterAdmin}
                  value={companyProfile.projectCode}
                  onChange={(e) => setCompanyProfile({ ...companyProfile, projectCode: e.target.value })}
                  className="w-full px-3 py-2 border border-[#456B5A]/30 rounded-lg text-[#014025] focus:outline-none focus:ring-1 focus:ring-[#456B5A] disabled:bg-slate-50 font-mono"
                />
              </div>
              <div>
                <label className="block text-[#696969] font-medium mb-1">Timezone</label>
                <input
                  type="text"
                  disabled
                  value="Asia/Kolkata (IST +05:30)"
                  className="w-full px-3 py-2 border border-[#456B5A]/20 bg-slate-50 rounded-lg text-[#696969] font-mono text-[11px]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[#696969] font-medium mb-1">Reporting Cycle Start</label>
                <input
                  type="text"
                  disabled
                  value="Saturday (00:00:00)"
                  className="w-full px-3 py-2 border border-[#456B5A]/20 bg-slate-50 rounded-lg text-[#696969] text-[11px]"
                />
              </div>
              <div>
                <label className="block text-[#696969] font-medium mb-1">Reporting Cycle End</label>
                <input
                  type="text"
                  disabled
                  value="Friday (23:59:59)"
                  className="w-full px-3 py-2 border border-[#456B5A]/20 bg-slate-50 rounded-lg text-[#696969] text-[11px]"
                />
              </div>
            </div>

            {isMasterAdmin && (
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-[#014025] hover:bg-[#014025]/90 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Profile</span>
                </button>
              </div>
            )}
          </form>
        </div>

        {/* 2. Time & Overtime Rules */}
        <div className="bg-white rounded-xl border border-[#456B5A]/20 shadow-xs p-5 space-y-4">
          <div className="flex items-center space-x-2.5 border-b border-[#456B5A]/15 pb-3">
            <div className="p-2 bg-[#456B5A]/10 rounded-lg text-[#3B5E4F]">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#014025]">Time &amp; Overtime Rules</h2>
              <p className="text-[11px] text-[#696969]">Standard working shift schedule and overtime thresholds</p>
            </div>
          </div>

          <form onSubmit={handleSaveTimeRules} className="space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[#696969] font-medium mb-1">Standard Start Time</label>
                <input
                  type="time"
                  disabled={!isMasterAdmin}
                  value={timeRules.standardStartTime}
                  onChange={(e) => setTimeRules({ ...timeRules, standardStartTime: e.target.value })}
                  className="w-full px-3 py-2 border border-[#456B5A]/30 rounded-lg text-[#014025] font-mono focus:outline-none focus:ring-1 focus:ring-[#456B5A] disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-[#696969] font-medium mb-1">Standard End Time</label>
                <input
                  type="time"
                  disabled={!isMasterAdmin}
                  value={timeRules.standardEndTime}
                  onChange={(e) => setTimeRules({ ...timeRules, standardEndTime: e.target.value })}
                  className="w-full px-3 py-2 border border-[#456B5A]/30 rounded-lg text-[#014025] font-mono focus:outline-none focus:ring-1 focus:ring-[#456B5A] disabled:bg-slate-50"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[#696969] font-medium mb-1">Standard Hours</label>
                <input
                  type="number"
                  disabled={!isMasterAdmin}
                  value={timeRules.standardHours}
                  onChange={(e) => setTimeRules({ ...timeRules, standardHours: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-[#456B5A]/30 rounded-lg text-[#014025] font-mono focus:outline-none focus:ring-1 focus:ring-[#456B5A] disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-[#696969] font-medium mb-1">Break (Mins)</label>
                <input
                  type="number"
                  disabled={!isMasterAdmin}
                  value={timeRules.unpaidBreakMinutes}
                  onChange={(e) => setTimeRules({ ...timeRules, unpaidBreakMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-[#456B5A]/30 rounded-lg text-[#014025] font-mono focus:outline-none focus:ring-1 focus:ring-[#456B5A] disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-[#696969] font-medium mb-1">Grace (Mins)</label>
                <input
                  type="number"
                  disabled={!isMasterAdmin}
                  value={timeRules.graceMinutes}
                  onChange={(e) => setTimeRules({ ...timeRules, graceMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-[#456B5A]/30 rounded-lg text-[#014025] font-mono focus:outline-none focus:ring-1 focus:ring-[#456B5A] disabled:bg-slate-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-[#696969] font-medium mb-1">Overtime Standard Rate (₹ / Hour)</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-[#696969] font-semibold">₹</span>
                <input
                  type="number"
                  disabled={!isMasterAdmin}
                  value={timeRules.overtimeRatePerHour}
                  onChange={(e) => setTimeRules({ ...timeRules, overtimeRatePerHour: Number(e.target.value) })}
                  className="w-full pl-7 pr-3 py-2 border border-[#456B5A]/30 rounded-lg text-[#014025] font-mono font-semibold focus:outline-none focus:ring-1 focus:ring-[#456B5A] disabled:bg-slate-50"
                />
              </div>
            </div>

            {isMasterAdmin && (
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-[#014025] hover:bg-[#014025]/90 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Time Rules</span>
                </button>
              </div>
            )}
          </form>
        </div>

        {/* 3. Petty Cash Opening Balances */}
        <div className="bg-white rounded-xl border border-[#456B5A]/20 shadow-xs p-5 space-y-4">
          <div className="flex items-center space-x-2.5 border-b border-[#456B5A]/15 pb-3">
            <div className="p-2 bg-[#456B5A]/10 rounded-lg text-[#3B5E4F]">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#014025]">Petty Cash Opening Balances</h2>
              <p className="text-[11px] text-[#696969]">Excel software benchmark initial opening amounts</p>
            </div>
          </div>

          <form onSubmit={handleSavePettyCash} className="space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[#696969] font-medium mb-1">Opening Cash In Account</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-[#696969] font-semibold">₹</span>
                  <input
                    type="number"
                    disabled={!isMasterAdmin}
                    value={pettyCashOpening.openingInAccount}
                    onChange={(e) => setPettyCashOpening({ ...pettyCashOpening, openingInAccount: Number(e.target.value) })}
                    className="w-full pl-7 pr-3 py-2 border border-[#456B5A]/30 rounded-lg text-[#014025] font-mono font-semibold focus:outline-none focus:ring-1 focus:ring-[#456B5A] disabled:bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#696969] font-medium mb-1">Opening Cash In Hand</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-[#696969] font-semibold">₹</span>
                  <input
                    type="number"
                    disabled={!isMasterAdmin}
                    value={pettyCashOpening.openingInHand}
                    onChange={(e) => setPettyCashOpening({ ...pettyCashOpening, openingInHand: Number(e.target.value) })}
                    className="w-full pl-7 pr-3 py-2 border border-[#456B5A]/30 rounded-lg text-[#014025] font-mono font-semibold focus:outline-none focus:ring-1 focus:ring-[#456B5A] disabled:bg-slate-50"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[#696969] font-medium mb-1">Effective Opening Date</label>
              <input
                type="date"
                disabled={!isMasterAdmin}
                value={pettyCashOpening.asOfDate}
                onChange={(e) => setPettyCashOpening({ ...pettyCashOpening, asOfDate: e.target.value })}
                className="w-full px-3 py-2 border border-[#456B5A]/30 rounded-lg text-[#014025] font-mono focus:outline-none focus:ring-1 focus:ring-[#456B5A] disabled:bg-slate-50"
              />
            </div>

            {isMasterAdmin && (
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-[#014025] hover:bg-[#014025]/90 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Opening Balances</span>
                </button>
              </div>
            )}
          </form>
        </div>

        {/* 4. System Diagnostics & Storage Health */}
        <div className="bg-white rounded-xl border border-[#456B5A]/20 shadow-xs p-5 space-y-4">
          <div className="flex items-center space-x-2.5 border-b border-[#456B5A]/15 pb-3">
            <div className="p-2 bg-[#456B5A]/10 rounded-lg text-[#3B5E4F]">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#014025]">Database &amp; Engine Health</h2>
              <p className="text-[11px] text-[#696969]">High-concurrency SQLite storage metrics</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-[#696969]">Storage Engine</span>
              <span className="font-mono font-semibold text-[#014025]">SQLite 3 (WAL Mode + FK)</span>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-[#696969]">Server Local Time (Asia/Kolkata)</span>
              <span className="font-mono text-xs text-[#014025]">
                {systemStats?.serverTimeKolkata || 'Active'}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-[#696969]">Active System Users</span>
              <span className="font-mono font-bold text-[#014025]">{systemStats?.activeUsers || 3}</span>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-[#696969]">Configured Reference Teams</span>
              <span className="font-mono font-bold text-[#014025]">{systemStats?.totalTeams || 8}</span>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <span className="text-[11px] text-[#696969]">Immutable Audit Trail</span>
              <a
                href="#audit"
                onClick={(e) => {
                  e.preventDefault();
                  window.location.hash = 'audit';
                }}
                className="text-xs text-[#456B5A] hover:text-[#014025] font-semibold underline"
              >
                View Audit History &rarr;
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}