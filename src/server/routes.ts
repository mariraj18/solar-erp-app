import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import {
  db,
  logAudit,
  createNotification,
  seedComprehensiveDemoData,
  calculateHaversineDistanceMeters,
  maskAadhaar,
} from './db';
import { computeFinancialSummary, round2 } from '../lib/calculations';
import { getTodayKolkataISO, getWeekBounds } from '../lib/dateUtils';

const JWT_SECRET = process.env.JWT_SECRET || 'erp-super-secure-internal-secret-2026';

export const apiRouter = Router();

// Ensure upload directory exists for attachments
const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// User roles: Master Admin, Secondary Admin / Manager, Staff, and Labourer
export type UserRole = 'master_admin' | 'secondary_admin' | 'staff' | 'admin' | 'labourer';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  designation?: string;
  assignedLocation?: string;
  mobileNumber?: string;
  maskedAadhaar?: string;
  assignedTeamId?: string;
  assignedWorksiteId?: string;
  assignedSupervisorId?: string;
  isAttendanceParticipant?: boolean;
  dailyRate?: number;
  hourlyRate?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function isMasterAdmin(user?: AuthUser): boolean {
  return Boolean(user && (user.role === 'master_admin' || user.role === 'admin'));
}

export function isSecondaryAdmin(user?: AuthUser): boolean {
  return Boolean(user && user.role === 'secondary_admin');
}

export function isAdminAny(user?: AuthUser): boolean {
  return isMasterAdmin(user) || isSecondaryAdmin(user);
}

export function isLabourer(user?: AuthUser): boolean {
  return Boolean(user && user.role === 'labourer');
}

// Check if user has permission to view/manage given staff data
export function canAccessStaff(user: AuthUser, staffUserId: string): boolean {
  if (isMasterAdmin(user)) return true;
  if (user.id === staffUserId) return true;
  if (isSecondaryAdmin(user)) {
    const row = db.prepare('SELECT 1 FROM secondary_admin_assignments WHERE secondary_admin_id = ? AND staff_user_id = ?').get(user.id, staffUserId);
    return Boolean(row);
  }
  return false;
}

// Get array of staff user IDs that this user is permitted to see
export function getPermittedStaffIds(user: AuthUser): string[] | null {
  if (isMasterAdmin(user)) return null; // null means company-wide
  if (isSecondaryAdmin(user)) {
    const rows = db.prepare('SELECT staff_user_id FROM secondary_admin_assignments WHERE secondary_admin_id = ?').all(user.id) as Array<{ staff_user_id: string }>;
    const list = rows.map(r => r.staff_user_id);
    list.push(user.id);
    return list;
  }
  return [user.id];
}

// Check financial module permission for secondary admin
export function canAccessFinanceModule(user: AuthUser, moduleName: 'petty_cash' | 'office_ledger' | 'weekly_payments' | 'bills'): boolean {
  if (isMasterAdmin(user)) return true;
  if (isSecondaryAdmin(user)) {
    // Secondary admins have role-based access to maintain their own office's petty cash, office ledger, and weekly payments
    if (moduleName === 'petty_cash' || moduleName === 'office_ledger' || moduleName === 'weekly_payments') return true;
    const assignments = db.prepare('SELECT allowed_financial_modules_json FROM secondary_admin_assignments WHERE secondary_admin_id = ?').all(user.id) as Array<{ allowed_financial_modules_json: string }>;
    for (const a of assignments) {
      try {
        const modules = JSON.parse(a.allowed_financial_modules_json || '[]');
        if (Array.isArray(modules) && modules.includes(moduleName)) return true;
      } catch {}
    }
  }
  return false;
}

// Get the assigned administrator for an operations staff user
export function getAssignedAdminForStaff(staffUserId: string): { id: string; fullName: string; role: string; email: string } {
  // 1. Check direct secondary admin assignment
  const assign = db.prepare(`
    SELECT u.id, u.full_name as fullName, u.role, u.email
    FROM secondary_admin_assignments sa
    JOIN users u ON sa.secondary_admin_id = u.id
    WHERE sa.staff_user_id = ? AND u.status = 'active'
    LIMIT 1
  `).get(staffUserId) as any;

  if (assign) return assign;

  // 2. Check direct assigned_admin_id on users table
  const userRow = db.prepare('SELECT assigned_admin_id FROM users WHERE id = ?').get(staffUserId) as any;
  if (userRow?.assigned_admin_id) {
    const directAdmin = db.prepare("SELECT id, full_name as fullName, role, email FROM users WHERE id = ? AND status = 'active'").get(userRow.assigned_admin_id) as any;
    if (directAdmin) return directAdmin;
  }

  // 3. Fallback to active Master Admin
  const masterAdmin = db.prepare("SELECT id, full_name as fullName, role, email FROM users WHERE (role = 'master_admin' OR role = 'admin') AND status = 'active' LIMIT 1").get() as any;
  if (masterAdmin) return masterAdmin;

  return { id: 'usr-admin-01', fullName: 'Master Administrator', role: 'master_admin', email: 'admin@solar.local' };
}

// Authentication Middleware
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    const userRow = db.prepare(`
      SELECT id, email, full_name, role, status, designation, assigned_location,
             mobile_number, masked_aadhaar, assigned_team_id, assigned_worksite_id,
             assigned_supervisor_id, is_attendance_participant, daily_rate, hourly_rate
      FROM users WHERE id = ?
    `).get(decoded.id) as any;

    if (!userRow || userRow.status !== 'active') {
      return res.status(401).json({ error: 'User account is deactivated or not found.' });
    }

    req.user = {
      id: userRow.id,
      email: userRow.email,
      fullName: userRow.full_name,
      role: userRow.role,
      designation: userRow.designation,
      assignedLocation: userRow.assigned_location,
      mobileNumber: userRow.mobile_number,
      maskedAadhaar: userRow.masked_aadhaar,
      assignedTeamId: userRow.assigned_team_id,
      assignedWorksiteId: userRow.assigned_worksite_id,
      assignedSupervisorId: userRow.assigned_supervisor_id,
      isAttendanceParticipant: Boolean(userRow.is_attendance_participant),
      dailyRate: userRow.daily_rate,
      hourlyRate: userRow.hourly_rate,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session token.' });
  }
}

// Master-Admin Only Middleware
export function requireMasterAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !isMasterAdmin(req.user)) {
    return res.status(403).json({ error: 'Access denied. Master Administrator privileges required.' });
  }
  next();
}

// Admin-any Middleware (Master or Secondary Admin)
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !isAdminAny(req.user)) {
    return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
  }
  next();
}

// Non-Labourer Only Middleware (Labourers cannot access finance, staff, or admin ledgers)
export function requireStaffOrAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role === 'labourer') {
    return res.status(403).json({ error: 'Access denied. Labourer accounts are restricted from administrative ledgers.' });
  }
  next();
}

// =========================================================================
// 1. STATUS & SYSTEM INFO
// =========================================================================
apiRouter.get('/status', (req: Request, res: Response) => {
  const stats = {
    serverTimeKolkata: getTodayKolkataISO(),
    storageEngine: 'SQLite WAL (Production Local ERP Database)',
    activeUsers: (db.prepare("SELECT COUNT(*) as c FROM users WHERE status = 'active'").get() as { c: number }).c,
    totalTeams: (db.prepare("SELECT COUNT(*) as c FROM teams WHERE status = 'active'").get() as { c: number }).c,
    totalWorksites: (db.prepare("SELECT COUNT(*) as c FROM worksites WHERE status = 'active'").get() as { c: number }).c,
    totalLabourers: (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'labourer' AND status = 'active'").get() as { c: number }).c,
  };
  res.json(stats);
});

// =========================================================================
// 2. AUTHENTICATION & PROFILE
// =========================================================================
// Method B: Password login (supports email OR mobile number)
apiRouter.post('/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  const identifier = (email || req.body.identifier || '').toString().trim();
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Email or Mobile number and password are required.' });
  }

  const user = db.prepare(`
    SELECT * FROM users
    WHERE LOWER(email) = LOWER(?) OR mobile_number = ?
  `).get(identifier, identifier) as any;

  if (!user) {
    return res.status(401).json({ error: 'Incorrect password or username.' });
  }

  if (user.status !== 'active') {
    return res.status(403).json({ error: 'This account has been deactivated by the administrator.' });
  }

  const isPasswordMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isPasswordMatch) {
    return res.status(401).json({ error: 'Incorrect password or username.' });
  }

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  logAudit({
    actorId: user.id,
    actorName: user.full_name,
    actorRole: user.role,
    action: 'USER_LOGIN',
    entityType: 'users',
    entityId: user.id,
    reason: 'Successful password authentication',
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      designation: user.designation,
      assignedLocation: user.assigned_location,
      mobileNumber: user.mobile_number,
      maskedAadhaar: user.masked_aadhaar,
      assignedTeamId: user.assigned_team_id,
      assignedWorksiteId: user.assigned_worksite_id,
      assignedSupervisorId: user.assigned_supervisor_id,
      isAttendanceParticipant: Boolean(user.is_attendance_participant),
    },
  });
});

async function sendRealSmsOtp(mobileNumber: string, otpCode: string): Promise<boolean> {
  const apiKey = process.env.TWOFACTOR_API_KEY;
  if (!apiKey) return false;
  try {
    const formattedMobile = mobileNumber.replace(/\D/g, '').slice(-10);
    const url = `https://2factor.in/API/V1/${apiKey}/SMS/${formattedMobile}/${otpCode}/SolarERP`;
    const response = await fetch(url, { method: 'GET' });
    const data = await response.json().catch(() => ({}));
    console.log(`[2Factor SMS] Dispatched OTP to ${formattedMobile}:`, data);
    return true;
  } catch (err) {
    console.error('[2Factor SMS Error]:', err);
    return false;
  }
}

// Method A: Mobile + OTP Authentication
apiRouter.post('/auth/otp/request', async (req: Request, res: Response) => {
  const { mobileNumber } = req.body;
  if (!mobileNumber || typeof mobileNumber !== 'string') {
    return res.status(400).json({ error: 'Valid mobile number is required.' });
  }

  const cleanMobile = mobileNumber.replace(/\D/g, '').slice(-10);
  if (cleanMobile.length < 10) {
    return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
  }

  // Rate limiting / refresh window: 3 minutes rolling window (refresh request 3 to 5 mins)
  // Allows up to 5 OTP requests within 3 minutes
  const RATE_LIMIT_WINDOW_MINUTES = 3;
  const windowAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();

  const recentOtps = db.prepare(`
    SELECT created_at FROM otp_verifications
    WHERE mobile_number = ? AND created_at > ?
    ORDER BY created_at ASC
  `).all(cleanMobile, windowAgo) as { created_at: string }[];

  const MAX_REQUESTS_PER_WINDOW = 5;
  if (recentOtps.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldestInWindow = new Date(recentOtps[0].created_at).getTime();
    const waitSeconds = Math.max(1, Math.ceil((oldestInWindow + RATE_LIMIT_WINDOW_MINUTES * 60 * 1000 - Date.now()) / 1000));
    const waitMinutes = Math.ceil(waitSeconds / 60);
    return res.status(429).json({
      error: `Too many OTP requests. Please wait ${waitMinutes} minute${waitMinutes > 1 ? 's' : ''} (${waitSeconds}s) before trying again.`,
      retryAfterSeconds: waitSeconds,
    });
  }

  // Verify that an active user exists with this mobile number
  const user = db.prepare('SELECT id, full_name, role, status FROM users WHERE mobile_number = ?').get(cleanMobile) as any;
  if (!user) {
    return res.status(404).json({ error: 'No active account registered with this mobile number.' });
  }

  if (user.status !== 'active') {
    return res.status(403).json({ error: 'This account has been deactivated.' });
  }

  // Generate 6-digit OTP code (e.g. standard random 6 digits)
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const id = `otp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString(); // 5-minute expiry

  db.prepare(`
    INSERT INTO otp_verifications (id, mobile_number, otp_code, user_id, expires_at, is_used, attempts, created_at)
    VALUES (?, ?, ?, ?, ?, 0, 0, ?)
  `).run(id, cleanMobile, otpCode, user.id, expiresAt, now.toISOString());

  // Also create persistent in-app notification for the user
  createNotification({
    userId: user.id,
    title: 'Your Login OTP',
    message: `Your one-time login verification code is ${otpCode}. It expires in 5 minutes.`,
    type: 'info',
  });

  logAudit({
    actorId: user.id,
    actorName: user.full_name,
    actorRole: user.role,
    action: 'OTP_REQUESTED',
    entityType: 'otp_verifications',
    entityId: id,
    reason: `OTP requested for mobile ${cleanMobile}`,
  });

  // Dispatch Real SMS via 2Factor if API key is configured
  if (process.env.TWOFACTOR_API_KEY) {
    await sendRealSmsOtp(cleanMobile, otpCode);
  }

  const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.TWOFACTOR_API_KEY);

  res.json({
    success: true,
    message: isProduction
      ? 'One-Time Password (OTP) sent to your registered mobile number. Valid for 5 minutes.'
      : 'One-Time Password (OTP) generated. Valid for 5 minutes.',
    ...(isProduction ? {} : { otpCode }),
    expiresInSeconds: 300,
    refreshIntervalSeconds: 180,
  });
});

apiRouter.post('/auth/otp/verify', (req: Request, res: Response) => {
  const { mobileNumber, otpCode } = req.body;
  if (!mobileNumber || !otpCode) {
    return res.status(400).json({ error: 'Mobile number and OTP code are required.' });
  }

  const cleanMobile = mobileNumber.replace(/\D/g, '').slice(-10);
  const cleanCode = otpCode.toString().trim();

  // Find latest unused OTP for this mobile
  const otpRow = db.prepare(`
    SELECT * FROM otp_verifications
    WHERE mobile_number = ? AND is_used = 0
    ORDER BY created_at DESC LIMIT 1
  `).get(cleanMobile) as any;

  if (!otpRow) {
    return res.status(400).json({ error: 'No active OTP found. Please request a new OTP.' });
  }

  // Check expiry
  if (new Date(otpRow.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
  }

  // Check max attempts
  if (otpRow.attempts >= 3) {
    return res.status(400).json({ error: 'Too many incorrect attempts. Please request a new OTP.' });
  }

  if (otpRow.otp_code !== cleanCode) {
    db.prepare('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = ?').run(otpRow.id);
    return res.status(401).json({ error: 'Invalid OTP code. Please check and try again.' });
  }

  // Mark OTP as used
  db.prepare('UPDATE otp_verifications SET is_used = 1 WHERE id = ?').run(otpRow.id);

  // Retrieve user
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(otpRow.user_id) as any;
  if (!user || user.status !== 'active') {
    return res.status(401).json({ error: 'User account not active or found.' });
  }

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  logAudit({
    actorId: user.id,
    actorName: user.full_name,
    actorRole: user.role,
    action: 'USER_LOGIN_OTP',
    entityType: 'users',
    entityId: user.id,
    reason: `Successful OTP authentication for mobile ${cleanMobile}`,
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      designation: user.designation,
      assignedLocation: user.assigned_location,
      mobileNumber: user.mobile_number,
      maskedAadhaar: user.masked_aadhaar,
      assignedTeamId: user.assigned_team_id,
      assignedWorksiteId: user.assigned_worksite_id,
      assignedSupervisorId: user.assigned_supervisor_id,
      isAttendanceParticipant: Boolean(user.is_attendance_participant),
    },
  });
});

apiRouter.get('/auth/me', requireAuth, (req: Request, res: Response) => {
  const assignedAdmin = !isAdminAny(req.user) ? getAssignedAdminForStaff(req.user!.id) : null;
  res.json({
    user: {
      ...req.user,
      assignedAdmin,
    },
  });
});

// =========================================================================
// 3. USER MANAGEMENT (Master Admin & Account Maintenance)
// =========================================================================
apiRouter.get('/users', requireAuth, (req: Request, res: Response) => {
  if (isMasterAdmin(req.user)) {
    const users = db.prepare('SELECT id, email, full_name, role, status, designation, assigned_location, assigned_admin_id, mobile_number, created_at, updated_at FROM users ORDER BY created_at ASC').all();
    return res.json(users);
  }

  if (isSecondaryAdmin(req.user)) {
    // Secondary admin ONLY sees staff accounts assigned to them - NOT any admins
    const assignedStaff = db.prepare(`
      SELECT u.id, u.email, u.full_name, u.role, u.status, u.designation, u.assigned_location, u.assigned_admin_id, u.mobile_number, u.created_at, u.updated_at
      FROM users u
      WHERE u.role = 'staff' AND (
        u.assigned_admin_id = ? OR
        u.id IN (SELECT staff_user_id FROM secondary_admin_assignments WHERE secondary_admin_id = ?)
      )
      ORDER BY u.full_name ASC
    `).all(req.user!.id, req.user!.id);
    return res.json(assignedStaff);
  }

  // Staff sees only themselves
  const user = db.prepare('SELECT id, email, full_name, role, status, designation, assigned_location, created_at, updated_at FROM users WHERE id = ?').get(req.user!.id);
  res.json(user ? [user] : []);
});

apiRouter.post('/users', requireAuth, requireMasterAdmin, (req: Request, res: Response) => {
  const { email, fullName, role, password, designation, assignedLocation, assignedAdminId } = req.body;
  if (!email || !fullName || !password) {
    return res.status(400).json({ error: 'Email, full name, and password are required.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email);
  if (existing) {
    return res.status(400).json({ error: 'A user with this email already exists.' });
  }

  const id = `usr-${Date.now()}`;
  const now = new Date().toISOString();
  const passwordHash = bcrypt.hashSync(password, 10);
  const userRole = (role === 'master_admin' || role === 'secondary_admin' || role === 'staff') ? role : 'staff';

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status, designation, assigned_location, assigned_admin_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
  `).run(id, email.toLowerCase().trim(), passwordHash, fullName.trim(), userRole, designation || null, assignedLocation || null, assignedAdminId || null, now, now);

  if (assignedAdminId && userRole === 'staff') {
    db.prepare(`
      INSERT OR REPLACE INTO secondary_admin_assignments (
        id, secondary_admin_id, staff_user_id, can_view_reports, can_approve_attendance, can_edit_attendance, allowed_financial_modules_json, can_edit_finance, can_view_details, created_at, updated_at
      ) VALUES (?, ?, ?, 1, 1, 1, '["weekly_payments"]', 0, 1, ?, ?)
    `).run(`assign-${Date.now()}`, assignedAdminId, id, now, now);
  }

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'CREATE_USER',
    entityType: 'users',
    entityId: id,
    newValues: { email, fullName, role: userRole, designation, assignedLocation },
  });

  res.status(201).json({ id, email, fullName, role: userRole, status: 'active' });
});

apiRouter.patch('/users/:id', requireAuth, requireStaffOrAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const { fullName, role, status, password, designation, assignedLocation, assignedAdminId, mobileNumber } = req.body;

  const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as {
    id: string;
    email: string;
    full_name: string;
    role: string;
    status: string;
    assigned_admin_id: string | null;
  } | undefined;

  if (!targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Authorization checks based on roles
  if (isSecondaryAdmin(req.user)) {
    // Secondary admin can ONLY edit staff accounts, NOT any admin accounts
    if (targetUser.role !== 'staff') {
      return res.status(403).json({ error: 'Access denied: Secondary Administrators cannot edit administrator accounts.' });
    }

    // Must be assigned to this secondary admin
    const isAssigned = targetUser.assigned_admin_id === req.user!.id || Boolean(
      db.prepare('SELECT 1 FROM secondary_admin_assignments WHERE secondary_admin_id = ? AND staff_user_id = ?').get(req.user!.id, id)
    );
    if (!isAssigned) {
      return res.status(403).json({ error: 'Access denied: You can only edit staff accounts assigned to you.' });
    }

    // Secondary admin CANNOT deactivate staff ("secondary admin can view and edit staffs not deactivate")
    if (status && status !== targetUser.status) {
      return res.status(403).json({ error: 'Secondary Administrators cannot deactivate or change staff account status. Only Master Administrator can change account status.' });
    }

    // Secondary admin CANNOT promote or alter staff role
    if (role && role !== 'staff') {
      return res.status(403).json({ error: 'Secondary Administrators cannot modify account roles.' });
    }

    // Secondary admin CANNOT reassign staff to other admins
    if (assignedAdminId && assignedAdminId !== targetUser.assigned_admin_id && assignedAdminId !== req.user!.id) {
      return res.status(403).json({ error: 'Secondary Administrators cannot reassign staff to other administrators.' });
    }
  } else if (!isMasterAdmin(req.user)) {
    // Regular staff cannot edit other user accounts
    return res.status(403).json({ error: 'Access denied: Only administrators can modify user accounts.' });
  }

  // Prevent admin from locking out the sole active master admin
  if (targetUser.id === req.user!.id && (status === 'inactive' || (role && role !== 'master_admin' && role !== 'admin'))) {
    const adminCount = (db.prepare("SELECT COUNT(*) as c FROM users WHERE (role = 'admin' OR role = 'master_admin') AND status = 'active'").get() as { c: number }).c;
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'Cannot deactivate or demote the last remaining active Master Administrator.' });
    }
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  if (fullName) {
    updates.push('full_name = ?');
    params.push(fullName.trim());
  }
  if (role && isMasterAdmin(req.user) && (role === 'master_admin' || role === 'secondary_admin' || role === 'staff' || role === 'admin')) {
    updates.push('role = ?');
    params.push(role);
  }
  if (status && isMasterAdmin(req.user) && (status === 'active' || status === 'inactive')) {
    updates.push('status = ?');
    params.push(status);
  }
  if (designation !== undefined) {
    updates.push('designation = ?');
    params.push(designation);
  }
  if (assignedLocation !== undefined) {
    updates.push('assigned_location = ?');
    params.push(assignedLocation);
  }
  if (mobileNumber !== undefined) {
    updates.push('mobile_number = ?');
    params.push(mobileNumber ? mobileNumber.replace(/\D/g, '').slice(-10) : null);
  }
  if (assignedAdminId !== undefined && isMasterAdmin(req.user)) {
    updates.push('assigned_admin_id = ?');
    params.push(assignedAdminId);
  }
  if (password) {
    updates.push('password_hash = ?');
    params.push(bcrypt.hashSync(password, 10));
  }

  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'UPDATE_USER',
    entityType: 'users',
    entityId: id,
    previousValues: targetUser,
    newValues: { fullName, role, status, designation, assignedLocation, mobileNumber },
  });

  res.json({ success: true, message: 'User updated successfully.' });
});

// Secure password reset endpoint for administrators
apiRouter.patch('/users/:id/reset-password', requireAuth, requireStaffOrAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
  }

  const user = db.prepare('SELECT id, email, full_name, role, assigned_admin_id FROM users WHERE id = ?').get(id) as {
    id: string;
    email: string;
    full_name: string;
    role: string;
    assigned_admin_id: string | null;
  } | undefined;

  if (!user) return res.status(404).json({ error: 'User not found.' });

  if (isSecondaryAdmin(req.user)) {
    if (user.role !== 'staff') {
      return res.status(403).json({ error: 'Access denied: Secondary Administrators cannot reset passwords for administrator accounts.' });
    }
    const isAssigned = user.assigned_admin_id === req.user!.id || Boolean(
      db.prepare('SELECT 1 FROM secondary_admin_assignments WHERE secondary_admin_id = ? AND staff_user_id = ?').get(req.user!.id, id)
    );
    if (!isAssigned) {
      return res.status(403).json({ error: 'Access denied: You can only reset password for staff assigned to you.' });
    }
  } else if (!isMasterAdmin(req.user)) {
    return res.status(403).json({ error: 'Access denied: Only administrators can reset account passwords.' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  const now = new Date().toISOString();
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, now, id);

  createNotification({
    userId: id,
    title: 'Password Updated',
    message: `Your account password has been updated by ${req.user!.fullName}.`,
    type: 'info',
  });

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'RESET_PASSWORD',
    entityType: 'users',
    entityId: id,
    reason: 'Admin initiated password reset',
  });

  res.json({ success: true, message: `Password reset successfully for ${user.full_name}.` });
});

// =========================================================================
// 4. SECONDARY ADMIN ASSIGNMENTS & PERMISSIONS MATRIX (MASTER ADMIN ONLY)
// =========================================================================
apiRouter.get('/secondary-admins', requireAuth, (req: Request, res: Response) => {
  if (!isMasterAdmin(req.user)) {
    return res.status(403).json({ error: 'Unauthorized: Only Master Administrator can manage secondary admins.' });
  }

  let secAdminsQuery = "SELECT id, email, full_name, designation, assigned_location, status FROM users WHERE role = 'secondary_admin'";
  const secAdmins = db.prepare(secAdminsQuery).all() as Array<any>;

  const assignments = db.prepare(`
    SELECT a.*, u.full_name as staff_name, u.email as staff_email
    FROM secondary_admin_assignments a
    JOIN users u ON a.staff_user_id = u.id
  `).all() as Array<any>;

  const result = secAdmins.map(admin => ({
    ...admin,
    assignedStaff: assignments
      .filter(a => a.secondary_admin_id === admin.id)
      .map(a => ({
        ...a,
        allowedFinancialModules: JSON.parse(a.allowed_financial_modules_json || '[]'),
      })),
  }));

  res.json(result);
});

// GET /api/offices - Office list for location/secondary admin categorization & filtering
apiRouter.get('/offices', requireAuth, (req: Request, res: Response) => {
  const masterAdmin = db.prepare("SELECT id, full_name, email FROM users WHERE role IN ('master_admin', 'admin') LIMIT 1").get() as any;
  const secAdmins = db.prepare("SELECT id, full_name, email, designation, assigned_location FROM users WHERE role = 'secondary_admin' AND status = 'active' ORDER BY full_name ASC").all() as Array<any>;
  const assignments = db.prepare("SELECT secondary_admin_id, staff_user_id FROM secondary_admin_assignments").all() as Array<any>;
  const staffUsers = db.prepare("SELECT id, full_name, email, assigned_admin_id FROM users WHERE role = 'staff' AND status = 'active'").all() as Array<any>;

  if (isSecondaryAdmin(req.user)) {
    // Secondary admin sees their own office info
    const me = secAdmins.find(s => s.id === req.user!.id) || {
      id: req.user!.id,
      full_name: req.user!.fullName,
      assigned_location: req.user!.assignedLocation,
    };
    const myStaffIds = assignments.filter(a => a.secondary_admin_id === req.user!.id).map(a => a.staff_user_id);
    staffUsers.filter(s => s.assigned_admin_id === req.user!.id).forEach(s => {
      if (!myStaffIds.includes(s.id)) myStaffIds.push(s.id);
    });

    return res.json([
      {
        id: req.user!.id,
        name: me.assigned_location ? `${me.assigned_location} Office (${me.full_name})` : `${me.full_name} Office`,
        location: me.assigned_location || 'Branch Office',
        adminId: req.user!.id,
        adminName: me.full_name,
        isHeadOffice: false,
        staffCount: myStaffIds.length,
        staffUserIds: myStaffIds,
      }
    ]);
  }

  // Master Admin sees Head Office + all Secondary Admin offices
  const headOfficeStaffIds: string[] = [];
  const assignedToSec: string[] = [];
  assignments.forEach(a => assignedToSec.push(a.staff_user_id));
  staffUsers.forEach(s => {
    if (s.assigned_admin_id && !assignedToSec.includes(s.id)) {
      assignedToSec.push(s.id);
    }
    if (!assignedToSec.includes(s.id)) {
      headOfficeStaffIds.push(s.id);
    }
  });

  const offices = [
    {
      id: 'head_office',
      name: 'Head Office (Central)',
      location: 'Head Office',
      adminId: masterAdmin?.id || 'usr-admin-01',
      adminName: masterAdmin?.full_name || 'Master Administrator',
      isHeadOffice: true,
      staffCount: headOfficeStaffIds.length,
      staffUserIds: headOfficeStaffIds,
    },
    ...secAdmins.map(sec => {
      const staffIds = assignments.filter(a => a.secondary_admin_id === sec.id).map(a => a.staff_user_id);
      staffUsers.filter(s => s.assigned_admin_id === sec.id).forEach(s => {
        if (!staffIds.includes(s.id)) staffIds.push(s.id);
      });
      return {
        id: sec.id,
        name: sec.assigned_location ? `${sec.assigned_location} Office (${sec.full_name})` : `${sec.full_name} Office`,
        location: sec.assigned_location || 'Branch Office',
        adminId: sec.id,
        adminName: sec.full_name,
        isHeadOffice: false,
        staffCount: staffIds.length,
        staffUserIds: staffIds,
      };
    })
  ];

  res.json(offices);
});

apiRouter.post('/secondary-admins/assign', requireAuth, requireMasterAdmin, (req: Request, res: Response) => {
  const {
    secondaryAdminId,
    staffUserId,
    canViewReports = 1,
    canApproveAttendance = 1,
    canEditAttendance = 1,
    allowedFinancialModules = ['weekly_payments'],
    canEditFinance = 0,
    canViewDetails = 1,
  } = req.body;

  if (!secondaryAdminId || !staffUserId) {
    return res.status(400).json({ error: 'Secondary admin and staff user are required.' });
  }

  const id = `assign-${secondaryAdminId}-${staffUserId}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO secondary_admin_assignments (
      id, secondary_admin_id, staff_user_id, can_view_reports, can_approve_attendance, can_edit_attendance,
      allowed_financial_modules_json, can_edit_finance, can_view_details, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(secondary_admin_id, staff_user_id) DO UPDATE SET
      can_view_reports = excluded.can_view_reports,
      can_approve_attendance = excluded.can_approve_attendance,
      can_edit_attendance = excluded.can_edit_attendance,
      allowed_financial_modules_json = excluded.allowed_financial_modules_json,
      can_edit_finance = excluded.can_edit_finance,
      can_view_details = excluded.can_view_details,
      updated_at = excluded.updated_at
  `).run(
    id,
    secondaryAdminId,
    staffUserId,
    canViewReports ? 1 : 0,
    canApproveAttendance ? 1 : 0,
    canEditAttendance ? 1 : 0,
    JSON.stringify(allowedFinancialModules),
    canEditFinance ? 1 : 0,
    canViewDetails ? 1 : 0,
    now,
    now
  );

  // Update staff user's assigned_admin_id
  db.prepare('UPDATE users SET assigned_admin_id = ?, updated_at = ? WHERE id = ?').run(secondaryAdminId, now, staffUserId);

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'ASSIGN_SECONDARY_ADMIN',
    entityType: 'secondary_admin_assignments',
    entityId: id,
    newValues: { secondaryAdminId, staffUserId, allowedFinancialModules },
  });

  res.json({ success: true, message: 'Secondary admin permissions and scope updated.' });
});

apiRouter.delete('/secondary-admins/assign/:adminId/:staffId', requireAuth, requireMasterAdmin, (req: Request, res: Response) => {
  const { adminId, staffId } = req.params;
  db.prepare('DELETE FROM secondary_admin_assignments WHERE secondary_admin_id = ? AND staff_user_id = ?').run(adminId, staffId);
  db.prepare('UPDATE users SET assigned_admin_id = NULL WHERE id = ? AND assigned_admin_id = ?').run(staffId, adminId);
  res.json({ success: true, message: 'Assignment removed.' });
});

// =========================================================================
// 5. LABOUR CATEGORIES (WITH STAFF ISOLATION & SHARED TEMPLATES)
// =========================================================================
apiRouter.get('/categories', requireAuth, (req: Request, res: Response) => {
  let categories: any[];
  if (isMasterAdmin(req.user)) {
    categories = db.prepare('SELECT * FROM labour_categories ORDER BY display_order ASC').all();
  } else {
    // Staff and Secondary Admin see shared categories or their own
    categories = db.prepare(`
      SELECT * FROM labour_categories
      WHERE is_shared = 1 OR owner_user_id = ?
      ORDER BY display_order ASC
    `).all(req.user!.id);
  }
  res.json(categories);
});

apiRouter.post('/categories', requireAuth, (req: Request, res: Response) => {
  const { name, code, defaultRate, rateType, displayOrder, isShared } = req.body;
  if (!name || !code) {
    return res.status(400).json({ error: 'Name and Code are required.' });
  }

  const id = `cat-${code.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const sharedFlag = isMasterAdmin(req.user) ? (isShared ? 1 : 0) : 0;

  try {
    db.prepare(`
      INSERT INTO labour_categories (id, name, code, default_rate, rate_type, display_order, is_shared, owner_user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name.trim(),
      code.toUpperCase().trim(),
      Number(defaultRate) || 0,
      rateType || 'daily',
      Number(displayOrder) || 0,
      sharedFlag,
      req.user!.id,
      now
    );

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'CREATE_CATEGORY',
      entityType: 'labour_categories',
      entityId: id,
      newValues: { name, code, defaultRate },
    });

    res.status(201).json({ id, name, code, defaultRate: Number(defaultRate) || 0 });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'A category with this code already exists.' });
    }
    res.status(500).json({ error: err.message || 'Failed to save category.' });
  }
});

apiRouter.put('/categories/:id', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, code, defaultRate, rateType, displayOrder, isShared } = req.body;

  const existing = db.prepare('SELECT * FROM labour_categories WHERE id = ?').get(id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Category not found.' });
  }

  if (!isAdminAny(req.user) && existing.owner_user_id !== req.user!.id) {
    return res.status(403).json({ error: 'Permission denied to edit this category.' });
  }

  const updatedName = name ? name.trim() : existing.name;
  const updatedCode = code ? code.toUpperCase().trim() : existing.code;
  const updatedRate = defaultRate !== undefined ? Number(defaultRate) || 0 : existing.default_rate;
  const updatedRateType = rateType || existing.rate_type;
  const updatedOrder = displayOrder !== undefined ? Number(displayOrder) || 0 : existing.display_order;
  const updatedShared = isMasterAdmin(req.user) ? (isShared !== undefined ? (isShared ? 1 : 0) : existing.is_shared) : existing.is_shared;

  try {
    db.prepare(`
      UPDATE labour_categories
      SET name = ?, code = ?, default_rate = ?, rate_type = ?, display_order = ?, is_shared = ?
      WHERE id = ?
    `).run(updatedName, updatedCode, updatedRate, updatedRateType, updatedOrder, updatedShared, id);

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'UPDATE_CATEGORY',
      entityType: 'labour_categories',
      entityId: id,
      previousValues: existing,
      newValues: { name: updatedName, code: updatedCode, defaultRate: updatedRate, rateType: updatedRateType },
    });

    res.json({ id, name: updatedName, code: updatedCode, defaultRate: updatedRate, rateType: updatedRateType, isShared: updatedShared });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'A category with this code already exists.' });
    }
    res.status(500).json({ error: err.message || 'Failed to update category.' });
  }
});

apiRouter.delete('/categories/:id', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;

  const existing = db.prepare('SELECT * FROM labour_categories WHERE id = ?').get(id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Category not found.' });
  }

  if (!isAdminAny(req.user) && existing.owner_user_id !== req.user!.id) {
    return res.status(403).json({ error: 'Permission denied to delete this category.' });
  }

  // Check if category is used in existing attendance lines
  const usedInAttendance = db.prepare('SELECT COUNT(*) as count FROM attendance_lines WHERE category_id = ?').get(id) as { count: number };
  if (usedInAttendance && usedInAttendance.count > 0) {
    return res.status(400).json({
      error: `Cannot delete category "${existing.name}" because it is referenced in ${usedInAttendance.count} attendance line(s). You can edit its rate or name instead.`,
    });
  }

  try {
    // Delete any template associations
    db.prepare('DELETE FROM team_role_templates WHERE category_id = ?').run(id);

    db.prepare('DELETE FROM labour_categories WHERE id = ?').run(id);

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'DELETE_CATEGORY',
      entityType: 'labour_categories',
      entityId: id,
      previousValues: existing,
    });

    res.json({ success: true, message: `Category "${existing.name}" deleted successfully.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete category.' });
  }
});

// =========================================================================
// 6. TEAMS & TEMPLATES (WITH STAFF ISOLATION)
// =========================================================================
apiRouter.get('/teams', requireAuth, (req: Request, res: Response) => {
  let teams: Array<any>;
  if (isMasterAdmin(req.user)) {
    teams = db.prepare("SELECT * FROM teams WHERE status = 'active' ORDER BY name ASC").all() as Array<any>;
  } else if (isSecondaryAdmin(req.user)) {
    // Secondary admin sees shared teams, their owned teams, or teams owned by their assigned staff
    teams = db.prepare(`
      SELECT * FROM teams
      WHERE status = 'active' AND (
        is_shared = 1 OR
        owner_user_id = ? OR
        owner_user_id IN (SELECT staff_user_id FROM secondary_admin_assignments WHERE secondary_admin_id = ?)
      )
      ORDER BY name ASC
    `).all(req.user!.id, req.user!.id) as Array<any>;
  } else {
    // Staff see their own owned teams or shared teams
    teams = db.prepare(`
      SELECT * FROM teams
      WHERE status = 'active' AND (is_shared = 1 OR owner_user_id = ?)
      ORDER BY name ASC
    `).all(req.user!.id) as Array<any>;
  }

  const teamIds = teams.map(t => t.id);
  let roles: Array<any> = [];
  if (teamIds.length > 0) {
    const placeholders = teamIds.map(() => '?').join(',');
    roles = db.prepare(`
      SELECT r.*, c.name as category_name, c.code as category_code
      FROM team_role_templates r
      JOIN labour_categories c ON r.category_id = c.id
      WHERE r.team_id IN (${placeholders})
    `).all(...teamIds) as Array<any>;
  }

  const fullTeams = teams.map(t => ({
    ...t,
    roles: roles.filter(r => r.team_id === t.id),
  }));

  res.json(fullTeams);
});

apiRouter.post('/teams', requireAuth, (req: Request, res: Response) => {
  const {
    name,
    workCategory,
    locationProject,
    notes,
    roles,
    isShared,
    assignedWorksiteId,
    siteLatitude,
    siteLongitude,
    geofenceRadiusMeters,
    geofenceAccuracyThreshold,
    attendanceMethod,
  } = req.body;
  if (!name || !workCategory) {
    return res.status(400).json({ error: 'Team name and work category are required.' });
  }

  const teamId = `team-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const sharedFlag = isMasterAdmin(req.user) ? (isShared ? 1 : 0) : 0;
  const isStaff = !isAdminAny(req.user);

  let worksiteId = assignedWorksiteId || null;
  const latNum = siteLatitude !== undefined && siteLatitude !== null && siteLatitude !== '' ? Number(siteLatitude) : null;
  const lonNum = siteLongitude !== undefined && siteLongitude !== null && siteLongitude !== '' ? Number(siteLongitude) : null;
  const radiusNum = Number(geofenceRadiusMeters) || 150;
  const accuracyNum = Number(geofenceAccuracyThreshold) || 50;

  // STRICT GOVERNANCE: Operations staff cannot directly set live geofence coordinates
  const liveLat = isStaff ? null : latNum;
  const liveLon = isStaff ? null : lonNum;

  // If admin provided coordinates, auto-sync or create linked worksite
  if (!isStaff && latNum !== null && lonNum !== null) {
    if (!worksiteId) {
      const existingWs = db.prepare('SELECT id FROM worksites WHERE ABS(latitude - ?) < 0.0005 AND ABS(longitude - ?) < 0.0005').get(latNum, lonNum) as any;
      if (existingWs) {
        worksiteId = existingWs.id;
      } else {
        worksiteId = `ws-${teamId}`;
        try {
          db.prepare(`
            INSERT INTO worksites (
              id, name, code, latitude, longitude, radius_meters, accuracy_threshold_meters,
              address, status, assigned_teams_json, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
          `).run(
            worksiteId,
            locationProject || `${name.trim()} Site`,
            `WS-${teamId.substring(5, 9).toUpperCase()}`,
            latNum,
            lonNum,
            radiusNum,
            accuracyNum,
            locationProject || `${name.trim()} Project Site`,
            JSON.stringify([teamId]),
            req.user!.id,
            now,
            now
          );
        } catch (e) {
          console.error('Worksite auto-create notice:', e);
        }
      }
    }
  }

  const insertTeam = db.prepare(`
    INSERT INTO teams (
      id, name, work_category, location_project, status, notes, is_shared, owner_user_id,
      assigned_worksite_id, site_latitude, site_longitude, geofence_radius_meters, geofence_accuracy_threshold,
      attendance_method, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertRole = db.prepare(`
    INSERT INTO team_role_templates (id, team_id, category_id, default_rate, rate_type, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  try {
    const transaction = db.transaction(() => {
      insertTeam.run(
        teamId,
        name.trim(),
        workCategory.trim(),
        locationProject || null,
        notes || null,
        sharedFlag,
        req.user!.id,
        worksiteId,
        liveLat,
        liveLon,
        radiusNum,
        accuracyNum,
        attendanceMethod || 'both',
        now,
        now
      );

      if (Array.isArray(roles)) {
        for (const r of roles) {
          if (r.categoryId) {
            const roleId = `role-${teamId}-${r.categoryId}`;
            insertRole.run(roleId, teamId, r.categoryId, Number(r.defaultRate) || 0, r.rateType || 'daily', now);
          }
        }
      }
    });

    transaction();

    // If operations staff specified coordinates, submit geofence request to their assigned admin
    let pendingGeofenceRequestId: string | null = null;
    let assignedAdminName = '';
    if (isStaff && latNum !== null && lonNum !== null) {
      const assignedAdmin = getAssignedAdminForStaff(req.user!.id);
      assignedAdminName = assignedAdmin.fullName;
      pendingGeofenceRequestId = `gfc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const reasonText = (req.body.locationChangeReason && req.body.locationChangeReason.trim()) || `Initial worksite geofence setup for new team "${name.trim()}"`;

      db.prepare(`
        INSERT INTO geofence_change_requests (
          id, entity_type, entity_id, entity_name, requested_by_id, requested_by_name,
          target_admin_id, previous_latitude, previous_longitude, previous_radius_meters, previous_accuracy_threshold,
          requested_latitude, requested_longitude, requested_radius_meters, requested_accuracy_threshold,
          reason, status, created_at, updated_at
        ) VALUES (?, 'team', ?, ?, ?, ?, ?, NULL, NULL, 150, 50, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `).run(
        pendingGeofenceRequestId,
        teamId,
        name.trim(),
        req.user!.id,
        req.user!.fullName,
        assignedAdmin.id,
        latNum,
        lonNum,
        radiusNum,
        accuracyNum,
        reasonText,
        now,
        now
      );

      db.prepare('UPDATE teams SET pending_geofence_request_id = ? WHERE id = ?').run(pendingGeofenceRequestId, teamId);

      createNotification({
        userId: assignedAdmin.id,
        title: 'New Team Geofence Approval Required',
        message: `${req.user!.fullName} created team "${name.trim()}" and submitted worksite location for approval.`,
        type: 'approval',
        link: '/approvals',
      });
    }

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'CREATE_TEAM',
      entityType: 'teams',
      entityId: teamId,
      newValues: { name, workCategory, siteLatitude: liveLat, siteLongitude: liveLon, radiusMeters: radiusNum, roles, pendingGeofenceRequestId },
    });

    res.status(201).json({
      id: teamId,
      name,
      workCategory,
      locationProject,
      assignedWorksiteId: worksiteId,
      pendingGeofenceApproval: Boolean(pendingGeofenceRequestId),
      message: pendingGeofenceRequestId
        ? `Team created. Location coordinates submitted to your assigned administrator (${assignedAdminName}) for review and approval.`
        : 'Team created successfully.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create team.' });
  }
});

apiRouter.put('/teams/:id', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    name,
    workCategory,
    locationProject,
    status,
    notes,
    roles,
    isShared,
    assignedWorksiteId,
    siteLatitude,
    siteLongitude,
    geofenceRadiusMeters,
    geofenceAccuracyThreshold,
    attendanceMethod,
  } = req.body;

  const currentTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as any;
  if (!currentTeam) {
    return res.status(404).json({ error: 'Team not found.' });
  }

  // Check ownership
  if (!isMasterAdmin(req.user) && currentTeam.owner_user_id !== req.user!.id) {
    return res.status(403).json({ error: 'You do not have permission to modify this team.' });
  }

  const now = new Date().toISOString();
  const isStaff = !isAdminAny(req.user);
  let worksiteId = assignedWorksiteId !== undefined ? assignedWorksiteId : currentTeam.assigned_worksite_id;
  const latNum = siteLatitude !== undefined && siteLatitude !== null && siteLatitude !== '' ? Number(siteLatitude) : currentTeam.site_latitude;
  const lonNum = siteLongitude !== undefined && siteLongitude !== null && siteLongitude !== '' ? Number(siteLongitude) : currentTeam.site_longitude;
  const radiusNum = geofenceRadiusMeters !== undefined ? Number(geofenceRadiusMeters) : (currentTeam.geofence_radius_meters || 150);
  const accuracyNum = geofenceAccuracyThreshold !== undefined ? Number(geofenceAccuracyThreshold) : (currentTeam.geofence_accuracy_threshold || 50);

  // Check if coordinates or radius are being modified
  const isLocationChanged = (
    latNum !== null && lonNum !== null && (
      Math.abs(Number(latNum) - Number(currentTeam.site_latitude || 0)) > 0.0001 ||
      Math.abs(Number(lonNum) - Number(currentTeam.site_longitude || 0)) > 0.0001 ||
      Math.abs(Number(radiusNum) - Number(currentTeam.geofence_radius_meters || 150)) > 5
    )
  );

  // STRICT GOVERNANCE: Operations staff cannot directly alter live coordinates
  const effectiveLat = isStaff ? currentTeam.site_latitude : latNum;
  const effectiveLon = isStaff ? currentTeam.site_longitude : lonNum;
  const effectiveRadius = isStaff ? (currentTeam.geofence_radius_meters || 150) : radiusNum;
  const effectiveAccuracy = isStaff ? (currentTeam.geofence_accuracy_threshold || 50) : accuracyNum;

  // If administrator provided coordinates, auto-sync worksite
  if (!isStaff && latNum !== null && lonNum !== null) {
    if (!worksiteId) {
      const existingWs = db.prepare('SELECT id FROM worksites WHERE ABS(latitude - ?) < 0.0005 AND ABS(longitude - ?) < 0.0005').get(latNum, lonNum) as any;
      if (existingWs) {
        worksiteId = existingWs.id;
      } else {
        worksiteId = `ws-${id}`;
        try {
          db.prepare(`
            INSERT INTO worksites (
              id, name, code, latitude, longitude, radius_meters, accuracy_threshold_meters,
              address, status, assigned_teams_json, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
          `).run(
            worksiteId,
            locationProject || `${name || currentTeam.name} Site`,
            `WS-${id.substring(0, 4).toUpperCase()}`,
            latNum,
            lonNum,
            radiusNum,
            accuracyNum,
            locationProject || `${name || currentTeam.name} Project Site`,
            JSON.stringify([id]),
            req.user!.id,
            now,
            now
          );
        } catch {
          // Ignore if exists
        }
      }
    } else {
      // Update existing worksite coords
      try {
        db.prepare(`
          UPDATE worksites
          SET latitude = ?, longitude = ?, radius_meters = ?, accuracy_threshold_meters = ?, updated_at = ?
          WHERE id = ?
        `).run(latNum, lonNum, radiusNum, accuracyNum, now, worksiteId);
      } catch {
        // Ignore
      }
    }
  }

  try {
    let pendingGeofenceRequestId: string | null = null;
    let assignedAdminName = '';

    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE teams
        SET name = ?, work_category = ?, location_project = ?, status = ?, notes = ?, is_shared = ?,
            assigned_worksite_id = ?, site_latitude = ?, site_longitude = ?,
            geofence_radius_meters = ?, geofence_accuracy_threshold = ?, attendance_method = ?, updated_at = ?
        WHERE id = ?
      `).run(
        name !== undefined ? name : currentTeam.name,
        workCategory !== undefined ? workCategory : currentTeam.work_category,
        locationProject !== undefined ? locationProject : currentTeam.location_project,
        status || currentTeam.status || 'active',
        notes !== undefined ? notes : currentTeam.notes,
        isMasterAdmin(req.user) && isShared !== undefined ? (isShared ? 1 : 0) : currentTeam.is_shared,
        worksiteId,
        effectiveLat,
        effectiveLon,
        effectiveRadius,
        effectiveAccuracy,
        attendanceMethod || currentTeam.attendance_method || 'both',
        now,
        id
      );

      if (Array.isArray(roles)) {
        db.prepare('DELETE FROM team_role_templates WHERE team_id = ?').run(id);
        const insertRole = db.prepare(`
          INSERT INTO team_role_templates (id, team_id, category_id, default_rate, rate_type, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const r of roles) {
          if (r.categoryId) {
            insertRole.run(`role-${id}-${r.categoryId}`, id, r.categoryId, Number(r.defaultRate) || 0, r.rateType || 'daily', now);
          }
        }
      }

      // If staff changed coordinates, create pending request for their assigned admin
      if (isStaff && isLocationChanged && latNum !== null && lonNum !== null) {
        const assignedAdmin = getAssignedAdminForStaff(req.user!.id);
        assignedAdminName = assignedAdmin.fullName;
        pendingGeofenceRequestId = `gfc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const reasonText = (req.body.locationChangeReason && req.body.locationChangeReason.trim()) || 'Staff requested worksite location and geofence adjustment.';

        db.prepare(`
          INSERT INTO geofence_change_requests (
            id, entity_type, entity_id, entity_name, requested_by_id, requested_by_name,
            target_admin_id, previous_latitude, previous_longitude, previous_radius_meters, previous_accuracy_threshold,
            requested_latitude, requested_longitude, requested_radius_meters, requested_accuracy_threshold,
            reason, status, created_at, updated_at
          ) VALUES (?, 'team', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
        `).run(
          pendingGeofenceRequestId,
          id,
          name !== undefined ? name.trim() : currentTeam.name,
          req.user!.id,
          req.user!.fullName,
          assignedAdmin.id,
          currentTeam.site_latitude || null,
          currentTeam.site_longitude || null,
          currentTeam.geofence_radius_meters || 150,
          currentTeam.geofence_accuracy_threshold || 50,
          latNum,
          lonNum,
          radiusNum,
          accuracyNum,
          reasonText,
          now,
          now
        );

        db.prepare('UPDATE teams SET pending_geofence_request_id = ? WHERE id = ?').run(pendingGeofenceRequestId, id);

        createNotification({
          userId: assignedAdmin.id,
          title: 'Geofence Location Change Request',
          message: `${req.user!.fullName} requested site geofence change for team "${currentTeam.name}": ${reasonText}`,
          type: 'approval',
          link: '/approvals',
        });
      }
    });

    transaction();

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'UPDATE_TEAM',
      entityType: 'teams',
      entityId: id,
      previousValues: currentTeam,
      newValues: { name, workCategory, siteLatitude: effectiveLat, siteLongitude: effectiveLon, radiusMeters: effectiveRadius, roles, pendingGeofenceRequestId },
    });

    res.json({
      success: true,
      pendingGeofenceApproval: Boolean(pendingGeofenceRequestId),
      message: pendingGeofenceRequestId
        ? `Team template updated. Site location change submitted to your assigned administrator (${assignedAdminName}) for review and approval.`
        : 'Team template and settings updated successfully.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update team.' });
  }
});

// Week-specific team snapshot configuration
apiRouter.get('/teams/week/:weekStart', requireAuth, (req: Request, res: Response) => {
  const { weekStart } = req.params;
  const assignments = db.prepare('SELECT * FROM team_week_assignments WHERE week_start_date = ?').all(weekStart);
  res.json(assignments);
});

apiRouter.post('/teams/week/:weekStart', requireAuth, (req: Request, res: Response) => {
  const { weekStart } = req.params;
  const { teamId, customRoleConfig } = req.body;
  const bounds = getWeekBounds(weekStart);
  const now = new Date().toISOString();
  const id = `twa-${weekStart}-${teamId}`;

  db.prepare(`
    INSERT INTO team_week_assignments (id, week_start_date, week_end_date, team_id, custom_role_config_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(week_start_date, team_id) DO UPDATE SET
      custom_role_config_json = excluded.custom_role_config_json
  `).run(id, bounds.startDate, bounds.endDate, teamId, JSON.stringify(customRoleConfig), now);

  res.json({ success: true, message: 'Team week configuration snapshotted.' });
});

// =========================================================================
// 7. DAILY ATTENDANCE (BUG FIXES, ROBUST TRANSACTIONS, RBAC & APPROVALS)
// =========================================================================
apiRouter.get('/attendance', requireAuth, (req: Request, res: Response) => {
  const { weekStart, date, teamId, staffUserId, status, secondaryAdminId } = req.query;

  let query = `
    SELECT e.*, u.full_name as staff_name, t.name as team_name,
           COALESCE(sec.id, u.assigned_admin_id, 'head_office') as secondary_admin_id,
           COALESCE(sec.full_name, 'Head Office / Master Admin') as secondary_admin_name,
           COALESCE(sec.assigned_location, 'Head Office') as office_location,
           CASE
             WHEN sec.id IS NOT NULL THEN (COALESCE(sec.assigned_location, 'Branch') || ' Office (' || sec.full_name || ')')
             ELSE 'Head Office (Central)'
           END as office_name
    FROM attendance_entries e
    JOIN users u ON e.owner_user_id = u.id
    JOIN teams t ON e.team_id = t.id
    LEFT JOIN secondary_admin_assignments saa ON saa.staff_user_id = u.id
    LEFT JOIN users sec ON (sec.id = saa.secondary_admin_id OR sec.id = u.assigned_admin_id)
    WHERE e.is_deleted = 0
  `;
  const params: unknown[] = [];

  // Data isolation
  if (!isMasterAdmin(req.user)) {
    if (isSecondaryAdmin(req.user)) {
      const permittedStaff = getPermittedStaffIds(req.user!);
      if (permittedStaff && permittedStaff.length > 0) {
        const placeholders = permittedStaff.map(() => '?').join(',');
        query += ` AND e.owner_user_id IN (${placeholders})`;
        params.push(...permittedStaff);
      } else {
        query += ' AND e.owner_user_id = ?';
        params.push(req.user!.id);
      }
    } else {
      // Staff sees only their own
      query += ' AND e.owner_user_id = ?';
      params.push(req.user!.id);
    }
  } else {
    // Master admin can filter by secondaryAdminId / office or staff
    if (secondaryAdminId && secondaryAdminId !== 'all') {
      if (secondaryAdminId === 'head_office') {
        query += ' AND (sec.id IS NULL AND (u.assigned_admin_id IS NULL OR u.assigned_admin_id = req.user.id))';
      } else {
        query += ' AND (sec.id = ? OR u.assigned_admin_id = ?)';
        params.push(secondaryAdminId, secondaryAdminId);
      }
    }
    if (staffUserId) {
      query += ' AND e.owner_user_id = ?';
      params.push(staffUserId);
    }
  }

  if (weekStart) {
    query += ' AND e.week_start_date = ?';
    params.push(weekStart);
  }
  if (date) {
    query += ' AND e.date = ?';
    params.push(date);
  }
  if (teamId) {
    query += ' AND e.team_id = ?';
    params.push(teamId);
  }
  if (status) {
    query += ' AND e.status = ?';
    params.push(status);
  }

  query += ' ORDER BY e.date ASC, e.created_at ASC';
  const entries = db.prepare(query).all(...params) as Array<any>;

  if (entries.length === 0) {
    return res.json([]);
  }

  const entryIds = entries.map(e => e.id);
  const placeholders = entryIds.map(() => '?').join(',');
  const lines = db.prepare(`SELECT * FROM attendance_lines WHERE attendance_entry_id IN (${placeholders})`).all(...entryIds) as Array<any>;

  const entriesWithLines = entries.map(entry => ({
    ...entry,
    lines: lines.filter(l => l.attendance_entry_id === entry.id),
  }));

  res.json(entriesWithLines);
});

// Create Attendance Entry (Atomic, safe, returns status 201 or actionable error)
apiRouter.post('/attendance', requireAuth, (req: Request, res: Response) => {
  const {
    date,
    teamId,
    locationProject,
    shiftBatch,
    inTime,
    outTime,
    overtimeHours,
    overtimeRate,
    overtimeAmount,
    remarks,
    lines,
    clientRequestId,
    selfMarkedLabourerIds,
    gpsCount,
    manualCount,
  } = req.body;

  if (!date || !teamId) {
    return res.status(400).json({ error: 'Date and Team ID are required.' });
  }

  // Idempotency: verify no duplicate entry submitted with same clientRequestId
  if (clientRequestId) {
    const existingReq = db.prepare('SELECT id FROM attendance_entries WHERE remarks LIKE ?').get(`%req:${clientRequestId}%`) as any;
    if (existingReq) {
      return res.status(200).json({ id: existingReq.id, success: true, message: 'Attendance already recorded.' });
    }
  }

  const weekBounds = getWeekBounds(date);
  const entryId = `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  // Status lifecycle:
  // If Master Admin creates it, it's immediately approved.
  // If Staff or Secondary Admin creates it, it enters pending_approval.
  const initialStatus = isMasterAdmin(req.user) ? 'approved' : 'pending_approval';
  const approverId = isMasterAdmin(req.user) ? req.user!.id : null;
  const approverName = isMasterAdmin(req.user) ? req.user!.fullName : null;
  const approvedAt = isMasterAdmin(req.user) ? now : null;

  const insertEntry = db.prepare(`
    INSERT INTO attendance_entries (
      id, week_start_date, team_id, date, location_project, shift_batch,
      in_time, out_time, overtime_hours, overtime_rate, overtime_amount,
      remarks, status, approved_by, approved_by_name, approved_at,
      owner_user_id, created_by, updated_by,
      self_marked_labourer_ids_json, gps_count, manual_count,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertLine = db.prepare(`
    INSERT INTO attendance_lines (
      id, attendance_entry_id, category_id, category_name, count, rate, rate_type,
      calculated_amount, final_amount, is_overridden, override_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    const transaction = db.transaction(() => {
      insertEntry.run(
        entryId,
        weekBounds.startDate,
        teamId,
        date,
        locationProject || null,
        shiftBatch || 'Regular',
        inTime || null,
        outTime || null,
        Number(overtimeHours) || 0,
        Number(overtimeRate) || 0,
        Number(overtimeAmount) || 0,
        remarks ? `${remarks} (req:${clientRequestId || 'direct'})` : `(req:${clientRequestId || 'direct'})`,
        initialStatus,
        approverId,
        approverName,
        approvedAt,
        req.user!.id,
        req.user!.id,
        req.user!.id,
        JSON.stringify(selfMarkedLabourerIds || []),
        Number(gpsCount) || 0,
        Number(manualCount) || 0,
        now,
        now
      );

      if (Array.isArray(lines)) {
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineId = `line-${entryId}-${i}`;
          const count = Math.max(0, parseInt(line.count, 10) || 0);
          const rate = Math.max(0, Number(line.rate) || 0);
          const calcAmt = round2(count * rate);
          const finalAmt = line.isOverridden && line.finalAmount !== undefined ? round2(Number(line.finalAmount)) : calcAmt;

          insertLine.run(
            lineId,
            entryId,
            line.categoryId,
            line.categoryName || 'Labour',
            count,
            rate,
            line.rateType || 'daily',
            calcAmt,
            finalAmt,
            line.isOverridden ? 1 : 0,
            line.overrideReason || null
          );
        }
      }

      // Link self-marked GPS records for this team and date
      if (Array.isArray(selfMarkedLabourerIds) && selfMarkedLabourerIds.length > 0) {
        const placeholders = selfMarkedLabourerIds.map(() => '?').join(',');
        db.prepare(`
          UPDATE labourer_attendance_records
          SET attendance_entry_id = ?, status = 'approved', approved_by = ?, approved_by_name = ?, approved_at = ?
          WHERE team_id = ? AND date = ? AND (id IN (${placeholders}) OR user_id IN (${placeholders}))
        `).run(entryId, req.user!.id, req.user!.fullName, now, teamId, date, ...selfMarkedLabourerIds, ...selfMarkedLabourerIds);
      }
    });

    transaction();

    // Notify assigned approver if pending
    if (initialStatus === 'pending_approval') {
      const assigned = db.prepare('SELECT secondary_admin_id FROM secondary_admin_assignments WHERE staff_user_id = ?').get(req.user!.id) as { secondary_admin_id: string } | undefined;
      const targetAdminId = assigned ? assigned.secondary_admin_id : 'usr-admin-01';
      createNotification({
        userId: targetAdminId,
        title: 'New Attendance Submission',
        message: `${req.user!.fullName} submitted attendance for ${date} awaiting your approval.`,
        type: 'approval',
        link: '/approvals',
      });
    }

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'CREATE_ATTENDANCE',
      entityType: 'attendance_entries',
      entityId: entryId,
      newValues: { date, teamId, linesCount: lines?.length, status: initialStatus },
    });

    res.status(201).json({ id: entryId, success: true, status: initialStatus, message: 'Attendance entry saved successfully.' });
  } catch (err: any) {
    console.error('[ATTENDANCE_SAVE_ERROR]', err.message);
    res.status(500).json({ error: err.message || 'Database error occurred while saving attendance.' });
  }
});

// Update Attendance Entry (With revision workflow and admin modification flags)
apiRouter.put('/attendance/:id', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    locationProject,
    shiftBatch,
    inTime,
    outTime,
    overtimeHours,
    overtimeRate,
    overtimeAmount,
    remarks,
    lines,
    changeReason,
    selfMarkedLabourerIds,
    gpsCount,
    manualCount,
  } = req.body;

  const currentEntry = db.prepare('SELECT * FROM attendance_entries WHERE id = ?').get(id) as any;
  if (!currentEntry) {
    return res.status(404).json({ error: 'Attendance entry not found.' });
  }

  // Permission check
  if (!isMasterAdmin(req.user) && currentEntry.owner_user_id !== req.user!.id && !canAccessStaff(req.user!, currentEntry.owner_user_id)) {
    return res.status(403).json({ error: 'You do not have permission to modify this attendance record.' });
  }

  const now = new Date().toISOString();

  // If entry is approved and edited by staff: MUST follow approval workflow!
  // It creates a proposed revision (status = 'change_pending_approval') with changeReason
  // The current approved values remain active in reports until approved.
  if (currentEntry.status === 'approved' && !isAdminAny(req.user)) {
    if (!changeReason || !changeReason.trim()) {
      return res.status(400).json({ error: 'A mandatory change reason is required when editing approved attendance.' });
    }

    const revisionData = {
      locationProject,
      shiftBatch,
      inTime,
      outTime,
      overtimeHours,
      overtimeRate,
      overtimeAmount,
      remarks,
      lines,
      selfMarkedLabourerIds,
      gpsCount,
      manualCount,
      requestedBy: req.user!.id,
      requestedByName: req.user!.fullName,
      requestedAt: now,
    };

    db.prepare(`
      UPDATE attendance_entries
      SET status = 'change_pending_approval',
          change_reason = ?,
          revision_data_json = ?,
          updated_by = ?,
          updated_at = ?
      WHERE id = ?
    `).run(changeReason.trim(), JSON.stringify(revisionData), req.user!.id, now, id);

    // Notify approver
    createNotification({
      userId: 'usr-admin-01',
      title: 'Attendance Change Request',
      message: `${req.user!.fullName} requested changes to approved attendance on ${currentEntry.date}. Reason: ${changeReason}`,
      type: 'approval',
      link: '/approvals',
    });

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'REQUEST_ATTENDANCE_CHANGE',
      entityType: 'attendance_entries',
      entityId: id,
      reason: changeReason,
      newValues: revisionData,
    });

    return res.json({ success: true, message: 'Proposed changes submitted for approval. Current approved version remains in effect until approved.' });
  }

  // If Admin edited it, or if it was still a draft/pending submission
  const isAdminEdit = isAdminAny(req.user) && req.user!.id !== currentEntry.owner_user_id;

  try {
    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE attendance_entries
        SET location_project = ?, shift_batch = ?, in_time = ?, out_time = ?,
            overtime_hours = ?, overtime_rate = ?, overtime_amount = ?, remarks = ?,
            admin_modified = ?, admin_modified_by = ?, admin_modified_at = ?, admin_modification_reason = ?,
            self_marked_labourer_ids_json = ?,
            gps_count = ?,
            manual_count = ?,
            updated_by = ?, updated_at = ?
        WHERE id = ?
      `).run(
        locationProject || null,
        shiftBatch || 'Regular',
        inTime || null,
        outTime || null,
        Number(overtimeHours) || 0,
        Number(overtimeRate) || 0,
        Number(overtimeAmount) || 0,
        remarks || null,
        isAdminEdit ? 1 : currentEntry.admin_modified,
        isAdminEdit ? req.user!.id : currentEntry.admin_modified_by,
        isAdminEdit ? now : currentEntry.admin_modified_at,
        isAdminEdit ? (changeReason || 'Administrator modified attendance values') : currentEntry.admin_modification_reason,
        selfMarkedLabourerIds !== undefined ? JSON.stringify(selfMarkedLabourerIds) : currentEntry.self_marked_labourer_ids_json,
        gpsCount !== undefined ? Number(gpsCount) : currentEntry.gps_count,
        manualCount !== undefined ? Number(manualCount) : currentEntry.manual_count,
        req.user!.id,
        now,
        id
      );

      if (Array.isArray(lines)) {
        db.prepare('DELETE FROM attendance_lines WHERE attendance_entry_id = ?').run(id);
        const insertLine = db.prepare(`
          INSERT INTO attendance_lines (
            id, attendance_entry_id, category_id, category_name, count, rate, rate_type,
            calculated_amount, final_amount, is_overridden, override_reason
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineId = `line-${id}-${i}-${Date.now().toString(36)}`;
          const count = Math.max(0, parseInt(line.count, 10) || 0);
          const rate = Math.max(0, Number(line.rate) || 0);
          const calcAmt = round2(count * rate);
          const finalAmt = line.isOverridden && line.finalAmount !== undefined ? round2(Number(line.finalAmount)) : calcAmt;

          insertLine.run(
            lineId,
            id,
            line.categoryId,
            line.categoryName || 'Labour',
            count,
            rate,
            line.rateType || 'daily',
            calcAmt,
            finalAmt,
            line.isOverridden ? 1 : 0,
            line.overrideReason || null
          );
        }
      }
    });

    transaction();

    // If admin altered staff's attendance, notify the staff member
    if (isAdminEdit) {
      createNotification({
        userId: currentEntry.owner_user_id,
        title: 'Attendance Modified by Administrator',
        message: `${req.user!.fullName} modified your attendance entry for ${currentEntry.date}. Reason: ${changeReason || 'Administrative update'}`,
        type: 'modification',
      });
    }

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'UPDATE_ATTENDANCE',
      entityType: 'attendance_entries',
      entityId: id,
      previousValues: currentEntry,
      newValues: { linesCount: lines?.length, adminModified: isAdminEdit },
      reason: changeReason,
    });

    res.json({ success: true, message: 'Attendance entry updated successfully.' });
  } catch (err: any) {
    console.error('[ATTENDANCE_UPDATE_ERROR]', err.message);
    res.status(500).json({ error: err.message || 'Failed to update attendance entry.' });
  }
});

// Approval Queue endpoint for authorized admins
apiRouter.get('/approvals/queue', requireAuth, requireAdmin, (req: Request, res: Response) => {
  // Master Admin only approves geo location requests; daily attendance muster roll approvals are handled exclusively by assigned secondary admins
  if (isMasterAdmin(req.user)) {
    return res.json([]);
  }

  const permittedStaff = getPermittedStaffIds(req.user!);

  let query = `
    SELECT e.*, u.full_name as staff_name, t.name as team_name
    FROM attendance_entries e
    JOIN users u ON e.owner_user_id = u.id
    JOIN teams t ON e.team_id = t.id
    WHERE e.is_deleted = 0 AND (e.status = 'pending_approval' OR e.status = 'change_pending_approval')
  `;
  const params: unknown[] = [];

  if (permittedStaff && permittedStaff.length > 0) {
    const placeholders = permittedStaff.map(() => '?').join(',');
    query += ` AND e.owner_user_id IN (${placeholders})`;
    params.push(...permittedStaff);
  }

  query += ' ORDER BY e.created_at ASC';
  const entries = db.prepare(query).all(...params) as Array<any>;

  const entryIds = entries.map(e => e.id);
  let lines: Array<any> = [];
  if (entryIds.length > 0) {
    const placeholders = entryIds.map(() => '?').join(',');
    lines = db.prepare(`SELECT * FROM attendance_lines WHERE attendance_entry_id IN (${placeholders})`).all(...entryIds) as Array<any>;
  }

  const result = entries.map(e => ({
    ...e,
    lines: lines.filter(l => l.attendance_entry_id === e.id),
    revisionData: e.revision_data_json ? JSON.parse(e.revision_data_json) : null,
  }));

  res.json(result);
});

// Approve Attendance or Proposed Revision
apiRouter.post('/attendance/:id/approve', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const entry = db.prepare('SELECT * FROM attendance_entries WHERE id = ?').get(id) as any;
  if (!entry) return res.status(404).json({ error: 'Attendance entry not found.' });

  // Approver cannot approve their own entry
  if (entry.owner_user_id === req.user!.id && !isMasterAdmin(req.user)) {
    return res.status(403).json({ error: 'You cannot approve your own attendance submission.' });
  }

  const now = new Date().toISOString();

  // If approving a proposed revision:
  if (entry.status === 'change_pending_approval' && entry.revision_data_json) {
    try {
      const revision = JSON.parse(entry.revision_data_json);
      const transaction = db.transaction(() => {
        db.prepare(`
          UPDATE attendance_entries
          SET location_project = ?, shift_batch = ?, in_time = ?, out_time = ?,
              overtime_hours = ?, overtime_rate = ?, overtime_amount = ?, remarks = ?,
              status = 'approved', approved_by = ?, approved_by_name = ?, approved_at = ?,
              revision_data_json = NULL, change_reason = NULL, updated_at = ?
          WHERE id = ?
        `).run(
          revision.locationProject || null,
          revision.shiftBatch || 'Regular',
          revision.inTime || null,
          revision.outTime || null,
          Number(revision.overtimeHours) || 0,
          Number(revision.overtimeRate) || 0,
          Number(revision.overtimeAmount) || 0,
          revision.remarks || null,
          req.user!.id,
          req.user!.fullName,
          now,
          now,
          id
        );

        if (Array.isArray(revision.lines)) {
          db.prepare('DELETE FROM attendance_lines WHERE attendance_entry_id = ?').run(id);
          const insertLine = db.prepare(`
            INSERT INTO attendance_lines (
              id, attendance_entry_id, category_id, category_name, count, rate, rate_type,
              calculated_amount, final_amount, is_overridden, override_reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (let i = 0; i < revision.lines.length; i++) {
            const line = revision.lines[i];
            const lineId = `line-${id}-${i}-${Date.now().toString(36)}`;
            insertLine.run(
              lineId,
              id,
              line.categoryId,
              line.categoryName || 'Labour',
              Math.max(0, parseInt(line.count, 10) || 0),
              Math.max(0, Number(line.rate) || 0),
              line.rateType || 'daily',
              line.calculatedAmount || 0,
              line.finalAmount || 0,
              line.isOverridden ? 1 : 0,
              line.overrideReason || null
            );
          }
        }
      });
      transaction();
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to apply revision: ' + err.message });
    }
  } else {
    // Normal approval
    db.prepare(`
      UPDATE attendance_entries
      SET status = 'approved', approved_by = ?, approved_by_name = ?, approved_at = ?, updated_at = ?
      WHERE id = ?
    `).run(req.user!.id, req.user!.fullName, now, now, id);
  }

  createNotification({
    userId: entry.owner_user_id,
    title: 'Attendance Approved',
    message: `Your attendance submission for ${entry.date} has been approved by ${req.user!.fullName}.`,
    type: 'approval',
  });

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'APPROVE_ATTENDANCE',
    entityType: 'attendance_entries',
    entityId: id,
  });

  res.json({ success: true, message: 'Attendance approved successfully.' });
});

// Reject Attendance or Proposed Revision
apiRouter.post('/attendance/:id/reject', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'A mandatory rejection reason is required.' });
  }

  const entry = db.prepare('SELECT * FROM attendance_entries WHERE id = ?').get(id) as any;
  if (!entry) return res.status(404).json({ error: 'Attendance entry not found.' });

  const now = new Date().toISOString();

  // If rejecting proposed revision, keep previous approved values!
  if (entry.status === 'change_pending_approval') {
    db.prepare(`
      UPDATE attendance_entries
      SET status = 'approved',
          revision_data_json = NULL,
          rejection_reason = ?,
          updated_at = ?
      WHERE id = ?
    `).run(`Revision rejected: ${reason.trim()}`, now, id);
  } else {
    db.prepare(`
      UPDATE attendance_entries
      SET status = 'rejected',
          rejection_reason = ?,
          updated_at = ?
      WHERE id = ?
    `).run(reason.trim(), now, id);
  }

  createNotification({
    userId: entry.owner_user_id,
    title: 'Attendance Rejected',
    message: `Your attendance submission for ${entry.date} was rejected. Reason: ${reason.trim()}`,
    type: 'rejection',
  });

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'REJECT_ATTENDANCE',
    entityType: 'attendance_entries',
    entityId: id,
    reason: reason.trim(),
  });

  res.json({ success: true, message: 'Attendance rejected.' });
});

apiRouter.delete('/attendance/:id', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const currentEntry = db.prepare('SELECT * FROM attendance_entries WHERE id = ?').get(id) as any;
  if (!currentEntry) {
    return res.status(404).json({ error: 'Attendance entry not found.' });
  }

  if (!isMasterAdmin(req.user) && currentEntry.owner_user_id !== req.user!.id) {
    return res.status(403).json({ error: 'Unauthorized to delete this record.' });
  }

  db.prepare('UPDATE attendance_entries SET is_deleted = 1, updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'DELETE_ATTENDANCE',
    entityType: 'attendance_entries',
    entityId: id,
    previousValues: currentEntry,
  });

  res.json({ success: true, message: 'Attendance entry deleted.' });
});

// =========================================================================
// 8. ADDITIONAL CHARGES & FINANCIAL ADJUSTMENTS
// =========================================================================
apiRouter.get('/charges', requireAuth, (req: Request, res: Response) => {
  const { weekStart, teamId, staffUserId, secondaryAdminId } = req.query;
  let query = `
    SELECT c.*, u.full_name as staff_name, t.name as team_name,
           COALESCE(sec.id, u.assigned_admin_id, 'head_office') as secondary_admin_id,
           COALESCE(sec.full_name, 'Head Office / Master Admin') as secondary_admin_name,
           COALESCE(sec.assigned_location, 'Head Office') as office_location,
           CASE
             WHEN sec.id IS NOT NULL THEN (COALESCE(sec.assigned_location, 'Branch') || ' Office (' || sec.full_name || ')')
             ELSE 'Head Office (Central)'
           END as office_name
    FROM additional_charges c
    JOIN users u ON c.owner_user_id = u.id
    JOIN teams t ON c.team_id = t.id
    LEFT JOIN secondary_admin_assignments saa ON saa.staff_user_id = u.id
    LEFT JOIN users sec ON (sec.id = saa.secondary_admin_id OR sec.id = u.assigned_admin_id)
    WHERE c.is_deleted = 0
  `;
  const params: unknown[] = [];

  if (!isMasterAdmin(req.user)) {
    if (isSecondaryAdmin(req.user)) {
      const permitted = getPermittedStaffIds(req.user!);
      if (permitted && permitted.length > 0) {
        query += ` AND c.owner_user_id IN (${permitted.map(() => '?').join(',')})`;
        params.push(...permitted);
      }
    } else {
      query += ' AND c.owner_user_id = ?';
      params.push(req.user!.id);
    }
  } else {
    if (secondaryAdminId && secondaryAdminId !== 'all') {
      if (secondaryAdminId === 'head_office') {
        query += ' AND (sec.id IS NULL OR sec.id = "head_office")';
      } else {
        query += ' AND (sec.id = ? OR u.assigned_admin_id = ?)';
        params.push(secondaryAdminId, secondaryAdminId);
      }
    }
    if (staffUserId) {
      query += ' AND c.owner_user_id = ?';
      params.push(staffUserId);
    }
  }

  if (weekStart) {
    query += ' AND c.week_start_date = ?';
    params.push(weekStart);
  }
  if (teamId) {
    query += ' AND c.team_id = ?';
    params.push(teamId);
  }

  query += ' ORDER BY c.created_at ASC';
  const charges = db.prepare(query).all(...params);
  res.json(charges);
});

apiRouter.post('/charges', requireAuth, (req: Request, res: Response) => {
  const {
    teamId,
    weekStartDate,
    date,
    category,
    description,
    quantity,
    unit,
    rate,
    amount,
    remarks,
    isOverridden,
    overrideReason,
  } = req.body;

  if (!teamId || !weekStartDate || !category || !description) {
    return res.status(400).json({ error: 'Team, week, category, and description are required.' });
  }

  const id = `chg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const qty = quantity !== undefined && quantity !== null && quantity !== '' ? Number(quantity) : null;
  const r = rate !== undefined && rate !== null && rate !== '' ? Number(rate) : null;

  let calculatedAmt = 0;
  if (qty !== null && r !== null) {
    calculatedAmt = round2(qty * r);
  } else {
    calculatedAmt = round2(Number(amount) || 0);
  }

  const finalAmt = isOverridden && amount !== undefined ? round2(Number(amount)) : calculatedAmt;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO additional_charges (
      id, team_id, week_start_date, date, category, description,
      quantity, unit, rate, calculated_amount, final_amount,
      is_overridden, override_reason, remarks, owner_user_id, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    teamId,
    weekStartDate,
    date || null,
    category.trim(),
    description.trim(),
    qty,
    unit || null,
    r,
    calculatedAmt,
    finalAmt,
    isOverridden ? 1 : 0,
    overrideReason || null,
    remarks || null,
    req.user!.id,
    req.user!.id,
    now
  );

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'CREATE_ADDITIONAL_CHARGE',
    entityType: 'additional_charges',
    entityId: id,
    newValues: { category, description, calculatedAmt, finalAmt },
  });

  res.status(201).json({ id, success: true, message: 'Additional charge added.' });
});

apiRouter.delete('/charges/:id', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const charge = db.prepare('SELECT * FROM additional_charges WHERE id = ?').get(id) as any;
  if (!charge) return res.status(404).json({ error: 'Charge not found.' });

  if (!isMasterAdmin(req.user) && charge.owner_user_id !== req.user!.id) {
    return res.status(403).json({ error: 'Unauthorized.' });
  }

  db.prepare('UPDATE additional_charges SET is_deleted = 1 WHERE id = ?').run(id);

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'DELETE_ADDITIONAL_CHARGE',
    entityType: 'additional_charges',
    entityId: id,
    previousValues: charge,
  });

  res.json({ success: true, message: 'Charge removed.' });
});

apiRouter.get('/adjustments', requireAuth, (req: Request, res: Response) => {
  const { weekStart, teamId, staffUserId, secondaryAdminId } = req.query;
  let query = `
    SELECT a.*, u.full_name as staff_name, t.name as team_name,
           COALESCE(sec.id, u.assigned_admin_id, 'head_office') as secondary_admin_id,
           COALESCE(sec.full_name, 'Head Office / Master Admin') as secondary_admin_name,
           COALESCE(sec.assigned_location, 'Head Office') as office_location,
           CASE
             WHEN sec.id IS NOT NULL THEN (COALESCE(sec.assigned_location, 'Branch') || ' Office (' || sec.full_name || ')')
             ELSE 'Head Office (Central)'
           END as office_name
    FROM financial_adjustments a
    JOIN users u ON a.owner_user_id = u.id
    JOIN teams t ON a.team_id = t.id
    LEFT JOIN secondary_admin_assignments saa ON saa.staff_user_id = u.id
    LEFT JOIN users sec ON (sec.id = saa.secondary_admin_id OR sec.id = u.assigned_admin_id)
    WHERE a.is_deleted = 0
  `;
  const params: unknown[] = [];

  if (!isMasterAdmin(req.user)) {
    if (isSecondaryAdmin(req.user)) {
      const permitted = getPermittedStaffIds(req.user!);
      if (permitted && permitted.length > 0) {
        query += ` AND a.owner_user_id IN (${permitted.map(() => '?').join(',')})`;
        params.push(...permitted);
      }
    } else {
      query += ' AND a.owner_user_id = ?';
      params.push(req.user!.id);
    }
  } else {
    if (secondaryAdminId && secondaryAdminId !== 'all') {
      if (secondaryAdminId === 'head_office') {
        query += ' AND (sec.id IS NULL OR sec.id = "head_office")';
      } else {
        query += ' AND (sec.id = ? OR u.assigned_admin_id = ?)';
        params.push(secondaryAdminId, secondaryAdminId);
      }
    }
    if (staffUserId) {
      query += ' AND a.owner_user_id = ?';
      params.push(staffUserId);
    }
  }

  if (weekStart) {
    query += ' AND a.week_start_date = ?';
    params.push(weekStart);
  }
  if (teamId) {
    query += ' AND a.team_id = ?';
    params.push(teamId);
  }

  query += ' ORDER BY a.date ASC, a.created_at ASC';
  const adjustments = db.prepare(query).all(...params);
  res.json(adjustments);
});

apiRouter.post('/adjustments', requireAuth, (req: Request, res: Response) => {
  const {
    teamId,
    weekStartDate,
    date,
    adjustmentType,
    description,
    amount,
    ratePercentage,
    baseAmount,
  } = req.body;

  if (!teamId || !weekStartDate || !adjustmentType || !description || amount === undefined) {
    return res.status(400).json({ error: 'Team, week, type, description, and amount are required.' });
  }

  const id = `adj-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO financial_adjustments (
      id, team_id, week_start_date, date, adjustment_type, description,
      amount, rate_percentage, base_amount, owner_user_id, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    teamId,
    weekStartDate,
    date || getTodayKolkataISO(),
    adjustmentType,
    description.trim(),
    round2(Number(amount)),
    ratePercentage ? Number(ratePercentage) : null,
    baseAmount ? Number(baseAmount) : null,
    req.user!.id,
    req.user!.id,
    now
  );

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'CREATE_FINANCIAL_ADJUSTMENT',
    entityType: 'financial_adjustments',
    entityId: id,
    newValues: { adjustmentType, description, amount },
  });

  res.status(201).json({ id, success: true, message: 'Adjustment saved.' });
});

apiRouter.delete('/adjustments/:id', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const adj = db.prepare('SELECT * FROM financial_adjustments WHERE id = ?').get(id) as any;
  if (!adj) return res.status(404).json({ error: 'Adjustment not found.' });

  if (!isMasterAdmin(req.user) && adj.owner_user_id !== req.user!.id) {
    return res.status(403).json({ error: 'Unauthorized.' });
  }

  db.prepare('UPDATE financial_adjustments SET is_deleted = 1 WHERE id = ?').run(id);

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'DELETE_FINANCIAL_ADJUSTMENT',
    entityType: 'financial_adjustments',
    entityId: id,
    previousValues: adj,
  });

  res.json({ success: true, message: 'Adjustment removed.' });
});

// =========================================================================
// 9. SUPPLIER & CONTRACTOR BILLS
// =========================================================================
apiRouter.get('/supplier-bills', requireAuth, (req: Request, res: Response) => {
  const { weekStart } = req.query;
  let query = 'SELECT * FROM supplier_bills WHERE is_deleted = 0';
  const params: unknown[] = [];
  if (weekStart) {
    query += ' AND week_start_date = ?';
    params.push(weekStart);
  }
  const bills = db.prepare(query).all(...params);
  res.json(bills);
});

apiRouter.post('/supplier-bills', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const { weekStartDate, supplierName, workDescription, grossAmount, advancePaid, remarks } = req.body;
  if (!weekStartDate || !supplierName || !workDescription || grossAmount === undefined) {
    return res.status(400).json({ error: 'Parameters missing.' });
  }

  const id = `sb-${Date.now()}`;
  const now = new Date().toISOString();
  const gross = round2(Number(grossAmount));
  const advance = round2(Number(advancePaid) || 0);
  const netPayable = round2(gross - advance);

  db.prepare(`
    INSERT INTO supplier_bills (
      id, week_start_date, supplier_name, work_description, gross_amount, advance_paid, net_payable, remarks, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, weekStartDate, supplierName.trim(), workDescription.trim(), gross, advance, netPayable, remarks || null, req.user!.id, now);

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'CREATE_SUPPLIER_BILL',
    entityType: 'supplier_bills',
    entityId: id,
    newValues: { supplierName, gross, advance, netPayable },
  });

  res.status(201).json({ id, grossAmount: gross, advancePaid: advance, netPayable });
});

apiRouter.delete('/supplier-bills/:id', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const bill = db.prepare('SELECT * FROM supplier_bills WHERE id = ?').get(id);
  if (!bill) return res.status(404).json({ error: 'Bill not found.' });

  db.prepare('UPDATE supplier_bills SET is_deleted = 1 WHERE id = ?').run(id);
  res.json({ success: true, message: 'Supplier bill removed.' });
});

// =========================================================================
// 10. ATTACHMENT & DOCUMENT MANAGEMENT
// =========================================================================
apiRouter.get('/attachments', requireAuth, (req: Request, res: Response) => {
  const { recordType, recordId, staffUserId, teamId, weekStart } = req.query;
  let query = 'SELECT a.*, u.full_name as owner_name FROM attachments a JOIN users u ON a.owner_user_id = u.id WHERE 1=1';
  const params: unknown[] = [];

  if (!isMasterAdmin(req.user)) {
    if (isSecondaryAdmin(req.user)) {
      const permitted = getPermittedStaffIds(req.user!);
      if (permitted && permitted.length > 0) {
        query += ` AND a.owner_user_id IN (${permitted.map(() => '?').join(',')})`;
        params.push(...permitted);
      }
    } else {
      query += ' AND a.owner_user_id = ?';
      params.push(req.user!.id);
    }
  } else if (staffUserId) {
    query += ' AND a.owner_user_id = ?';
    params.push(staffUserId);
  }

  if (recordType) {
    query += ' AND a.record_type = ?';
    params.push(recordType);
  }
  if (recordId) {
    query += ' AND a.record_id = ?';
    params.push(recordId);
  }
  if (teamId) {
    query += ' AND a.team_id = ?';
    params.push(teamId);
  }
  if (weekStart) {
    query += ' AND a.week_start_date = ?';
    params.push(weekStart);
  }

  query += ' ORDER BY a.created_at DESC';
  const list = db.prepare(query).all(...params);
  res.json(list);
});

apiRouter.post('/attachments', requireAuth, (req: Request, res: Response) => {
  const {
    recordType = 'general',
    recordId,
    fileName,
    fileSize,
    mimeType,
    fileDataBase64,
    description,
    teamId,
    date,
    weekStartDate,
  } = req.body;

  if (!fileName || !fileDataBase64) {
    return res.status(400).json({ error: 'File name and file content are required.' });
  }

  // Validate allowed extensions
  const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.xlsx', '.xls'];
  const ext = path.extname(fileName).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    return res.status(400).json({ error: 'Only PDF, JPG, PNG, and XLSX files are supported.' });
  }

  const id = `attch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const storedFilename = `${id}${ext}`;
  const localFilePath = path.join(uploadsDir, storedFilename);

  // Write base64 buffer to disk
  try {
    const buffer = Buffer.from(fileDataBase64.replace(/^data:.*?;base64,/, ''), 'base64');
    fs.writeFileSync(localFilePath, buffer);

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO attachments (
        id, record_type, record_id, file_name, file_size, mime_type, file_path, description,
        owner_user_id, uploaded_by, uploaded_by_name, team_id, date, week_start_date, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      recordType,
      recordId || null,
      fileName,
      fileSize || buffer.length,
      mimeType || 'application/octet-stream',
      storedFilename,
      description || null,
      req.user!.id,
      req.user!.id,
      req.user!.fullName,
      teamId || null,
      date || null,
      weekStartDate || null,
      now
    );

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'UPLOAD_ATTACHMENT',
      entityType: 'attachments',
      entityId: id,
      newValues: { fileName, recordType, recordId },
    });

    res.status(201).json({ id, fileName, success: true, message: 'Attachment saved successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save attachment file: ' + err.message });
  }
});

apiRouter.get('/attachments/:id/download', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as any;
  if (!attachment) return res.status(404).json({ error: 'Attachment not found.' });

  // Security check: staff cannot access another staff member's attachment
  if (!canAccessStaff(req.user!, attachment.owner_user_id)) {
    return res.status(403).json({ error: 'Unauthorized to download this attachment.' });
  }

  const fullPath = path.join(uploadsDir, attachment.file_path);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'Physical file not found.' });
  }

  res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${attachment.file_name}"`);
  const stream = fs.createReadStream(fullPath);
  stream.pipe(res);
});

apiRouter.delete('/attachments/:id', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as any;
  if (!attachment) return res.status(404).json({ error: 'Attachment not found.' });

  if (!isMasterAdmin(req.user) && attachment.owner_user_id !== req.user!.id) {
    return res.status(403).json({ error: 'Unauthorized to delete this attachment.' });
  }

  try {
    const fullPath = path.join(uploadsDir, attachment.file_path);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch {}

  db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
  res.json({ success: true, message: 'Attachment removed.' });
});

// =========================================================================
// 11. WEEKLY PAYMENTS & PAYMENT TRACKER
// =========================================================================
apiRouter.get('/payments', requireAuth, (req: Request, res: Response) => {
  const { weekStart, teamId, status, staffUserId, secondaryAdminId } = req.query;

  let query = `
    SELECT p.*, t.name as team_name, u.full_name as staff_name,
           COALESCE(sec.id, u.assigned_admin_id, 'head_office') as secondary_admin_id,
           COALESCE(sec.full_name, 'Head Office / Master Admin') as secondary_admin_name,
           COALESCE(sec.assigned_location, 'Head Office') as office_location,
           CASE
             WHEN sec.id IS NOT NULL THEN (COALESCE(sec.assigned_location, 'Branch') || ' Office (' || sec.full_name || ')')
             ELSE 'Head Office (Central)'
           END as office_name
    FROM weekly_payments p
    JOIN teams t ON p.team_id = t.id
    JOIN users u ON p.staff_user_id = u.id
    LEFT JOIN secondary_admin_assignments saa ON saa.staff_user_id = u.id
    LEFT JOIN users sec ON (sec.id = saa.secondary_admin_id OR sec.id = u.assigned_admin_id)
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (!isMasterAdmin(req.user)) {
    if (isSecondaryAdmin(req.user)) {
      const permitted = getPermittedStaffIds(req.user!);
      if (permitted && permitted.length > 0) {
        query += ` AND p.staff_user_id IN (${permitted.map(() => '?').join(',')})`;
        params.push(...permitted);
      }
    } else {
      query += ' AND p.staff_user_id = ?';
      params.push(req.user!.id);
    }
  } else {
    // Master admin can filter by secondaryAdminId / office or staff
    if (secondaryAdminId && secondaryAdminId !== 'all') {
      if (secondaryAdminId === 'head_office') {
        query += ' AND (sec.id IS NULL AND (u.assigned_admin_id IS NULL OR u.assigned_admin_id = req.user.id))';
      } else {
        query += ' AND (sec.id = ? OR u.assigned_admin_id = ?)';
        params.push(secondaryAdminId, secondaryAdminId);
      }
    }
    if (staffUserId) {
      query += ' AND p.staff_user_id = ?';
      params.push(staffUserId);
    }
  }

  if (weekStart) {
    query += ' AND p.week_start_date = ?';
    params.push(weekStart);
  }
  if (teamId) {
    query += ' AND p.team_id = ?';
    params.push(teamId);
  }
  if (status) {
    query += ' AND p.status = ?';
    params.push(status);
  }

  query += ' ORDER BY p.week_start_date DESC, p.created_at DESC';
  const payments = db.prepare(query).all(...params);
  res.json(payments);
});

// Mark as Paid or Partial Payment for a Team's Weekly Report (Accessible by Staff for their records, and Admin with override authority)
apiRouter.post('/payments/mark-paid', requireAuth, (req: Request, res: Response) => {
  const {
    weekStartDate,
    teamId,
    staffUserId,
    grossAmount = 0,
    chargesAmount = 0,
    deductionsAmount = 0,
    netPayable = 0,
    amountPaid = 0,
    paymentDate,
    paymentMethod = 'Bank Transfer',
    voucherRef,
    voucherAttachmentId,
    notes,
  } = req.body;

  if (!weekStartDate || !teamId || !staffUserId || amountPaid === undefined) {
    return res.status(400).json({ error: 'Week, team, staff, and payment amount are required.' });
  }

  // Permission check: Staff can update payment for their own records; Secondary Admin for their scope; Master Admin for anyone
  if (!isAdminAny(req.user) && req.user!.id !== staffUserId) {
    return res.status(403).json({ error: 'Permission denied to record payment for this staff account.' });
  }

  const net = round2(Number(netPayable));
  const paid = round2(Number(amountPaid));
  let status = 'Pending';
  if (paid >= net && net > 0) {
    status = 'Paid';
  } else if (paid > 0) {
    status = 'Partially Paid';
  } else {
    status = 'Not Paid';
  }

  const id = `pmt-${weekStartDate}-${teamId}-${staffUserId}`;
  const now = new Date().toISOString();
  const isOverride = isAdminAny(req.user) && req.user!.id !== staffUserId;

  db.prepare(`
    INSERT INTO weekly_payments (
      id, week_start_date, team_id, staff_user_id, gross_amount, charges_amount,
      deductions_amount, net_payable, amount_paid, status, payment_date,
      payment_method, voucher_ref, voucher_attachment_id, notes, marked_by, marked_by_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(week_start_date, team_id, staff_user_id) DO UPDATE SET
      gross_amount = excluded.gross_amount,
      charges_amount = excluded.charges_amount,
      deductions_amount = excluded.deductions_amount,
      net_payable = excluded.net_payable,
      amount_paid = excluded.amount_paid,
      status = excluded.status,
      payment_date = excluded.payment_date,
      payment_method = excluded.payment_method,
      voucher_ref = excluded.voucher_ref,
      voucher_attachment_id = excluded.voucher_attachment_id,
      notes = excluded.notes,
      marked_by = excluded.marked_by,
      marked_by_name = excluded.marked_by_name,
      updated_at = excluded.updated_at
  `).run(
    id,
    weekStartDate,
    teamId,
    staffUserId,
    round2(Number(grossAmount)),
    round2(Number(chargesAmount)),
    round2(Number(deductionsAmount)),
    net,
    paid,
    status,
    paymentDate || getTodayKolkataISO(),
    paymentMethod,
    voucherRef || null,
    voucherAttachmentId || null,
    notes || null,
    req.user!.id,
    req.user!.fullName,
    now,
    now
  );

  createNotification({
    userId: staffUserId,
    title: isOverride ? 'Payment Override Recorded' : 'Payment Status Updated',
    message: `Payment for week starting ${weekStartDate} has been recorded as ${status} (₹${paid} settled).`,
    type: 'payment',
  });

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: isOverride ? 'ADMIN_OVERRIDE_PAYMENT' : 'MARK_WEEKLY_PAYMENT',
    entityType: 'weekly_payments',
    entityId: id,
    newValues: { status, amountPaid: paid, netPayable: net, voucherRef },
    reason: isOverride ? 'Admin payment override / settlement modification' : 'Payment recorded by operations staff',
  });

  res.json({ success: true, status, amountPaid: paid, netPayable: net, message: `Payment recorded as ${status}.` });
});

// Historical unpaid balances across prior weeks
apiRouter.get('/payments/historical-outstanding', requireAuth, (req: Request, res: Response) => {
  const { currentWeekStart, staffUserId } = req.query;

  let query = `
    SELECT p.*, t.name as team_name, u.full_name as staff_name
    FROM weekly_payments p
    JOIN teams t ON p.team_id = t.id
    JOIN users u ON p.staff_user_id = u.id
    WHERE (p.status = 'Pending' OR p.status = 'Partially Paid' OR p.status = 'Not Paid')
  `;
  const params: unknown[] = [];

  if (currentWeekStart) {
    query += ' AND p.week_start_date < ?';
    params.push(currentWeekStart);
  }

  if (!isMasterAdmin(req.user)) {
    if (isSecondaryAdmin(req.user)) {
      const permitted = getPermittedStaffIds(req.user!);
      if (permitted && permitted.length > 0) {
        query += ` AND p.staff_user_id IN (${permitted.map(() => '?').join(',')})`;
        params.push(...permitted);
      }
    } else {
      query += ' AND p.staff_user_id = ?';
      params.push(req.user!.id);
    }
  } else if (staffUserId) {
    query += ' AND p.staff_user_id = ?';
    params.push(staffUserId);
  }

  query += ' ORDER BY p.week_start_date ASC';
  const outstanding = db.prepare(query).all(...params);
  res.json(outstanding);
});

// =========================================================================
// 12. MASTER-ADMIN & OFFICE-WISE ACCOUNTS LEDGER (ROLE-BASED & OFFICE ISOLATION)
// =========================================================================
apiRouter.get('/office-ledger', requireAuth, (req: Request, res: Response) => {
  if (!isMasterAdmin(req.user) && !canAccessFinanceModule(req.user!, 'office_ledger')) {
    return res.status(403).json({ error: 'Access restricted to Master Administrator or authorized accounts managers.' });
  }

  const { startDate, endDate, category, secondaryAdminId } = req.query;
  let query = `
    SELECT l.*,
           COALESCE(l.office_name, 'Head Office (Central)') as office_name,
           COALESCE(u.full_name, 'Administrator') as created_by_name,
           COALESCE(sec.full_name, 'Head Office / Master Admin') as secondary_admin_name
    FROM office_ledger_entries l
    LEFT JOIN users u ON l.created_by = u.id
    LEFT JOIN users sec ON l.secondary_admin_id = sec.id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (isSecondaryAdmin(req.user)) {
    // Secondary admin sees exclusively their own office ledger records
    query += ' AND (l.secondary_admin_id = ? OR (l.created_by = ? AND (l.secondary_admin_id IS NULL OR l.secondary_admin_id = ?)))';
    params.push(req.user!.id, req.user!.id, req.user!.id);
  } else if (secondaryAdminId && secondaryAdminId !== 'all') {
    if (secondaryAdminId === 'head_office') {
      query += " AND (l.secondary_admin_id = 'head_office' OR l.secondary_admin_id IS NULL)";
    } else {
      query += ' AND l.secondary_admin_id = ?';
      params.push(secondaryAdminId);
    }
  }

  if (startDate) {
    query += ' AND l.entry_date >= ?';
    params.push(startDate);
  }
  if (endDate) {
    query += ' AND l.entry_date <= ?';
    params.push(endDate);
  }
  if (category) {
    query += ' AND l.category = ?';
    params.push(category);
  }

  query += ' ORDER BY l.entry_date ASC, l.created_at ASC';
  const entries = db.prepare(query).all(...params) as Array<any>;

  // Compute running balance dynamically
  let running = 0;
  const withRunning = entries.map(e => {
    if (e.entry_type === 'credit') {
      running = round2(running + e.amount);
    } else {
      running = round2(running - e.amount);
    }
    return { ...e, runningBalance: running };
  });

  // Calculate office breakdowns for master admin
  let officeBreakdowns: any[] = [];
  if (isMasterAdmin(req.user)) {
    const allOfficeRows = db.prepare(`
      SELECT l.secondary_admin_id, l.entry_type, l.amount, l.office_name, sec.full_name as sec_name
      FROM office_ledger_entries l
      LEFT JOIN users sec ON l.secondary_admin_id = sec.id
    `).all() as Array<any>;

    const breakdownMap = new Map<string, { officeId: string; officeName: string; adminName: string; totalCredit: number; totalDebit: number; netBalance: number; count: number }>();

    // Ensure Head Office exists
    breakdownMap.set('head_office', {
      officeId: 'head_office',
      officeName: 'Head Office (Central)',
      adminName: 'Master Administrator',
      totalCredit: 0,
      totalDebit: 0,
      netBalance: 0,
      count: 0,
    });

    const secAdmins = db.prepare("SELECT id, full_name, assigned_location FROM users WHERE role = 'secondary_admin'").all() as Array<any>;
    secAdmins.forEach(s => {
      breakdownMap.set(s.id, {
        officeId: s.id,
        officeName: s.assigned_location ? `${s.assigned_location} Office (${s.full_name})` : `${s.full_name} Office`,
        adminName: s.full_name,
        totalCredit: 0,
        totalDebit: 0,
        netBalance: 0,
        count: 0,
      });
    });

    allOfficeRows.forEach(row => {
      const key = (row.secondary_admin_id && row.secondary_admin_id !== 'head_office') ? row.secondary_admin_id : 'head_office';
      if (!breakdownMap.has(key)) {
        breakdownMap.set(key, {
          officeId: key,
          officeName: row.office_name || 'Branch Office',
          adminName: row.sec_name || 'Secondary Admin',
          totalCredit: 0,
          totalDebit: 0,
          netBalance: 0,
          count: 0,
        });
      }
      const b = breakdownMap.get(key)!;
      b.count++;
      if (row.entry_type === 'credit') {
        b.totalCredit = round2(b.totalCredit + row.amount);
        b.netBalance = round2(b.netBalance + row.amount);
      } else {
        b.totalDebit = round2(b.totalDebit + row.amount);
        b.netBalance = round2(b.netBalance - row.amount);
      }
    });

    officeBreakdowns = Array.from(breakdownMap.values());
  }

  res.json({
    entries: withRunning,
    officeBreakdowns: isMasterAdmin(req.user) ? officeBreakdowns : undefined,
    currentBalance: running,
  });
});

apiRouter.post('/office-ledger', requireAuth, (req: Request, res: Response) => {
  if (!isMasterAdmin(req.user) && !canAccessFinanceModule(req.user!, 'office_ledger')) {
    return res.status(403).json({ error: 'Access restricted to Master Administrator or authorized accounts managers.' });
  }

  const {
    entryDate,
    referenceNo,
    category,
    description,
    entryType, // 'debit' or 'credit'
    amount,
    paymentMode,
    relatedTeamId,
    relatedStaffId,
    notes,
    secondaryAdminId,
    officeName: customOfficeName,
  } = req.body;

  if (!entryDate || !category || !description || !entryType || amount === undefined) {
    return res.status(400).json({ error: 'Date, category, description, entry type, and amount are required.' });
  }

  const id = `ledg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  let targetSecAdminId = 'head_office';
  let targetOfficeName = 'Head Office (Central)';

  if (isSecondaryAdmin(req.user)) {
    targetSecAdminId = req.user!.id;
    targetOfficeName = req.user!.assignedLocation ? `${req.user!.assignedLocation} Office` : `${req.user!.fullName} Office`;
  } else if (secondaryAdminId && secondaryAdminId !== 'head_office') {
    targetSecAdminId = secondaryAdminId;
    const secUser = db.prepare('SELECT full_name, assigned_location FROM users WHERE id = ?').get(secondaryAdminId) as any;
    if (secUser) {
      targetOfficeName = secUser.assigned_location ? `${secUser.assigned_location} Office (${secUser.full_name})` : `${secUser.full_name} Office`;
    }
  }
  if (customOfficeName) targetOfficeName = customOfficeName;

  db.prepare(`
    INSERT INTO office_ledger_entries (
      id, entry_date, reference_no, category, description, entry_type, amount,
      payment_mode, related_team_id, related_staff_id, notes, created_by, created_at,
      secondary_admin_id, office_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    entryDate,
    referenceNo || null,
    category.trim(),
    description.trim(),
    entryType,
    round2(Number(amount)),
    paymentMode || 'Bank Transfer',
    relatedTeamId || null,
    relatedStaffId || null,
    notes || null,
    req.user!.id,
    now,
    targetSecAdminId,
    targetOfficeName
  );

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'CREATE_OFFICE_LEDGER_ENTRY',
    entityType: 'office_ledger_entries',
    entityId: id,
    newValues: { category, entryType, amount, officeName: targetOfficeName },
  });

  res.status(201).json({ id, success: true, message: 'Ledger entry recorded.' });
});

// =========================================================================
// 13. EXCEL-BASED PETTY CASH MODULE ("Petty Cash - Oct 2026" / "for software.xlsx")
// =========================================================================
apiRouter.get('/petty-cash', requireAuth, (req: Request, res: Response) => {
  if (!isMasterAdmin(req.user) && !canAccessFinanceModule(req.user!, 'petty_cash')) {
    return res.status(403).json({ error: 'Access restricted to authorized administrators.' });
  }

  const { month, year, date, secondaryAdminId } = req.query;

  // Determine target office
  let targetSecAdminId: string | null = null;
  if (isSecondaryAdmin(req.user)) {
    targetSecAdminId = req.user!.id;
  } else if (secondaryAdminId && secondaryAdminId !== 'all') {
    targetSecAdminId = String(secondaryAdminId);
  }

  // Retrieve configured opening balances for target office
  let openingKey = 'petty_cash_opening';
  let defaultAccount = 75000;
  let defaultHand = 25000;

  if (targetSecAdminId && targetSecAdminId !== 'head_office') {
    openingKey = `petty_cash_opening_${targetSecAdminId}`;
    defaultAccount = 0;
    defaultHand = 0;
  }

  const openingRow = db.prepare("SELECT value_json FROM company_settings WHERE key = ?").get(openingKey) as { value_json: string } | undefined;
  const openingConfig = openingRow ? JSON.parse(openingRow.value_json) : { openingInAccount: defaultAccount, openingInHand: defaultHand };

  let query = `
    SELECT p.*,
           COALESCE(p.office_name, 'Head Office (Central)') as office_name,
           COALESCE(u.full_name, 'Administrator') as created_by_name,
           COALESCE(sec.full_name, 'Head Office / Master Admin') as secondary_admin_name
    FROM petty_cash_entries p
    LEFT JOIN users u ON p.created_by = u.id
    LEFT JOIN users sec ON p.secondary_admin_id = sec.id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (targetSecAdminId) {
    if (targetSecAdminId === 'head_office') {
      query += " AND (p.secondary_admin_id = 'head_office' OR p.secondary_admin_id IS NULL)";
    } else {
      query += ' AND (p.secondary_admin_id = ? OR (p.created_by = ? AND p.secondary_admin_id IS NULL))';
      params.push(targetSecAdminId, targetSecAdminId);
    }
  }

  if (date) {
    query += ' AND p.date = ?';
    params.push(date);
  } else if (month && year) {
    const mStr = String(month).padStart(2, '0');
    query += ' AND p.date >= ? AND p.date <= ?';
    params.push(`${year}-${mStr}-01`);
    params.push(`${year}-${mStr}-31`);
  }

  query += ' ORDER BY p.date ASC, p.serial_no ASC, p.created_at ASC';
  const entries = db.prepare(query).all(...params) as Array<any>;

  let runningAccount = openingConfig.openingInAccount || 0;
  let runningHand = openingConfig.openingInHand || 0;

  const enrichedEntries = entries.map(e => {
    const cred = round2(Number(e.credit_amount) || 0);
    const deb = round2(Number(e.debit_amount) || 0);
    const online = round2(Number(e.online_amount) || 0);

    if (e.channel === 'online' || e.channel === 'account') {
      runningAccount = round2(runningAccount + cred - deb);
    } else {
      runningHand = round2(runningHand + cred - deb);
    }

    const dayBal = round2(cred - deb);

    return {
      ...e,
      dayBalance: dayBal,
      cashInAccount: runningAccount,
      cashInHand: runningHand,
      totalFunds: round2(runningAccount + runningHand),
    };
  });

  // Calculate office breakdowns for master admin
  let officeBreakdowns: any[] = [];
  if (isMasterAdmin(req.user)) {
    const allPettyRows = db.prepare(`
      SELECT p.secondary_admin_id, p.credit_amount, p.debit_amount, p.channel, p.office_name, sec.full_name as sec_name
      FROM petty_cash_entries p
      LEFT JOIN users sec ON p.secondary_admin_id = sec.id
    `).all() as Array<any>;

    const breakdownMap = new Map<string, { officeId: string; officeName: string; adminName: string; accountBalance: number; handBalance: number; totalFunds: number; entryCount: number }>();

    // Head office opening
    const headOpeningRow = db.prepare("SELECT value_json FROM company_settings WHERE key = 'petty_cash_opening'").get() as any;
    const headOpening = headOpeningRow ? JSON.parse(headOpeningRow.value_json) : { openingInAccount: 75000, openingInHand: 25000 };
    breakdownMap.set('head_office', {
      officeId: 'head_office',
      officeName: 'Head Office (Central)',
      adminName: 'Master Administrator',
      accountBalance: headOpening.openingInAccount || 0,
      handBalance: headOpening.openingInHand || 0,
      totalFunds: round2((headOpening.openingInAccount || 0) + (headOpening.openingInHand || 0)),
      entryCount: 0,
    });

    const secAdmins = db.prepare("SELECT id, full_name, assigned_location FROM users WHERE role = 'secondary_admin'").all() as Array<any>;
    secAdmins.forEach(s => {
      const secOpenRow = db.prepare("SELECT value_json FROM company_settings WHERE key = ?").get(`petty_cash_opening_${s.id}`) as any;
      const secOpen = secOpenRow ? JSON.parse(secOpenRow.value_json) : { openingInAccount: 0, openingInHand: 0 };
      breakdownMap.set(s.id, {
        officeId: s.id,
        officeName: s.assigned_location ? `${s.assigned_location} Office (${s.full_name})` : `${s.full_name} Office`,
        adminName: s.full_name,
        accountBalance: secOpen.openingInAccount || 0,
        handBalance: secOpen.openingInHand || 0,
        totalFunds: round2((secOpen.openingInAccount || 0) + (secOpen.openingInHand || 0)),
        entryCount: 0,
      });
    });

    allPettyRows.forEach(row => {
      const key = (row.secondary_admin_id && row.secondary_admin_id !== 'head_office') ? row.secondary_admin_id : 'head_office';
      if (!breakdownMap.has(key)) {
        breakdownMap.set(key, {
          officeId: key,
          officeName: row.office_name || 'Branch Office',
          adminName: row.sec_name || 'Secondary Admin',
          accountBalance: 0,
          handBalance: 0,
          totalFunds: 0,
          entryCount: 0,
        });
      }
      const b = breakdownMap.get(key)!;
      b.entryCount++;
      const cred = round2(Number(row.credit_amount) || 0);
      const deb = round2(Number(row.debit_amount) || 0);
      if (row.channel === 'online' || row.channel === 'account') {
        b.accountBalance = round2(b.accountBalance + cred - deb);
      } else {
        b.handBalance = round2(b.handBalance + cred - deb);
      }
      b.totalFunds = round2(b.accountBalance + b.handBalance);
    });

    officeBreakdowns = Array.from(breakdownMap.values());
  }

  res.json({
    openingBalances: openingConfig,
    entries: enrichedEntries,
    currentAccountBalance: runningAccount,
    currentHandBalance: runningHand,
    totalAvailableFunds: round2(runningAccount + runningHand),
    officeBreakdowns: isMasterAdmin(req.user) ? officeBreakdowns : undefined,
    office: isSecondaryAdmin(req.user) ? {
      id: req.user!.id,
      name: req.user!.assignedLocation ? `${req.user!.assignedLocation} Office` : `${req.user!.fullName} Office`,
      adminName: req.user!.fullName,
    } : undefined,
  });
});

apiRouter.post('/petty-cash', requireAuth, (req: Request, res: Response) => {
  if (!isMasterAdmin(req.user) && !canAccessFinanceModule(req.user!, 'petty_cash')) {
    return res.status(403).json({ error: 'Access restricted to authorized administrators.' });
  }

  const {
    date,
    serialNo,
    description,
    creditAmount = 0,
    debitAmount = 0,
    onlineAmount = 0,
    channel = 'cash',
    relatedTeamId,
    relatedStaffId,
    notes,
    secondaryAdminId,
    officeName: customOfficeName,
  } = req.body;

  if (!date || !description) {
    return res.status(400).json({ error: 'Date and description are required.' });
  }

  const id = `pc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  const cAmt = round2(Number(creditAmount) || 0);
  const dAmt = round2(Number(debitAmount) || 0);
  const onl = round2(Number(onlineAmount) || 0);

  let targetSecAdminId = 'head_office';
  let targetOfficeName = 'Head Office (Central)';

  if (isSecondaryAdmin(req.user)) {
    targetSecAdminId = req.user!.id;
    targetOfficeName = req.user!.assignedLocation ? `${req.user!.assignedLocation} Office` : `${req.user!.fullName} Office`;
  } else if (secondaryAdminId && secondaryAdminId !== 'head_office') {
    targetSecAdminId = secondaryAdminId;
    const secUser = db.prepare('SELECT full_name, assigned_location FROM users WHERE id = ?').get(secondaryAdminId) as any;
    if (secUser) {
      targetOfficeName = secUser.assigned_location ? `${secUser.assigned_location} Office (${secUser.full_name})` : `${secUser.full_name} Office`;
    }
  }
  if (customOfficeName) targetOfficeName = customOfficeName;

  db.prepare(`
    INSERT INTO petty_cash_entries (
      id, date, serial_no, description, credit_amount, debit_amount, online_amount,
      channel, related_team_id, related_staff_id, notes, created_by, created_at, updated_at,
      secondary_admin_id, office_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    date,
    serialNo || null,
    description.trim(),
    cAmt,
    dAmt,
    onl,
    channel,
    relatedTeamId || null,
    relatedStaffId || null,
    notes || null,
    req.user!.id,
    now,
    now,
    targetSecAdminId,
    targetOfficeName
  );

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'CREATE_PETTY_CASH_ENTRY',
    entityType: 'petty_cash_entries',
    entityId: id,
    newValues: { date, description, creditAmount: cAmt, debitAmount: dAmt, channel, officeName: targetOfficeName },
  });

  res.status(201).json({ id, success: true, message: 'Petty cash transaction recorded.' });
});

apiRouter.delete('/petty-cash/:id', requireAuth, (req: Request, res: Response) => {
  if (!isMasterAdmin(req.user) && !canAccessFinanceModule(req.user!, 'petty_cash')) {
    return res.status(403).json({ error: 'Access restricted.' });
  }

  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM petty_cash_entries WHERE id = ?').get(id) as any;
  if (!existing) return res.status(404).json({ error: 'Entry not found.' });

  if (isSecondaryAdmin(req.user)) {
    if (existing.secondary_admin_id !== req.user!.id && existing.created_by !== req.user!.id) {
      return res.status(403).json({ error: 'Unauthorized to delete entries from other offices.' });
    }
  }

  db.prepare('DELETE FROM petty_cash_entries WHERE id = ?').run(id);
  res.json({ success: true, message: 'Petty cash entry removed.' });
});

// =========================================================================
// 14. IN-APP PERSISTENT NOTIFICATIONS
// =========================================================================
apiRouter.get('/notifications', requireAuth, (req: Request, res: Response) => {
  const notifs = db.prepare(`
    SELECT * FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).all(req.user!.id);

  const unreadCount = (db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user!.id) as { c: number }).c;

  res.json({ notifications: notifs, unreadCount });
});

apiRouter.patch('/notifications/:id/read', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, req.user!.id);
  res.json({ success: true });
});

apiRouter.post('/notifications/read-all', requireAuth, (req: Request, res: Response) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.id);
  res.json({ success: true });
});

apiRouter.post('/notifications/register-token', requireAuth, (req: Request, res: Response) => {
  const { pushToken, deviceType } = req.body;
  if (!pushToken || typeof pushToken !== 'string') {
    return res.status(400).json({ error: 'Valid pushToken string is required.' });
  }

  const cleanToken = pushToken.trim();
  const id = `pt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO user_push_tokens (id, user_id, push_token, device_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(push_token) DO UPDATE SET
        user_id = excluded.user_id,
        updated_at = excluded.updated_at
    `).run(id, req.user!.id, cleanToken, deviceType || 'android', now, now);

    res.json({ success: true, message: 'Push token registered successfully for user.' });
  } catch (err) {
    console.error('Failed to register push token:', err);
    res.status(500).json({ error: 'Failed to register push token.' });
  }
});

// =========================================================================
// 15. TEAM MERGING (MODE A & MODE B)
// =========================================================================
apiRouter.get('/merges/summary-groups', requireAuth, (req: Request, res: Response) => {
  const { weekStart } = req.query;
  let query = 'SELECT * FROM summary_merge_groups';
  const params: unknown[] = [];
  if (weekStart) {
    query += ' WHERE week_start_date = ?';
    params.push(weekStart);
  }
  const groups = db.prepare(query).all(...params) as Array<{
    id: string;
    week_start_date: string;
    group_name: string;
    team_ids_json: string;
    created_by: string;
    created_at: string;
  }>;

  const parsed = groups.map(g => ({
    ...g,
    teamIds: JSON.parse(g.team_ids_json || '[]'),
  }));
  res.json(parsed);
});

apiRouter.post('/merges/summary-groups', requireAuth, (req: Request, res: Response) => {
  const { weekStartDate, groupName, teamIds } = req.body;
  if (!weekStartDate || !groupName || !Array.isArray(teamIds) || teamIds.length < 2) {
    return res.status(400).json({ error: 'Week start date, group name, and at least 2 teams are required.' });
  }

  const id = `smg-${Date.now()}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO summary_merge_groups (id, week_start_date, group_name, team_ids_json, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, weekStartDate, groupName.trim(), JSON.stringify(teamIds), req.user!.id, now);

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'CREATE_SUMMARY_MERGE_GROUP',
    entityType: 'summary_merge_groups',
    entityId: id,
    newValues: { groupName, teamIds },
  });

  res.status(201).json({ id, success: true, message: 'Summary merge group created.' });
});

apiRouter.delete('/merges/summary-groups/:id', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  db.prepare('DELETE FROM summary_merge_groups WHERE id = ?').run(id);
  res.json({ success: true, message: 'Summary merge group deleted.' });
});

apiRouter.post('/merges/attendance/execute', requireAuth, (req: Request, res: Response) => {
  const { sourceTeamIds, destinationTeamId, weekStartDate, reason } = req.body;
  if (!Array.isArray(sourceTeamIds) || !destinationTeamId || !weekStartDate) {
    return res.status(400).json({ error: 'Parameters missing.' });
  }

  const placeholders = sourceTeamIds.map(() => '?').join(',');
  const entriesToMerge = db.prepare(`
    SELECT id, team_id FROM attendance_entries
    WHERE team_id IN (${placeholders}) AND week_start_date = ? AND is_deleted = 0
  `).all(...sourceTeamIds, weekStartDate) as Array<{ id: string; team_id: string }>;

  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    for (const entry of entriesToMerge) {
      db.prepare(`
        UPDATE attendance_entries
        SET team_id = ?, is_merged = 1, merged_into_id = ?, updated_by = ?, updated_at = ?
        WHERE id = ?
      `).run(destinationTeamId, destinationTeamId, req.user!.id, now, entry.id);
    }
  });

  transaction();

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'MERGE_ATTENDANCE_ENTRIES',
    entityType: 'attendance_entries',
    entityId: destinationTeamId,
    reason: reason || 'Consolidation of team attendance records',
    newValues: { sourceTeamIds, destinationTeamId, mergedCount: entriesToMerge.length },
  });

  res.json({ success: true, message: `Successfully merged ${entriesToMerge.length} attendance entries into destination team.` });
});

// =========================================================================
// 16. REPORTS (WEEKLY & MONTHLY — APPROVAL-ENFORCED & SCOPED)
// =========================================================================
apiRouter.get('/reports/weekly', requireAuth, (req: Request, res: Response) => {
  const { weekStart, staffUserId } = req.query;
  const targetDate = typeof weekStart === 'string' && weekStart ? weekStart : getTodayKolkataISO();
  const bounds = getWeekBounds(targetDate);

  // Determine staff scoping
  let targetStaffId: string | null = null;
  if (!isMasterAdmin(req.user)) {
    if (isSecondaryAdmin(req.user)) {
      if (staffUserId && canAccessStaff(req.user!, String(staffUserId))) {
        targetStaffId = String(staffUserId);
      }
    } else {
      targetStaffId = req.user!.id;
    }
  } else if (staffUserId) {
    targetStaffId = String(staffUserId);
  }

  // 1. Fetch teams
  const allTeams = db.prepare("SELECT * FROM teams WHERE status = 'active'").all() as Array<any>;

  // 2. Fetch attendance entries
  let attQuery = 'SELECT * FROM attendance_entries WHERE week_start_date = ? AND is_deleted = 0';
  const attParams: unknown[] = [bounds.startDate];

  if (targetStaffId) {
    attQuery += ' AND owner_user_id = ?';
    attParams.push(targetStaffId);
  } else if (isSecondaryAdmin(req.user)) {
    const permitted = getPermittedStaffIds(req.user!);
    if (permitted && permitted.length > 0) {
      attQuery += ` AND owner_user_id IN (${permitted.map(() => '?').join(',')})`;
      attParams.push(...permitted);
    }
  }

  attQuery += ' ORDER BY date ASC';
  const allEntries = db.prepare(attQuery).all(...attParams) as Array<any>;

  // CRITICAL REQUIREMENT:
  // "Attendance in pending or rejected states does not enter approved payable totals."
  // "Pending submissions and revisions are tracked separately."
  const approvedEntries = allEntries.filter(e => e.status === 'approved' || e.status === 'change_pending_approval');
  const pendingEntries = allEntries.filter(e => e.status === 'pending_approval');
  const rejectedEntries = allEntries.filter(e => e.status === 'rejected');

  const entryIds = approvedEntries.map(e => e.id);
  let lines: Array<any> = [];
  if (entryIds.length > 0) {
    const placeholders = entryIds.map(() => '?').join(',');
    lines = db.prepare(`SELECT * FROM attendance_lines WHERE attendance_entry_id IN (${placeholders})`).all(...entryIds) as Array<any>;
  }

  // 3. Additional charges
  let chgQuery = 'SELECT * FROM additional_charges WHERE week_start_date = ? AND is_deleted = 0';
  const chgParams: unknown[] = [bounds.startDate];
  if (targetStaffId) {
    chgQuery += ' AND owner_user_id = ?';
    chgParams.push(targetStaffId);
  }
  const charges = db.prepare(chgQuery).all(...chgParams) as Array<any>;

  // 4. Financial adjustments
  let adjQuery = 'SELECT * FROM financial_adjustments WHERE week_start_date = ? AND is_deleted = 0';
  const adjParams: unknown[] = [bounds.startDate];
  if (targetStaffId) {
    adjQuery += ' AND owner_user_id = ?';
    adjParams.push(targetStaffId);
  }
  const adjustments = db.prepare(adjQuery).all(...adjParams) as Array<any>;

  // 5. Supplier bills
  const supplierBills = db.prepare('SELECT * FROM supplier_bills WHERE week_start_date = ? AND is_deleted = 0').all(bounds.startDate) as Array<any>;

  // 6. Summary merge groups
  const mergeGroups = db.prepare('SELECT * FROM summary_merge_groups WHERE week_start_date = ?').all(bounds.startDate) as Array<any>;

  // 7. Payment status records for this week
  let pmtQuery = 'SELECT * FROM weekly_payments WHERE week_start_date = ?';
  const pmtParams: unknown[] = [bounds.startDate];
  if (targetStaffId) {
    pmtQuery += ' AND staff_user_id = ?';
    pmtParams.push(targetStaffId);
  }
  const weekPayments = db.prepare(pmtQuery).all(...pmtParams) as Array<any>;

  // Build team-wise breakdown using ONLY approved entries
  const teamSummaries = allTeams.map(team => {
    const teamEntries = approvedEntries.filter(e => e.team_id === team.id);
    const teamPendingEntries = pendingEntries.filter(e => e.team_id === team.id);
    const teamEntryIds = teamEntries.map(e => e.id);
    const teamLines = lines.filter(l => teamEntryIds.includes(l.attendance_entry_id));
    const teamCharges = charges.filter(c => c.team_id === team.id);
    const teamAdjustments = adjustments.filter(a => a.team_id === team.id);

    const labourAmounts = teamLines.map(l => l.final_amount);
    const overtimeAmounts = teamEntries.map(e => e.overtime_amount || 0);
    const chargeAmounts = teamCharges.map(c => c.final_amount);

    const credits = teamAdjustments.filter(a => a.adjustment_type === 'credit' || a.adjustment_type === 'addition').map(a => a.amount);
    const deductions = teamAdjustments.filter(a => a.adjustment_type === 'fixed_deduction' || a.adjustment_type === 'percentage_deduction').map(a => a.amount);
    const advancesApplied = teamAdjustments.filter(a => a.adjustment_type === 'advance_deduction').map(a => a.amount);

    const summary = computeFinancialSummary({
      labourAmounts,
      overtimeAmounts,
      additionalChargeAmounts: chargeAmounts,
      credits,
      deductions,
      advancesApplied,
    });

    const paymentRecord = weekPayments.find(p => p.team_id === team.id);

    return {
      teamId: team.id,
      teamName: team.name,
      workCategory: team.work_category,
      entriesCount: teamEntries.length,
      pendingCount: teamPendingEntries.length,
      linesCount: teamLines.length,
      chargesCount: teamCharges.length,
      adjustmentsCount: teamAdjustments.length,
      paymentStatus: paymentRecord?.status || 'Pending',
      amountPaid: paymentRecord?.amount_paid || 0,
      paymentRecord,
      ...summary,
      entries: teamEntries.map(e => ({
        ...e,
        lines: teamLines.filter(l => l.attendance_entry_id === e.id),
      })),
      pendingEntries: teamPendingEntries,
      charges: teamCharges,
      adjustments: teamAdjustments,
    };
  }).filter(t => t.entriesCount > 0 || t.pendingCount > 0 || t.chargesCount > 0 || t.adjustmentsCount > 0);

  // Grand totals
  const grandLabour = teamSummaries.reduce((sum, t) => sum + t.labourSubtotal, 0);
  const grandOvertime = teamSummaries.reduce((sum, t) => sum + t.overtimeSubtotal, 0);
  const grandCharges = teamSummaries.reduce((sum, t) => sum + t.additionalChargesSubtotal, 0);
  const grandGross = teamSummaries.reduce((sum, t) => sum + t.grossAmount, 0) + supplierBills.reduce((sum, b) => sum + b.gross_amount, 0);
  const grandCredits = teamSummaries.reduce((sum, t) => sum + t.creditsSubtotal, 0);
  const grandDeductions = teamSummaries.reduce((sum, t) => sum + t.deductionsSubtotal, 0);
  const grandAdvances = teamSummaries.reduce((sum, t) => sum + t.advancesAppliedSubtotal, 0) + supplierBills.reduce((sum, b) => sum + b.advance_paid, 0);
  const grandPayable = teamSummaries.reduce((sum, t) => sum + t.finalPayable, 0) + supplierBills.reduce((sum, b) => sum + b.net_payable, 0);
  const grandPaid = weekPayments.reduce((sum, p) => sum + (p.amount_paid || 0), 0);
  const grandOutstanding = round2(grandPayable - grandPaid);

  res.json({
    weekBounds: bounds,
    teamSummaries,
    supplierBills,
    mergeGroups: mergeGroups.map(g => ({ ...g, teamIds: JSON.parse(g.team_ids_json || '[]') })),
    pendingSubmissionsCount: pendingEntries.length,
    rejectedSubmissionsCount: rejectedEntries.length,
    grandTotals: {
      labour: round2(grandLabour),
      overtime: round2(grandOvertime),
      additionalCharges: round2(grandCharges),
      gross: round2(grandGross),
      credits: round2(grandCredits),
      deductions: round2(grandDeductions),
      advancesApplied: round2(grandAdvances),
      finalPayable: round2(grandPayable),
      paid: round2(grandPaid),
      outstanding: grandOutstanding,
    },
  });
});

apiRouter.get('/reports/monthly', requireAuth, (req: Request, res: Response) => {
  const { year, month, staffUserId } = req.query;
  const y = parseInt(String(year), 10) || new Date().getFullYear();
  const m = parseInt(String(month), 10) || (new Date().getMonth() + 1);

  const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  let query = "SELECT e.*, t.name as team_name, t.work_category FROM attendance_entries e JOIN teams t ON e.team_id = t.id WHERE e.date >= ? AND e.date <= ? AND e.is_deleted = 0 AND (e.status = 'approved' OR e.status = 'change_pending_approval')";
  const params: unknown[] = [startDate, endDate];

  if (!isMasterAdmin(req.user)) {
    if (isSecondaryAdmin(req.user)) {
      const permitted = getPermittedStaffIds(req.user!);
      if (permitted && permitted.length > 0) {
        query += ` AND e.owner_user_id IN (${permitted.map(() => '?').join(',')})`;
        params.push(...permitted);
      }
    } else {
      query += ' AND e.owner_user_id = ?';
      params.push(req.user!.id);
    }
  } else if (staffUserId) {
    query += ' AND e.owner_user_id = ?';
    params.push(staffUserId);
  }

  query += ' ORDER BY e.date ASC';
  const entries = db.prepare(query).all(...params) as Array<any>;

  const entryIds = entries.map(e => e.id);
  let lines: Array<any> = [];
  if (entryIds.length > 0) {
    const placeholders = entryIds.map(() => '?').join(',');
    lines = db.prepare(`SELECT * FROM attendance_lines WHERE attendance_entry_id IN (${placeholders})`).all(...entryIds) as Array<any>;
  }

  const charges = db.prepare('SELECT * FROM additional_charges WHERE date >= ? AND date <= ? AND is_deleted = 0').all(startDate, endDate) as Array<any>;
  const adjustments = db.prepare('SELECT * FROM financial_adjustments WHERE date >= ? AND date <= ? AND is_deleted = 0').all(startDate, endDate) as Array<any>;

  const totalLabour = round2(lines.reduce((acc, l) => acc + (l.final_amount || 0), 0));
  const totalOvertime = round2(entries.reduce((acc, e) => acc + (e.overtime_amount || 0), 0));
  const totalCharges = round2(charges.reduce((acc, c) => acc + (c.final_amount || 0), 0));
  const gross = round2(totalLabour + totalOvertime + totalCharges);

  const credits = round2(adjustments.filter(a => a.adjustment_type === 'credit' || a.adjustment_type === 'addition').reduce((acc, a) => acc + a.amount, 0));
  const deductions = round2(adjustments.filter(a => a.adjustment_type === 'fixed_deduction' || a.adjustment_type === 'percentage_deduction').reduce((acc, a) => acc + a.amount, 0));
  const advances = round2(adjustments.filter(a => a.adjustment_type === 'advance_deduction').reduce((acc, a) => acc + a.amount, 0));
  const payable = round2(gross + credits - deductions - advances);

  // Group by team
  const teamsMap = new Map<string, any>();
  for (const entry of entries) {
    if (!teamsMap.has(entry.team_id)) {
      teamsMap.set(entry.team_id, {
        teamId: entry.team_id,
        teamName: entry.team_name,
        workCategory: entry.work_category,
        daysCount: 0,
        manDays: 0,
        labourSubtotal: 0,
        overtimeSubtotal: 0,
        chargesSubtotal: 0,
        deductionsSubtotal: 0,
        grossAmount: 0,
        finalPayable: 0,
      });
    }
    const t = teamsMap.get(entry.team_id);
    t.daysCount += 1;
    t.overtimeSubtotal = round2(t.overtimeSubtotal + (entry.overtime_amount || 0));

    const entryLines = lines.filter(l => l.attendance_entry_id === entry.id);
    for (const l of entryLines) {
      t.manDays += Number(l.count) || 0;
      t.labourSubtotal = round2(t.labourSubtotal + (l.final_amount || 0));
    }
  }

  // Add charges & adjustments per team
  for (const c of charges) {
    if (teamsMap.has(c.team_id)) {
      const t = teamsMap.get(c.team_id);
      t.chargesSubtotal = round2(t.chargesSubtotal + (c.final_amount || 0));
    }
  }
  for (const a of adjustments) {
    if (teamsMap.has(a.team_id)) {
      const t = teamsMap.get(a.team_id);
      if (a.adjustment_type === 'fixed_deduction' || a.adjustment_type === 'percentage_deduction' || a.adjustment_type === 'advance_deduction') {
        t.deductionsSubtotal = round2(t.deductionsSubtotal + (a.amount || 0));
      }
    }
  }

  const teamSummaries = Array.from(teamsMap.values()).map(t => {
    const g = round2(t.labourSubtotal + t.overtimeSubtotal + t.chargesSubtotal);
    const p = round2(g - t.deductionsSubtotal);
    return { ...t, grossAmount: g, finalPayable: p };
  });

  // Group by labour category
  const categoryMap = new Map<string, any>();
  for (const line of lines) {
    if (!categoryMap.has(line.category_id)) {
      categoryMap.set(line.category_id, {
        categoryId: line.category_id,
        categoryName: line.category_name,
        totalCount: 0,
        totalAmount: 0,
      });
    }
    const cat = categoryMap.get(line.category_id);
    cat.totalCount += Number(line.count) || 0;
    cat.totalAmount = round2(cat.totalAmount + (line.final_amount || 0));
  }
  const categoryBreakdown = Array.from(categoryMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);

  res.json({
    month: m,
    year: y,
    startDate,
    endDate,
    totals: { totalLabour, totalOvertime, totalCharges, gross, credits, deductions, advances, payable },
    teamSummaries,
    categoryBreakdown,
    entriesCount: entries.length,
    chargesCount: charges.length,
  });
});

// =========================================================================
// 17. AUDIT LOGS & SETTINGS
// =========================================================================
apiRouter.get('/audit', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const { limit, entityType, actorId } = req.query;
  const lim = parseInt(String(limit), 10) || 100;

  let query = 'SELECT * FROM audit_logs';
  const conditions: string[] = [];
  const params: unknown[] = [];
  // Optional filters for actorId and entityType
  if (actorId) {
    conditions.push('actor_id = ?');
    params.push(actorId);
  }

  if (entityType) {
    conditions.push('entity_type = ?');
    params.push(entityType);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(lim);

  const logs = db.prepare(query).all(...params);
  res.json(logs);
});

apiRouter.get('/settings', requireAuth, (req: Request, res: Response) => {
  const settingsRows = db.prepare('SELECT * FROM company_settings').all() as Array<{ key: string; value_json: string }>;
  const settings: Record<string, any> = {};
  for (const row of settingsRows) {
    try {
      settings[row.key] = JSON.parse(row.value_json);
    } catch {
      settings[row.key] = row.value_json;
    }
  }
  res.json(settings);
});

apiRouter.post('/settings', requireAuth, requireMasterAdmin, (req: Request, res: Response) => {
  const { key, value } = req.body;
  if (!key || value === undefined) {
    return res.status(400).json({ error: 'Key and value are required.' });
  }

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO company_settings (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), now);

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'UPDATE_SETTINGS',
    entityType: 'company_settings',
    entityId: key,
    newValues: { key, value },
  });

  res.json({ success: true, message: 'Settings saved.' });
});

// Seed sample data on demand
apiRouter.post('/seed-sample-data', requireAuth, requireMasterAdmin, (req: Request, res: Response) => {
  try {
    seedComprehensiveDemoData(true);
    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'SEED_SAMPLE_DATA',
      entityType: 'system',
      entityId: 'sample-data',
      reason: 'User requested sample data generation',
    });
    res.json({ success: true, message: 'Comprehensive sample data seeded successfully for all modules.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to seed sample data: ' + err.message });
  }
});

// =========================================================================
// 19. WORKSITE & GPS GEOFENCE MANAGEMENT
// =========================================================================
apiRouter.get('/worksites', requireAuth, (req: Request, res: Response) => {
  const { secondaryAdminId } = req.query;
  let query = 'SELECT * FROM worksites';
  const params: any[] = [];

  if (isSecondaryAdmin(req.user)) {
    query += ' WHERE secondary_admin_id = ?';
    params.push(req.user!.id);
  } else if (secondaryAdminId && secondaryAdminId !== 'all') {
    query += ' WHERE secondary_admin_id = ?';
    params.push(secondaryAdminId);
  }
  query += ' ORDER BY name ASC';
  const worksites = db.prepare(query).all(...params) as any[];
  const pendingRequests = db.prepare("SELECT * FROM geofence_change_requests WHERE entity_type = 'worksite' AND status = 'pending'").all() as any[];
  const pendingByEntityId = new Map(pendingRequests.map(r => [r.entity_id, r]));

  const formatted = worksites.map(ws => ({
    ...ws,
    assignedTeams: JSON.parse(ws.assigned_teams_json || '[]'),
    pendingRequest: pendingByEntityId.get(ws.id) || null,
  }));
  res.json(formatted);
});

apiRouter.post('/worksites', requireAuth, requireStaffOrAdmin, (req: Request, res: Response) => {
  const { name, projectName, address, latitude, longitude, allowedRadiusMeters, accuracyThresholdMeters, assignedTeams, reason, secondaryAdminId, officeName } = req.body;
  if (!name || !projectName || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'Name, project name, latitude, and longitude are required.' });
  }

  const id = `ws-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  const radius = Number(allowedRadiusMeters) || 150;
  const accuracy = Number(accuracyThresholdMeters) || 50;
  const teamsJson = JSON.stringify(Array.isArray(assignedTeams) ? assignedTeams : []);

  let targetSecAdminId = 'head_office';
  let targetOfficeName = 'Head Office (Central)';

  if (isSecondaryAdmin(req.user)) {
    targetSecAdminId = req.user!.id;
    targetOfficeName = req.user!.assignedLocation ? `${req.user!.assignedLocation} Office` : `${req.user!.fullName} Office`;
  } else if (secondaryAdminId) {
    targetSecAdminId = secondaryAdminId;
    if (secondaryAdminId === 'head_office') {
      targetOfficeName = 'Head Office (Central)';
    } else {
      const u = db.prepare('SELECT full_name, assigned_location FROM users WHERE id = ?').get(secondaryAdminId) as any;
      targetOfficeName = officeName || (u?.assigned_location ? `${u.assigned_location} Office (${u.full_name})` : u?.full_name ? `${u.full_name} Office` : 'Branch Office');
    }
  }

  if (!isAdminAny(req.user)) {
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'A mandatory reason is required for staff worksite requests.' });
    }

    const assignedAdmin = getAssignedAdminForStaff(req.user!.id);
    const reqId = `gfc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // Create inactive worksite pending approval
    db.prepare(`
      INSERT INTO worksites (id, name, project_name, address, latitude, longitude, allowed_radius_meters, accuracy_threshold_meters, status, assigned_teams_json, pending_geofence_request_id, secondary_admin_id, office_name, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'inactive', ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, projectName, address || '', Number(latitude), Number(longitude), radius, accuracy, teamsJson, reqId, targetSecAdminId, targetOfficeName, req.user!.id, now, now);

    const proposedChanges = {
      name,
      projectName,
      address: address || '',
      latitude: Number(latitude),
      longitude: Number(longitude),
      allowedRadiusMeters: radius,
      accuracyThresholdMeters: accuracy,
      assignedTeams: Array.isArray(assignedTeams) ? assignedTeams : [],
      status: 'active',
      isNewWorksite: true,
      secondaryAdminId: targetSecAdminId,
      officeName: targetOfficeName,
    };

    db.prepare(`
      INSERT INTO geofence_change_requests (
        id, entity_type, entity_id, entity_name, requested_by_id, requested_by_name,
        target_admin_id, previous_latitude, previous_longitude, previous_radius_meters, previous_accuracy_threshold,
        requested_latitude, requested_longitude, requested_radius_meters, requested_accuracy_threshold,
        reason, proposed_changes_json, status, created_at, updated_at
      ) VALUES (?, 'worksite', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      reqId,
      id,
      name,
      req.user!.id,
      req.user!.fullName,
      assignedAdmin.id,
      Number(latitude),
      Number(longitude),
      radius,
      accuracy,
      Number(latitude),
      Number(longitude),
      radius,
      accuracy,
      reason.trim(),
      JSON.stringify(proposedChanges),
      now,
      now
    );

    createNotification({
      userId: assignedAdmin.id,
      title: 'New Worksite Approval Request',
      message: `${req.user!.fullName} requested creation of worksite "${name}": ${reason.trim()}`,
      type: 'approval',
      link: '/approvals',
    });

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'REQUEST_CREATE_WORKSITE',
      entityType: 'worksites',
      entityId: id,
      newValues: proposedChanges,
    });

    return res.status(201).json({
      id,
      pendingApproval: true,
      targetAdminName: assignedAdmin.fullName,
      message: `Worksite created and submitted for Administrator approval (${assignedAdmin.fullName}). It will become active once approved.`,
    });
  }

  db.prepare(`
    INSERT INTO worksites (id, name, project_name, address, latitude, longitude, allowed_radius_meters, accuracy_threshold_meters, status, assigned_teams_json, secondary_admin_id, office_name, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)
  `).run(id, name, projectName, address || '', Number(latitude), Number(longitude), radius, accuracy, teamsJson, targetSecAdminId, targetOfficeName, req.user!.id, now, now);

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'CREATE_WORKSITE',
    entityType: 'worksites',
    entityId: id,
    newValues: { name, projectName, latitude, longitude, radius, accuracy, secondaryAdminId: targetSecAdminId, officeName: targetOfficeName },
  });

  res.status(201).json({ id, message: 'Worksite created successfully.' });
});

apiRouter.put('/worksites/:id', requireAuth, requireStaffOrAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM worksites WHERE id = ?').get(id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Worksite not found.' });
  }

  const { name, projectName, address, latitude, longitude, allowedRadiusMeters, accuracyThresholdMeters, status, assignedTeams, reason, secondaryAdminId, officeName } = req.body;
  const now = new Date().toISOString();

  let targetSecAdminId: string | null = null;
  let targetOfficeName: string | null = null;
  if (secondaryAdminId) {
    targetSecAdminId = secondaryAdminId;
    if (secondaryAdminId === 'head_office') {
      targetOfficeName = 'Head Office (Central)';
    } else {
      const u = db.prepare('SELECT full_name, assigned_location FROM users WHERE id = ?').get(secondaryAdminId) as any;
      targetOfficeName = officeName || (u?.assigned_location ? `${u.assigned_location} Office (${u.full_name})` : u?.full_name ? `${u.full_name} Office` : 'Branch Office');
    }
  }

  // If staff member makes changes, DO NOT save directly. Send request to Admin for approval.
  if (!isAdminAny(req.user)) {
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'A mandatory reason is required for staff worksite change requests.' });
    }

    const assignedAdmin = getAssignedAdminForStaff(req.user!.id);
    const reqId = `gfc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const prevLat = Number(existing.latitude) || 0;
    const prevLng = Number(existing.longitude) || 0;
    const prevRad = Number(existing.allowed_radius_meters) || 150;
    const prevAcc = Number(existing.accuracy_threshold_meters) || 50;

    const reqLat = latitude !== undefined ? Number(latitude) : prevLat;
    const reqLng = longitude !== undefined ? Number(longitude) : prevLng;
    const reqRad = allowedRadiusMeters !== undefined ? Number(allowedRadiusMeters) : prevRad;
    const reqAcc = accuracyThresholdMeters !== undefined ? Number(accuracyThresholdMeters) : prevAcc;

    const proposedChanges = {
      name: name !== undefined ? name : existing.name,
      projectName: projectName !== undefined ? projectName : existing.project_name,
      address: address !== undefined ? address : (existing.address || ''),
      latitude: reqLat,
      longitude: reqLng,
      allowedRadiusMeters: reqRad,
      accuracyThresholdMeters: reqAcc,
      status: status !== undefined ? status : existing.status,
      assignedTeams: assignedTeams !== undefined ? assignedTeams : JSON.parse(existing.assigned_teams_json || '[]'),
    };

    db.prepare(`
      INSERT INTO geofence_change_requests (
        id, entity_type, entity_id, entity_name, requested_by_id, requested_by_name,
        target_admin_id, previous_latitude, previous_longitude, previous_radius_meters, previous_accuracy_threshold,
        requested_latitude, requested_longitude, requested_radius_meters, requested_accuracy_threshold,
        reason, proposed_changes_json, status, created_at, updated_at
      ) VALUES (?, 'worksite', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      reqId,
      id,
      existing.name,
      req.user!.id,
      req.user!.fullName,
      assignedAdmin.id,
      prevLat,
      prevLng,
      prevRad,
      prevAcc,
      reqLat,
      reqLng,
      reqRad,
      reqAcc,
      reason.trim(),
      JSON.stringify(proposedChanges),
      now,
      now
    );

    db.prepare('UPDATE worksites SET pending_geofence_request_id = ? WHERE id = ?').run(reqId, id);

    createNotification({
      userId: assignedAdmin.id,
      title: 'Worksite Configuration Change Request',
      message: `${req.user!.fullName} requested changes for worksite "${existing.name}": ${reason.trim()}`,
      type: 'approval',
      link: '/approvals',
    });

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'REQUEST_WORKSITE_CHANGE',
      entityType: 'geofence_change_requests',
      entityId: reqId,
      newValues: { worksiteId: id, proposedChanges, reason, targetAdminId: assignedAdmin.id },
    });

    return res.json({
      success: true,
      pendingApproval: true,
      targetAdminName: assignedAdmin.fullName,
      message: `Worksite change request submitted successfully to Administrator (${assignedAdmin.fullName}) for approval.`,
    });
  }

  db.prepare(`
    UPDATE worksites SET
      name = COALESCE(?, name),
      project_name = COALESCE(?, project_name),
      address = COALESCE(?, address),
      latitude = COALESCE(?, latitude),
      longitude = COALESCE(?, longitude),
      allowed_radius_meters = COALESCE(?, allowed_radius_meters),
      accuracy_threshold_meters = COALESCE(?, accuracy_threshold_meters),
      status = COALESCE(?, status),
      assigned_teams_json = COALESCE(?, assigned_teams_json),
      secondary_admin_id = COALESCE(?, secondary_admin_id),
      office_name = COALESCE(?, office_name),
      updated_by = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    name,
    projectName,
    address,
    latitude !== undefined ? Number(latitude) : null,
    longitude !== undefined ? Number(longitude) : null,
    allowedRadiusMeters !== undefined ? Number(allowedRadiusMeters) : null,
    accuracyThresholdMeters !== undefined ? Number(accuracyThresholdMeters) : null,
    status,
    assignedTeams ? JSON.stringify(assignedTeams) : null,
    targetSecAdminId,
    targetOfficeName,
    req.user!.id,
    now,
    id
  );

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'UPDATE_WORKSITE',
    entityType: 'worksites',
    entityId: id,
    previousValues: existing,
    newValues: req.body,
  });

  res.json({ message: 'Worksite updated successfully.' });
});

apiRouter.delete('/worksites/:id', requireAuth, requireMasterAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM worksites WHERE id = ?').get(id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Worksite not found.' });
  }

  db.prepare('DELETE FROM worksites WHERE id = ?').run(id);

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'DELETE_WORKSITE',
    entityType: 'worksites',
    entityId: id,
    previousValues: existing,
  });

  res.json({ message: 'Worksite deleted.' });
});

// =========================================================================
// 20. LABOURER MANAGEMENT
// =========================================================================
apiRouter.get('/labourers', requireAuth, (req: Request, res: Response) => {
  const { teamId, worksiteId, status } = req.query;
  let query = `
    SELECT u.id, u.email, u.full_name, u.role, u.status, u.designation,
           u.mobile_number, u.masked_aadhaar, u.aadhaar_status,
           u.assigned_team_id, t.name as team_name,
           u.assigned_worksite_id, w.name as worksite_name,
           u.assigned_supervisor_id, sup.full_name as supervisor_name,
           u.labour_category_id, cat.name as category_name,
           u.employment_status, u.login_method, u.daily_rate, u.hourly_rate,
           u.is_attendance_participant, u.created_at, u.updated_at
    FROM users u
    LEFT JOIN teams t ON u.assigned_team_id = t.id
    LEFT JOIN worksites w ON u.assigned_worksite_id = w.id
    LEFT JOIN users sup ON u.assigned_supervisor_id = sup.id
    LEFT JOIN labour_categories cat ON u.labour_category_id = cat.id
    WHERE u.role = 'labourer'
  `;

  const params: any[] = [];

  // Strict role-based scoping:
  if (isMasterAdmin(req.user)) {
    // Master admin: view all labourers company-wide
  } else if (isSecondaryAdmin(req.user)) {
    // Secondary admin sees labourers assigned to them, or to teams supervised by them/their staff
    query += ` AND (
      u.assigned_supervisor_id = ? OR
      u.assigned_admin_id = ? OR
      u.assigned_team_id IN (
        SELECT id FROM teams WHERE owner_user_id = ? OR owner_user_id IN (
          SELECT staff_user_id FROM secondary_admin_assignments WHERE secondary_admin_id = ?
        )
      ) OR
      u.assigned_supervisor_id IN (
        SELECT staff_user_id FROM secondary_admin_assignments WHERE secondary_admin_id = ?
      )
    )`;
    params.push(req.user!.id, req.user!.id, req.user!.id, req.user!.id, req.user!.id);
  } else {
    // Staff user: ONLY sees labourers assigned to that staff member's teams or where staff is supervisor/creator
    query += ` AND (
      u.assigned_supervisor_id = ? OR
      u.created_by = ? OR
      u.assigned_team_id IN (
        SELECT id FROM teams WHERE owner_user_id = ?
      )
    )`;
    params.push(req.user!.id, req.user!.id, req.user!.id);
  }

  if (teamId) {
    query += ' AND u.assigned_team_id = ?';
    params.push(teamId);
  }
  if (worksiteId) {
    query += ' AND u.assigned_worksite_id = ?';
    params.push(worksiteId);
  }
  if (status) {
    query += ' AND u.status = ?';
    params.push(status);
  }

  query += ' ORDER BY u.full_name ASC';
  const labourers = db.prepare(query).all(...params);
  res.json(labourers);
});

apiRouter.post('/labourers', requireAuth, requireStaffOrAdmin, (req: Request, res: Response) => {
  const {
    fullName,
    mobileNumber,
    aadhaarNumber,
    assignedTeamId,
    assignedWorksiteId,
    assignedSupervisorId,
    labourCategoryId,
    designation,
    dailyRate,
    hourlyRate,
    loginMethod,
    password,
  } = req.body;

  if (!fullName || !mobileNumber) {
    return res.status(400).json({ error: 'Full name and mobile number are required.' });
  }

  const cleanMobile = mobileNumber.replace(/\D/g, '').slice(-10);
  if (cleanMobile.length < 10) {
    return res.status(400).json({ error: 'A valid 10-digit mobile number is required.' });
  }

  // Check unique mobile
  const existing = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get(cleanMobile);
  if (existing) {
    return res.status(400).json({ error: 'A labourer or user is already registered with this mobile number.' });
  }

  // Staff role constraint: staff can only assign labourer to their own teams
  if (!isAdminAny(req.user) && assignedTeamId) {
    const isOwned = db.prepare('SELECT 1 FROM teams WHERE id = ? AND owner_user_id = ?').get(assignedTeamId, req.user!.id);
    if (!isOwned) {
      return res.status(403).json({ error: 'Staff members can only register labourers into their own assigned teams.' });
    }
  }

  const id = `usr-labourer-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const email = `labourer.${cleanMobile}@labour.erp`;
  const defaultPass = password ? password.toString().trim() : 'Password@123';
  const passwordHash = bcrypt.hashSync(defaultPass, 10);
  const now = new Date().toISOString();

  // Mask Aadhaar according to UIDAI standard (XXXX-XXXX-1234)
  const maskedAadhaarVal = aadhaarNumber ? maskAadhaar(aadhaarNumber) : null;
  const encryptedAadhaarVal = aadhaarNumber ? `enc-${Buffer.from(aadhaarNumber).toString('base64')}` : null;
  const aadhaarStatus = aadhaarNumber ? 'verified' : 'unverified';

  db.prepare(`
    INSERT INTO users (
      id, email, password_hash, full_name, role, status, designation,
      mobile_number, masked_aadhaar, encrypted_aadhaar, aadhaar_status,
      assigned_team_id, assigned_worksite_id, assigned_supervisor_id, labour_category_id,
      employment_status, login_method, daily_rate, hourly_rate, is_attendance_participant,
      created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, 'labourer', 'active', ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      'active', ?, ?, ?, 1,
      ?, ?, ?
    )
  `).run(
    id,
    email,
    passwordHash,
    fullName,
    designation || 'Site Labourer',
    cleanMobile,
    maskedAadhaarVal,
    encryptedAadhaarVal,
    aadhaarStatus,
    assignedTeamId || null,
    assignedWorksiteId || null,
    assignedSupervisorId || req.user!.id,
    labourCategoryId || null,
    loginMethod || 'both',
    Number(dailyRate) || 0,
    Number(hourlyRate) || 0,
    req.user!.id,
    now,
    now
  );

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'CREATE_LABOURER',
    entityType: 'users',
    entityId: id,
    newValues: { fullName, mobile: cleanMobile, maskedAadhaar: maskedAadhaarVal, teamId: assignedTeamId },
  });

  res.status(201).json({ id, message: 'Labourer account registered successfully.' });
});

apiRouter.put('/labourers/:id', requireAuth, requireStaffOrAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'labourer'").get(id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Labourer account not found.' });
  }

  // Role-based authorization for editing:
  if (!isMasterAdmin(req.user)) {
    if (isSecondaryAdmin(req.user)) {
      const allowed = existing.assigned_supervisor_id === req.user!.id ||
        existing.assigned_admin_id === req.user!.id ||
        Boolean(db.prepare(`
          SELECT 1 FROM teams WHERE id = ? AND (
            owner_user_id = ? OR
            owner_user_id IN (SELECT staff_user_id FROM secondary_admin_assignments WHERE secondary_admin_id = ?)
          )
        `).get(existing.assigned_team_id, req.user!.id, req.user!.id)) ||
        Boolean(db.prepare('SELECT 1 FROM secondary_admin_assignments WHERE secondary_admin_id = ? AND staff_user_id = ?').get(req.user!.id, existing.assigned_supervisor_id));

      if (!allowed) {
        return res.status(403).json({ error: 'Access denied: You can only edit labourers within your managed teams.' });
      }
    } else {
      // Staff user: only permitted to edit labourers assigned to their own teams or supervised by them
      const allowed = existing.assigned_supervisor_id === req.user!.id ||
        existing.created_by === req.user!.id ||
        Boolean(db.prepare('SELECT 1 FROM teams WHERE id = ? AND owner_user_id = ?').get(existing.assigned_team_id, req.user!.id));

      if (!allowed) {
        return res.status(403).json({ error: 'Access denied: You can only edit labourers assigned to your own teams.' });
      }
    }
  }

  const {
    fullName,
    mobileNumber,
    assignedTeamId,
    assignedWorksiteId,
    assignedSupervisorId,
    labourCategoryId,
    designation,
    dailyRate,
    hourlyRate,
    employmentStatus,
    loginMethod,
    aadhaarNumber,
  } = req.body;

  const now = new Date().toISOString();
  const maskedAadhaarVal = aadhaarNumber ? maskAadhaar(aadhaarNumber) : existing.masked_aadhaar;
  const encryptedAadhaarVal = aadhaarNumber ? `enc-${Buffer.from(aadhaarNumber).toString('base64')}` : existing.encrypted_aadhaar;

  db.prepare(`
    UPDATE users SET
      full_name = COALESCE(?, full_name),
      mobile_number = COALESCE(?, mobile_number),
      assigned_team_id = COALESCE(?, assigned_team_id),
      assigned_worksite_id = COALESCE(?, assigned_worksite_id),
      assigned_supervisor_id = COALESCE(?, assigned_supervisor_id),
      labour_category_id = COALESCE(?, labour_category_id),
      designation = COALESCE(?, designation),
      daily_rate = COALESCE(?, daily_rate),
      hourly_rate = COALESCE(?, hourly_rate),
      employment_status = COALESCE(?, employment_status),
      login_method = COALESCE(?, login_method),
      masked_aadhaar = COALESCE(?, masked_aadhaar),
      encrypted_aadhaar = COALESCE(?, encrypted_aadhaar),
      updated_at = ?
    WHERE id = ?
  `).run(
    fullName,
    mobileNumber ? mobileNumber.replace(/\D/g, '').slice(-10) : null,
    assignedTeamId,
    assignedWorksiteId,
    assignedSupervisorId,
    labourCategoryId,
    designation,
    dailyRate !== undefined ? Number(dailyRate) : null,
    hourlyRate !== undefined ? Number(hourlyRate) : null,
    employmentStatus,
    loginMethod,
    maskedAadhaarVal,
    encryptedAadhaarVal,
    now,
    id
  );

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'UPDATE_LABOURER',
    entityType: 'users',
    entityId: id,
    previousValues: { fullName: existing.full_name, teamId: existing.assigned_team_id },
    newValues: req.body,
  });

  res.json({ message: 'Labourer account updated successfully.' });
});

apiRouter.delete('/labourers/:id', requireAuth, requireStaffOrAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'labourer'").get(id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Labourer account not found.' });
  }

  // Role-based authorization for removal:
  if (!isMasterAdmin(req.user)) {
    if (isSecondaryAdmin(req.user)) {
      const allowed = existing.assigned_supervisor_id === req.user!.id ||
        existing.assigned_admin_id === req.user!.id ||
        Boolean(db.prepare(`
          SELECT 1 FROM teams WHERE id = ? AND (
            owner_user_id = ? OR
            owner_user_id IN (SELECT staff_user_id FROM secondary_admin_assignments WHERE secondary_admin_id = ?)
          )
        `).get(existing.assigned_team_id, req.user!.id, req.user!.id)) ||
        Boolean(db.prepare('SELECT 1 FROM secondary_admin_assignments WHERE secondary_admin_id = ? AND staff_user_id = ?').get(req.user!.id, existing.assigned_supervisor_id));

      if (!allowed) {
        return res.status(403).json({ error: 'Access denied: You can only remove labourers within your managed teams.' });
      }
    } else {
      // Staff user: only permitted to remove labourers assigned to their own teams or supervised by them
      const allowed = existing.assigned_supervisor_id === req.user!.id ||
        existing.created_by === req.user!.id ||
        Boolean(db.prepare('SELECT 1 FROM teams WHERE id = ? AND owner_user_id = ?').get(existing.assigned_team_id, req.user!.id));

      if (!allowed) {
        return res.status(403).json({ error: 'Access denied: You can only remove labourers assigned to your own teams.' });
      }
    }
  }

  // Check if historical attendance exists
  const attCount = (db.prepare('SELECT COUNT(*) as c FROM labourer_attendance_records WHERE user_id = ?').get(id) as { c: number })?.c || 0;
  const now = new Date().toISOString();

  if (attCount > 0) {
    // Soft remove / deactivate to preserve historical attendance data integrity
    db.prepare(`
      UPDATE users SET
        status = 'inactive',
        employment_status = 'inactive',
        assigned_team_id = NULL,
        updated_at = ?
      WHERE id = ?
    `).run(now, id);
  } else {
    // Hard delete if no attendance records exist
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'REMOVE_LABOURER',
    entityType: 'users',
    entityId: id,
    previousValues: { fullName: existing.full_name, teamId: existing.assigned_team_id, attendanceCount: attCount },
  });

  res.json({ success: true, message: `Labourer "${existing.full_name}" removed successfully.` });
});

apiRouter.post('/labourers/:id/transfer-team', requireAuth, requireStaffOrAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const { newTeamId, reason } = req.body;
  if (!newTeamId) {
    return res.status(400).json({ error: 'Target team ID is required.' });
  }

  const labourer = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'labourer'").get(id) as any;
  if (!labourer) {
    return res.status(404).json({ error: 'Labourer not found.' });
  }

  const oldTeamId = labourer.assigned_team_id;
  const now = new Date().toISOString();

  db.prepare('UPDATE users SET assigned_team_id = ?, updated_at = ? WHERE id = ?').run(newTeamId, now, id);

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'TRANSFER_LABOURER_TEAM',
    entityType: 'users',
    entityId: id,
    previousValues: { teamId: oldTeamId },
    newValues: { teamId: newTeamId },
    reason: reason || 'Labourer reassigned to new team while preserving historical attendance.',
  });

  res.json({ success: true, message: 'Labourer transferred to new team successfully.' });
});

apiRouter.post('/labourers/:id/reset-password', requireAuth, requireStaffOrAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(newHash, new Date().toISOString(), id);

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'RESET_LABOURER_PASSWORD',
    entityType: 'users',
    entityId: id,
    reason: 'Authorized administrator password reset',
  });

  res.json({ success: true, message: 'Labourer password reset successfully.' });
});

// =========================================================================
// 20.B GEOFENCE LOCATION SEARCH PROXY (OPENSTREETMAP NOMINATIM + LOCAL WORKSITES)
// =========================================================================
apiRouter.get('/geo/search', requireAuth, async (req: Request, res: Response) => {
  const query = String(req.query.q || '').trim();
  if (!query) {
    return res.json([]);
  }

  const results: Array<{ place_id: string | number; lat: string; lon: string; display_name: string; is_local?: boolean }> = [];

  // 1. Search local known worksites first
  try {
    const local = db.prepare(`
      SELECT id, name, project_name, address, latitude, longitude
      FROM worksites
      WHERE status = 'active' AND (
        name LIKE ? OR project_name LIKE ? OR (address IS NOT NULL AND address LIKE ?)
      )
      LIMIT 4
    `).all(`%${query}%`, `%${query}%`, `%${query}%`) as any[];

    for (const ws of local) {
      results.push({
        place_id: `ws-${ws.id}`,
        lat: String(ws.latitude),
        lon: String(ws.longitude),
        display_name: `[Worksite] ${ws.name} - ${ws.project_name}${ws.address ? ` (${ws.address})` : ''}`,
        is_local: true,
      });
    }
  } catch (err: any) {
    console.warn('[GEO_LOCAL_SEARCH_ERROR]', err?.message);
  }

  // 2. Query OpenStreetMap Nominatim with compliant server-side User-Agent
  try {
    const osmUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6&addressdetails=1`;
    const resp = await fetch(osmUrl, {
      headers: {
        'User-Agent': 'SolarERP-Geofence/1.0 (internal-erp-system)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data)) {
        for (const item of data) {
          results.push({
            place_id: item.place_id || item.osm_id || Math.random().toString(),
            lat: String(item.lat),
            lon: String(item.lon),
            display_name: item.display_name,
            is_local: false,
          });
        }
      }
    }
  } catch (err: any) {
    console.warn('[GEO_OSM_SEARCH_ERROR]', err?.message);
  }

  res.json(results);
});

// =========================================================================
// 21. GPS ATTENDANCE (CHECK-IN & CHECK-OUT WITH HAVERSINE GEOFENCE VALIDATION)
// =========================================================================

// POST /api/gps-attendance/check-in
apiRouter.post('/gps-attendance/check-in', requireAuth, (req: Request, res: Response) => {
  const { latitude, longitude, accuracy, deviceTimestamp, notes } = req.body;
  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'GPS coordinates (latitude, longitude) are required for check-in.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as any;
  if (!user || user.status !== 'active') {
    return res.status(403).json({ error: 'User account is not active.' });
  }

  // Find assigned worksite
  let worksiteId = user.assigned_worksite_id;
  if (!worksiteId && user.assigned_team_id) {
    const team = db.prepare('SELECT assigned_worksite_id FROM teams WHERE id = ?').get(user.assigned_team_id) as any;
    if (team?.assigned_worksite_id) worksiteId = team.assigned_worksite_id;
  }
  // Fallback to first active worksite if none explicitly assigned
  if (!worksiteId) {
    const firstWs = db.prepare("SELECT id FROM worksites WHERE status = 'active' LIMIT 1").get() as any;
    worksiteId = firstWs?.id;
  }

  if (!worksiteId) {
    return res.status(400).json({ error: 'No active worksite assigned to this account. Please contact your site supervisor.' });
  }

  const worksite = db.prepare('SELECT * FROM worksites WHERE id = ?').get(worksiteId) as any;
  if (!worksite) {
    return res.status(404).json({ error: 'Assigned worksite not found in system.' });
  }

  const today = getTodayKolkataISO();
  const bounds = getWeekBounds(today);

  // Check if user already has an active check-in today without check-out
  const activeRecord = db.prepare(`
    SELECT * FROM labourer_attendance_records
    WHERE user_id = ? AND date = ? AND check_out_time IS NULL
  `).get(user.id, today) as any;

  if (activeRecord) {
    return res.status(400).json({
      error: 'You already have an active check-in for today. Please check out before checking in again.',
      activeRecord,
    });
  }

  // Server-side Haversine distance validation
  const distanceMeters = calculateHaversineDistanceMeters(
    Number(latitude),
    Number(longitude),
    Number(worksite.latitude),
    Number(worksite.longitude)
  );

  const acc = Number(accuracy) || 10;
  const maxAccuracy = worksite.accuracy_threshold_meters || 50;
  const allowedRadius = worksite.allowed_radius_meters || 150;

  let checkInStatus = 'valid_location';
  const exceptions: string[] = [];

  if (acc > maxAccuracy) {
    checkInStatus = 'poor_accuracy';
    exceptions.push(`GPS accuracy was ${Math.round(acc)}m (allowed: ${maxAccuracy}m)`);
  } else if (distanceMeters > allowedRadius) {
    checkInStatus = 'outside_radius';
    exceptions.push(`Location is ${distanceMeters}m away from ${worksite.name} (allowed: ${allowedRadius}m)`);
  }

  const id = `lar-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const nowTime = new Date().toISOString();
  const supervisorId = user.assigned_supervisor_id || 'usr-admin-01';

  db.prepare(`
    INSERT INTO labourer_attendance_records (
      id, user_id, user_name, user_role, team_id, worksite_id, worksite_name,
      date, week_start_date, supervisor_id,
      check_in_time, check_in_device_time, check_in_lat, check_in_lon,
      check_in_accuracy, check_in_distance_meters, check_in_status,
      rate_applied, status, exception_flags_json, notes, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, 'pending', ?, ?, ?, ?
    )
  `).run(
    id,
    user.id,
    user.full_name,
    user.role,
    user.assigned_team_id || null,
    worksite.id,
    worksite.name,
    today,
    bounds.startDate,
    supervisorId,
    nowTime,
    deviceTimestamp || nowTime,
    Number(latitude),
    Number(longitude),
    acc,
    distanceMeters,
    checkInStatus,
    user.daily_rate || 0,
    JSON.stringify(exceptions),
    notes || '',
    nowTime,
    nowTime
  );

  logAudit({
    actorId: user.id,
    actorName: user.full_name,
    actorRole: user.role,
    action: 'GPS_CHECK_IN',
    entityType: 'labourer_attendance_records',
    entityId: id,
    newValues: { worksite: worksite.name, distanceMeters, accuracy: acc, status: checkInStatus },
    reason: exceptions.length > 0 ? exceptions.join('; ') : 'Successful geofenced check-in',
  });

  res.status(201).json({
    id,
    message: checkInStatus === 'valid_location'
      ? `Check-in recorded successfully at ${worksite.name} (${distanceMeters}m from site center).`
      : `Check-in recorded with flag [${checkInStatus}]: ${exceptions.join('; ')}`,
    checkInStatus,
    distanceMeters,
    worksiteName: worksite.name,
    allowedRadius,
    accuracy: acc,
    checkInTime: nowTime,
  });
});

// POST /api/gps-attendance/check-out
apiRouter.post('/gps-attendance/check-out', requireAuth, (req: Request, res: Response) => {
  const { latitude, longitude, accuracy, deviceTimestamp, notes } = req.body;
  const user = req.user!;
  const today = getTodayKolkataISO();

  // Find active check-in today
  const activeRecord = db.prepare(`
    SELECT * FROM labourer_attendance_records
    WHERE user_id = ? AND date = ? AND check_out_time IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(user.id, today) as any;

  if (!activeRecord) {
    return res.status(400).json({ error: 'No active check-in found for today to check out from.' });
  }

  const worksite = db.prepare('SELECT * FROM worksites WHERE id = ?').get(activeRecord.worksite_id) as any;
  let distanceMeters = 0;
  if (worksite && latitude !== undefined && longitude !== undefined) {
    distanceMeters = calculateHaversineDistanceMeters(
      Number(latitude),
      Number(longitude),
      Number(worksite.latitude),
      Number(worksite.longitude)
    );
  }

  const acc = Number(accuracy) || 10;
  const maxAccuracy = worksite?.accuracy_threshold_meters || 50;
  const allowedRadius = worksite?.allowed_radius_meters || 150;

  let checkOutStatus = 'valid_location';
  const exceptions: string[] = JSON.parse(activeRecord.exception_flags_json || '[]');

  if (acc > maxAccuracy) {
    checkOutStatus = 'poor_accuracy';
    exceptions.push(`Checkout GPS accuracy was ${Math.round(acc)}m`);
  } else if (distanceMeters > allowedRadius) {
    checkOutStatus = 'outside_radius';
    exceptions.push(`Checkout location was ${distanceMeters}m away from worksite`);
  }

  const checkOutTime = new Date().toISOString();
  const checkInDate = new Date(activeRecord.check_in_time);
  const checkOutDate = new Date(checkOutTime);
  const diffMinutes = Math.max(0, Math.round((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60)));

  // Calculate standard 8-hour workday, lunch break, and overtime
  const workingHours = Number((diffMinutes / 60).toFixed(2));
  const payableHours = Math.min(8, workingHours);
  const overtimeHours = Math.max(0, workingHours - 8);

  // Daily or hourly wages
  const dailyRate = activeRecord.rate_applied || user.dailyRate || 0;
  const hourlyRate = user.hourlyRate || (dailyRate > 0 ? dailyRate / 8 : 150);
  const calculatedWages = round2((payableHours / 8) * dailyRate + overtimeHours * hourlyRate * 1.5);

  db.prepare(`
    UPDATE labourer_attendance_records SET
      check_out_time = ?,
      check_out_device_time = ?,
      check_out_lat = ?,
      check_out_lon = ?,
      check_out_accuracy = ?,
      check_out_distance_meters = ?,
      check_out_status = ?,
      total_working_minutes = ?,
      payable_hours = ?,
      overtime_hours = ?,
      calculated_wages = ?,
      exception_flags_json = ?,
      notes = COALESCE(?, notes),
      updated_at = ?
    WHERE id = ?
  `).run(
    checkOutTime,
    deviceTimestamp || checkOutTime,
    latitude !== undefined ? Number(latitude) : null,
    longitude !== undefined ? Number(longitude) : null,
    acc,
    distanceMeters,
    checkOutStatus,
    diffMinutes,
    payableHours,
    overtimeHours,
    calculatedWages,
    JSON.stringify(exceptions),
    notes || null,
    checkOutTime,
    activeRecord.id
  );

  // Notify assigned supervisor of completed shift awaiting review
  if (activeRecord.supervisor_id) {
    createNotification({
      userId: activeRecord.supervisor_id,
      title: 'GPS Attendance Shift Completed',
      message: `${user.fullName} completed shift (${workingHours} hrs) at ${activeRecord.worksite_name}. Awaiting review.`,
      type: 'approval',
      link: '/attendance',
    });
  }

  logAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: 'GPS_CHECK_OUT',
    entityType: 'labourer_attendance_records',
    entityId: activeRecord.id,
    newValues: { workingHours, payableHours, overtimeHours, calculatedWages, distanceMeters, checkOutStatus },
  });

  res.json({
    message: 'Check-out completed successfully.',
    totalWorkingMinutes: diffMinutes,
    payableHours,
    overtimeHours,
    calculatedWages,
    checkOutTime,
  });
});

// GET /api/gps-attendance/today
apiRouter.get('/gps-attendance/today', requireAuth, (req: Request, res: Response) => {
  const today = getTodayKolkataISO();
  const record = db.prepare(`
    SELECT * FROM labourer_attendance_records
    WHERE user_id = ? AND date = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(req.user!.id, today);
  res.json({ todayRecord: record || null });
});

// GET /api/gps-attendance/team-today (Returns individual self-marked labourers for a team on a date)
apiRouter.get('/gps-attendance/team-today', requireAuth, (req: Request, res: Response) => {
  const teamId = (req.query.teamId as string) || '';
  const date = (req.query.date as string) || getTodayKolkataISO();

  if (!teamId) {
    return res.status(400).json({ error: 'teamId parameter is required.' });
  }

  const records = db.prepare(`
    SELECT r.*, u.full_name as worker_name, u.mobile_number, u.masked_aadhaar,
           u.labour_category_id, c.name as category_name, c.code as category_code,
           u.daily_rate, u.hourly_rate
    FROM labourer_attendance_records r
    JOIN users u ON r.user_id = u.id
    LEFT JOIN labour_categories c ON u.labour_category_id = c.id
    WHERE r.team_id = ? AND r.date = ?
    ORDER BY r.check_in_time ASC
  `).all(teamId, date) as any[];

  res.json(records);
});

// GET /api/gps-attendance/my-history
apiRouter.get('/gps-attendance/my-history', requireAuth, (req: Request, res: Response) => {
  const records = db.prepare(`
    SELECT * FROM labourer_attendance_records
    WHERE user_id = ?
    ORDER BY date DESC, created_at DESC
    LIMIT 60
  `).all(req.user!.id);
  res.json(records);
});

// GET /api/gps-attendance/all (Supervisor and Admin Review Queue)
apiRouter.get('/gps-attendance/all', requireAuth, requireStaffOrAdmin, (req: Request, res: Response) => {
  const { weekStartDate, date, teamId, worksiteId, status, secondaryAdminId, staffUserId } = req.query;
  let query = `
    SELECT r.*, u.mobile_number, u.masked_aadhaar, sup.full_name as supervisor_name,
           COALESCE(sec.id, sup.assigned_admin_id, 'head_office') as secondary_admin_id,
           COALESCE(sec.full_name, 'Head Office / Master Admin') as secondary_admin_name,
           COALESCE(sec.assigned_location, 'Head Office') as office_location,
           CASE
             WHEN sec.id IS NOT NULL THEN (COALESCE(sec.assigned_location, 'Branch') || ' Office (' || sec.full_name || ')')
             ELSE 'Head Office (Central)'
           END as office_name
    FROM labourer_attendance_records r
    LEFT JOIN users u ON r.user_id = u.id
    LEFT JOIN users sup ON r.supervisor_id = sup.id
    LEFT JOIN secondary_admin_assignments saa ON saa.staff_user_id = sup.id
    LEFT JOIN users sec ON (sec.id = saa.secondary_admin_id OR sec.id = sup.assigned_admin_id)
    WHERE 1=1
  `;
  const params: any[] = [];

  if (isSecondaryAdmin(req.user)) {
    query += ` AND (r.supervisor_id = ? OR r.user_id IN (SELECT staff_user_id FROM secondary_admin_assignments WHERE secondary_admin_id = ?))`;
    params.push(req.user!.id, req.user!.id);
  } else if (!isAdminAny(req.user)) {
    // Staff: see only their assigned labourers/records
    query += ` AND (r.supervisor_id = ? OR r.user_id = ?)`;
    params.push(req.user!.id, req.user!.id);
  } else {
    // Master admin can filter by secondaryAdminId / office or staff
    if (secondaryAdminId && secondaryAdminId !== 'all') {
      if (secondaryAdminId === 'head_office') {
        query += ' AND (sec.id IS NULL AND (sup.assigned_admin_id IS NULL OR sup.assigned_admin_id = req.user.id))';
      } else {
        query += ' AND (sec.id = ? OR sup.assigned_admin_id = ?)';
        params.push(secondaryAdminId, secondaryAdminId);
      }
    }
    if (staffUserId) {
      query += ' AND (r.supervisor_id = ? OR r.user_id = ?)';
      params.push(staffUserId, staffUserId);
    }
  }

  if (weekStartDate) {
    query += ' AND r.week_start_date = ?';
    params.push(weekStartDate);
  }
  if (date) {
    query += ' AND r.date = ?';
    params.push(date);
  }
  if (teamId) {
    query += ' AND r.team_id = ?';
    params.push(teamId);
  }
  if (worksiteId) {
    query += ' AND r.worksite_id = ?';
    params.push(worksiteId);
  }
  if (status) {
    query += ' AND r.status = ?';
    params.push(status);
  }

  query += ' ORDER BY r.date DESC, r.created_at DESC LIMIT 200';
  const records = db.prepare(query).all(...params);
  res.json(records);
});

// PUT /api/gps-attendance/:id/override (Admin Manual Override with Mandatory Reason)
apiRouter.put('/gps-attendance/:id/override', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason, status, payableHours, overtimeHours, notes } = req.body;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'A mandatory reason is required for manual attendance override.' });
  }

  const existing = db.prepare('SELECT * FROM labourer_attendance_records WHERE id = ?').get(id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Attendance record not found.' });
  }

  const now = new Date().toISOString();
  const newStatus = status || 'approved';
  const hrs = payableHours !== undefined ? Number(payableHours) : existing.payable_hours;
  const ot = overtimeHours !== undefined ? Number(overtimeHours) : existing.overtime_hours;
  const rate = existing.rate_applied || 0;
  const recalculatedWages = round2((hrs / 8) * rate + ot * (rate / 8) * 1.5);

  db.prepare(`
    UPDATE labourer_attendance_records SET
      status = ?,
      is_overridden = 1,
      override_reason = ?,
      override_by = ?,
      override_by_name = ?,
      override_at = ?,
      payable_hours = ?,
      overtime_hours = ?,
      calculated_wages = ?,
      notes = COALESCE(?, notes),
      updated_at = ?
    WHERE id = ?
  `).run(
    newStatus,
    reason.trim(),
    req.user!.id,
    req.user!.fullName,
    now,
    hrs,
    ot,
    recalculatedWages,
    notes || null,
    now,
    id
  );

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'GPS_ATTENDANCE_OVERRIDE',
    entityType: 'labourer_attendance_records',
    entityId: id,
    previousValues: { status: existing.status, payableHours: existing.payable_hours },
    newValues: { status: newStatus, payableHours: hrs, overtimeHours: ot, overrideReason: reason },
    reason: reason.trim(),
  });

  res.json({ success: true, message: 'Attendance record overridden and updated successfully.' });
});

// PUT /api/gps-attendance/:id/approve & reject
apiRouter.put('/gps-attendance/:id/approve', requireAuth, requireStaffOrAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM labourer_attendance_records WHERE id = ?').get(id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Attendance record not found.' });
  }

  // STRICT RULE: No self-approval!
  if (existing.user_id === req.user!.id) {
    return res.status(403).json({ error: 'Self-approval is strictly forbidden. Your designated attendance supervisor must review and approve your submission.' });
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE labourer_attendance_records SET
      status = 'approved',
      approved_by = ?,
      approved_by_name = ?,
      approved_at = ?,
      updated_at = ?
    WHERE id = ?
  `).run(req.user!.id, req.user!.fullName, now, now, id);

  createNotification({
    userId: existing.user_id,
    title: 'Attendance Approved',
    message: `Your GPS attendance for ${existing.date} (${existing.payable_hours} hrs) has been approved.`,
    type: 'approval',
  });

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'APPROVE_GPS_ATTENDANCE',
    entityType: 'labourer_attendance_records',
    entityId: id,
  });

  res.json({ success: true, message: 'Attendance approved.' });
});

apiRouter.put('/gps-attendance/:id/reject', requireAuth, requireStaffOrAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'A rejection reason is required.' });
  }

  const existing = db.prepare('SELECT * FROM labourer_attendance_records WHERE id = ?').get(id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Attendance record not found.' });
  }

  if (existing.user_id === req.user!.id) {
    return res.status(403).json({ error: 'You cannot reject your own record.' });
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE labourer_attendance_records SET
      status = 'rejected',
      rejection_reason = ?,
      updated_at = ?
    WHERE id = ?
  `).run(reason.trim(), now, id);

  createNotification({
    userId: existing.user_id,
    title: 'Attendance Rejected',
    message: `Your GPS attendance for ${existing.date} was rejected: ${reason}`,
    type: 'rejection',
  });

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'REJECT_GPS_ATTENDANCE',
    entityType: 'labourer_attendance_records',
    entityId: id,
    reason: reason.trim(),
  });

  res.json({ success: true, message: 'Attendance rejected.' });
});

// POST /api/gps-attendance/:id/re-request-location (Re-request Location for Outside Radius / Attendance Re-check)
apiRouter.post('/gps-attendance/:id/re-request-location', requireAuth, requireStaffOrAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason, notes } = req.body;
  const existing = db.prepare('SELECT * FROM labourer_attendance_records WHERE id = ?').get(id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Attendance record not found.' });
  }

  const now = new Date();
  const requestedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

  // 1. Create a 30-min spot verification request for this worker
  const verifId = `vrf-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  db.prepare(`
    INSERT INTO attendance_verification_requests (
      id, target_type, target_user_id, target_team_id, requested_by_id, requested_by_name,
      requested_at, expires_at, status, worksite_id, response_notes, created_at
    ) VALUES (?, 'individual', ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `).run(
    verifId,
    existing.user_id,
    existing.team_id || null,
    req.user!.id,
    req.user!.fullName,
    requestedAt,
    expiresAt,
    existing.worksite_id,
    notes || reason || 'Location re-request due to outside radius/geofence discrepancy',
    requestedAt
  );

  // 2. Mark the attendance record as re-check requested
  db.prepare(`
    UPDATE labourer_attendance_records SET
      status = 'pending',
      re_check_requested = 1,
      re_check_reason = ?,
      updated_at = ?
    WHERE id = ?
  `).run(reason || 'Location was outside worksite radius. 30-min re-verification requested.', requestedAt, id);

  // 3. Notify labourer
  createNotification({
    userId: existing.user_id,
    title: '⚠️ Location Re-verification Required',
    message: `${req.user!.fullName} requested you re-verify your location within 30 minutes. Your attendance check-in is pending re-check.`,
    type: 'approval',
    link: '/attendance',
  });

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'RE_REQUEST_LOCATION_VERIFICATION',
    entityType: 'labourer_attendance_records',
    entityId: id,
    newValues: { verificationId: verifId, expiresAt, reason },
  });

  res.json({
    success: true,
    message: 'Re-verification requested. Labourer has 30 minutes to confirm location inside the geofence perimeter.',
    verificationId: verifId,
    expiresAt,
  });
});

// Reconciliation check between count-based attendance and individual GPS attendance
apiRouter.get('/gps-attendance/reconciliation', requireAuth, requireStaffOrAdmin, (req: Request, res: Response) => {
  const { weekStartDate } = req.query;
  const weekStart = (weekStartDate as string) || getWeekBounds(getTodayKolkataISO()).startDate;

  // Find teams with both count-based attendance entries and individual GPS records for the same week
  const countEntries = db.prepare(`
    SELECT ae.team_id, t.name as team_name, ae.date, COUNT(*) as entries_count, SUM(al.count) as total_headcount
    FROM attendance_entries ae
    JOIN teams t ON ae.team_id = t.id
    JOIN attendance_lines al ON ae.id = al.attendance_entry_id
    WHERE ae.week_start_date = ? AND ae.is_deleted = 0
    GROUP BY ae.team_id, ae.date
  `).all(weekStart) as any[];

  const gpsEntries = db.prepare(`
    SELECT r.team_id, t.name as team_name, r.date, COUNT(*) as individual_workers_count,
           SUM(r.payable_hours) as total_gps_hours, SUM(r.calculated_wages) as total_gps_wages
    FROM labourer_attendance_records r
    LEFT JOIN teams t ON r.team_id = t.id
    WHERE r.week_start_date = ? AND r.status != 'rejected'
    GROUP BY r.team_id, r.date
  `).all(weekStart) as any[];

  // Cross check overlaps
  const overlaps: any[] = [];
  for (const c of countEntries) {
    const match = gpsEntries.find(g => g.team_id === c.team_id && g.date === c.date);
    if (match) {
      overlaps.push({
        teamId: c.team_id,
        teamName: c.team_name,
        date: c.date,
        countBasedHeadcount: c.total_headcount,
        individualGpsCount: match.individual_workers_count,
        warning: 'Potential double count: team has both count-based entries and individual GPS check-ins for the same day.',
      });
    }
  }

  res.json({
    weekStartDate: weekStart,
    overlapsCount: overlaps.length,
    overlaps,
    countEntries,
    gpsEntries,
  });
});

// =========================================================================
// 22. RANDOM ATTENDANCE VERIFICATION (30-MINUTE EXPIRY WINDOW)
// =========================================================================

// POST /api/verifications/request (Trigger 30-min spot check)
apiRouter.post('/verifications/request', requireAuth, requireStaffOrAdmin, (req: Request, res: Response) => {
  const { targetType, targetUserId, targetTeamId, worksiteId, notes } = req.body;
  if (!targetType || (!targetUserId && !targetTeamId)) {
    return res.status(400).json({ error: 'Target type and target user or team ID are required.' });
  }

  // STRICT RULE: No self-verification requests
  if (targetUserId === req.user!.id) {
    return res.status(403).json({ error: 'You cannot request verification for your own account.' });
  }

  const now = new Date();
  const requestedAt = now.toISOString();
  // EXACTLY 30 minutes expiry
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

  const id = `vrf-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  db.prepare(`
    INSERT INTO attendance_verification_requests (
      id, target_type, target_user_id, target_team_id,
      requested_by_id, requested_by_name, requested_at, expires_at,
      status, worksite_id, response_notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `).run(
    id,
    targetType,
    targetUserId || null,
    targetTeamId || null,
    req.user!.id,
    req.user!.fullName,
    requestedAt,
    expiresAt,
    worksiteId || null,
    notes || 'Random 30-minute spot verification',
    requestedAt
  );

  // Send persistent in-app notifications to target labourers
  let targetUserIds: string[] = [];
  if (targetUserId) {
    targetUserIds = [targetUserId];
  } else if (targetTeamId) {
    const labourers = db.prepare("SELECT id FROM users WHERE assigned_team_id = ? AND role = 'labourer'").all(targetTeamId) as Array<{ id: string }>;
    targetUserIds = labourers.map(l => l.id);
  }

  for (const uid of targetUserIds) {
    createNotification({
      userId: uid,
      title: 'Action Required: Attendance Verification',
      message: `Verification requested by ${req.user!.fullName}. Please confirm your location within 30 minutes.`,
      type: 'approval',
      link: '/attendance',
    });
  }

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'REQUEST_ATTENDANCE_VERIFICATION',
    entityType: 'attendance_verification_requests',
    entityId: id,
    newValues: { targetType, targetUserId, targetTeamId, expiresAt },
  });

  res.status(201).json({
    id,
    message: 'Attendance verification requested. Workers have 30 minutes to verify.',
    expiresAt,
    targetsNotified: targetUserIds.length,
  });
});

// GET /api/verifications/active (Pending requests for current logged in user)
apiRouter.get('/verifications/active', requireAuth, (req: Request, res: Response) => {
  const now = new Date().toISOString();

  // Mark any pending verifications that have passed their 30-min window as 'expired'
  db.prepare(`
    UPDATE attendance_verification_requests
    SET status = 'expired'
    WHERE status = 'pending' AND expires_at < ?
  `).run(now);

  // Retrieve active pending requests for current user (direct user or via assigned team)
  const user = db.prepare('SELECT assigned_team_id FROM users WHERE id = ?').get(req.user!.id) as any;
  const teamId = user?.assigned_team_id || '__none__';

  const active = db.prepare(`
    SELECT v.*, w.name as worksite_name
    FROM attendance_verification_requests v
    LEFT JOIN worksites w ON v.worksite_id = w.id
    WHERE v.status = 'pending'
      AND v.expires_at > ?
      AND (v.target_user_id = ? OR v.target_team_id = ?)
    ORDER BY v.requested_at DESC
  `).all(now, req.user!.id, teamId);

  res.json(active);
});

// POST /api/verifications/:id/respond (Worker provides fresh GPS fix)
apiRouter.post('/verifications/:id/respond', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const { latitude, longitude, accuracy, deviceTimestamp, notes } = req.body;

  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'GPS coordinates are required to verify attendance.' });
  }

  const request = db.prepare('SELECT * FROM attendance_verification_requests WHERE id = ?').get(id) as any;
  if (!request) {
    return res.status(404).json({ error: 'Verification request not found.' });
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // Check 30-minute expiry
  if (now.getTime() > new Date(request.expires_at).getTime()) {
    db.prepare("UPDATE attendance_verification_requests SET status = 'expired' WHERE id = ?").run(id);
    return res.status(400).json({
      error: 'The 30-minute response window for this verification request has expired.',
      status: 'expired',
    });
  }

  // Worksite lookup
  let worksiteId = request.worksite_id;
  if (!worksiteId) {
    const user = db.prepare('SELECT assigned_worksite_id FROM users WHERE id = ?').get(req.user!.id) as any;
    worksiteId = user?.assigned_worksite_id;
  }
  if (!worksiteId) {
    const firstWs = db.prepare("SELECT id FROM worksites WHERE status = 'active' LIMIT 1").get() as any;
    worksiteId = firstWs?.id;
  }

  const worksite = worksiteId ? db.prepare('SELECT * FROM worksites WHERE id = ?').get(worksiteId) as any : null;

  let distanceMeters = 0;
  if (worksite) {
    distanceMeters = calculateHaversineDistanceMeters(
      Number(latitude),
      Number(longitude),
      Number(worksite.latitude),
      Number(worksite.longitude)
    );
  }

  const acc = Number(accuracy) || 10;
  const maxAccuracy = worksite?.accuracy_threshold_meters || 50;
  const allowedRadius = worksite?.allowed_radius_meters || 150;

  let verificationStatus = 'valid_location';
  if (acc > maxAccuracy) {
    verificationStatus = 'poor_accuracy';
  } else if (distanceMeters > allowedRadius) {
    verificationStatus = 'outside_radius';
  }

  db.prepare(`
    UPDATE attendance_verification_requests SET
      status = ?,
      responded_at = ?,
      responded_lat = ?,
      responded_lon = ?,
      responded_accuracy = ?,
      distance_meters = ?,
      worksite_id = ?,
      response_notes = ?
    WHERE id = ?
  `).run(
    verificationStatus,
    nowIso,
    Number(latitude),
    Number(longitude),
    acc,
    distanceMeters,
    worksite?.id || null,
    notes || null,
    id
  );

  // Auto-reconcile and update attendance record if worker re-verified inside valid geofence
  if (verificationStatus === 'valid_location') {
    const today = getTodayKolkataISO();
    try {
      db.prepare(`
        UPDATE labourer_attendance_records SET
          check_in_status = 'valid_location',
          check_in_distance_meters = ?,
          check_in_accuracy = ?,
          check_in_lat = ?,
          check_in_lon = ?,
          re_check_requested = 0,
          status = 'approved',
          notes = CASE 
            WHEN notes IS NULL OR notes = '' THEN 'Re-verified inside site geofence'
            ELSE notes || ' [Re-verified inside site geofence]'
          END,
          updated_at = ?
        WHERE user_id = ? AND date = ? AND (re_check_requested = 1 OR check_in_status = 'outside_radius')
      `).run(distanceMeters, acc, Number(latitude), Number(longitude), nowIso, req.user!.id, today);
    } catch (err: any) {
      console.warn('[RECONCILE_RECHECK_ERROR]', err?.message);
    }
  }

  // Notify requesting admin
  createNotification({
    userId: request.requested_by_id,
    title: `Verification Response: ${req.user!.fullName}`,
    message: `${req.user!.fullName} responded [${verificationStatus}] (${distanceMeters}m from site).`,
    type: 'info',
  });

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'RESPOND_ATTENDANCE_VERIFICATION',
    entityType: 'attendance_verification_requests',
    entityId: id,
    newValues: { status: verificationStatus, distanceMeters, accuracy: acc },
  });

  res.json({
    success: true,
    message: verificationStatus === 'valid_location'
      ? 'Attendance verified successfully. Location confirmed inside worksite.'
      : `Attendance verified with flag: ${verificationStatus} (${distanceMeters}m from site center).`,
    status: verificationStatus,
    distanceMeters,
    accuracy: acc,
  });
});

// GET /api/verifications/list (Admin and Staff overview and day monitoring)
apiRouter.get('/verifications/list', requireAuth, requireStaffOrAdmin, (req: Request, res: Response) => {
  const now = new Date().toISOString();
  const { date, teamId, status } = req.query;

  // Auto expire old requests
  db.prepare("UPDATE attendance_verification_requests SET status = 'expired' WHERE status = 'pending' AND expires_at < ?").run(now);

  let query = `
    SELECT v.*, u.full_name as target_user_name, t.name as target_team_name, w.name as worksite_name
    FROM attendance_verification_requests v
    LEFT JOIN users u ON v.target_user_id = u.id
    LEFT JOIN teams t ON v.target_team_id = t.id
    LEFT JOIN worksites w ON v.worksite_id = w.id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (date) {
    query += ` AND (date(v.requested_at) = ? OR v.requested_at LIKE ?)`;
    params.push(date, `${date}%`);
  }
  if (teamId) {
    query += ' AND v.target_team_id = ?';
    params.push(teamId);
  }
  if (status) {
    query += ' AND v.status = ?';
    params.push(status);
  }

  query += ' ORDER BY v.requested_at DESC LIMIT 150';
  const list = db.prepare(query).all(...params);
  res.json(list);
});

// =========================================================================
// 23. ATTENDANCE SUPERVISOR & PARTICIPANT ASSIGNMENTS
// =========================================================================
apiRouter.get('/attendance-supervisors', requireAuth, requireStaffOrAdmin, (req: Request, res: Response) => {
  const assignments = db.prepare(`
    SELECT a.*, p.full_name as participant_name, p.role as participant_actual_role,
           s.full_name as supervisor_name, s.role as supervisor_role,
           t.name as team_name, w.name as worksite_name
    FROM attendance_supervisors a
    JOIN users p ON a.participant_id = p.id
    JOIN users s ON a.supervisor_id = s.id
    LEFT JOIN teams t ON a.assigned_team_id = t.id
    LEFT JOIN worksites w ON a.assigned_worksite_id = w.id
    ORDER BY a.created_at DESC
  `).all();
  res.json(assignments);
});

apiRouter.post('/attendance-supervisors', requireAuth, requireMasterAdmin, (req: Request, res: Response) => {
  const { participantId, supervisorId, assignedTeamId, assignedWorksiteId, attendanceMethod } = req.body;
  if (!participantId || !supervisorId) {
    return res.status(400).json({ error: 'Participant and supervisor user IDs are required.' });
  }

  if (participantId === supervisorId) {
    return res.status(400).json({ error: 'A user cannot be their own attendance supervisor.' });
  }

  const participant = db.prepare('SELECT id, full_name, role FROM users WHERE id = ?').get(participantId) as any;
  if (!participant) {
    return res.status(404).json({ error: 'Participant account not found.' });
  }

  const id = `sup-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO attendance_supervisors (
      id, participant_id, actual_role, supervisor_id, assigned_team_id, assigned_worksite_id,
      attendance_method, effective_date, status, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    ON CONFLICT(participant_id, supervisor_id) DO UPDATE SET
      assigned_team_id = excluded.assigned_team_id,
      assigned_worksite_id = excluded.assigned_worksite_id,
      attendance_method = excluded.attendance_method,
      updated_at = excluded.updated_at
  `).run(
    id,
    participant.id,
    participant.role,
    supervisorId,
    assignedTeamId || null,
    assignedWorksiteId || null,
    attendanceMethod || 'gps',
    now.slice(0, 10),
    req.user!.id,
    now,
    now
  );

  // Update participant's user record
  db.prepare(`
    UPDATE users SET
      is_attendance_participant = 1,
      assigned_supervisor_id = ?,
      assigned_worksite_id = COALESCE(?, assigned_worksite_id),
      assigned_team_id = COALESCE(?, assigned_team_id),
      updated_at = ?
    WHERE id = ?
  `).run(supervisorId, assignedWorksiteId || null, assignedTeamId || null, now, participantId);

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'ASSIGN_ATTENDANCE_SUPERVISOR',
    entityType: 'attendance_supervisors',
    entityId: id,
    newValues: { participantId, supervisorId, actualRole: participant.role },
  });

  res.status(201).json({ success: true, message: 'Attendance participation and supervisor assigned.' });
});

apiRouter.delete('/attendance-supervisors/:id', requireAuth, requireMasterAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM attendance_supervisors WHERE id = ?').get(id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Assignment not found.' });
  }

  db.prepare('DELETE FROM attendance_supervisors WHERE id = ?').run(id);

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'DELETE_ATTENDANCE_SUPERVISOR',
    entityType: 'attendance_supervisors',
    entityId: id,
    previousValues: existing,
  });

  res.json({ success: true, message: 'Supervisor assignment removed.' });
});

// =========================================================================
// 24. GEOFENCE LOCATION CHANGE REQUESTS & ADMIN APPROVAL WORKFLOW
// =========================================================================

// POST /api/geofence-requests (Staff or Admin submits location change request)
apiRouter.post('/geofence-requests', requireAuth, requireStaffOrAdmin, (req: Request, res: Response) => {
  const {
    entityType = 'team',
    entityId,
    requestedLatitude,
    requestedLongitude,
    requestedRadiusMeters = 150,
    requestedAccuracyThreshold = 50,
    reason,
    proposedChanges,
  } = req.body;

  if (!entityId || requestedLatitude === undefined || requestedLongitude === undefined) {
    return res.status(400).json({ error: 'Entity ID, requested latitude, and requested longitude are required.' });
  }

  // Look up team or worksite
  let entityName = 'Team';
  let prevLat = 0;
  let prevLng = 0;
  let prevRad = 150;
  let prevAcc = 50;

  if (entityType === 'team') {
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(entityId) as any;
    if (!team) return res.status(404).json({ error: 'Team not found.' });
    entityName = team.name;
    prevLat = team.site_latitude || 0;
    prevLng = team.site_longitude || 0;
    prevRad = team.geofence_radius_meters || 150;
    prevAcc = team.geofence_accuracy_threshold || 50;
  } else {
    const ws = db.prepare('SELECT * FROM worksites WHERE id = ?').get(entityId) as any;
    if (!ws) return res.status(404).json({ error: 'Worksite not found.' });
    entityName = ws.name;
    prevLat = ws.latitude || 0;
    prevLng = ws.longitude || 0;
    prevRad = ws.allowed_radius_meters || 150;
    prevAcc = ws.accuracy_threshold_meters || 50;
  }

  // If requester is an Admin, they can apply changes directly or create approved request
  if (isAdminAny(req.user)) {
    if (entityType === 'team') {
      db.prepare(`
        UPDATE teams SET
          site_latitude = ?, site_longitude = ?, geofence_radius_meters = ?, geofence_accuracy_threshold = ?, updated_at = ?
        WHERE id = ?
      `).run(Number(requestedLatitude), Number(requestedLongitude), Number(requestedRadiusMeters), Number(requestedAccuracyThreshold), new Date().toISOString(), entityId);
    } else {
      db.prepare(`
        UPDATE worksites SET
          latitude = ?, longitude = ?, allowed_radius_meters = ?, accuracy_threshold_meters = ?, updated_at = ?
        WHERE id = ?
      `).run(Number(requestedLatitude), Number(requestedLongitude), Number(requestedRadiusMeters), Number(requestedAccuracyThreshold), new Date().toISOString(), entityId);
    }
    return res.json({ success: true, message: 'Geofence location updated directly by administrator.' });
  }

  // Staff requires mandatory reason and admin review
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'A mandatory reason is required for staff geofence change requests.' });
  }

  // STRICT RULE: Route strictly to the staff member's assigned administrator only
  const assignedAdmin = getAssignedAdminForStaff(req.user!.id);
  const targetAdminId = assignedAdmin.id;

  const reqId = `gfc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO geofence_change_requests (
      id, entity_type, entity_id, entity_name, requested_by_id, requested_by_name,
      target_admin_id, previous_latitude, previous_longitude, previous_radius_meters, previous_accuracy_threshold,
      requested_latitude, requested_longitude, requested_radius_meters, requested_accuracy_threshold,
      reason, proposed_changes_json, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(
    reqId,
    entityType,
    entityId,
    entityName,
    req.user!.id,
    req.user!.fullName,
    targetAdminId,
    prevLat,
    prevLng,
    prevRad,
    prevAcc,
    Number(requestedLatitude),
    Number(requestedLongitude),
    Number(requestedRadiusMeters),
    Number(requestedAccuracyThreshold),
    reason.trim(),
    proposedChanges ? JSON.stringify(proposedChanges) : null,
    now,
    now
  );

  if (entityType === 'team') {
    db.prepare('UPDATE teams SET pending_geofence_request_id = ? WHERE id = ?').run(reqId, entityId);
  } else if (entityType === 'worksite') {
    db.prepare('UPDATE worksites SET pending_geofence_request_id = ? WHERE id = ?').run(reqId, entityId);
  }

  createNotification({
    userId: targetAdminId,
    title: entityType === 'worksite' ? 'Worksite Change Request' : 'Geofence Location Change Request',
    message: `${req.user!.fullName} requested changes for "${entityName}": ${reason.trim()}`,
    type: 'approval',
    link: '/approvals',
  });

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'REQUEST_GEOFENCE_CHANGE',
    entityType: 'geofence_change_requests',
    entityId: reqId,
    newValues: { entityType, entityId, requestedLatitude, requestedLongitude, requestedRadiusMeters, reason, targetAdminId },
  });

  res.status(201).json({
    id: reqId,
    success: true,
    targetAdminName: assignedAdmin.fullName,
    message: `Change request submitted successfully. Awaiting approval from your assigned administrator (${assignedAdmin.fullName}).`,
  });
});

// GET /api/geofence-requests (List requests with strict secondary admin and staff scoping)
apiRouter.get('/geofence-requests', requireAuth, requireStaffOrAdmin, (req: Request, res: Response) => {
  const { status, entityId } = req.query;
  let query = 'SELECT * FROM geofence_change_requests WHERE 1=1';
  const params: unknown[] = [];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  if (entityId) {
    query += ' AND entity_id = ?';
    params.push(entityId);
  }

  // Scoping rules:
  // 1. Staff: only see own submitted requests
  // 2. Secondary Admin: ONLY see requests where target_admin_id = their ID OR requested by staff assigned to them
  // 3. Master Admin: sees company-wide requests
  if (!isAdminAny(req.user)) {
    query += ' AND requested_by_id = ?';
    params.push(req.user!.id);
  } else if (isSecondaryAdmin(req.user)) {
    query += ` AND (target_admin_id = ? OR requested_by_id IN (SELECT staff_user_id FROM secondary_admin_assignments WHERE secondary_admin_id = ?))`;
    params.push(req.user!.id, req.user!.id);
  }

  query += ' ORDER BY created_at DESC LIMIT 100';
  const list = db.prepare(query).all(...params);
  res.json(list);
});

// POST /api/geofence-requests/:id/approve (Admin approves geofence change with assigned authority check)
apiRouter.post('/geofence-requests/:id/approve', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const request = db.prepare('SELECT * FROM geofence_change_requests WHERE id = ?').get(id) as any;
  if (!request) {
    return res.status(404).json({ error: 'Geofence change request not found.' });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ error: `Request has already been ${request.status}.` });
  }

  // Check Secondary Admin authority: cannot approve requests for other admins' staff
  if (isSecondaryAdmin(req.user)) {
    const isAssigned = request.target_admin_id === req.user!.id || Boolean(
      db.prepare('SELECT 1 FROM secondary_admin_assignments WHERE secondary_admin_id = ? AND staff_user_id = ?').get(req.user!.id, request.requested_by_id)
    );
    if (!isAssigned) {
      return res.status(403).json({ error: 'Access denied: You are only authorized to review geofence change requests assigned to you or submitted by your operations staff.' });
    }
  }

  const now = new Date().toISOString();

  // Apply to team or worksite
  if (request.entity_type === 'team') {
    db.prepare(`
      UPDATE teams SET
        site_latitude = ?,
        site_longitude = ?,
        geofence_radius_meters = ?,
        geofence_accuracy_threshold = ?,
        pending_geofence_request_id = NULL,
        updated_at = ?
      WHERE id = ?
    `).run(
      request.requested_latitude,
      request.requested_longitude,
      request.requested_radius_meters,
      request.requested_accuracy_threshold,
      now,
      request.entity_id
    );
  } else {
    let name = null;
    let projectName = null;
    let address = null;
    let assignedTeamsJson = null;
    let status = null;

    if (request.proposed_changes_json) {
      try {
        const changes = JSON.parse(request.proposed_changes_json);
        if (changes.name) name = changes.name;
        if (changes.projectName) projectName = changes.projectName;
        if (changes.address !== undefined) address = changes.address;
        if (changes.assignedTeams !== undefined) assignedTeamsJson = JSON.stringify(changes.assignedTeams);
        if (changes.status) status = changes.status;
      } catch (e) {
        console.error('Error parsing proposed_changes_json:', e);
      }
    }

    db.prepare(`
      UPDATE worksites SET
        name = COALESCE(?, name),
        project_name = COALESCE(?, project_name),
        address = COALESCE(?, address),
        latitude = ?,
        longitude = ?,
        allowed_radius_meters = ?,
        accuracy_threshold_meters = ?,
        assigned_teams_json = COALESCE(?, assigned_teams_json),
        status = COALESCE(?, status, 'active'),
        pending_geofence_request_id = NULL,
        updated_at = ?
      WHERE id = ?
    `).run(
      name,
      projectName,
      address,
      request.requested_latitude,
      request.requested_longitude,
      request.requested_radius_meters,
      request.requested_accuracy_threshold,
      assignedTeamsJson,
      status,
      now,
      request.entity_id
    );
  }

  // Update request record
  db.prepare(`
    UPDATE geofence_change_requests SET
      status = 'approved',
      reviewed_by_id = ?,
      reviewed_by_name = ?,
      reviewed_at = ?,
      updated_at = ?
    WHERE id = ?
  `).run(req.user!.id, req.user!.fullName, now, now, id);

  createNotification({
    userId: request.requested_by_id,
    title: request.entity_type === 'worksite' ? 'Worksite Change Approved' : 'Geofence Change Approved',
    message: `Your requested changes for "${request.entity_name}" have been approved by ${req.user!.fullName}.`,
    type: 'approval',
  });

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'APPROVE_GEOFENCE_CHANGE',
    entityType: 'geofence_change_requests',
    entityId: id,
    newValues: { entityId: request.entity_id, lat: request.requested_latitude, lon: request.requested_longitude, radius: request.requested_radius_meters },
  });

  res.json({ success: true, message: 'Geofence location change approved and applied successfully.' });
});

// POST /api/geofence-requests/:id/reject (Admin rejects geofence change with assigned authority check)
apiRouter.post('/geofence-requests/:id/reject', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;
  const request = db.prepare('SELECT * FROM geofence_change_requests WHERE id = ?').get(id) as any;
  if (!request) {
    return res.status(404).json({ error: 'Geofence change request not found.' });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ error: `Request has already been ${request.status}.` });
  }

  // Check Secondary Admin authority: cannot reject requests for other admins' staff
  if (isSecondaryAdmin(req.user)) {
    const isAssigned = request.target_admin_id === req.user!.id || Boolean(
      db.prepare('SELECT 1 FROM secondary_admin_assignments WHERE secondary_admin_id = ? AND staff_user_id = ?').get(req.user!.id, request.requested_by_id)
    );
    if (!isAssigned) {
      return res.status(403).json({ error: 'Access denied: You are only authorized to review geofence change requests assigned to you or submitted by your operations staff.' });
    }
  }

  const now = new Date().toISOString();

  if (request.entity_type === 'team') {
    db.prepare('UPDATE teams SET pending_geofence_request_id = NULL WHERE id = ?').run(request.entity_id);
  } else if (request.entity_type === 'worksite') {
    db.prepare('UPDATE worksites SET pending_geofence_request_id = NULL WHERE id = ?').run(request.entity_id);
  }

  db.prepare(`
    UPDATE geofence_change_requests SET
      status = 'rejected',
      review_notes = ?,
      reviewed_by_id = ?,
      reviewed_by_name = ?,
      reviewed_at = ?,
      updated_at = ?
    WHERE id = ?
  `).run(reason || 'Rejected by administrator.', req.user!.id, req.user!.fullName, now, now, id);

  createNotification({
    userId: request.requested_by_id,
    title: 'Geofence Change Rejected',
    message: `Your site location change request for "${request.entity_name}" was rejected: ${reason || 'No reason specified'}`,
    type: 'rejection',
  });

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'REJECT_GEOFENCE_CHANGE',
    entityType: 'geofence_change_requests',
    entityId: id,
    reason: reason || null,
  });

  res.json({ success: true, message: 'Geofence change request rejected.' });
});



