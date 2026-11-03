-- =========================================================================
-- COMPANY LABOUR ATTENDANCE & WEEKLY PAYMENT ERP
-- PostgreSQL & Supabase Database Migration with Row Level Security (RLS)
-- =========================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles / Users Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT CHECK (role IN ('admin', 'staff')) NOT NULL DEFAULT 'staff',
    status TEXT CHECK (status IN ('active', 'inactive')) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Labour Categories
CREATE TABLE IF NOT EXISTS public.labour_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    default_rate NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    rate_type TEXT NOT NULL DEFAULT 'daily',
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Teams
CREATE TABLE IF NOT EXISTS public.teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    work_category TEXT NOT NULL,
    location_project TEXT,
    status TEXT CHECK (status IN ('active', 'inactive')) NOT NULL DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Team Role Templates
CREATE TABLE IF NOT EXISTS public.team_role_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.labour_categories(id) ON DELETE CASCADE,
    default_rate NUMERIC(12, 2) NOT NULL,
    rate_type TEXT NOT NULL DEFAULT 'daily',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(team_id, category_id)
);

-- 5. Team Week Assignments (Snapshotted configuration for the Saturday-Friday week)
CREATE TABLE IF NOT EXISTS public.team_week_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    week_start_date DATE NOT NULL,
    week_end_date DATE NOT NULL,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    custom_role_config_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(week_start_date, team_id)
);

-- 6. Attendance Entries (Supports multiple batches/shifts per date)
CREATE TABLE IF NOT EXISTS public.attendance_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    week_start_date DATE NOT NULL,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
    date DATE NOT NULL,
    location_project TEXT,
    shift_batch TEXT NOT NULL DEFAULT 'Regular',
    in_time TIME,
    out_time TIME,
    overtime_hours NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    overtime_rate NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    overtime_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    remarks TEXT,
    is_merged BOOLEAN NOT NULL DEFAULT FALSE,
    merged_into_id UUID REFERENCES public.attendance_entries(id) ON DELETE SET NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES public.profiles(id),
    updated_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Attendance Lines (Count-based categories per entry)
CREATE TABLE IF NOT EXISTS public.attendance_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attendance_entry_id UUID NOT NULL REFERENCES public.attendance_entries(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.labour_categories(id) ON DELETE RESTRICT,
    category_name TEXT NOT NULL,
    count INT NOT NULL DEFAULT 0 CHECK (count >= 0),
    rate NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (rate >= 0),
    rate_type TEXT NOT NULL DEFAULT 'daily',
    calculated_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    final_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    is_overridden BOOLEAN NOT NULL DEFAULT FALSE,
    override_reason TEXT
);

-- 8. Additional Charges & Expenses
CREATE TABLE IF NOT EXISTS public.additional_charges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
    week_start_date DATE NOT NULL,
    date DATE,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    quantity NUMERIC(10, 2),
    unit TEXT,
    rate NUMERIC(12, 2),
    calculated_amount NUMERIC(14, 2) NOT NULL,
    final_amount NUMERIC(14, 2) NOT NULL,
    is_overridden BOOLEAN NOT NULL DEFAULT FALSE,
    override_reason TEXT,
    remarks TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Financial Adjustments (Advances, Deductions, Credits)
CREATE TABLE IF NOT EXISTS public.financial_adjustments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
    week_start_date DATE NOT NULL,
    date DATE NOT NULL,
    adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('advance_deduction', 'advance_paid', 'fixed_deduction', 'percentage_deduction', 'credit', 'addition')),
    description TEXT NOT NULL,
    amount NUMERIC(14, 2) NOT NULL,
    rate_percentage NUMERIC(6, 2),
    base_amount NUMERIC(14, 2),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Supplier / Contractor Bills
CREATE TABLE IF NOT EXISTS public.supplier_bills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    week_start_date DATE NOT NULL,
    supplier_name TEXT NOT NULL,
    work_description TEXT NOT NULL,
    gross_amount NUMERIC(14, 2) NOT NULL,
    advance_paid NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    net_payable NUMERIC(14, 2) NOT NULL,
    remarks TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Summary Merge Groups
CREATE TABLE IF NOT EXISTS public.summary_merge_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    week_start_date DATE NOT NULL,
    group_name TEXT NOT NULL,
    team_ids_json JSONB NOT NULL,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES public.profiles(id),
    actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    previous_values_json JSONB,
    new_values_json JSONB,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Company Settings
CREATE TABLE IF NOT EXISTS public.company_settings (
    key TEXT PRIMARY KEY,
    value_json JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================================================
-- INDEXES
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_pg_attendance_date ON public.attendance_entries(date);
CREATE INDEX IF NOT EXISTS idx_pg_attendance_week ON public.attendance_entries(week_start_date);
CREATE INDEX IF NOT EXISTS idx_pg_charges_week ON public.additional_charges(week_start_date);
CREATE INDEX IF NOT EXISTS idx_pg_adjustments_week ON public.financial_adjustments(week_start_date);
CREATE INDEX IF NOT EXISTS idx_pg_audit_created ON public.audit_logs(created_at);

-- =========================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labour_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_role_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_week_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.additional_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.summary_merge_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- Helper function to check admin role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check authenticated active user
CREATE OR REPLACE FUNCTION public.is_active_staff_or_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. Profiles Policies
CREATE POLICY "Users can view active profiles"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (public.is_active_staff_or_admin());

CREATE POLICY "Admins can manage profiles"
    ON public.profiles FOR ALL
    TO authenticated
    USING (public.is_admin());

-- 2. Operational Tables Policies (Read & Write for active staff and admins)
CREATE POLICY "Staff and admin can read teams"
    ON public.teams FOR SELECT TO authenticated
    USING (public.is_active_staff_or_admin());

CREATE POLICY "Staff and admin can insert teams"
    ON public.teams FOR INSERT TO authenticated
    WITH CHECK (public.is_active_staff_or_admin());

CREATE POLICY "Staff and admin can update teams"
    ON public.teams FOR UPDATE TO authenticated
    USING (public.is_active_staff_or_admin());

-- Attendance Entries & Lines
CREATE POLICY "Staff and admin can manage attendance entries"
    ON public.attendance_entries FOR ALL TO authenticated
    USING (public.is_active_staff_or_admin());

CREATE POLICY "Staff and admin can manage attendance lines"
    ON public.attendance_lines FOR ALL TO authenticated
    USING (public.is_active_staff_or_admin());

-- Charges and Adjustments
CREATE POLICY "Staff and admin can manage charges"
    ON public.additional_charges FOR ALL TO authenticated
    USING (public.is_active_staff_or_admin());

CREATE POLICY "Staff and admin can manage adjustments"
    ON public.financial_adjustments FOR ALL TO authenticated
    USING (public.is_active_staff_or_admin());

CREATE POLICY "Staff and admin can manage supplier bills"
    ON public.supplier_bills FOR ALL TO authenticated
    USING (public.is_active_staff_or_admin());

CREATE POLICY "Staff and admin can manage merge groups"
    ON public.summary_merge_groups FOR ALL TO authenticated
    USING (public.is_active_staff_or_admin());

-- Audit logs: Read by admin, insert by all active users
CREATE POLICY "Admins can read audit logs"
    ON public.audit_logs FOR SELECT TO authenticated
    USING (public.is_admin());

CREATE POLICY "Active users can insert audit logs"
    ON public.audit_logs FOR INSERT TO authenticated
    WITH CHECK (public.is_active_staff_or_admin());
