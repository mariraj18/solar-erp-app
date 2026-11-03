import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

// Official Solar Icons Pack
import { HomeIcon } from '@solar-icons/react/bold/home';
import { WidgetIcon } from '@solar-icons/react/bold/widget';
import { CalendarDateIcon } from '@solar-icons/react/bold/calendar-date';
import { CalendarMarkIcon } from '@solar-icons/react/bold/calendar-mark';
import { CheckCircleIcon } from '@solar-icons/react/bold/check-circle';
import { DocumentTextIcon } from '@solar-icons/react/bold/document-text';
import { MapPointIcon } from '@solar-icons/react/bold/map-point';
import { UsersGroupRoundedIcon } from '@solar-icons/react/bold/users-group-rounded';
import { BuildingsIcon } from '@solar-icons/react/bold/buildings';
import { CardIcon } from '@solar-icons/react/bold/card';
import { WalletIcon } from '@solar-icons/react/bold/wallet';
import { BillListIcon } from '@solar-icons/react/bold/bill-list';
import { UserHandsIcon } from '@solar-icons/react/bold/user-hands';
import { PaperclipIcon } from '@solar-icons/react/bold/paperclip';
import { UserCheckIcon } from '@solar-icons/react/bold/user-check';
import { UserSpeakIcon } from '@solar-icons/react/bold/user-speak';
import { BellIcon } from '@solar-icons/react/bold/bell';
import { HistoryIcon } from '@solar-icons/react/bold/history';
import { SettingsIcon } from '@solar-icons/react/bold/settings';
import { Logout2Icon } from '@solar-icons/react/bold/logout-2';
import { MenuDotsIcon } from '@solar-icons/react/bold/menu-dots';
import { CardReceiveIcon } from '@solar-icons/react/bold/card-receive';
import { CardSendIcon } from '@solar-icons/react/bold/card-send';
import { AltArrowDownIcon } from '@solar-icons/react/bold/alt-arrow-down';
import { AltArrowLeftIcon } from '@solar-icons/react/bold/alt-arrow-left';
import { CloseCircleIcon } from '@solar-icons/react/bold/close-circle';

export type NavTab =
  | 'dashboard'
  | 'attendance'
  | 'gps-attendance'
  | 'labourers'
  | 'worksites'
  | 'my-reports'
  | 'teams'
  | 'weekly-reports'
  | 'monthly-reports'
  | 'approvals'
  | 'payments'
  | 'attachments'
  | 'charges'
  | 'adjustments'
  | 'staff'
  | 'secondary-admins'
  | 'office-accounts'
  | 'petty-cash'
  | 'notifications'
  | 'audit'
  | 'settings';

interface SidebarProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  /** Optional: notify parent layout so main content can animate or adjust. */
  onCollapsedChange?: (collapsed: boolean) => void;
}

interface NavItemDef {
  id: NavTab;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  adminOnly?: boolean;
  masterAdminOnly?: boolean;
  staffOnly?: boolean;
}

interface NavCategory {
  id: string;
  name: string;
  items: NavItemDef[];
}

export function Sidebar({ currentTab, onTabChange, onCollapsedChange }: SidebarProps) {
  const { user, logout, isMasterAdmin, isSecondaryAdmin, isAdminAny, isStaff } = useAuth();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      onCollapsedChange?.(next);
      return next;
    });
  };

  /* ---------------- Counter polling ---------------- */
  useEffect(() => {
    let isMounted = true;
    const fetchCounters = async () => {
      try {
        const notifRes = await api.notifications.list();
        if (isMounted) setUnreadNotifs(notifRes.unreadCount || 0);

        if (isAdminAny) {
          if (isMasterAdmin) {
            const geofences = await api.geofenceRequests
              .list({ status: 'pending' })
              .catch(() => []);
            if (isMounted && Array.isArray(geofences)) {
              setPendingApprovals(geofences.length);
            }
          } else {
            const queue = await api.attendance.getQueue().catch(() => []);
            if (isMounted && Array.isArray(queue)) {
              setPendingApprovals(queue.length);
            }
          }
        }
      } catch {}
    };
    fetchCounters();
    const interval = setInterval(fetchCounters, 25000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isAdminAny, isMasterAdmin]);

  /* ---------------- Category toggle ---------------- */
  const toggleCategory = (catId: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  /* ---------------- Navigation data (Official Solar Icons) ---------------- */
  const navCategories: NavCategory[] = [
    {
      id: 'overview',
      name: 'Overview',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: <WidgetIcon size={18} /> },
        { id: 'my-reports', label: 'My Workspace', icon: <DocumentTextIcon size={18} /> },
      ],
    },
    {
      id: 'operations',
      name: 'Operations',
      items: [
        { id: 'attendance', label: 'Daily Attendance', icon: <CalendarDateIcon size={18} /> },
        {
          id: 'approvals',
          label: 'Approval Queue',
          icon: <CheckCircleIcon size={18} />,
          badge: pendingApprovals,
          adminOnly: true,
        },
        { id: 'weekly-reports', label: 'Weekly Reports', icon: <DocumentTextIcon size={18} /> },
        { id: 'monthly-reports', label: 'Monthly Reports', icon: <CalendarMarkIcon size={18} /> },
      ],
    },
    {
      id: 'gps-geofence',
      name: 'GPS & Field Attendance',
      items: [
        { id: 'gps-attendance', label: 'GPS Attendance Queue', icon: <MapPointIcon size={18} /> },
        { id: 'labourers', label: 'Labourer Accounts', icon: <UsersGroupRoundedIcon size={18} /> },
        { id: 'worksites', label: 'Worksites & Geofences', icon: <BuildingsIcon size={18} /> },
      ],
    },
    {
      id: 'financials',
      name: 'Financials & Accounts',
      items: [
        { id: 'payments', label: 'Payment Tracker', icon: <CardIcon size={18} /> },
        {
          id: 'petty-cash',
          label: 'Petty Cash Ledger',
          icon: <WalletIcon size={18} />,
          adminOnly: true,
        },
        {
          id: 'office-accounts',
          label: 'Office Accounts Ledger',
          icon: <BillListIcon size={18} />,
          adminOnly: true,
        },
      ],
    },
    {
      id: 'admin',
      name: 'Administration',
      items: [
        { id: 'teams', label: 'Teams & Templates', icon: <UserHandsIcon size={18} /> },
        { id: 'charges', label: 'Additional Charges', icon: <CardReceiveIcon size={18} /> },
        { id: 'adjustments', label: 'Advances & Deductions', icon: <CardSendIcon size={18} /> },
        { id: 'attachments', label: 'Document Vault', icon: <PaperclipIcon size={18} /> },
      ],
    },
    {
      id: 'system',
      name: 'System & Security',
      items: [
        {
          id: 'staff',
          label: 'Staff Management',
          icon: <UserCheckIcon size={18} />,
          adminOnly: true,
        },
        {
          id: 'secondary-admins',
          label: 'Manager Scopes',
          icon: <UserSpeakIcon size={18} />,
          masterAdminOnly: true,
        },
        {
          id: 'notifications',
          label: 'Notifications',
          icon: <BellIcon size={18} />,
          badge: unreadNotifs,
        },
        { id: 'audit', label: 'Audit History', icon: <HistoryIcon size={18} />, adminOnly: true },
        { id: 'settings', label: 'Settings', icon: <SettingsIcon size={18} />, adminOnly: true },
      ],
    },
  ];

  const handleSelectTab = (tab: NavTab) => {
    onTabChange(tab);
    setMobileMenuOpen(false);
  };

  /* ---------------- Logo Spin on Pointer Enter (from PillNav) ---------------- */
  const markRef = useRef<HTMLDivElement>(null);
  const spinLogo = (e: React.PointerEvent) => {
    const mark = markRef.current;
    if (!mark || e.pointerType === 'touch' || mark.getAnimations().length) return;
    mark.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
      duration: 900,
      easing: 'cubic-bezier(0.65, 0, 0.25, 1)'
    });
  };

  /* ---------------- Mobile Bottom Nav Items (fixed 5, Solar Icons) ---------------- */
  interface MobileNavItem {
    id: NavTab | 'more_menu';
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }
  const mobileNavItems: MobileNavItem[] = [
    { id: 'dashboard',      label: 'Home',       icon: <HomeIcon size={24} /> },
    { id: 'attendance',     label: 'Attendance', icon: <CalendarDateIcon size={24} /> },
    { id: 'gps-attendance', label: 'GPS',        icon: <MapPointIcon size={24} /> },
    { id: 'payments',       label: 'Payments',   icon: <CardIcon size={24} /> },
    {
      id: 'more_menu',
      label: 'More',
      icon: <MenuDotsIcon size={24} />,
      badge: pendingApprovals > 0 ? pendingApprovals : undefined,
    },
  ];

  return (
    <>
      {/* 1. Desktop & Tablet Sidebar */}
      <aside
        className={`hidden md:flex flex-col h-screen sticky top-0 bg-[#456B5A] border-r border-[#355346] text-white/90 shrink-0 select-none z-30 transition-[width] duration-300 ease-in-out overflow-hidden ${
          isCollapsed ? 'w-[76px]' : 'w-64'
        }`}
      >
        {/* Brand Header */}
        <div className="p-3.5 border-b border-[#355346] flex items-center justify-between relative min-h-[57px]">
          {/* Expanded brand */}
          {!isCollapsed ? (
            <div className="flex items-center space-x-2.5 overflow-hidden">
              <div
                ref={markRef}
                onPointerEnter={spinLogo}
                className="w-8.5 h-8.5 rounded-xl bg-white p-1 border border-emerald-400/25 shadow-2xs flex items-center justify-center shrink-0 cursor-pointer"
                title="Solar Designs (Hover to spin)"
              >
                <img
                  src="/assets/aistudio/solar_designs_clean_logo_bf464b07.png"
                  alt="Logo"
                  className="w-full h-full object-contain pointer-events-none"
                />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-xs text-white tracking-tight leading-tight truncate">
                  Solar Designs Pvt Ltd
                </div>
              </div>
            </div>
          ) : (
            /* Collapsed brand (icon only) */
            <div
              ref={markRef}
              onPointerEnter={spinLogo}
              className="w-8.5 h-8.5 rounded-xl bg-white p-1 border border-emerald-400/25 shadow-2xs flex items-center justify-center mx-auto cursor-pointer"
              title="Solar Designs (Hover to spin)"
            >
              <img
                src="/assets/aistudio/solar_designs_clean_logo_bf464b07.png"
                alt="Logo"
                className="w-full h-full object-contain pointer-events-none"
              />
            </div>
          )}

          {/* Toggle button — chevron rotates 180° */}
          <button
            onClick={toggleCollapse}
            className={`p-1.5 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer ${
              isCollapsed ? 'absolute bottom-1 right-1' : ''
            }`}
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!isCollapsed}
          >
            <span className={`inline-block transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`}>
              <AltArrowLeftIcon size={18} />
            </span>
          </button>
        </div>

        {/* User Card (expanded only) */}
        {user && !isCollapsed && (
          <div className="mx-3 my-2 rounded-xl bg-black/15 border border-white/10 flex items-center px-3 py-2.5 transition-all">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-[#014025] border border-white/20 flex items-center justify-center text-white shrink-0 font-bold text-xs shadow-2xs">
                {user.fullName?.charAt(0) || 'U'}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white truncate">{user.fullName}</div>
                <div className="text-[10px] text-emerald-100/80 flex items-center space-x-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-300" />
                  <span className="capitalize truncate">
                    {user.role === 'master_admin'
                      ? 'Master Admin'
                      : user.role === 'secondary_admin'
                      ? 'Operations Manager'
                      : 'Staff Workspace'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Categorized Navigation List */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-2 space-y-3 no-scrollbar relative">
          {navCategories.map((category) => {
            const visibleItems = category.items.filter((item) => {
              if (item.masterAdminOnly && !isMasterAdmin) return false;
              if (item.adminOnly && !isAdminAny) return false;
              if (item.staffOnly && !isStaff) return false;
              return true;
            });

            if (visibleItems.length === 0) return null;
            const isCatCollapsed = Boolean(collapsedCategories[category.id]);

            return (
              <div key={category.id} className="space-y-1">
                {/* Category Header */}
                {!isCollapsed && (
                  <button
                    onClick={() => toggleCategory(category.id)}
                    className="w-full flex items-center justify-between px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider text-white/70 hover:text-white transition-colors cursor-pointer"
                  >
                    <span>{category.name}</span>
                    <span
                      className={`inline-block transition-transform duration-200 ${
                        isCatCollapsed ? '-rotate-90' : 'rotate-0'
                      }`}
                    >
                      <AltArrowDownIcon size={14} />
                    </span>
                  </button>
                )}

                {/* Category Items */}
                <div className={isCollapsed || !isCatCollapsed ? 'space-y-0.5' : 'space-y-0.5 hidden'}>
                  {visibleItems.map((item) => {
                    const isActive = currentTab === item.id;
                    return (
                      <div key={item.id} className="relative group">
                        <button
                          onClick={() => handleSelectTab(item.id)}
                          aria-current={isActive ? 'page' : undefined}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer relative z-10 ${
                            isActive
                              ? 'text-white font-semibold'
                              : 'text-white/85 hover:text-white hover:bg-white/10'
                          } ${isCollapsed ? 'justify-center' : ''}`}
                        >
                          {/* Gliding Spring Active Pill (matching PillNav bounce & physics) */}
                          {isActive && (
                            <motion.div
                              layoutId="sidebarActivePill"
                              transition={{
                                type: 'spring',
                                stiffness: 380,
                                damping: 28,
                                bounce: 0.3,
                              }}
                              className="absolute inset-0 rounded-lg bg-[#014025] ring-1 ring-white/15 shadow-sm z-0"
                            />
                          )}

                          <div className="flex items-center space-x-2.5 min-w-0 relative z-10">
                            <span className={isActive ? 'text-white' : 'text-emerald-100'}>
                              {item.icon}
                            </span>
                            {!isCollapsed && (
                              <span className="truncate whitespace-nowrap">
                                {item.label}
                              </span>
                            )}
                          </div>

                          {!isCollapsed && item.badge && item.badge > 0 ? (
                            <span className="px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-bold relative z-10">
                              {item.badge}
                            </span>
                          ) : null}

                          {/* Signature active dot indicator */}
                          {isActive && !isCollapsed && (
                            <motion.span
                              layoutId="sidebarActiveDot"
                              transition={{
                                type: 'spring',
                                stiffness: 450,
                                damping: 30,
                              }}
                              className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 relative z-10 ml-1.5"
                            />
                          )}

                          {isCollapsed && item.badge && item.badge > 0 && (
                            <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full z-10" />
                          )}
                        </button>

                        {/* Tooltip (collapsed only) */}
                        {isCollapsed && (
                          <div
                            role="tooltip"
                            className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 rounded-md bg-[#014025] text-white text-[11px] font-medium whitespace-nowrap opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 shadow-lg ring-1 ring-white/10 z-50"
                          >
                            {item.label}
                            {item.badge && item.badge > 0 ? (
                              <span className="ml-1.5 px-1.5 py-0.2 bg-amber-500 rounded-full text-[9px] font-bold">
                                {item.badge}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer Logout */}
        <div className="p-3 border-t border-[#355346]">
          <button
            onClick={logout}
            className={`w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-white/75 hover:text-white hover:bg-white/10 transition-colors cursor-pointer ${
              isCollapsed ? 'justify-center' : ''
            }`}
            title="Sign Out"
          >
            <Logout2Icon size={16} className="shrink-0" />
            {!isCollapsed && <span className="whitespace-nowrap">Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* 3. Mobile Full-Screen Menu (More drawer → full window) */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            className="md:hidden fixed inset-0 z-50 flex flex-col bg-[#1C3829] overflow-hidden"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-12 pb-4 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-white p-1 border border-emerald-400/25 shadow-sm flex items-center justify-center shrink-0">
                  <img
                    src="/assets/aistudio/solar_designs_clean_logo_bf464b07.png"
                    alt="Logo"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <div className="font-bold text-sm text-white leading-tight">Solar Designs Pvt Ltd</div>
                  <div className="text-[11px] text-emerald-300/80">Full Menu</div>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:text-white active:scale-95 transition-all"
                aria-label="Close menu"
              >
                <CloseCircleIcon size={20} />
              </button>
            </div>

            {/* User card */}
            {user && (
              <div className="mx-5 mb-4 rounded-2xl bg-white/8 border border-white/10 flex items-center px-4 py-3 gap-3 shrink-0">
                <div className="w-10 h-10 rounded-full bg-[#014025] border border-white/20 flex items-center justify-center text-white shrink-0 font-bold text-sm shadow-sm">
                  {user.fullName?.charAt(0) || 'U'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white truncate">{user.fullName}</div>
                  <div className="text-[11px] text-emerald-300/80 flex items-center gap-1.5 mt-0.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="capitalize">
                      {user.role === 'master_admin'
                        ? 'Master Admin'
                        : user.role === 'secondary_admin'
                        ? 'Operations Manager'
                        : 'Staff Workspace'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-900/40 text-red-300 border border-red-700/40 text-xs font-semibold shrink-0"
                >
                  <Logout2Icon size={14} />
                  Sign Out
                </button>
              </div>
            )}

            {/* Scrollable nav categories */}
            <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-5 no-scrollbar">
              {navCategories.map((cat) => {
                const visible = cat.items.filter((item) => {
                  if (item.masterAdminOnly && !isMasterAdmin) return false;
                  if (item.adminOnly && !isAdminAny) return false;
                  if (item.staffOnly && !isStaff) return false;
                  return true;
                });
                if (visible.length === 0) return null;

                return (
                  <div key={cat.id} className="space-y-2">
                    {/* Category label */}
                    <div className="text-[10px] font-bold uppercase tracking-widest text-white/40 px-1">
                      {cat.name}
                    </div>

                    {/* Items grid */}
                    <div className="grid grid-cols-3 gap-2.5">
                      {visible.map((item) => {
                        const isActive = currentTab === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => handleSelectTab(item.id)}
                            className={`relative flex flex-col items-center justify-center gap-1.5 rounded-2xl py-4 px-2 text-center transition-all active:scale-95 ${
                              isActive
                                ? 'bg-[#3dba6b] shadow-lg shadow-emerald-900/40'
                                : 'bg-white/8 border border-white/10 hover:bg-white/15'
                            }`}
                          >
                            {/* Badge */}
                            {item.badge && item.badge > 0 && (
                              <span className="absolute top-2 right-2 min-w-[18px] h-[18px] px-1 bg-amber-400 text-black rounded-full text-[9px] font-bold flex items-center justify-center">
                                {item.badge}
                              </span>
                            )}
                            <span className={isActive ? 'text-white' : 'text-emerald-200/80'}>
                              {item.icon}
                            </span>
                            <span className={`text-[11px] font-medium leading-tight ${isActive ? 'text-white font-semibold' : 'text-white/75'}`}>
                              {item.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Mobile Bottom Nav — Dark Pill Bar with Raised Bubble Active State */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 px-3 pb-safe-or-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <div className="bg-[#1C3829] rounded-[28px] px-1 pt-1 pb-2 flex items-end justify-around shadow-2xl">
          {mobileNavItems.map((item) => {
            const isActive = currentTab === item.id || (item.id === 'more_menu' && mobileMenuOpen);
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'more_menu') {
                    setMobileMenuOpen(true);
                  } else {
                    handleSelectTab(item.id as NavTab);
                  }
                }}
                className="flex flex-col items-center justify-end flex-1 min-w-0 relative focus:outline-none"
                aria-label={item.label}
              >
                {/* Raised bubble (active) or plain icon (inactive) */}
                <div className="relative flex flex-col items-center">
                  <motion.div
                    layoutId={`mobileNavBubble-${item.id}`}
                    animate={
                      isActive
                        ? { y: -14, scale: 1 }
                        : { y: 0, scale: 1 }
                    }
                    transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                    className={`flex items-center justify-center rounded-full ${
                      isActive
                        ? 'bg-[#3dba6b] w-12 h-12 shadow-lg shadow-emerald-900/60'
                        : 'w-10 h-10'
                    }`}
                  >
                    {/* Badge dot */}
                    {item.badge && item.badge > 0 && !isActive && (
                      <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-amber-400 rounded-full border-2 border-[#1C3829] z-10" />
                    )}
                    <span className={isActive ? 'text-white' : 'text-white/55'}>
                      {item.icon}
                    </span>
                  </motion.div>
                </div>

                {/* Label */}
                <span
                  className={`text-[10px] mt-0.5 leading-none font-medium transition-colors duration-200 ${
                    isActive ? 'text-white font-semibold' : 'text-white/50'
                  }`}
                >
                  {item.label}
                </span>

                {/* Active underline dot */}
                {isActive && (
                  <motion.span
                    layoutId="mobileNavDot"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    className="mt-1 w-1 h-1 rounded-full bg-[#3dba6b]"
                  />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}

export default Sidebar;