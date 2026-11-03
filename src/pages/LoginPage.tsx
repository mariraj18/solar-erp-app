import React, { useState, useEffect } from 'react';
import { ShieldCheck, AlertCircle, Lock, Mail, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Company branding
const COMPANY_NAME = 'Solar Designs Pvt Ltd';
const COMPANY_LOGO_URL = '/assets/aistudio/solar_designs_clean_logo_bf464b07.png';

export function LoginPage() {
  const { login, requestOtp, loginWithOtp } = useAuth();

  // Detect URL path to determine initial mode: /labour vs /admin
  const isLabourUrl = typeof window !== 'undefined' && (
    window.location.pathname.toLowerCase().includes('/labour') ||
    window.location.pathname.toLowerCase().includes('/worker') ||
    new URLSearchParams(window.location.search).get('role') === 'labour'
  );

  const [authMode, setAuthMode] = useState<'password' | 'otp'>(isLabourUrl ? 'otp' : 'password');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  
  // OTP state
  const [mobileNumber, setMobileNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpNotice, setOtpNotice] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Sync mode with browser URL smoothly
  const switchMode = (mode: 'password' | 'otp') => {
    setAuthMode(mode);
    setError(null);
    setOtpNotice(null);
    setOtpSent(false);
    if (typeof window !== 'undefined') {
      const targetPath = mode === 'otp' ? '/labour' : '/admin';
      if (window.location.pathname !== targetPath) {
        window.history.replaceState({}, '', targetPath);
      }
    }
  };

  // 3-minute refresh countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password) {
      setError('Please enter both identifier (email/mobile) and password.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await login(identifier.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Incorrect password or username.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!mobileNumber || mobileNumber.replace(/\D/g, '').length < 10) {
      setError('Please enter a valid 10-digit registered mobile number.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setOtpNotice(null);

    try {
      const res: any = await requestOtp(mobileNumber);
      setOtpSent(true);
      // Refresh time request window: 3 minutes (180s)
      setResendCooldown(res?.refreshIntervalSeconds || 180);
      setOtpNotice('OTP sent to your registered mobile number (Valid 5 mins).');
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await loginWithOtp(mobileNumber, otpCode.trim());
    } catch (err: any) {
      setError(err.message || 'Invalid or expired OTP code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#EAF1ED] via-[#F2F6F3] to-[#E5EFE8] flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden">
      {/* Decorative ambient sage glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-[#0E6037]/8 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-[#3B5E4F]/8 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[650px] bg-white/40 rounded-full blur-2xl" />
      </div>

      <div className="w-full max-w-[440px] relative z-10 animate-fade-in-up">
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-900/8 border border-[#D8E4DD] overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-emerald-950/10">
          
          {/* Card Header with Mint Sage Background */}
          <div className="relative pt-7 pb-6 px-6 text-center bg-gradient-to-b from-[#E7F0EB] via-[#EEF5F1] to-[#FAFCFA] border-b border-[#E1ECE5] overflow-hidden">
            <div className="relative z-10 flex flex-col items-center">
              {/* Circular Wave Logo */}
              <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl flex items-center justify-center p-1 transition-transform duration-300 hover:scale-105">
                <img
                  src={COMPANY_LOGO_URL}
                  alt={`${COMPANY_NAME} logo`}
                  className="w-full h-full object-contain filter drop-shadow-xs"
                />
              </div>

              {/* Title & Subtitle */}
              <h1 className="text-xl sm:text-[23px] font-bold text-slate-800 tracking-tight mt-2">
                {COMPANY_NAME}
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Labour Attendance &amp; GPS Geofence ERP
              </p>

              {/* Portal Mode Badge */}
              <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide bg-white/80 border border-emerald-900/10 text-emerald-900 shadow-2xs">
                {authMode === 'password' ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0E6037]" />
                    <span>👔 Admin &amp; Staff Portal</span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>👷 Site Worker Portal</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="px-6 pt-5 pb-1 bg-white border-b border-slate-100 flex gap-2">
            <button
              type="button"
              onClick={() => switchMode('password')}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                authMode === 'password'
                  ? 'bg-[#0E6037] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Password Login (Admin)
            </button>
            <button
              type="button"
              onClick={() => switchMode('otp')}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                authMode === 'otp'
                  ? 'bg-[#0E6037] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Mobile OTP (Worker)
            </button>
          </div>

          {/* Error & Info Notices */}
          <div className="px-6 pt-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start space-x-2 animate-shake mb-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {otpNotice && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-start space-x-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{otpNotice}</span>
              </div>
            )}
          </div>

          {/* Form Content */}
          {authMode === 'password' ? (
            <form onSubmit={handlePasswordSubmit} className="p-6 pt-2 space-y-4 bg-white">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-600">
                  Email Address or Mobile Number
                </label>
                <div className="relative group">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none transition-colors duration-200 group-focus-within:text-[#0E6037]" />
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Enter registered email or mobile"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-[#D5E0DA] rounded-xl bg-[#F8FAF9] text-slate-800 placeholder-slate-400 transition-all duration-200 focus:outline-none focus:ring-3 focus:ring-[#0E6037]/15 focus:border-[#0E6037] focus:bg-white hover:border-slate-300"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-600">
                  Password
                </label>
                <div className="relative group">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none transition-colors duration-200 group-focus-within:text-[#0E6037]" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-[#D5E0DA] rounded-xl bg-[#F8FAF9] text-slate-800 placeholder-slate-400 transition-all duration-200 focus:outline-none focus:ring-3 focus:ring-[#0E6037]/15 focus:border-[#0E6037] focus:bg-white hover:border-slate-300"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 bg-[#0E6037] hover:bg-[#0B4D2C] active:bg-[#083C22] text-white rounded-xl text-sm font-semibold shadow-md shadow-[#0E6037]/20 flex items-center justify-center space-x-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group cursor-pointer mt-2"
              >
                <span>
                  {isSubmitting ? 'Authenticating...' : 'Sign In with Password'}
                </span>
                {!isSubmitting && (
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                )}
              </button>
            </form>
          ) : (
            <div className="p-6 pt-2 space-y-4 bg-white">
              {!otpSent ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-600">
                      Registered Mobile Number (10 digits)
                    </label>
                    <div className="relative group">
                      <span className="text-slate-500 font-semibold text-xs absolute left-3.5 top-3 pointer-events-none">+91</span>
                      <input
                        type="tel"
                        required
                        value={mobileNumber}
                        onChange={(e) => setMobileNumber(e.target.value)}
                        placeholder="Enter 10-digit mobile number"
                        maxLength={10}
                        className="w-full pl-12 pr-3.5 py-2.5 text-sm border border-[#D5E0DA] rounded-xl bg-[#F8FAF9] text-slate-800 placeholder-slate-400 font-mono transition-all duration-200 focus:outline-none focus:ring-3 focus:ring-[#0E6037]/15 focus:border-[#0E6037] focus:bg-white hover:border-slate-300"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">
                      OTP valid for 5 minutes. Refresh request available every 3 to 5 minutes.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 px-4 bg-[#0E6037] hover:bg-[#0B4D2C] text-white rounded-xl text-sm font-semibold shadow-md shadow-[#0E6037]/20 flex items-center justify-center space-x-2 transition-all duration-200 cursor-pointer"
                  >
                    <span>{isSubmitting ? 'Generating OTP...' : 'Send OTP Code'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="block text-xs font-semibold text-slate-600">
                        Enter 6-Digit OTP Code
                      </label>
                      <button
                        type="button"
                        onClick={() => { setOtpSent(false); setOtpNotice(null); setResendCooldown(0); }}
                        className="text-xs text-[#0E6037] hover:underline cursor-pointer"
                      >
                        Change Number
                      </button>
                    </div>
                    <input
                      type="text"
                      required
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="123456"
                      maxLength={6}
                      className="w-full px-3.5 py-2.5 text-center text-lg tracking-widest font-mono border border-[#D5E0DA] rounded-xl bg-[#F8FAF9] text-slate-900 transition-all duration-200 focus:outline-none focus:ring-3 focus:ring-[#0E6037]/15 focus:border-[#0E6037] focus:bg-white"
                    />
                    <div className="flex justify-between items-center text-[11px] pt-1">
                      <span className="text-slate-400">Valid for 5 mins</span>
                      {resendCooldown > 0 ? (
                        <span className="text-slate-500 font-medium">
                          Refresh OTP in {Math.floor(resendCooldown / 60)}:{(resendCooldown % 60).toString().padStart(2, '0')}
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => handleSendOtp()}
                          className="text-[#0E6037] font-semibold hover:underline cursor-pointer disabled:opacity-50"
                        >
                          Resend OTP
                        </button>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 px-4 bg-[#0E6037] hover:bg-[#0B4D2C] text-white rounded-xl text-sm font-semibold shadow-md shadow-[#0E6037]/20 flex items-center justify-center space-x-2 transition-all duration-200 cursor-pointer"
                  >
                    <span>{isSubmitting ? 'Verifying OTP...' : 'Verify OTP & Enter App'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Quick Portal Switcher Banner */}
          <div className="bg-[#F8FAF9] px-6 py-3.5 border-t border-[#E8EFEA] text-center">
            {authMode === 'otp' ? (
              <div>
                <p className="text-[11px] text-slate-500 mb-1">Company Administrator or Operations Staff?</p>
                <button
                  type="button"
                  onClick={() => switchMode('password')}
                  className="w-full py-2 px-3 text-xs font-semibold text-[#0E6037] hover:text-[#0B4D2C] bg-white hover:bg-[#EBF3EE] border border-[#D5E0DA] hover:border-[#0E6037]/30 rounded-xl transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>👔 Admin &amp; Staff Sign In (Password)</span>
                </button>
              </div>
            ) : (
              <div>
                <p className="text-[11px] text-slate-500 mb-1">Registered Site Worker / Field Labourer?</p>
                <button
                  type="button"
                  onClick={() => switchMode('otp')}
                  className="w-full py-2 px-3 text-xs font-semibold text-[#0E6037] hover:text-[#0B4D2C] bg-white hover:bg-[#EBF3EE] border border-[#D5E0DA] hover:border-[#0E6037]/30 rounded-xl transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>👷 Site Worker Sign In (Mobile OTP)</span>
                </button>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500 mt-4">
          © {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.
        </p>
      </div>

      {/* Animation helpers */}
      <style>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-4px); }
          40%, 80% { transform: translateX(4px); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-shake {
          animation: shake 0.35s ease-in-out;
        }
      `}</style>
    </div>
  );
}
