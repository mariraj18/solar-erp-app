import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  Calendar,
  Navigation,
  RefreshCw,
  Info,
  Timer,
  ChevronRight,
  Bell,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

import { MapLocationPicker } from '../components/MapLocationPicker';

const COMPANY_LOGO_URL = '/assets/aistudio/solar_designs_clean_logo_bf464b07.png';

export function LabourerDashboardPage() {
  const { user, logout } = useAuth();
  const [todayRecord, setTodayRecord] = useState<any | null>(null);
  const [activeVerifications, setActiveVerifications] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [worksites, setWorksites] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [assignedWorksite, setAssignedWorksite] = useState<any | null>(null);
  const [assignedTeam, setAssignedTeam] = useState<any | null>(null);
  const [livePosition, setLivePosition] = useState<{ latitude: number; longitude: number } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isLocating, setIsLocating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Verification countdown states
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  // Fetch data
  const fetchData = async () => {
    try {
      const [todayRes, verifRes, histRes, wsRes, tmsRes] = await Promise.all([
        api.gpsAttendance.getToday(),
        api.verifications.getActive(),
        api.gpsAttendance.getMyHistory(),
        api.worksites.list().catch(() => []),
        api.teams.list().catch(() => []),
      ]);

      setTodayRecord(todayRes.todayRecord);
      setActiveVerifications(verifRes || []);
      setHistory(histRes || []);
      setWorksites(wsRes || []);
      setTeams(tmsRes || []);

      let matchedTeam: any = null;
      if (user?.assignedTeamId && Array.isArray(tmsRes)) {
        matchedTeam = tmsRes.find((t: any) => t.id === user.assignedTeamId);
        setAssignedTeam(matchedTeam);
      }

      if (user?.assignedWorksiteId && Array.isArray(wsRes)) {
        const found = wsRes.find((w: any) => w.id === user.assignedWorksiteId);
        if (found) setAssignedWorksite(found);
      } else if (matchedTeam?.assigned_worksite_id && Array.isArray(wsRes)) {
        const found = wsRes.find((w: any) => w.id === matchedTeam.assigned_worksite_id);
        if (found) setAssignedWorksite(found);
      } else if (matchedTeam?.site_latitude) {
        setAssignedWorksite({
          name: matchedTeam.location_project || `${matchedTeam.name} Site`,
          latitude: matchedTeam.site_latitude,
          longitude: matchedTeam.site_longitude,
          allowed_radius_meters: matchedTeam.geofence_radius_meters || 150,
        });
      } else if (wsRes && wsRes.length > 0) {
        setAssignedWorksite(wsRes[0]);
      }
    } catch (err: any) {
      console.error('Failed to load labourer dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 20000); // 20s poll
    return () => clearInterval(interval);
  }, []);

  // Update countdown timer for active verification
  useEffect(() => {
    if (activeVerifications.length === 0) {
      setTimeRemaining('');
      return;
    }

    const timer = setInterval(() => {
      const active = activeVerifications[0];
      const expiry = new Date(active.expires_at).getTime();
      const now = Date.now();
      const diff = Math.max(0, expiry - now);

      if (diff === 0) {
        setTimeRemaining('Expired');
        fetchData();
      } else {
        const minutes = Math.floor(diff / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeRemaining(`${minutes}m ${seconds < 10 ? '0' : ''}${seconds}s`);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [activeVerifications]);

  // Request high-accuracy GPS fix from device
  const getDeviceLocation = (): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser or device.'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        (err) => {
          let msg = 'Failed to obtain GPS location.';
          if (err.code === err.PERMISSION_DENIED) {
            msg = 'Location permission was denied. Please allow location access in your browser settings to record attendance.';
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            msg = 'Location unavailable. Please ensure your device GPS is turned on.';
          } else if (err.code === err.TIMEOUT) {
            msg = 'GPS location timed out. Please try again in an open sky area.';
          }
          reject(new Error(msg));
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    });
  };

  // Perform GPS Check-In
  const handleCheckIn = async () => {
    setIsLocating(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const position = await getDeviceLocation();
      const { latitude, longitude, accuracy } = position.coords;
      setLivePosition({ latitude, longitude });

      const res = await api.gpsAttendance.checkIn({
        latitude,
        longitude,
        accuracy: Math.round(accuracy),
        deviceTimestamp: new Date(position.timestamp).toISOString(),
      });

      setActionSuccess(res.message);
      await fetchData();
    } catch (err: any) {
      setActionError(err.message || 'Check-in failed. Please check GPS connection.');
    } finally {
      setIsLocating(false);
    }
  };

  // Perform GPS Check-Out
  const handleCheckOut = async () => {
    setIsLocating(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const position = await getDeviceLocation();
      const { latitude, longitude, accuracy } = position.coords;
      setLivePosition({ latitude, longitude });

      const res = await api.gpsAttendance.checkOut({
        latitude,
        longitude,
        accuracy: Math.round(accuracy),
        deviceTimestamp: new Date(position.timestamp).toISOString(),
      });

      setActionSuccess(res.message);
      await fetchData();
    } catch (err: any) {
      setActionError(err.message || 'Check-out failed. Please check GPS connection.');
    } finally {
      setIsLocating(false);
    }
  };

  // Respond to 30-min random verification request
  const handleVerifyAttendance = async (verificationId: string) => {
    setIsLocating(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const position = await getDeviceLocation();
      const { latitude, longitude, accuracy } = position.coords;
      setLivePosition({ latitude, longitude });

      const res = await api.verifications.respond(verificationId, {
        latitude,
        longitude,
        accuracy: Math.round(accuracy),
        deviceTimestamp: new Date(position.timestamp).toISOString(),
      });

      setActionSuccess(res.message);
      await fetchData();
    } catch (err: any) {
      setActionError(err.message || 'Verification response failed.');
    } finally {
      setIsLocating(false);
    }
  };

  const isCheckedIn = Boolean(todayRecord && todayRecord.check_in_time && !todayRecord.check_out_time);
  const isCheckedOut = Boolean(todayRecord && todayRecord.check_out_time);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between max-w-md mx-auto shadow-2xl relative">
      {/* Top Mobile Header */}
      <header className="bg-[#0E6037] text-white px-4 py-3.5 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 bg-white/10 rounded-xl p-1 flex items-center justify-center">
            <img src={COMPANY_LOGO_URL} alt="Logo" className="w-full h-full object-contain brightness-0 invert" />
          </div>
          <div>
            <h1 className="text-sm font-bold leading-tight">Worker Portal</h1>
            <p className="text-[11px] text-emerald-200">Solar Designs ERP</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={fetchData}
            title="Refresh status"
            className="p-2 bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-xl text-white transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={logout}
            title="Sign out"
            className="p-2 bg-white/10 hover:bg-red-500/80 active:bg-red-600 rounded-xl text-white transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Scrollable Body */}
      <main className="p-4 space-y-4 flex-1 overflow-y-auto">
        {/* Worker Info Card */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center space-x-1.5 flex-wrap gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#0E6037] bg-emerald-50 px-2 py-0.5 rounded-md">
                  {user?.designation || 'Labourer'}
                </span>
                {assignedTeam && (
                  <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                    Team: {assignedTeam.name}
                  </span>
                )}
              </div>
              <h2 className="text-base font-bold text-slate-900 mt-1">{user?.fullName}</h2>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                Mobile: +91 {user?.mobileNumber || 'N/A'} • Aadhaar: {user?.maskedAadhaar || 'XXXX-XXXX-****'}
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-[#0E6037] flex items-center justify-center font-bold text-sm shrink-0">
              {user?.fullName?.charAt(0) || 'L'}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex flex-col gap-1 text-xs text-slate-600">
            <div className="flex items-center space-x-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#0E6037] shrink-0" />
              <span className="font-semibold text-slate-800">Assigned Site:</span>
              <span className="truncate">{assignedWorksite?.name || assignedTeam?.location_project || 'Lumia Building Site'}</span>
            </div>
            <div className="text-[11px] text-slate-500 pl-5">
              Allowed radius: <strong className="text-slate-700">{assignedWorksite?.allowed_radius_meters || assignedWorksite?.radius_meters || assignedTeam?.geofence_radius_meters || 150}m</strong> from center
            </div>
          </div>
        </div>

        {/* Real Geofence Map Viewer for Worker */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-[#0E6037]">
            <span className="flex items-center space-x-1.5">
              <Navigation className="w-3.5 h-3.5 text-[#0E6037]" />
              <span>Site Geofence Map</span>
            </span>
            <span className="text-[11px] font-normal text-slate-500">
              {assignedWorksite?.allowed_radius_meters || assignedWorksite?.radius_meters || 150}m Boundary
            </span>
          </div>

          <MapLocationPicker
            latitude={assignedWorksite?.latitude || assignedTeam?.site_latitude || 12.9715987}
            longitude={assignedWorksite?.longitude || assignedTeam?.site_longitude || 77.5945627}
            radiusMeters={assignedWorksite?.allowed_radius_meters || assignedWorksite?.radius_meters || assignedTeam?.geofence_radius_meters || 150}
            readOnly={true}
            showControls={false}
            workerPosition={livePosition}
            height="180px"
            label="Site Attendance Area"
          />

          <p className="text-[11px] text-slate-500">
            Clicking <strong>Check In</strong> records your GPS location for <strong>{assignedTeam?.name || 'your assigned team'}</strong>.
          </p>
        </div>

        {/* 30-Minute Random Attendance Verification Banner (If Active) */}
        {activeVerifications.length > 0 && (
          <div className="bg-amber-500 text-white rounded-2xl p-4 shadow-lg animate-pulse-subtle border-2 border-amber-600">
            <div className="flex items-start space-x-2.5">
              <ShieldAlert className="w-6 h-6 text-white shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider">Attendance Verification Requested</h3>
                  <span className="bg-white text-amber-900 font-mono text-xs font-bold px-2 py-0.5 rounded-full shadow-xs">
                    {timeRemaining}
                  </span>
                </div>
                <p className="text-xs text-amber-100 mt-1">
                  Spot verification initiated by site supervisor. Please confirm your physical presence within 30 minutes.
                </p>

                <button
                  type="button"
                  disabled={isLocating}
                  onClick={() => handleVerifyAttendance(activeVerifications[0].id)}
                  className="mt-3 w-full py-2.5 px-4 bg-white text-amber-900 font-bold rounded-xl text-xs shadow-md flex items-center justify-center space-x-2 active:bg-amber-100 cursor-pointer"
                >
                  <Navigation className="w-4 h-4 text-amber-700" />
                  <span>{isLocating ? 'Capturing Fresh GPS Fix...' : 'Verify My Attendance Now'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Alerts & Feedback */}
        {actionSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {actionError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Primary GPS Check-In / Check-Out Action Panel */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm text-center">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Today's Attendance Status
          </div>

          <div className="flex items-center justify-center space-x-2 my-2">
            {isCheckedIn ? (
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-100 text-[#0E6037] font-bold text-xs">
                <span className="w-2 h-2 rounded-full bg-[#0E6037] animate-ping" />
                <span>Currently Checked In</span>
              </span>
            ) : isCheckedOut ? (
              <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-bold text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-600" />
                <span>Completed Shift (Checked Out)</span>
              </span>
            ) : (
              <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-amber-100 text-amber-800 font-bold text-xs">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>Not Checked In Today</span>
              </span>
            )}
          </div>

          {/* Times Breakdown */}
          {todayRecord && (
            <div className="grid grid-cols-2 gap-2 my-3.5 p-2.5 bg-slate-50 rounded-xl text-left text-xs border border-slate-200/60">
              <div>
                <span className="text-slate-400 block text-[10px]">Check In:</span>
                <span className="font-semibold text-slate-800">
                  {todayRecord.check_in_time ? new Date(todayRecord.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                </span>
                <span className="text-[10px] text-slate-500 block">
                  {todayRecord.check_in_distance_meters !== null ? `(${todayRecord.check_in_distance_meters}m away)` : ''}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Check Out:</span>
                <span className="font-semibold text-slate-800">
                  {todayRecord.check_out_time ? new Date(todayRecord.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Pending'}
                </span>
                <span className="text-[10px] text-slate-500 block">
                  {todayRecord.total_working_minutes ? `${(todayRecord.total_working_minutes / 60).toFixed(1)} hrs worked` : ''}
                </span>
              </div>
            </div>
          )}

          {/* Primary Buttons */}
          <div className="space-y-3 mt-4">
            {!isCheckedIn && !isCheckedOut && (
              <button
                type="button"
                disabled={isLocating}
                onClick={handleCheckIn}
                className="w-full py-4 px-6 bg-[#0E6037] hover:bg-[#0B4D2C] active:bg-[#083C22] text-white rounded-2xl text-base font-bold shadow-lg shadow-emerald-950/20 flex items-center justify-center space-x-2 transition-transform duration-150 active:scale-98 cursor-pointer disabled:opacity-50"
              >
                <Navigation className="w-5 h-5" />
                <span>{isLocating ? 'Validating Geofence...' : 'Check In With GPS'}</span>
              </button>
            )}

            {isCheckedIn && (
              <button
                type="button"
                disabled={isLocating}
                onClick={handleCheckOut}
                className="w-full py-4 px-6 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-2xl text-base font-bold shadow-lg shadow-red-950/20 flex items-center justify-center space-x-2 transition-transform duration-150 active:scale-98 cursor-pointer disabled:opacity-50"
              >
                <LogOut className="w-5 h-5" />
                <span>{isLocating ? 'Validating Geofence...' : 'Check Out With GPS'}</span>
              </button>
            )}

            {isCheckedOut && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold">
                Your attendance submission for today has been submitted to your supervisor.
              </div>
            )}
          </div>

          <div className="text-[11px] text-slate-400 mt-3 flex items-center justify-center space-x-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Allowed Worksite Radius: {assignedWorksite?.allowed_radius_meters || 150}m</span>
          </div>
        </div>

        {/* Privacy Notice: STRICT NO CONTINUOUS TRACKING */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs text-slate-600 space-y-1">
          <div className="flex items-center space-x-1.5 font-bold text-slate-800">
            <Info className="w-4 h-4 text-[#0E6037]" />
            <span>Location Privacy Policy</span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-500">
            Location coordinates are collected <strong>strictly upon your explicit request</strong> (Check In, Check Out, or Random Verification). Background tracking is <strong>never performed</strong>.
          </p>
        </div>

        {/* Recent Attendance History */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3 flex items-center justify-between">
            <span>Recent Attendance History</span>
            <span className="text-[10px] text-slate-400 font-normal">Last 30 Days</span>
          </h3>

          {history.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">No recent attendance records found.</p>
          ) : (
            <div className="space-y-2">
              {history.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-800">{item.date}</span>
                    <span className="text-slate-400 block text-[10px] truncate max-w-[180px]">
                      {item.worksite_name}
                    </span>
                  </div>

                  <div className="text-right">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        item.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.status === 'rejected'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {item.status.toUpperCase()}
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      {item.payable_hours ? `${item.payable_hours} hrs` : 'In Progress'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Bottom Sticky Status Indicator */}
      <footer className="p-3 bg-white border-t border-slate-200 text-center text-[11px] text-slate-400">
        Connected to Lumia Infrastructure ERP • Sat-Fri Weekly Cycle
      </footer>
    </div>
  );
}
