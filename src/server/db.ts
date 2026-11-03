import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

// Ensure data directory exists
const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'erp.db');
export const db = new Database(dbPath);

// Enable WAL mode and foreign keys for high reliability and concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT CHECK(role IN ('master_admin', 'admin', 'secondary_admin', 'staff', 'labourer')) NOT NULL DEFAULT 'staff',
      status TEXT CHECK(status IN ('active', 'inactive')) NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS labour_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      default_rate REAL NOT NULL DEFAULT 0,
      rate_type TEXT NOT NULL DEFAULT 'daily',
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      work_category TEXT NOT NULL,
      location_project TEXT,
      status TEXT CHECK(status IN ('active', 'inactive')) NOT NULL DEFAULT 'active',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS team_role_templates (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES labour_categories(id),
      default_rate REAL NOT NULL,
      rate_type TEXT NOT NULL DEFAULT 'daily',
      created_at TEXT NOT NULL,
      UNIQUE(team_id, category_id)
    );

    CREATE TABLE IF NOT EXISTS team_week_assignments (
      id TEXT PRIMARY KEY,
      week_start_date TEXT NOT NULL,
      week_end_date TEXT NOT NULL,
      team_id TEXT NOT NULL REFERENCES teams(id),
      custom_role_config_json TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(week_start_date, team_id)
    );

    CREATE TABLE IF NOT EXISTS attendance_entries (
      id TEXT PRIMARY KEY,
      week_start_date TEXT NOT NULL,
      team_id TEXT NOT NULL REFERENCES teams(id),
      date TEXT NOT NULL,
      location_project TEXT,
      shift_batch TEXT NOT NULL DEFAULT 'Regular',
      in_time TEXT,
      out_time TEXT,
      overtime_hours REAL NOT NULL DEFAULT 0,
      overtime_rate REAL NOT NULL DEFAULT 0,
      overtime_amount REAL NOT NULL DEFAULT 0,
      remarks TEXT,
      is_merged INTEGER NOT NULL DEFAULT 0,
      merged_into_id TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attendance_lines (
      id TEXT PRIMARY KEY,
      attendance_entry_id TEXT NOT NULL REFERENCES attendance_entries(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES labour_categories(id),
      category_name TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      rate REAL NOT NULL DEFAULT 0,
      rate_type TEXT NOT NULL DEFAULT 'daily',
      calculated_amount REAL NOT NULL DEFAULT 0,
      final_amount REAL NOT NULL DEFAULT 0,
      is_overridden INTEGER NOT NULL DEFAULT 0,
      override_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS additional_charges (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL REFERENCES teams(id),
      week_start_date TEXT NOT NULL,
      date TEXT,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      quantity REAL,
      unit TEXT,
      rate REAL,
      calculated_amount REAL NOT NULL,
      final_amount REAL NOT NULL,
      is_overridden INTEGER NOT NULL DEFAULT 0,
      override_reason TEXT,
      remarks TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS financial_adjustments (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL REFERENCES teams(id),
      week_start_date TEXT NOT NULL,
      date TEXT NOT NULL,
      adjustment_type TEXT NOT NULL, -- 'advance_deduction', 'advance_paid', 'fixed_deduction', 'percentage_deduction', 'credit', 'addition'
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      rate_percentage REAL,
      base_amount REAL,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS supplier_bills (
      id TEXT PRIMARY KEY,
      week_start_date TEXT NOT NULL,
      supplier_name TEXT NOT NULL,
      work_description TEXT NOT NULL,
      gross_amount REAL NOT NULL,
      advance_paid REAL NOT NULL DEFAULT 0,
      net_payable REAL NOT NULL,
      remarks TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS summary_merge_groups (
      id TEXT PRIMARY KEY,
      week_start_date TEXT NOT NULL,
      group_name TEXT NOT NULL,
      team_ids_json TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      previous_values_json TEXT,
      new_values_json TEXT,
      reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS company_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS secondary_admin_assignments (
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

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'info',
      link TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attachments (
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

    CREATE TABLE IF NOT EXISTS weekly_payments (
      id TEXT PRIMARY KEY,
      week_start_date TEXT NOT NULL,
      team_id TEXT NOT NULL,
      staff_user_id TEXT NOT NULL,
      gross_amount REAL NOT NULL DEFAULT 0,
      charges_amount REAL NOT NULL DEFAULT 0,
      deductions_amount REAL NOT NULL DEFAULT 0,
      net_payable REAL NOT NULL DEFAULT 0,
      amount_paid REAL NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS office_ledger_entries (
      id TEXT PRIMARY KEY,
      entry_date TEXT NOT NULL,
      reference_no TEXT,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      entry_type TEXT NOT NULL,
      amount REAL NOT NULL,
      running_balance REAL NOT NULL DEFAULT 0,
      payment_mode TEXT,
      related_team_id TEXT,
      related_staff_id TEXT,
      notes TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS petty_cash_entries (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      serial_no TEXT,
      description TEXT NOT NULL,
      credit_amount REAL NOT NULL DEFAULT 0,
      debit_amount REAL NOT NULL DEFAULT 0,
      online_amount REAL NOT NULL DEFAULT 0,
      channel TEXT NOT NULL DEFAULT 'cash',
      day_balance REAL NOT NULL DEFAULT 0,
      cash_in_hand_balance REAL NOT NULL DEFAULT 0,
      cash_in_account_balance REAL NOT NULL DEFAULT 0,
      related_team_id TEXT,
      related_staff_id TEXT,
      notes TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS worksites (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      project_name TEXT NOT NULL,
      address TEXT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      allowed_radius_meters REAL NOT NULL DEFAULT 150,
      accuracy_threshold_meters REAL NOT NULL DEFAULT 50,
      status TEXT NOT NULL DEFAULT 'active',
      assigned_teams_json TEXT DEFAULT '[]',
      created_by TEXT NOT NULL,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS labourer_attendance_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      user_name TEXT NOT NULL,
      user_role TEXT NOT NULL DEFAULT 'labourer',
      team_id TEXT REFERENCES teams(id),
      worksite_id TEXT NOT NULL REFERENCES worksites(id),
      worksite_name TEXT NOT NULL,
      date TEXT NOT NULL,
      week_start_date TEXT NOT NULL,
      supervisor_id TEXT REFERENCES users(id),
      check_in_time TEXT,
      check_in_device_time TEXT,
      check_in_lat REAL,
      check_in_lon REAL,
      check_in_accuracy REAL,
      check_in_distance_meters REAL,
      check_in_status TEXT, -- 'valid_location', 'outside_radius', 'poor_accuracy', 'overridden'
      check_out_time TEXT,
      check_out_device_time TEXT,
      check_out_lat REAL,
      check_out_lon REAL,
      check_out_accuracy REAL,
      check_out_distance_meters REAL,
      check_out_status TEXT,
      total_working_minutes INTEGER DEFAULT 0,
      payable_hours REAL DEFAULT 0,
      overtime_hours REAL DEFAULT 0,
      rate_applied REAL DEFAULT 0,
      calculated_wages REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'overridden'
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
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attendance_verification_requests (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL DEFAULT 'individual', -- 'individual' | 'team'
      target_user_id TEXT,
      target_team_id TEXT,
      requested_by_id TEXT NOT NULL REFERENCES users(id),
      requested_by_name TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'valid_location', 'outside_radius', 'poor_accuracy', 'expired', 'cancelled', 'manual_review'
      responded_at TEXT,
      responded_lat REAL,
      responded_lon REAL,
      responded_accuracy REAL,
      distance_meters REAL,
      worksite_id TEXT REFERENCES worksites(id),
      response_notes TEXT,
      review_notes TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attendance_supervisors (
      id TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL REFERENCES users(id),
      actual_role TEXT NOT NULL,
      supervisor_id TEXT NOT NULL REFERENCES users(id),
      assigned_team_id TEXT REFERENCES teams(id),
      assigned_worksite_id TEXT REFERENCES worksites(id),
      attendance_method TEXT NOT NULL DEFAULT 'gps',
      effective_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(participant_id, supervisor_id)
    );

    CREATE TABLE IF NOT EXISTS otp_verifications (
      id TEXT PRIMARY KEY,
      mobile_number TEXT NOT NULL,
      otp_code TEXT NOT NULL,
      user_id TEXT REFERENCES users(id),
      expires_at TEXT NOT NULL,
      is_used INTEGER DEFAULT 0,
      attempts INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS geofence_change_requests (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL DEFAULT 'team',
      entity_id TEXT NOT NULL,
      entity_name TEXT NOT NULL,
      requested_by_id TEXT NOT NULL REFERENCES users(id),
      requested_by_name TEXT NOT NULL,
      target_admin_id TEXT,
      previous_latitude REAL,
      previous_longitude REAL,
      previous_radius_meters REAL,
      previous_accuracy_threshold REAL,
      requested_latitude REAL NOT NULL,
      requested_longitude REAL NOT NULL,
      requested_radius_meters REAL NOT NULL DEFAULT 150,
      requested_accuracy_threshold REAL NOT NULL DEFAULT 50,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by_id TEXT REFERENCES users(id),
      reviewed_by_name TEXT,
      reviewed_at TEXT,
      review_notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_push_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      push_token TEXT NOT NULL UNIQUE,
      device_type TEXT DEFAULT 'android',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_push_user ON user_push_tokens(user_id);

    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_entries(date);
    CREATE INDEX IF NOT EXISTS idx_attendance_week ON attendance_entries(week_start_date);
    CREATE INDEX IF NOT EXISTS idx_charges_week ON additional_charges(week_start_date);
    CREATE INDEX IF NOT EXISTS idx_adjustments_week ON financial_adjustments(week_start_date);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_payments_week ON weekly_payments(week_start_date);
    CREATE INDEX IF NOT EXISTS idx_petty_date ON petty_cash_entries(date);
    CREATE INDEX IF NOT EXISTS idx_attachments_rec ON attachments(record_type, record_id);
    CREATE INDEX IF NOT EXISTS idx_gps_att_user ON labourer_attendance_records(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_gps_att_week ON labourer_attendance_records(week_start_date);
    CREATE INDEX IF NOT EXISTS idx_gps_att_status ON labourer_attendance_records(status);
    CREATE INDEX IF NOT EXISTS idx_verif_target ON attendance_verification_requests(target_user_id, status);
    CREATE INDEX IF NOT EXISTS idx_geofence_req_status ON geofence_change_requests(status);
  `);

  // Run incremental column additions safely for existing SQLite tables
  applyMigrations();

  // Seed default data if empty
  seedInitialData();
}

function applyMigrations() {
  const tryAddCol = (table: string, colDef: string) => {
    try {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${colDef}`).run();
    } catch {
      // Column already exists or table cannot be altered
    }
  };

  // Check if users table needs check constraint migration for labourer role
  try {
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get() as { sql: string } | undefined;
    if (tableInfo && !tableInfo.sql.includes('labourer')) {
      db.pragma('foreign_keys = OFF');
      const cols = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
      const colNames = cols.map(c => c.name);

      db.exec(`
        CREATE TABLE users_temp (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          full_name TEXT NOT NULL,
          role TEXT CHECK(role IN ('master_admin', 'admin', 'secondary_admin', 'staff', 'labourer')) NOT NULL DEFAULT 'staff',
          status TEXT CHECK(status IN ('active', 'inactive')) NOT NULL DEFAULT 'active',
          designation TEXT,
          assigned_location TEXT,
          assigned_admin_id TEXT,
          mobile_number TEXT,
          masked_aadhaar TEXT,
          encrypted_aadhaar TEXT,
          aadhaar_status TEXT DEFAULT 'unverified',
          assigned_team_id TEXT,
          assigned_worksite_id TEXT,
          assigned_supervisor_id TEXT,
          labour_category_id TEXT,
          employment_status TEXT DEFAULT 'active',
          login_method TEXT DEFAULT 'both',
          profile_photo_url TEXT,
          daily_rate REAL DEFAULT 0,
          hourly_rate REAL DEFAULT 0,
          is_attendance_participant INTEGER DEFAULT 0,
          created_by TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      const commonCols = colNames.filter(c => [
        'id', 'email', 'password_hash', 'full_name', 'role', 'status',
        'designation', 'assigned_location', 'assigned_admin_id', 'created_at', 'updated_at'
      ].includes(c));
      const colListStr = commonCols.join(', ');

      db.exec(`
        INSERT INTO users_temp (${colListStr})
        SELECT ${colListStr} FROM users;
        DROP TABLE users;
        ALTER TABLE users_temp RENAME TO users;
      `);
      db.pragma('foreign_keys = ON');
    }
  } catch (e) {
    console.error('User migration notice:', e);
  }

  // users table expansions
  tryAddCol('users', 'designation TEXT');
  tryAddCol('users', 'assigned_location TEXT');
  tryAddCol('users', 'assigned_admin_id TEXT');
  tryAddCol('users', 'mobile_number TEXT');
  tryAddCol('users', 'masked_aadhaar TEXT');
  tryAddCol('users', 'encrypted_aadhaar TEXT');
  tryAddCol('users', "aadhaar_status TEXT DEFAULT 'unverified'");
  tryAddCol('users', 'assigned_team_id TEXT');
  tryAddCol('users', 'assigned_worksite_id TEXT');
  tryAddCol('users', 'assigned_supervisor_id TEXT');
  tryAddCol('users', 'labour_category_id TEXT');
  tryAddCol('users', "employment_status TEXT DEFAULT 'active'");
  tryAddCol('users', "login_method TEXT DEFAULT 'both'");
  tryAddCol('users', 'profile_photo_url TEXT');
  tryAddCol('users', 'daily_rate REAL DEFAULT 0');
  tryAddCol('users', 'hourly_rate REAL DEFAULT 0');
  tryAddCol('users', 'is_attendance_participant INTEGER DEFAULT 0');
  tryAddCol('users', 'created_by TEXT');

  // teams data isolation & attendance method
  tryAddCol('teams', "owner_user_id TEXT NOT NULL DEFAULT 'usr-staff-01'");
  tryAddCol('teams', 'is_shared INTEGER NOT NULL DEFAULT 1');
  tryAddCol('teams', "attendance_method TEXT NOT NULL DEFAULT 'count'"); // 'count', 'individual_gps', 'both'
  tryAddCol('teams', 'assigned_worksite_id TEXT');
  tryAddCol('teams', 'site_latitude REAL');
  tryAddCol('teams', 'site_longitude REAL');
  tryAddCol('teams', 'geofence_radius_meters REAL DEFAULT 150');
  tryAddCol('teams', 'geofence_accuracy_threshold REAL DEFAULT 50');

  // labour_categories isolation
  tryAddCol('labour_categories', "owner_user_id TEXT NOT NULL DEFAULT 'usr-admin-01'");
  tryAddCol('labour_categories', 'is_shared INTEGER NOT NULL DEFAULT 1');

  // attendance_entries approval & isolation & self-marked GPS reconciliation
  tryAddCol('attendance_entries', "owner_user_id TEXT NOT NULL DEFAULT 'usr-staff-01'");
  tryAddCol('attendance_entries', "status TEXT NOT NULL DEFAULT 'approved'");
  tryAddCol('attendance_entries', 'approved_by TEXT');
  tryAddCol('attendance_entries', 'approved_by_name TEXT');
  tryAddCol('attendance_entries', 'approved_at TEXT');
  tryAddCol('attendance_entries', 'rejection_reason TEXT');
  tryAddCol('attendance_entries', 'change_reason TEXT');
  tryAddCol('attendance_entries', 'revision_data_json TEXT');
  tryAddCol('attendance_entries', 'admin_modified INTEGER NOT NULL DEFAULT 0');
  tryAddCol('attendance_entries', 'admin_modified_by TEXT');
  tryAddCol('attendance_entries', 'admin_modified_at TEXT');
  tryAddCol('attendance_entries', 'admin_modification_reason TEXT');
  tryAddCol('attendance_entries', "self_marked_labourer_ids_json TEXT DEFAULT '[]'");
  tryAddCol('attendance_entries', 'gps_count INTEGER DEFAULT 0');
  tryAddCol('attendance_entries', 'manual_count INTEGER DEFAULT 0');

  // labourer_attendance_records link to team attendance entry and re-check flags
  tryAddCol('labourer_attendance_records', 'attendance_entry_id TEXT');
  tryAddCol('labourer_attendance_records', 're_check_requested INTEGER DEFAULT 0');
  tryAddCol('labourer_attendance_records', 're_check_reason TEXT');
  tryAddCol('teams', 'pending_geofence_request_id TEXT');
  tryAddCol('worksites', 'pending_geofence_request_id TEXT');
  tryAddCol('geofence_change_requests', 'proposed_changes_json TEXT');

  // Office / Secondary Admin branch isolation for Financials, Accounts & Worksites
  tryAddCol('petty_cash_entries', 'secondary_admin_id TEXT');
  tryAddCol('petty_cash_entries', 'office_name TEXT');
  tryAddCol('office_ledger_entries', 'secondary_admin_id TEXT');
  tryAddCol('office_ledger_entries', 'office_name TEXT');
  tryAddCol('worksites', "secondary_admin_id TEXT DEFAULT 'head_office'");
  tryAddCol('worksites', "office_name TEXT DEFAULT 'Head Office (Central)'");

  try {
    db.prepare("UPDATE petty_cash_entries SET secondary_admin_id = 'head_office', office_name = 'Head Office (Central)' WHERE secondary_admin_id IS NULL").run();
    db.prepare("UPDATE office_ledger_entries SET secondary_admin_id = 'head_office', office_name = 'Head Office (Central)' WHERE secondary_admin_id IS NULL").run();
    db.prepare("UPDATE worksites SET secondary_admin_id = 'head_office', office_name = 'Head Office (Central)' WHERE secondary_admin_id IS NULL").run();
  } catch {}

  // Populate coordinates for existing default teams if not set
  try {
    db.prepare(`
      UPDATE teams
      SET assigned_worksite_id = 'ws-lumia-01',
          site_latitude = 12.9715987,
          site_longitude = 77.5945627,
          geofence_radius_meters = 150,
          geofence_accuracy_threshold = 50
      WHERE (site_latitude IS NULL OR site_latitude = 0) AND id IN ('team-heeralal', 'team-vishnu-civil', 'team-vishnu-painter')
    `).run();

    db.prepare(`
      UPDATE teams
      SET assigned_worksite_id = 'ws-museum-02',
          site_latitude = 12.978000,
          site_longitude = 77.600000,
          geofence_radius_meters = 200,
          geofence_accuracy_threshold = 60
      WHERE (site_latitude IS NULL OR site_latitude = 0) AND id IN ('team-museum-cleaning', 'team-centring-murugan')
    `).run();
  } catch {
    // Already set or tables pending
  }

  // additional_charges & financial_adjustments isolation & admin modifications
  tryAddCol('additional_charges', "owner_user_id TEXT NOT NULL DEFAULT 'usr-staff-01'");
  tryAddCol('additional_charges', "status TEXT NOT NULL DEFAULT 'approved'");
  tryAddCol('additional_charges', 'admin_modified INTEGER NOT NULL DEFAULT 0');

  tryAddCol('financial_adjustments', "owner_user_id TEXT NOT NULL DEFAULT 'usr-staff-01'");
  tryAddCol('financial_adjustments', "status TEXT NOT NULL DEFAULT 'approved'");
  tryAddCol('financial_adjustments', 'admin_modified INTEGER NOT NULL DEFAULT 0');
}

function seedInitialData() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  const now = new Date().toISOString();

  if (userCount.count === 0) {
    const defaultEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@company.erp';
    const defaultPass = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@ERP2026!';
    const adminPasswordHash = bcrypt.hashSync(defaultPass, 10);

    const insertUser = db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertUser.run(
      'usr-admin-01',
      defaultEmail,
      adminPasswordHash,
      'ERP Administrator',
      'master_admin',
      'active',
      now,
      now
    );

    // Only seed test staff user when running automated test suites
    if (process.env.NODE_ENV === 'test') {
      const staffPasswordHash = bcrypt.hashSync('Staff@ERP2026!', 10);
      insertUser.run(
        'usr-staff-01',
        'staff@company.erp',
        staffPasswordHash,
        'Site Operations Staff',
        'staff',
        'active',
        now,
        now
      );
    }
  }

  // Seed labour categories
  const catCount = db.prepare('SELECT COUNT(*) as count FROM labour_categories').get() as { count: number };
  if (catCount.count === 0) {
    const insertCat = db.prepare(`
      INSERT INTO labour_categories (id, name, code, default_rate, rate_type, display_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const categories = [
      { id: 'cat-mason', name: 'Mason', code: 'MASON', rate: 1400, order: 1 },
      { id: 'cat-helper', name: 'Helper', code: 'HELPER', rate: 1000, order: 2 },
      { id: 'cat-painter', name: 'Painter', code: 'PAINTER', rate: 950, order: 3 },
      { id: 'cat-centring', name: 'Centring Labour', code: 'CENTRING', rate: 1200, order: 4 },
      { id: 'cat-carpenter', name: 'Carpenter', code: 'CARPENTER', rate: 1100, order: 5 },
      { id: 'cat-barbender', name: 'Barbender', code: 'BARBENDER', rate: 1300, order: 6 },
      { id: 'cat-electrician', name: 'Electrician', code: 'ELECTRICIAN', rate: 1200, order: 7 },
      { id: 'cat-plumber', name: 'Plumber', code: 'PLUMBER', rate: 1200, order: 8 },
      { id: 'cat-tile', name: 'Tile Mason', code: 'TILE', rate: 1350, order: 9 },
      { id: 'cat-breaker', name: 'Demolition / Breaker', code: 'BREAKER', rate: 1100, order: 10 },
    ];

    for (const c of categories) {
      insertCat.run(c.id, c.name, c.code, c.rate, 'daily', c.order, now);
    }
  }

  // Seed reference teams
  const teamCount = db.prepare('SELECT COUNT(*) as count FROM teams').get() as { count: number };
  if (teamCount.count === 0) {
    const insertTeam = db.prepare(`
      INSERT INTO teams (id, name, work_category, location_project, status, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertRole = db.prepare(`
      INSERT INTO team_role_templates (id, team_id, category_id, default_rate, rate_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const initialTeams = [
      {
        id: 'team-heeralal',
        name: 'Heeralal / Lumia Building',
        category: 'Civil Construction',
        project: 'Lumia Building',
        roles: [
          { catId: 'cat-mason', rate: 1400 },
          { catId: 'cat-helper', rate: 1000 },
        ],
      },
      {
        id: 'team-centring-murugan',
        name: 'Centring Murugan',
        category: 'Centring & Shuttering',
        project: 'Main Tower',
        roles: [
          { catId: 'cat-centring', rate: 1200 },
          { catId: 'cat-helper', rate: 1000 },
        ],
      },
      {
        id: 'team-vishnu-civil',
        name: 'Vishnu Civil Labour',
        category: 'Civil Works',
        project: 'Block A',
        roles: [
          { catId: 'cat-mason', rate: 1400 },
          { catId: 'cat-helper', rate: 1000 },
        ],
      },
      {
        id: 'team-vishnu-painter',
        name: 'Vishnu Painter',
        category: 'Painting',
        project: 'Block A & B',
        roles: [
          { catId: 'cat-painter', rate: 950 },
          { catId: 'cat-helper', rate: 1000 },
        ],
      },
      {
        id: 'team-museum-cleaning',
        name: 'Museum Cleaning',
        category: 'Cleaning & Maintenance',
        project: 'Heritage Museum Site',
        roles: [
          { catId: 'cat-helper', rate: 1000 },
        ],
      },
      {
        id: 'team-electrician-arun',
        name: 'Electrician Arun',
        category: 'Electrical Works',
        project: 'Site Wide',
        roles: [
          { catId: 'cat-electrician', rate: 1200 },
          { catId: 'cat-helper', rate: 1000 },
        ],
      },
      {
        id: 'team-ali-carpenter',
        name: 'Ali Carpenter',
        category: 'Carpentry',
        project: 'Interior Finishing',
        roles: [
          { catId: 'cat-carpenter', rate: 1100 },
          { catId: 'cat-helper', rate: 1000 },
        ],
      },
      {
        id: 'team-transport-bolero',
        name: 'Transport / Bolero',
        category: 'Transport & Logistics',
        project: 'Material Hauling',
        roles: [
          { catId: 'cat-helper', rate: 1000 },
        ],
      },
    ];

    for (const t of initialTeams) {
      insertTeam.run(t.id, t.name, t.category, t.project, 'active', '', now, now);
      for (let i = 0; i < t.roles.length; i++) {
        const r = t.roles[i];
        insertRole.run(`role-${t.id}-${r.catId}`, t.id, r.catId, r.rate, 'daily', now);
      }
    }
  }

  // Seed default company settings
  const settingsCount = db.prepare('SELECT COUNT(*) as count FROM company_settings').get() as { count: number };
  if (settingsCount.count === 0) {
    const insertSetting = db.prepare('INSERT INTO company_settings (key, value_json, updated_at) VALUES (?, ?, ?)');
    insertSetting.run('company_info', JSON.stringify({
      companyName: 'Lumia Infrastructure & Construction Ltd.',
      projectCode: 'LUMIA-ERP',
      timezone: 'Asia/Kolkata',
      weekStartDay: 'Saturday',
      weekEndDay: 'Friday',
      currency: 'INR',
    }), now);

    insertSetting.run('time_rules', JSON.stringify({
      standardStartTime: '08:30',
      standardEndTime: '17:30',
      standardHours: 8,
      unpaidBreakMinutes: 60,
      graceMinutes: 15,
      overtimeRatePerHour: 150,
    }), now);

    insertSetting.run('petty_cash_opening', JSON.stringify({
      openingInAccount: 75000,
      openingInHand: 25000,
      asOfDate: '2026-10-01',
    }), now);
  }

  // Only seed rich sample demo data (secondary admin, sample worksites, sample labourers, fake attendance) if SEED_DEMO_DATA is true
  if (process.env.SEED_DEMO_DATA === 'true') {
    // Ensure secondary admin and assignment exist for testing & demonstration
    const secAdmin = db.prepare("SELECT id FROM users WHERE email = 'secadmin@company.erp'").get();
    if (!secAdmin) {
      const secHash = bcrypt.hashSync('SecAdmin@ERP2026!', 10);
      db.prepare(`
        INSERT INTO users (id, email, password_hash, full_name, role, status, designation, assigned_location, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'secondary_admin', 'active', 'Operations Manager', 'Site Alpha', ?, ?)
      `).run('usr-secadmin-01', 'secadmin@company.erp', secHash, 'Operations Manager (Sec Admin)', now, now);

      // Assign staff usr-staff-01 to secadmin
      db.prepare(`
        INSERT OR IGNORE INTO secondary_admin_assignments (
          id, secondary_admin_id, staff_user_id, can_view_reports, can_approve_attendance, can_edit_attendance, allowed_financial_modules_json, can_edit_finance, can_view_details, created_at, updated_at
        ) VALUES (?, ?, ?, 1, 1, 1, ?, 1, 1, ?, ?)
      `).run(
        'assign-sec-01',
        'usr-secadmin-01',
        'usr-staff-01',
        JSON.stringify(['petty_cash', 'weekly_payments']),
        now,
        now
      );
    }

  // Seed sample worksites if empty
  const worksiteCount = db.prepare('SELECT COUNT(*) as count FROM worksites').get() as { count: number };
  if (worksiteCount.count === 0) {
    const insertWs = db.prepare(`
      INSERT INTO worksites (id, name, project_name, address, latitude, longitude, allowed_radius_meters, accuracy_threshold_meters, status, assigned_teams_json, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 'usr-admin-01', ?, ?)
    `);

    // Lumia Building Site (Bengaluru, MG Road / Tech Zone)
    insertWs.run(
      'ws-lumia-01',
      'Lumia Building Main Site',
      'Lumia Infrastructure Phase 2',
      '42, Brigade Road, Ashok Nagar, Bengaluru 560025',
      12.971598,
      77.594562,
      150, // 150m allowed radius
      50,  // 50m max GPS accuracy
      JSON.stringify(['team-heeralal', 'team-centring-murugan', 'team-vishnu-civil']),
      now,
      now
    );

    // Heritage Museum Restoration Project
    insertWs.run(
      'ws-museum-02',
      'Heritage Museum Site',
      'Heritage Restoration & Landscaping',
      'Kasturba Road, Sampangi Rama Nagara, Bengaluru 560001',
      12.978000,
      77.600000,
      200,
      60,
      JSON.stringify(['team-museum-cleaning', 'team-ali-carpenter']),
      now,
      now
    );
  }

  // Seed sample labourer accounts
  const labourerCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'labourer'").get() as { count: number };
  if (labourerCount.count === 0) {
    const labPasswordHash = bcrypt.hashSync('Password@123', 10);
    const insertLab = db.prepare(`
      INSERT OR REPLACE INTO users (
        id, email, password_hash, full_name, role, status, designation, assigned_location,
        assigned_admin_id, mobile_number, masked_aadhaar, encrypted_aadhaar, aadhaar_status,
        assigned_team_id, assigned_worksite_id, assigned_supervisor_id, labour_category_id,
        employment_status, login_method, daily_rate, hourly_rate, is_attendance_participant,
        created_by, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, 'labourer', 'active', ?, 'Site Lumia',
        'usr-admin-01', ?, ?, ?, 'verified',
        ?, ?, ?, ?,
        'active', 'both', ?, 0, 1,
        'usr-admin-01', ?, ?
      )
    `);

    insertLab.run(
      'usr-labourer-01',
      'ramesh.kumar@labour.erp',
      labPasswordHash,
      'Ramesh Kumar',
      'Lead Mason',
      '9876543210',
      'XXXX-XXXX-8901',
      'enc-aadhaar-ramesh-8901',
      'team-heeralal',
      'ws-lumia-01',
      'usr-staff-01',
      'cat-mason',
      1400,
      now,
      now
    );

    insertLab.run(
      'usr-labourer-02',
      'suresh.patel@labour.erp',
      labPasswordHash,
      'Suresh Patel',
      'Construction Helper',
      '9876543211',
      'XXXX-XXXX-4321',
      'enc-aadhaar-suresh-4321',
      'team-heeralal',
      'ws-lumia-01',
      'usr-staff-01',
      'cat-helper',
      1000,
      now,
      now
    );
  }

  // Ensure Staff and Secondary Admin attendance participant records exist
  const supCount = db.prepare('SELECT COUNT(*) as count FROM attendance_supervisors').get() as { count: number };
  if (supCount.count === 0) {
    db.prepare(`
      INSERT OR IGNORE INTO attendance_supervisors (
        id, participant_id, actual_role, supervisor_id, assigned_team_id, assigned_worksite_id,
        attendance_method, effective_date, status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'gps', '2026-10-01', 'active', 'usr-admin-01', ?, ?)
    `).run(
      'sup-assign-01',
      'usr-staff-01',
      'staff',
      'usr-secadmin-01',
      'team-heeralal',
      'ws-lumia-01',
      now,
      now
    );

    // Update usr-staff-01 to have is_attendance_participant = 1 and assigned_supervisor_id = usr-secadmin-01
    db.prepare(`
      UPDATE users SET
        is_attendance_participant = 1,
        assigned_supervisor_id = 'usr-secadmin-01',
        assigned_worksite_id = 'ws-lumia-01'
      WHERE id = 'usr-staff-01'
    `).run();
  }

  // Seed sample active random verification request expiring in 25 minutes for demonstration
  const verifCount = db.prepare('SELECT COUNT(*) as count FROM attendance_verification_requests').get() as { count: number };
  if (verifCount.count === 0) {
    const expiresAt = new Date(Date.now() + 25 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO attendance_verification_requests (
        id, target_type, target_user_id, target_team_id, requested_by_id, requested_by_name,
        requested_at, expires_at, status, worksite_id, response_notes, created_at
      ) VALUES (?, 'individual', 'usr-labourer-01', 'team-heeralal', 'usr-admin-01', 'ERP Administrator', ?, ?, 'pending', 'ws-lumia-01', 'Random 11:30 AM site attendance spot-check', ?)
    `).run('vrf-active-demo-01', now, expiresAt, now);

    // Add persistent notification for Ramesh Kumar
    createNotification({
      userId: 'usr-labourer-01',
      title: 'Action Required: Attendance Verification',
      message: 'Random attendance verification requested by ERP Administrator. Please confirm your location within 30 minutes.',
      type: 'approval',
      link: '/attendance',
    });
  }

    // Seed rich sample data for all modules if empty
    seedComprehensiveDemoData();
  }
}

export function seedComprehensiveDemoData(force = false) {
  const attCount = db.prepare('SELECT COUNT(*) as c FROM attendance_entries').get() as { c: number };
  if (!force && attCount.c >= 4) {
    return;
  }

  const now = new Date().toISOString();

  // 1. Attendance Entries & Lines
  const insertAtt = db.prepare(`
    INSERT OR REPLACE INTO attendance_entries (
      id, week_start_date, team_id, date, location_project, shift_batch,
      in_time, out_time, overtime_hours, overtime_rate, overtime_amount, remarks,
      owner_user_id, status, approved_by, approved_by_name, approved_at,
      rejection_reason, change_reason, revision_data_json, admin_modified,
      created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertLine = db.prepare(`
    INSERT OR REPLACE INTO attendance_lines (
      id, attendance_entry_id, category_id, category_name, count, rate, rate_type,
      calculated_amount, final_amount, is_overridden, override_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Sample 1: Heeralal 17/10/2026 - Approved
  insertAtt.run(
    'att-demo-01', '2026-10-17', 'team-heeralal', '2026-10-17', 'Lumia Building Block A', 'Regular Shift',
    '08:30', '19:30', 2, 150, 300, 'Foundation column concreting team',
    'usr-staff-01', 'approved', 'usr-admin-01', 'ERP Administrator', '2026-10-17T20:00:00.000Z',
    null, null, null, 0, 'usr-staff-01', 'usr-admin-01', now, now
  );
  insertLine.run('line-demo-01-1', 'att-demo-01', 'cat-mason', 'Mason', 10, 1400, 'daily', 14000, 14000, 0, null);
  insertLine.run('line-demo-01-2', 'att-demo-01', 'cat-helper', 'Helper', 8, 1000, 'daily', 8000, 8000, 0, null);

  // Sample 2: Heeralal 18/10/2026 - Approved
  insertAtt.run(
    'att-demo-02', '2026-10-17', 'team-heeralal', '2026-10-18', 'Lumia Building Block A', 'Regular Shift',
    '08:30', '17:30', 0, 150, 0, 'Brick masonry external wall',
    'usr-staff-01', 'approved', 'usr-admin-01', 'ERP Administrator', '2026-10-18T18:00:00.000Z',
    null, null, null, 0, 'usr-staff-01', 'usr-admin-01', now, now
  );
  insertLine.run('line-demo-02-1', 'att-demo-02', 'cat-mason', 'Mason', 12, 1400, 'daily', 16800, 16800, 0, null);
  insertLine.run('line-demo-02-2', 'att-demo-02', 'cat-helper', 'Helper', 10, 1000, 'daily', 10000, 10000, 0, null);

  // Sample 3: Centring Murugan 19/10/2026 - Pending Approval (Staff submitted)
  insertAtt.run(
    'att-demo-03', '2026-10-17', 'team-centring-murugan', '2026-10-19', 'Main Tower 4th Floor', 'Centring Shift',
    '08:30', '17:30', 0, 150, 0, 'Slab shuttering formwork erection',
    'usr-staff-01', 'pending_approval', null, null, null,
    null, null, null, 0, 'usr-staff-01', 'usr-staff-01', now, now
  );
  insertLine.run('line-demo-03-1', 'att-demo-03', 'cat-centring', 'Centring Labour', 15, 1200, 'daily', 18000, 18000, 0, null);
  insertLine.run('line-demo-03-2', 'att-demo-03', 'cat-helper', 'Helper', 6, 1000, 'daily', 6000, 6000, 0, null);

  // Sample 4: Vishnu Civil 20/10/2026 - Change Pending Approval (revision requested)
  const revisionPayload = {
    locationProject: 'Block B Ground Floor',
    shiftBatch: 'Plastering Batch',
    inTime: '08:30',
    outTime: '17:30',
    overtimeHours: 0,
    overtimeRate: 150,
    overtimeAmount: 0,
    remarks: 'Site engineer confirmed 2 extra masons joined at 9am',
    lines: [
      { categoryId: 'cat-mason', categoryName: 'Mason', count: 10, rate: 1400, calculatedAmount: 14000, finalAmount: 14000 },
      { categoryId: 'cat-helper', categoryName: 'Helper', count: 14, rate: 1000, calculatedAmount: 14000, finalAmount: 14000 },
    ]
  };

  insertAtt.run(
    'att-demo-04', '2026-10-17', 'team-vishnu-civil', '2026-10-20', 'Block B Ground Floor', 'Plastering Batch',
    '08:30', '17:30', 0, 150, 0, 'Original batch count verified by supervisor',
    'usr-staff-01', 'change_pending_approval', 'usr-admin-01', 'ERP Administrator', '2026-10-20T18:00:00.000Z',
    null, 'Site engineer confirmed 2 extra masons joined at 9am', JSON.stringify(revisionPayload), 0,
    'usr-staff-01', 'usr-staff-01', now, now
  );
  insertLine.run('line-demo-04-1', 'att-demo-04', 'cat-mason', 'Mason', 8, 1400, 'daily', 11200, 11200, 0, null);
  insertLine.run('line-demo-04-2', 'att-demo-04', 'cat-helper', 'Helper', 14, 1000, 'daily', 14000, 14000, 0, null);

  // Sample 5: Painter 21/10/2026 - Rejected (with mandatory reason)
  insertAtt.run(
    'att-demo-05', '2026-10-17', 'team-vishnu-painter', '2026-10-21', 'Tower 2 External Facade', 'Painting Batch',
    '08:30', '17:30', 0, 150, 0, 'Exterior primer coat application',
    'usr-staff-01', 'rejected', null, null, null,
    'Daily safety checklist and biometric muster slip missing for 3 workers.', null, null, 0,
    'usr-staff-01', 'usr-staff-01', now, now
  );
  insertLine.run('line-demo-05-1', 'att-demo-05', 'cat-painter', 'Painter', 18, 950, 'daily', 17100, 17100, 0, null);

  // 2. Additional Charges
  const insertChg = db.prepare(`
    INSERT OR REPLACE INTO additional_charges (
      id, team_id, week_start_date, date, category, description,
      quantity, unit, rate, calculated_amount, final_amount,
      is_overridden, override_reason, remarks, owner_user_id, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertChg.run('chg-demo-01', 'team-heeralal', '2026-10-17', '2026-10-17', 'Transport', 'Tempo transport for scaffolding props', 2, 'trips', 1200, 2400, 2400, 0, null, 'Gate pass #4419', 'usr-staff-01', 'usr-staff-01', now);
  insertChg.run('chg-demo-02', 'team-centring-murugan', '2026-10-17', '2026-10-19', 'Equipment Rental', 'Diesel concrete mixer machine hire', 1, 'shift', 3500, 3500, 3500, 0, null, 'Fuel included', 'usr-staff-01', 'usr-staff-01', now);
  insertChg.run('chg-demo-03', 'team-vishnu-civil', '2026-10-17', '2026-10-20', 'Safety Gear', 'Safety rubber boots & helmets for wet casting', 12, 'pairs', 250, 3000, 3000, 0, null, 'Store requisition #109', 'usr-staff-01', 'usr-staff-01', now);

  // 3. Financial Adjustments
  const insertAdj = db.prepare(`
    INSERT OR REPLACE INTO financial_adjustments (
      id, team_id, week_start_date, date, adjustment_type, description,
      amount, rate_percentage, base_amount, owner_user_id, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertAdj.run('adj-demo-01', 'team-heeralal', '2026-10-17', '2026-10-22', 'advance_deduction', 'Recovery against weekly festival advance', 10000, null, null, 'usr-staff-01', 'usr-admin-01', now);
  insertAdj.run('adj-demo-02', 'team-vishnu-painter', '2026-10-17', '2026-10-21', 'percentage_deduction', 'Quality retention standard deduction (6.25%)', 1068.75, 6.25, 17100, 'usr-staff-01', 'usr-admin-01', now);
  insertAdj.run('adj-demo-03', 'team-vishnu-civil', '2026-10-17', '2026-10-22', 'credit', 'Speed bonus for completing raft slab ahead of timeline', 5000, null, null, 'usr-staff-01', 'usr-admin-01', now);

  // 4. Supplier Bills
  const insertBill = db.prepare(`
    INSERT OR REPLACE INTO supplier_bills (
      id, week_start_date, supplier_name, work_description, gross_amount, advance_paid, net_payable, remarks, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertBill.run('bill-demo-01', '2026-10-17', 'Pankaj Steel Traders', 'TMT 16mm & 20mm rebar supply (Batch 4)', 284800, 210000, 74800, 'Weighbridge receipt verified at Gate 2', 'usr-admin-01', now);
  insertBill.run('bill-demo-02', '2026-10-17', 'UltraTech Concrete Solutions', 'M25 Ready-Mix Concrete 28 cum delivery', 145000, 50000, 95000, 'Slump test report attached', 'usr-admin-01', now);

  // 5. Weekly Payments
  const insertPmt = db.prepare(`
    INSERT OR REPLACE INTO weekly_payments (
      id, week_start_date, team_id, staff_user_id, gross_amount, charges_amount,
      deductions_amount, net_payable, amount_paid, status, payment_date,
      payment_method, voucher_ref, notes, marked_by, marked_by_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Week 2026-10-10: Partially Paid (shows in Outstanding Tracker)
  insertPmt.run(
    'pmt-demo-01', '2026-10-10', 'team-heeralal', 'usr-staff-01', 100000, 0, 0, 100000, 80000,
    'Partially Paid', '2026-10-16', 'Bank Transfer', 'TXN-00192', 'Balance ₹20,000 carry forward',
    'usr-admin-01', 'ERP Administrator', now, now
  );

  // Week 2026-10-17: Fully Paid
  insertPmt.run(
    'pmt-demo-02', '2026-10-17', 'team-heeralal', 'usr-staff-01', 117600, 2400, 10000, 110000, 110000,
    'Paid', '2026-10-23', 'Cheque', 'CHQ-88210', 'Cleared at HDFC Bank Site Branch',
    'usr-admin-01', 'ERP Administrator', now, now
  );

  // Week 2026-10-17: Pending Payment
  insertPmt.run(
    'pmt-demo-03', '2026-10-17', 'team-centring-murugan', 'usr-staff-01', 27500, 3500, 0, 31000, 0,
    'Pending', null, 'Bank Transfer', null, 'Awaiting approval queue settlement',
    'usr-admin-01', 'ERP Administrator', now, now
  );

  // 6. Petty Cash Entries ("for software.xlsx" Reference)
  const insertPetty = db.prepare(`
    INSERT OR REPLACE INTO petty_cash_entries (
      id, date, serial_no, description, credit_amount, debit_amount, online_amount,
      channel, day_balance, cash_in_hand_balance, cash_in_account_balance, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertPetty.run('pc-demo-01', '2026-10-01', 'PC-001', 'Office stationery, ledger books & printing supplies', 0, 1250, 0, 'cash', -1250, 23750, 75000, 'usr-admin-01', now, now);
  insertPetty.run('pc-demo-02', '2026-10-05', 'PC-002', 'Head office imprest replenishment via RTGS transfer', 50000, 0, 50000, 'online', 50000, 23750, 125000, 'usr-admin-01', now, now);
  insertPetty.run('pc-demo-03', '2026-10-12', 'PC-003', 'Site diesel generator fuel 60 litres in cash', 0, 5400, 0, 'cash', -5400, 18350, 125000, 'usr-admin-01', now, now);
  insertPetty.run('pc-demo-04', '2026-10-18', 'PC-004', 'Municipal curing water tanker delivery (2 tankers)', 0, 3200, 0, 'cash', -3200, 15150, 125000, 'usr-admin-01', now, now);
  insertPetty.run('pc-demo-05', '2026-10-22', 'PC-005', 'Electrical conduit pipes and switches paid via UPI', 0, 7650, 7650, 'online', -7650, 15150, 117350, 'usr-admin-01', now, now);

  // 7. Office Ledger (Restricted Double-Entry Master Admin Ledger)
  const insertLedger = db.prepare(`
    INSERT OR REPLACE INTO office_ledger_entries (
      id, entry_date, reference_no, category, description, entry_type, amount, running_balance, payment_mode, notes, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertLedger.run('ledg-demo-01', '2026-10-01', 'CAP-2026-01', 'Capital Injection', 'Director initial working capital injection for Q4 operations', 'credit', 500000, 500000, 'NEFT', 'Ref #RBI-00918', 'usr-admin-01', now);
  insertLedger.run('ledg-demo-02', '2026-10-08', 'ADV-LUMIA-01', 'Contractor Advance', 'Mobilization advance disbursed to Lumia Civil Works', 'debit', 150000, 350000, 'Cheque', 'Cheque #88190', 'usr-admin-01', now);
  insertLedger.run('ledg-demo-03', '2026-10-15', 'MAT-STL-01', 'Material Purchase', 'Pankaj Steel Traders batch advance for TMT rebar', 'debit', 210000, 140000, 'RTGS', 'UTR #HDFC99120', 'usr-admin-01', now);
  insertLedger.run('ledg-demo-04', '2026-10-22', 'CLT-BIL-01', 'Client Billing', 'Interim Client RA Bill #03 received from Lumia Infrastructure', 'credit', 380000, 520000, 'Wire', 'Receipt acknowledged', 'usr-admin-01', now);

  // 8. Dummy Attachments & Physical Files
  const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Create real dummy text/pdf files in uploads dir
  const sampleFiles = [
    { name: 'heeralal_oct17_muster_roll.pdf', content: '%PDF-1.4\n1 0 obj\n<<\n/Title (Heeralal Muster Roll - 17 Oct 2026)\n>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF' },
    { name: 'chq_88210_payment_voucher.pdf', content: '%PDF-1.4\n1 0 obj\n<<\n/Title (Payment Voucher CHQ-88210)\n>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF' },
    { name: 'pankaj_steel_weighbridge_slip.pdf', content: '%PDF-1.4\n1 0 obj\n<<\n/Title (Pankaj Steel Weighbridge Challan)\n>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF' },
  ];

  const insertAttach = db.prepare(`
    INSERT OR REPLACE INTO attachments (
      id, record_type, record_id, file_name, file_size, mime_type, file_path, description,
      owner_user_id, uploaded_by, uploaded_by_name, team_id, date, week_start_date, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  sampleFiles.forEach((file, idx) => {
    const fileId = `attch-demo-0${idx + 1}`;
    const storedName = `${fileId}.pdf`;
    try {
      fs.writeFileSync(path.join(uploadsDir, storedName), file.content);
    } catch {}

    insertAttach.run(
      fileId,
      idx === 1 ? 'weekly_payment' : 'attendance',
      idx === 1 ? 'pmt-demo-02' : 'att-demo-01',
      file.name,
      file.content.length * 1024,
      'application/pdf',
      storedName,
      idx === 0 ? 'Site supervisor signed muster roll with biometric check' : idx === 1 ? 'Photocopy of cleared cheque & labour thumb impression' : 'Weighbridge computerized certificate',
      'usr-staff-01',
      'usr-staff-01',
      'Staff User',
      'team-heeralal',
      '2026-10-17',
      '2026-10-17',
      now
    );
  });

  // 9. In-App Notifications
  const insertNotif = db.prepare(`
    INSERT OR REPLACE INTO notifications (id, user_id, title, message, type, link, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertNotif.run('notif-demo-01', 'usr-admin-01', 'New Attendance Submitted for Approval', 'Staff User submitted attendance for Centring Murugan (19/10/2026) with 21 workers.', 'approval', '/approvals', 0, now);
  insertNotif.run('notif-demo-02', 'usr-admin-01', 'Attendance Revision Proposed', 'Staff User requested revision for Vishnu Civil Labour (20/10/2026). Reason: Site engineer counted 2 extra masons.', 'revision', '/approvals', 0, now);
  insertNotif.run('notif-demo-03', 'usr-staff-01', 'Attendance Approved', 'Your attendance submission for Heeralal (17/10/2026) was approved by ERP Administrator.', 'approval', '/daily', 0, now);
  insertNotif.run('notif-demo-04', 'usr-staff-01', 'Weekly Payment Disbursed', 'Cheque voucher CHQ-88210 (₹1,10,000) recorded for week starting 17/10/2026.', 'payment', '/payments', 1, now);
}

export async function sendExpoPushNotification(params: {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) {
  try {
    const rows = db.prepare('SELECT push_token FROM user_push_tokens WHERE user_id = ?').all(params.userId) as Array<{ push_token: string }>;
    if (!rows || rows.length === 0) return;

    const messages = rows
      .filter(r => r.push_token && (r.push_token.startsWith('ExponentPushToken[') || r.push_token.startsWith('ExpoPushToken[')))
      .map(r => ({
        to: r.push_token,
        sound: 'default',
        title: params.title,
        body: params.body,
        data: params.data || {},
        priority: 'high',
        channelId: 'default',
      }));

    if (messages.length === 0) return;

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    console.error('[Expo Push Dispatch Error]:', err);
  }
}

export function createNotification(params: {
  userId: string;
  title: string;
  message: string;
  type?: 'info' | 'approval' | 'rejection' | 'modification' | 'payment';
  link?: string;
}) {
  try {
    const id = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, link, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(id, params.userId, params.title, params.message, params.type || 'info', params.link || null, now);

    // Asynchronously dispatch real mobile push notification to user's registered device(s)
    sendExpoPushNotification({
      userId: params.userId,
      title: params.title,
      body: params.message,
      data: { link: params.link, type: params.type },
    }).catch(err => console.error('[Push Notification Error]:', err));
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
}

export function logAudit(params: {
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValues?: unknown;
  newValues?: unknown;
  reason?: string;
}) {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_name, actor_role, action, entity_type, entity_id, previous_values_json, new_values_json, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const id = `aud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    stmt.run(
      id,
      params.actorId,
      params.actorName,
      params.actorRole,
      params.action,
      params.entityType,
      params.entityId,
      params.previousValues ? JSON.stringify(params.previousValues) : null,
      params.newValues ? JSON.stringify(params.newValues) : null,
      params.reason || null,
      new Date().toISOString()
    );
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

/**
 * Calculates great-circle distance between two GPS coordinates in metres using the Haversine formula.
 * Verified against standard WGS84 ellipsoidal distance.
 */
export function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in metres
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Masks an Aadhaar number to display only the last 4 digits (e.g. XXXX-XXXX-1234).
 * Protects sensitive citizen identity information according to UIDAI privacy guidelines.
 */
export function maskAadhaar(raw?: string | null): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 4) return 'XXXX-XXXX-XXXX';
  const last4 = digits.slice(-4);
  return `XXXX-XXXX-${last4}`;
}

