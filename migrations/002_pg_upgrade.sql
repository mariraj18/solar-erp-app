-- =========================================================================
-- Migration 002: Upgrade labour_erp PostgreSQL schema to match full app schema
-- Run once against: labour_erp database (postgres / root1)
-- =========================================================================

-- ── Drop old CHECK constraints that block new roles ─────────────────────────
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_status_check;

-- ── Add all missing columns to users ────────────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS designation TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS assigned_location TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS assigned_admin_id TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS mobile_number TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS masked_aadhaar TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS encrypted_aadhaar TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS aadhaar_status TEXT DEFAULT 'unverified';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS assigned_team_id TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS assigned_worksite_id TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS assigned_supervisor_id TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS labour_category_id TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS employment_status TEXT DEFAULT 'active';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS login_method TEXT DEFAULT 'both';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS daily_rate NUMERIC DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_attendance_participant INTEGER DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_by TEXT;

-- Re-add a broader role check
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('master_admin','admin','secondary_admin','staff','labourer'));
ALTER TABLE public.users ADD CONSTRAINT users_status_check
  CHECK (status IN ('active','inactive'));

-- ── Add missing columns to teams ─────────────────────────────────────────────
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS owner_user_id TEXT NOT NULL DEFAULT 'usr-staff-01';
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS is_shared INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS attendance_method TEXT NOT NULL DEFAULT 'count';
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS assigned_worksite_id TEXT;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS site_latitude NUMERIC;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS site_longitude NUMERIC;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS geofence_radius_meters NUMERIC DEFAULT 150;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS geofence_accuracy_threshold NUMERIC DEFAULT 50;

-- ── Add missing columns to labour_categories ─────────────────────────────────
ALTER TABLE public.labour_categories ADD COLUMN IF NOT EXISTS owner_user_id TEXT NOT NULL DEFAULT 'usr-admin-01';
ALTER TABLE public.labour_categories ADD COLUMN IF NOT EXISTS is_shared INTEGER NOT NULL DEFAULT 1;

-- ── Add missing columns to attendance_entries ────────────────────────────────
ALTER TABLE public.attendance_entries ADD COLUMN IF NOT EXISTS owner_user_id TEXT NOT NULL DEFAULT 'usr-staff-01';
ALTER TABLE public.attendance_entries ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE public.attendance_entries ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE public.attendance_entries ADD COLUMN IF NOT EXISTS approved_by_name TEXT;
ALTER TABLE public.attendance_entries ADD COLUMN IF NOT EXISTS approved_at TEXT;
ALTER TABLE public.attendance_entries ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.attendance_entries ADD COLUMN IF NOT EXISTS change_reason TEXT;
ALTER TABLE public.attendance_entries ADD COLUMN IF NOT EXISTS revision_data_json TEXT;
ALTER TABLE public.attendance_entries ADD COLUMN IF NOT EXISTS admin_modified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.attendance_entries ADD COLUMN IF NOT EXISTS admin_modified_by TEXT;
ALTER TABLE public.attendance_entries ADD COLUMN IF NOT EXISTS admin_modified_at TEXT;
ALTER TABLE public.attendance_entries ADD COLUMN IF NOT EXISTS admin_modification_reason TEXT;
ALTER TABLE public.attendance_entries ADD COLUMN IF NOT EXISTS self_marked_labourer_ids_json TEXT DEFAULT '[]';
ALTER TABLE public.attendance_entries ADD COLUMN IF NOT EXISTS gps_count INTEGER DEFAULT 0;
ALTER TABLE public.attendance_entries ADD COLUMN IF NOT EXISTS manual_count INTEGER DEFAULT 0;

-- ── Add missing columns to additional_charges ────────────────────────────────
ALTER TABLE public.additional_charges ADD COLUMN IF NOT EXISTS owner_user_id TEXT NOT NULL DEFAULT 'usr-staff-01';
ALTER TABLE public.additional_charges ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE public.additional_charges ADD COLUMN IF NOT EXISTS admin_modified INTEGER NOT NULL DEFAULT 0;

-- ── Add missing columns to financial_adjustments ────────────────────────────
ALTER TABLE public.financial_adjustments ADD COLUMN IF NOT EXISTS owner_user_id TEXT NOT NULL DEFAULT 'usr-staff-01';
ALTER TABLE public.financial_adjustments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE public.financial_adjustments ADD COLUMN IF NOT EXISTS admin_modified INTEGER NOT NULL DEFAULT 0;

-- ── Create missing tables ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.secondary_admin_assignments (
  id TEXT PRIMARY KEY,
  secondary_admin_id TEXT NOT NULL,
  staff_user_id TEXT NOT NULL,
  can_view_reports INTEGER NOT NULL DEFAULT 1,
  can_approve_attendance INTEGER NOT NULL DEFAULT 1,
  can_edit_attendance INTEGER NOT NULL DEFAULT 1,
  allowed_financial_modules_json TEXT NOT NULL DEFAULT '["weekly_payments"]',
  can_edit_finance INTEGER NOT NULL DEFAULT 0,
  can_view_details INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(secondary_admin_id, staff_user_id)
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  link TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.attachments (
  id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL,
  record_id TEXT,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  description TEXT,
  owner_user_id TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  uploaded_by_name TEXT NOT NULL,
  team_id TEXT,
  date TEXT,
  week_start_date TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.weekly_payments (
  id TEXT PRIMARY KEY,
  week_start_date TEXT NOT NULL,
  team_id TEXT NOT NULL,
  staff_user_id TEXT NOT NULL,
  gross_amount NUMERIC NOT NULL DEFAULT 0,
  charges_amount NUMERIC NOT NULL DEFAULT 0,
  deductions_amount NUMERIC NOT NULL DEFAULT 0,
  net_payable NUMERIC NOT NULL DEFAULT 0,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Pending',
  payment_date TEXT,
  payment_method TEXT,
  voucher_ref TEXT,
  voucher_attachment_id TEXT,
  notes TEXT,
  marked_by TEXT,
  marked_by_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(week_start_date, team_id, staff_user_id)
);

CREATE TABLE IF NOT EXISTS public.office_ledger_entries (
  id TEXT PRIMARY KEY,
  entry_date TEXT NOT NULL,
  reference_no TEXT,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  running_balance NUMERIC NOT NULL DEFAULT 0,
  payment_mode TEXT,
  related_team_id TEXT,
  related_staff_id TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.petty_cash_entries (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  serial_no TEXT,
  description TEXT NOT NULL,
  credit_amount NUMERIC NOT NULL DEFAULT 0,
  debit_amount NUMERIC NOT NULL DEFAULT 0,
  online_amount NUMERIC NOT NULL DEFAULT 0,
  channel TEXT NOT NULL DEFAULT 'cash',
  day_balance NUMERIC NOT NULL DEFAULT 0,
  cash_in_hand_balance NUMERIC NOT NULL DEFAULT 0,
  cash_in_account_balance NUMERIC NOT NULL DEFAULT 0,
  related_team_id TEXT,
  related_staff_id TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.worksites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project_name TEXT NOT NULL,
  address TEXT,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  allowed_radius_meters NUMERIC NOT NULL DEFAULT 150,
  accuracy_threshold_meters NUMERIC NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'active',
  assigned_teams_json TEXT DEFAULT '[]',
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.labourer_attendance_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL DEFAULT 'labourer',
  team_id TEXT,
  worksite_id TEXT NOT NULL,
  worksite_name TEXT NOT NULL,
  date TEXT NOT NULL,
  week_start_date TEXT NOT NULL,
  supervisor_id TEXT,
  check_in_time TEXT,
  check_in_device_time TEXT,
  check_in_lat NUMERIC,
  check_in_lon NUMERIC,
  check_in_accuracy NUMERIC,
  check_in_distance_meters NUMERIC,
  check_in_status TEXT,
  check_out_time TEXT,
  check_out_device_time TEXT,
  check_out_lat NUMERIC,
  check_out_lon NUMERIC,
  check_out_accuracy NUMERIC,
  check_out_distance_meters NUMERIC,
  check_out_status TEXT,
  total_working_minutes INTEGER DEFAULT 0,
  payable_hours NUMERIC DEFAULT 0,
  overtime_hours NUMERIC DEFAULT 0,
  rate_applied NUMERIC DEFAULT 0,
  calculated_wages NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by TEXT,
  approved_by_name TEXT,
  approved_at TEXT,
  rejection_reason TEXT,
  is_overridden INTEGER DEFAULT 0,
  override_reason TEXT,
  override_by TEXT,
  override_by_name TEXT,
  override_at TEXT,
  exception_flags_json TEXT DEFAULT '[]',
  attendance_entry_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.attendance_verification_requests (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL DEFAULT 'individual',
  target_user_id TEXT,
  target_team_id TEXT,
  requested_by_id TEXT NOT NULL,
  requested_by_name TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  responded_at TEXT,
  responded_lat NUMERIC,
  responded_lon NUMERIC,
  responded_accuracy NUMERIC,
  distance_meters NUMERIC,
  worksite_id TEXT,
  response_notes TEXT,
  review_notes TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.attendance_supervisors (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  actual_role TEXT NOT NULL,
  supervisor_id TEXT NOT NULL,
  assigned_team_id TEXT,
  assigned_worksite_id TEXT,
  attendance_method TEXT NOT NULL DEFAULT 'gps',
  effective_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(participant_id, supervisor_id)
);

CREATE TABLE IF NOT EXISTS public.otp_verifications (
  id TEXT PRIMARY KEY,
  mobile_number TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  user_id TEXT,
  expires_at TEXT NOT NULL,
  is_used INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notif_user ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_payments_week ON public.weekly_payments(week_start_date);
CREATE INDEX IF NOT EXISTS idx_petty_date ON public.petty_cash_entries(date);
CREATE INDEX IF NOT EXISTS idx_attachments_rec ON public.attachments(record_type, record_id);
CREATE INDEX IF NOT EXISTS idx_gps_att_user ON public.labourer_attendance_records(user_id, date);
CREATE INDEX IF NOT EXISTS idx_gps_att_week ON public.labourer_attendance_records(week_start_date);
CREATE INDEX IF NOT EXISTS idx_gps_att_status ON public.labourer_attendance_records(status);
CREATE INDEX IF NOT EXISTS idx_verif_target ON public.attendance_verification_requests(target_user_id, status);
