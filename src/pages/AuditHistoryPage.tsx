import React, { useState, useEffect } from 'react';
import { History, Search, ShieldCheck, UserCheck, AlertCircle, Filter } from 'lucide-react';
import { api } from '../lib/api';
import { formatDateDisplay } from '../lib/dateUtils';
import { CustomSelect } from '../components/CustomSelect';

export function AuditHistoryPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('');

  useEffect(() => {
    loadLogs();
  }, [entityFilter]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await api.audit.list({
        entityType: entityFilter || undefined,
        limit: 150,
      });
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      (log.actor_name || '').toLowerCase().includes(term) ||
      (log.action || '').toLowerCase().includes(term) ||
      (log.reason || '').toLowerCase().includes(term) ||
      (log.entity_id || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300 animate-slide-in">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-[#456B5A]/10 flex items-center justify-center">
              <History className="w-4 h-4 text-[#456B5A]" />
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-[#014025] tracking-tight">
              System Audit History &amp; Override Trail
            </h1>
          </div>
          <p className="text-xs text-[#696969] mt-1.5 ml-10">
            Immutable log of all financial modifications, staff rate overrides, and operational merges
          </p>
        </div>

        <div className="w-56">
          <CustomSelect
            value={entityFilter}
            onChange={(val) => setEntityFilter(String(val))}
            options={[
              { value: '', label: 'All Entities' },
              { value: 'attendance_entries', label: 'Attendance Entries', badge: 'Attendance' },
              { value: 'additional_charges', label: 'Additional Charges', badge: 'Charges' },
              { value: 'financial_adjustments', label: 'Financial Adjustments', badge: 'Adjustments' },
              { value: 'teams', label: 'Teams & Rates', badge: 'Teams' },
              { value: 'users', label: 'User Accounts', badge: 'Users' },
            ]}
            placeholder="All Entities"
            size="sm"
            leadingIcon={<Filter className="w-3.5 h-3.5" />}
          />
        </div>
      </div>

      {/* Search */}
      <div className="max-w-md animate-slide-in" style={{ animationDelay: '0.1s' }}>
        <div className="relative group">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5 pointer-events-none transition-colors duration-200 group-focus-within:text-[#456B5A]" />
          <input
            type="text"
            placeholder="Search by actor, action, reason, record ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50/50 text-gray-800 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#456B5A]/20 focus:border-[#456B5A] focus:bg-white hover:border-gray-300"
          />
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300 animate-slide-in" style={{ animationDelay: '0.2s' }}>
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center space-y-3">
            <div className="w-8 h-8 border-2 border-[#456B5A]/20 border-t-[#456B5A] rounded-full animate-spin" />
            <p className="text-xs text-[#696969]">Loading audit history...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#456B5A]/10 mb-3">
              <History className="w-6 h-6 text-[#456B5A]" />
            </div>
            <p className="text-sm font-semibold text-[#014025]">No audit events found</p>
            <p className="text-xs text-[#696969] mt-1">
              {search || entityFilter
                ? 'Try adjusting your search or filter criteria.'
                : 'Audit events will appear here as actions are performed.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#456B5A]/5 text-[#014025] font-bold border-b border-gray-100">
                  <th className="py-3 px-3 font-semibold">Timestamp</th>
                  <th className="py-3 px-3 font-semibold">Actor</th>
                  <th className="py-3 px-3 font-semibold">Action</th>
                  <th className="py-3 px-3 font-semibold">Entity</th>
                  <th className="py-3 px-3 font-semibold">Details &amp; Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 font-mono text-[11px] sm:text-xs">
                {filteredLogs.map((log, idx) => {
                  let prevObj = null;
                  let newObj = null;
                  try {
                    if (log.previous_values_json) prevObj = JSON.parse(log.previous_values_json);
                    if (log.new_values_json) newObj = JSON.parse(log.new_values_json);
                  } catch {}

                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-[#456B5A]/5 transition-colors duration-150 animate-row-in"
                      style={{ animationDelay: `${idx * 0.02}s` }}
                    >
                      <td className="py-3 px-3 text-[#696969] whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('en-IN')}
                      </td>

                      <td className="py-3 px-3 font-sans">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-semibold text-[#014025]">{log.actor_name}</span>
                          <span
                            className={`inline-flex items-center space-x-0.5 text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-md ${
                              log.actor_role === 'admin'
                                ? 'bg-[#014025]/10 text-[#014025]'
                                : 'bg-[#456B5A]/10 text-[#456B5A]'
                            }`}
                          >
                            {log.actor_role === 'admin' ? (
                              <ShieldCheck className="w-2.5 h-2.5" />
                            ) : (
                              <UserCheck className="w-2.5 h-2.5" />
                            )}
                            <span>{log.actor_role}</span>
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-3 font-bold text-[#014025]">
                        <span className="bg-[#456B5A]/10 px-2 py-0.5 rounded-md text-[10px] font-semibold">
                          {log.action}
                        </span>
                      </td>

                      <td className="py-3 px-3 font-sans text-[#696969]">
                        <span className="font-semibold text-[#014025]">{log.entity_type}</span>
                        <span className="block text-[10px] text-gray-400 font-mono mt-0.5">
                          {log.entity_id}
                        </span>
                      </td>

                      <td className="py-3 px-3 font-sans text-gray-800">
                        {log.reason && (
                          <div className="inline-flex items-start space-x-1 text-[#014025] bg-[#456B5A]/8 border border-[#456B5A]/15 px-2 py-1 rounded-md text-[11px] mb-1.5">
                            <AlertCircle className="w-3 h-3 mt-0.5 shrink-0 text-[#456B5A]" />
                            <span>
                              <strong className="font-semibold">Reason:</strong> {log.reason}
                            </span>
                          </div>
                        )}

                        {newObj && (
                          <div className="text-[10px] text-[#696969] font-mono truncate max-w-md bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
                            {JSON.stringify(newObj)}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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