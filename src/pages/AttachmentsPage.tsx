import React, { useState, useEffect } from 'react';
import {
  Paperclip,
  Upload,
  Download,
  Trash2,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  Building,
  User,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatDateDisplay, getTodayKolkataISO } from '../lib/dateUtils';
import { useAuth } from '../context/AuthContext';
import { CustomSelect } from '../components/CustomSelect';

export function AttachmentsPage() {
  const { user, isMasterAdmin, isSecondaryAdmin } = useAuth();
  const [attachments, setAttachments] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Upload Modal State
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [recordType, setRecordType] = useState('general');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [docDate, setDocDate] = useState(getTodayKolkataISO());
  const [isUploading, setIsUploading] = useState(false);

  const loadAttachments = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [attList, tList] = await Promise.all([
        api.attachments.list({ recordType: typeFilter || undefined, teamId: teamFilter || undefined }),
        api.teams.list(),
      ]);
      setAttachments(attList);
      setTeams(tList);
    } catch (err: any) {
      setError(err.message || 'Failed to load attachments.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAttachments();
  }, [typeFilter, teamFilter]);

  const handleUploadSubmit = async () => {
    if (!selectedFile) {
      alert('Please choose a file to upload.');
      return;
    }

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        await api.attachments.upload({
          recordType,
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          mimeType: selectedFile.type,
          fileDataBase64: base64,
          description: description.trim() || undefined,
          teamId: selectedTeamId || undefined,
          date: docDate || undefined,
        });

        setUploadModalOpen(false);
        setSelectedFile(null);
        setDescription('');
        await loadAttachments();
      };
      reader.readAsDataURL(selectedFile);
    } catch (err: any) {
      alert(err.message || 'Failed to upload document.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this attachment?')) return;
    try {
      await api.attachments.delete(id);
      await loadAttachments();
    } catch (err: any) {
      alert(err.message || 'Failed to delete attachment.');
    }
  };

  const getFileIcon = (mime: string, name: string) => {
    const n = name.toLowerCase();
    if (n.endsWith('.pdf')) return <FileText className="w-5 h-5 text-red-500" />;
    if (n.endsWith('.xlsx') || n.endsWith('.xls')) return <FileSpreadsheet className="w-5 h-5 text-emerald-600" />;
    if (n.endsWith('.jpg') || n.endsWith('.jpeg') || n.endsWith('.png')) return <ImageIcon className="w-5 h-5 text-blue-500" />;
    return <Paperclip className="w-5 h-5 text-[#456B5A]" />;
  };

  const filtered = attachments.filter((a) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      a.file_name?.toLowerCase().includes(term) ||
      a.description?.toLowerCase().includes(term) ||
      a.uploaded_by_name?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#696969]/20 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#014025] tracking-tight">
            Document &amp; Attachments Library
          </h1>
          <p className="text-xs sm:text-sm text-[#696969] mt-0.5">
            Organized repository of attendance timesheets, payment vouchers, chits, and contractor bills
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setUploadModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#014025] hover:bg-[#014025]/85 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Document</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="w-48">
            <CustomSelect
              value={typeFilter}
              onChange={(val) => setTypeFilter(String(val))}
              options={[
                { value: '', label: 'All Document Types' },
                { value: 'attendance', label: 'Daily Attendance' },
                { value: 'weekly_payment', label: 'Payment Vouchers' },
                { value: 'charge', label: 'Additional Charges' },
                { value: 'bill', label: 'Supplier Bills' },
                { value: 'general', label: 'General Documents' },
              ]}
              placeholder="All Types"
              size="sm"
              leadingIcon={<Filter className="w-3.5 h-3.5" />}
            />
          </div>

          <div className="w-48">
            <CustomSelect
              value={teamFilter}
              onChange={(val) => setTeamFilter(String(val))}
              options={[
                { value: '', label: 'All Teams' },
                ...teams.map((t) => ({ value: t.id, label: t.name })),
              ]}
              placeholder="All Teams"
              size="sm"
              leadingIcon={<Building className="w-3.5 h-3.5" />}
            />
          </div>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-[#696969] absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Search documents or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#696969]/30 rounded-lg text-[#014025] focus:outline-none focus:ring-1 focus:ring-[#456B5A]"
          />
        </div>
      </div>

      {/* Attachments Grid / Table */}
      <div className="bg-white rounded-xl border border-[#696969]/20 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#696969]/10 text-[#014025] font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Document</th>
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-3">Category / Record</th>
                <th className="py-2.5 px-3">Uploaded By</th>
                <th className="py-2.5 px-3">Upload Date</th>
                <th className="py-2.5 px-3 text-right">Size</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#696969]/15">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-[#696969]">
                    No document attachments found matching the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((att) => (
                  <tr key={att.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center space-x-2">
                        {getFileIcon(att.mime_type, att.file_name)}
                        <span className="font-semibold text-[#014025] max-w-xs truncate">{att.file_name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-[#696969] max-w-xs truncate">{att.description || '--'}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#456B5A]/15 text-[#014025] capitalize">
                        {att.record_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[#696969]">{att.uploaded_by_name}</td>
                    <td className="py-2.5 px-3 text-[#696969]">{formatDateDisplay(att.created_at)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-[#696969]">
                      {Math.round((att.file_size || 0) / 1024)} KB
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <a
                          href={api.attachments.downloadUrl(att.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-[#456B5A] hover:text-[#014025] hover:bg-[#456B5A]/10 rounded"
                          title="Download Document"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        {(isMasterAdmin || att.owner_user_id === user?.id) && (
                          <button
                            onClick={() => handleDelete(att.id)}
                            className="p-1.5 text-[#696969] hover:text-red-500 hover:bg-red-50 rounded"
                            title="Delete Document"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upload Modal */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-[#696969]/20 w-full max-w-md overflow-hidden">
            <div className="px-5 py-3.5 bg-[#014025] text-white font-bold text-sm flex items-center justify-between">
              <span>Upload Document / Receipt</span>
              <button onClick={() => setUploadModalOpen(false)} className="text-white/70 hover:text-white">
                ✕
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div>
                <label className="block text-xs font-semibold text-[#014025] mb-1">
                  Choose File (PDF, JPG, PNG, XLSX) <span className="text-red-500">*</span>
                </label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.xlsx"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setSelectedFile(e.target.files[0]);
                    }
                  }}
                  className="w-full border border-[#696969]/30 rounded p-1.5 text-xs text-[#014025] bg-white"
                />
              </div>

              <div>
                <CustomSelect
                  label="Document Category"
                  value={recordType}
                  onChange={(val) => setRecordType(String(val))}
                  options={[
                    { value: 'attendance', label: 'Daily Attendance Timesheet / Chit' },
                    { value: 'weekly_payment', label: 'Weekly Payment Voucher' },
                    { value: 'charge', label: 'Extra Charge Bill' },
                    { value: 'bill', label: 'Contractor / Material Bill' },
                    { value: 'general', label: 'General Documentation' },
                  ]}
                />
              </div>

              <div>
                <CustomSelect
                  label="Related Team (Optional)"
                  value={selectedTeamId}
                  onChange={(val) => setSelectedTeamId(String(val))}
                  options={[
                    { value: '', label: '-- No Specific Team --' },
                    ...teams.map((t) => ({ value: t.id, label: t.name })),
                  ]}
                  placeholder="No Specific Team"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#014025] mb-1">Description / Memo</label>
                <input
                  type="text"
                  placeholder="e.g. Scanned physical muster roll signed by site engineer"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full border border-[#696969]/30 rounded p-1.5 text-xs text-[#014025]"
                />
              </div>
            </div>

            <div className="px-5 py-3 bg-[#696969]/5 border-t border-[#696969]/15 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                className="px-3 py-1.5 text-xs border border-[#696969]/30 rounded-md text-[#696969] hover:bg-[#696969]/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUploadSubmit}
                disabled={isUploading || !selectedFile}
                className="px-4 py-1.5 bg-[#014025] hover:bg-[#014025]/85 text-white rounded-md text-xs font-semibold shadow-xs disabled:opacity-50"
              >
                {isUploading ? 'Uploading...' : 'Save Document'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
