import React, { useState, useEffect } from 'react';
import {
  Bell,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  Check,
  RefreshCw,
  Info,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatDateDisplay } from '../lib/dateUtils';
import { useAuth } from '../context/AuthContext';

export function NotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.notifications.list();
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch (err: any) {
      setError(err.message || 'Failed to load notifications.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const handleMarkRead = async (id: string) => {
    try {
      await api.notifications.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.warn('Failed to mark read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.notifications.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
    } catch (err) {
      console.warn('Failed to mark all read:', err);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'approval':
        return <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
      case 'rejection':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'modification':
        return <ShieldAlert className="w-5 h-5 text-amber-600" />;
      default:
        return <Info className="w-5 h-5 text-[#456B5A]" />;
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#696969]/20 pb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-[#014025]/10 text-[#014025] flex items-center justify-center relative">
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full text-[10px] font-bold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#014025] tracking-tight">
              In-App Notifications
            </h1>
            <p className="text-xs sm:text-sm text-[#696969] mt-0.5">
              Persistent updates on attendance reviews, approvals, admin modifications, and payment settlements
            </p>
          </div>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-[#456B5A]/30 text-xs font-semibold text-[#014025] hover:bg-[#456B5A]/10 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Mark All as Read</span>
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Listing */}
      {isLoading ? (
        <div className="bg-white p-12 text-center rounded-xl border border-[#696969]/20 text-xs text-[#696969]">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#456B5A] mb-2" />
          Loading notifications...
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-xl border border-[#696969]/20 space-y-2">
          <Bell className="w-10 h-10 text-[#696969]/40 mx-auto" />
          <div className="font-semibold text-sm text-[#014025]">No Notifications</div>
          <div className="text-xs text-[#696969]">You do not have any notification records yet.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => {
                if (!n.is_read) handleMarkRead(n.id);
              }}
              className={`p-4 rounded-xl border transition-all flex items-start justify-between gap-3 cursor-pointer ${
                n.is_read
                  ? 'bg-white border-[#696969]/20 opacity-80 hover:opacity-100'
                  : 'bg-emerald-50/40 border-[#456B5A]/40 shadow-xs'
              }`}
            >
              <div className="flex items-start space-x-3 min-w-0">
                <div className="mt-0.5 shrink-0">{getNotificationIcon(n.type)}</div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-xs sm:text-sm text-[#014025]">{n.title}</span>
                    {!n.is_read && (
                      <span className="w-2 h-2 rounded-full bg-[#014025] shrink-0" title="Unread" />
                    )}
                  </div>
                  <p className="text-xs text-[#696969] mt-1 leading-relaxed">{n.message}</p>
                  <div className="text-[10px] text-[#696969]/70 mt-1.5 flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{formatDateDisplay(n.created_at)}</span>
                  </div>
                </div>
              </div>

              {!n.is_read && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMarkRead(n.id);
                  }}
                  className="p-1.5 text-[#456B5A] hover:bg-[#456B5A]/10 rounded-md shrink-0 text-xs font-semibold"
                  title="Mark as Read"
                >
                  <Check className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
