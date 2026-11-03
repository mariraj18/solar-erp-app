/**
 * Seed Script: Weekly Payment Report Data (24.10.2026 to 30.10.2026)
 * Source: Weekly_Payment_Report_24.10.2026_to_30.10.2026.docx
 *
 * Inserts real sample attendance entries, charges, adjustments and weekly payments
 * for the week of Saturday 24-Oct-2026 to Friday 30-Oct-2026.
 *
 * Run via: npx tsx src/server/seedWeeklyReport.ts
 */

import { db, initDatabase } from './db';

initDatabase();

const WEEK_START = '2026-10-24';
const WEEK_END   = '2026-10-30';
const STAFF_ID   = 'usr-staff-01';
const ADMIN_ID   = 'usr-admin-01';
const now = new Date().toISOString();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(prefix: string, suffix: string) {
  return `${prefix}-w2410-${suffix}`;
}

const insertTeam = db.prepare(`
  INSERT OR IGNORE INTO teams (id, name, work_category, location_project, status, notes, created_at, updated_at)
  VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
`);

const insertAtt = db.prepare(`
  INSERT OR REPLACE INTO attendance_entries (
    id, week_start_date, team_id, date, location_project, shift_batch,
    in_time, out_time, overtime_hours, overtime_rate, overtime_amount, remarks,
    owner_user_id, status, approved_by, approved_by_name, approved_at,
    created_by, updated_by, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, 'ERP Administrator', ?, ?, ?, ?, ?)
`);

const insertLine = db.prepare(`
  INSERT OR REPLACE INTO attendance_lines (
    id, attendance_entry_id, category_id, category_name,
    count, rate, rate_type, calculated_amount, final_amount, is_overridden, override_reason
  ) VALUES (?, ?, ?, ?, ?, ?, 'daily', ?, ?, 0, null)
`);

const insertChg = db.prepare(`
  INSERT OR REPLACE INTO additional_charges (
    id, team_id, week_start_date, date, category, description,
    quantity, unit, rate, calculated_amount, final_amount,
    is_overridden, override_reason, remarks, owner_user_id, created_by, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, null, ?, ?, ?, ?)
`);

const insertAdj = db.prepare(`
  INSERT OR REPLACE INTO financial_adjustments (
    id, team_id, week_start_date, date, adjustment_type, description,
    amount, rate_percentage, base_amount, owner_user_id, created_by, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertPmt = db.prepare(`
  INSERT OR REPLACE INTO weekly_payments (
    id, week_start_date, team_id, staff_user_id,
    gross_amount, charges_amount, deductions_amount, net_payable, amount_paid,
    status, payment_date, payment_method, voucher_ref, notes,
    marked_by, marked_by_name, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'Pending', null, 'Cash', null, ?, ?, 'ERP Administrator', ?, ?)
`);

// ─── Ensure new teams exist ───────────────────────────────────────────────────

const newTeams = [
  { id: 'team-sakthivel-breaker',   name: 'Sakthivel Team – Breaker Work',         cat: 'Demolition',              proj: 'Lemuir Building' },
  { id: 'team-kannan-water',        name: 'Kannan Water Supply',                    cat: 'Water Supply',            proj: 'Lemuir Building' },
  { id: 'team-manoj-bolero',        name: 'Manoj Bolero – Transport',               cat: 'Transport & Logistics',   proj: 'Site Wide' },
  { id: 'team-ulaganathan-vvd',     name: 'VVD – Ulaganathan Civil',               cat: 'Civil Works',             proj: 'VVD Site' },
  { id: 'team-pitchumani-museum',   name: 'Museum Cleaning – Pitchumani',           cat: 'Cleaning & Maintenance',  proj: 'Heritage Museum Site' },
  { id: 'team-vishnu-iron-shift',   name: 'Vishnu Iron Rod Shifting',               cat: 'Material Handling',       proj: 'Admin to Lemuir Building' },
  { id: 'team-tile-arun',           name: 'Tile Arun – Tile Work',                  cat: 'Tile Work',               proj: 'Lemuir Building' },
  { id: 'team-subbayya-water',      name: 'Subbayya Water Supply',                  cat: 'Water Supply',            proj: 'Lemuir Building' },
  { id: 'team-anburaj-painter',     name: 'Anburaj Painter Team',                   cat: 'Painting',                proj: 'Lemuir Building' },
  { id: 'team-joseph-plumber',      name: 'Joseph Plumber Team',                    cat: 'Plumbing',                proj: 'Lemuir Building' },
  { id: 'team-electrician-arul',    name: 'Arul Electrician Team',                  cat: 'Electrical Works',        proj: 'Lemuir Building' },
  { id: 'team-kadi-supramani',      name: 'Supramani – Kadi / Electrical Pipe',     cat: 'Electrical Works',        proj: 'Forbes & Lemuir Buildings' },
  { id: 'team-ansari-carpenter',    name: 'Ansari Team – Carpentry',                cat: 'Carpentry',               proj: 'Lemuir Building' },
  { id: 'team-ali-carpenter',       name: 'Ali Team – Carpentry',                   cat: 'Carpentry',               proj: 'Lemuir Building' },
  { id: 'team-sakthivel-bolero',    name: 'Sakthivel Bolero – Transport',           cat: 'Transport & Logistics',   proj: 'Site Wide' },
  { id: 'team-sakthivel-demolish',  name: 'Sakthivel Demolisher – Green Gate',      cat: 'Demolition',              proj: 'Green Gate' },
  { id: 'team-vishnu-civil-akbar',  name: 'Vishnu Civil (Akbar Ali)',               cat: 'Civil Works',             proj: 'Lemuir Building' },
  { id: 'team-vishnu-painter-akbar','name': 'Vishnu Painter (Akbar Ali)',             cat: 'Painting',                proj: 'Lemuir Building' },
  { id: 'team-arun-mason-akbar',    name: 'Arun Mason Team (Akbar Ali)',             cat: 'Masonry',                 proj: 'Lemuir Building' },
];

for (const t of newTeams) {
  insertTeam.run(t.id, t.name, t.cat, t.proj, '', now, now);
}

// ─── 1. SAKTHIVEL TEAM – BREAKER WORK (26/10 to 30/10) ──────────────────────
// Breaker: 8 x ₹1,900 = ₹15,200 | Helper: 5 x ₹1,000 = ₹5,000
// Mestri: 6 x ₹1,300 = ₹7,800 | Rental: ₹1,660 | TOTAL: ₹29,606

const sakthivelBreaker = [
  { date: '2026-10-26', breaker: 1, helper: 1 },
  { date: '2026-10-27', breaker: 2, helper: 0 },
  { date: '2026-10-28', breaker: 2, helper: 1 },
  { date: '2026-10-29', breaker: 2, helper: 2 },
  { date: '2026-10-30', breaker: 1, helper: 1 },
];

for (const d of sakthivelBreaker) {
  const eid = uid('att-sak-brk', d.date.slice(5));
  insertAtt.run(eid, WEEK_START, 'team-sakthivel-breaker', d.date, 'Lemuir Building', 'Regular',
    '08:00', '17:00', 0, 0, 0, 'Breaker demolition work',
    STAFF_ID, ADMIN_ID, now, STAFF_ID, STAFF_ID, now, now);
  if (d.breaker > 0)
    insertLine.run(`${eid}-brk`, eid, 'cat-breaker', 'Demolition / Breaker', d.breaker, 1900, d.breaker * 1900, d.breaker * 1900);
  if (d.helper > 0)
    insertLine.run(`${eid}-hlp`, eid, 'cat-helper', 'Helper', d.helper, 1000, d.helper * 1000, d.helper * 1000);
}
// Mestri charge (treated as Additional Charge)
insertChg.run(uid('chg-sak-mestri','01'), 'team-sakthivel-breaker', WEEK_START, '2026-10-30',
  'Labour – Mestri', 'Mestri coolie (6 days)', 6, 'days', 1300, 7800, 7800,
  'Week total mestri charge', STAFF_ID, STAFF_ID, now);
// Equipment Rental
insertChg.run(uid('chg-sak-rental','01'), 'team-sakthivel-breaker', WEEK_START, '2026-10-30',
  'Equipment Rental', 'Satti rental ₹760 + Steel Palette ₹900', 1, 'lot', 1660, 1660, 1660,
  'Tool rental for breaker team', STAFF_ID, STAFF_ID, now);
insertPmt.run(uid('pmt-sak-brk','01'), WEEK_START, 'team-sakthivel-breaker', STAFF_ID,
  29606, 9460, 0, 29606, 'Sakthivel Breaker Week 24-30 Oct 2026', ADMIN_ID, now, now);

// ─── 2. KANNAN WATER SUPPLY ────────────────────────────────────────────────────
// 19/10 – Water Supply 1 Load @ ₹2,500 = ₹2,500
insertChg.run(uid('chg-kannan-ws','01'), 'team-kannan-water', WEEK_START, '2026-10-19',
  'Water Supply', 'Water Supply – 01 Load', 1, 'load', 2500, 2500, 2500,
  '', STAFF_ID, STAFF_ID, now);
insertPmt.run(uid('pmt-kannan','01'), WEEK_START, 'team-kannan-water', STAFF_ID,
  2500, 2500, 0, 2500, 'Kannan Water Supply', ADMIN_ID, now, now);

// ─── 3. MANOJ BOLERO – TRIPS (28/10 to 30/10) ────────────────────────────────
// Trip Charges = ₹2,400
const manojTrips = [
  { date: '2026-10-28', desc: 'Cement trip 50 bags', amount: 700 },
  { date: '2026-10-28', desc: 'Green gate pipe', amount: 300 },
  { date: '2026-10-29', desc: 'Window shifting', amount: 300 },
  { date: '2026-10-29', desc: 'Sand shifting', amount: 300 },
  { date: '2026-10-29', desc: 'Brick to old guest house', amount: 300 },
  { date: '2026-10-30', desc: 'Labour trip', amount: 500 },
];
for (let i = 0; i < manojTrips.length; i++) {
  const t = manojTrips[i];
  insertChg.run(uid('chg-manoj', String(i + 1).padStart(2,'0')), 'team-manoj-bolero', WEEK_START, t.date,
    'Transport – Trip', t.desc, 1, 'trip', t.amount, t.amount, t.amount, '', STAFF_ID, STAFF_ID, now);
}
insertPmt.run(uid('pmt-manoj','01'), WEEK_START, 'team-manoj-bolero', STAFF_ID,
  2400, 2400, 0, 2400, 'Manoj Bolero Trip List', ADMIN_ID, now, now);

// ─── 4. LEMUIR BUILDING – HIRALAL – LABOUR (24/10 to 30/10) ─────────────────
// Mason 54 x ₹1,400 = ₹75,600 | Helper 27 x ₹1,000 = ₹27,000 | TOTAL: ₹1,02,600

const heeralal2410 = [
  { date: '2026-10-24', in: '08:00', out: '18:00', mason: 10, helper: 5 },
  { date: '2026-10-26', in: '09:00', out: '18:00', mason:  9, helper: 4 },
  { date: '2026-10-27', in: '09:00', out: '18:00', mason: 10, helper: 5 },
  { date: '2026-10-28', in: '09:00', out: '18:00', mason:  8, helper: 4 },
  { date: '2026-10-29', in: '09:00', out: '18:00', mason:  9, helper: 5 },
  { date: '2026-10-30', in: '09:00', out: '18:00', mason:  8, helper: 4 },
];

for (const d of heeralal2410) {
  const eid = uid('att-hrl2410', d.date.slice(5));
  insertAtt.run(eid, WEEK_START, 'team-heeralal', d.date, 'Lemuir Building', 'Regular',
    d.in, d.out, 0, 0, 0, 'Civil masonry work – Lemuir Building',
    STAFF_ID, ADMIN_ID, now, STAFF_ID, STAFF_ID, now, now);
  insertLine.run(`${eid}-mason`, eid, 'cat-mason', 'Mason', d.mason, 1400, d.mason * 1400, d.mason * 1400);
  insertLine.run(`${eid}-hlp`,   eid, 'cat-helper', 'Helper', d.helper, 1000, d.helper * 1000, d.helper * 1000);
}
insertPmt.run(uid('pmt-hrl2410','01'), WEEK_START, 'team-heeralal', STAFF_ID,
  102600, 0, 0, 102600, 'Lemuir Hiralal Labour Report 24-30 Oct', ADMIN_ID, now, now);

// ─── 5. CENTRING – MURUGAN (24/10 to 30/10) ──────────────────────────────────
// Mason 12 x ₹1,400 = ₹16,800 | Helper 12 x ₹1,100 = ₹13,200
// Machines: ₹2,400 | Purchase: ₹190 | TOTAL: ₹32,590

const murugan2410 = [
  { date: '2026-10-24', mason: 2, helper: 3 },
  { date: '2026-10-26', mason: 2, helper: 2 },
  { date: '2026-10-27', mason: 2, helper: 2 },
  { date: '2026-10-28', mason: 2, helper: 1 },
  { date: '2026-10-29', mason: 2, helper: 2 },
  { date: '2026-10-30', mason: 2, helper: 2 },
];

for (const d of murugan2410) {
  const eid = uid('att-mur2410', d.date.slice(5));
  insertAtt.run(eid, WEEK_START, 'team-centring-murugan', d.date, 'Main Tower', 'Centring Shift',
    '08:30', '17:30', 0, 0, 0, 'Slab shuttering and centring work',
    STAFF_ID, ADMIN_ID, now, STAFF_ID, STAFF_ID, now, now);
  insertLine.run(`${eid}-mason`, eid, 'cat-mason', 'Mason', d.mason, 1400, d.mason * 1400, d.mason * 1400);
  insertLine.run(`${eid}-hlp`,   eid, 'cat-helper', 'Helper', d.helper, 1100, d.helper * 1100, d.helper * 1100);
}
insertChg.run(uid('chg-mur-mach','01'), 'team-centring-murugan', WEEK_START, '2026-10-30',
  'Equipment Rental', '14" machine ₹1,200 + Wood Cutting ₹600 + Grinding ₹600 (6 days)', 1, 'lot', 2400, 2400, 2400,
  'Centring machines rental', STAFF_ID, STAFF_ID, now);
insertChg.run(uid('chg-mur-prch','01'), 'team-centring-murugan', WEEK_START, '2026-10-30',
  'Material Purchase', '14" wheel x1, 4" wheel x1', 1, 'lot', 190, 190, 190,
  'Cutting wheel purchase', STAFF_ID, STAFF_ID, now);
insertPmt.run(uid('pmt-mur2410','01'), WEEK_START, 'team-centring-murugan', STAFF_ID,
  30000, 2590, 0, 32590, 'Centring Murugan Labour 24-30 Oct', ADMIN_ID, now, now);

// ─── 6. VVD – ULAGANATHAN (24/10 to 30/10) ────────────────────────────────────
// Mason 29 x ₹1,400 = ₹40,600 | Helper 36 x ₹1,000 = ₹36,000
// Less deduction ₹362 | TOTAL: ₹76,238 → reported ₹76,600 in summary (before deduction)

const vvd2410 = [
  { date: '2026-10-24', in: '09:00', out: '18:00', mason:  6, helper:  7 }, // 4+2 mason, 4+3 helper
  { date: '2026-10-26', in: '09:00', out: '18:00', mason:  4, helper:  4 },
  { date: '2026-10-27', in: '09:00', out: '18:00', mason:  6, helper:  6 }, // 4+2 mason, 4+2 helper
  { date: '2026-10-28', in: '09:00', out: '18:00', mason:  6, helper:  7 },
  { date: '2026-10-29', in: '09:00', out: '18:00', mason:  2, helper:  3 },
  { date: '2026-10-30', in: '09:00', out: '18:00', mason:  5, helper:  9 },
];

for (const d of vvd2410) {
  const eid = uid('att-vvd2410', d.date.slice(5));
  insertAtt.run(eid, WEEK_START, 'team-ulaganathan-vvd', d.date, 'VVD Site', 'Regular',
    d.in, d.out, 0, 0, 0, 'VVD civil works',
    STAFF_ID, ADMIN_ID, now, STAFF_ID, STAFF_ID, now, now);
  insertLine.run(`${eid}-mason`, eid, 'cat-mason', 'Mason', d.mason, 1400, d.mason * 1400, d.mason * 1400);
  insertLine.run(`${eid}-hlp`,   eid, 'cat-helper', 'Helper', d.helper, 1000, d.helper * 1000, d.helper * 1000);
}
insertAdj.run(uid('adj-vvd-ded','01'), 'team-ulaganathan-vvd', WEEK_START, '2026-10-30',
  'fixed_deduction', 'Quality / shortage deduction', 362, null, null, STAFF_ID, ADMIN_ID, now);
insertPmt.run(uid('pmt-vvd2410','01'), WEEK_START, 'team-ulaganathan-vvd', STAFF_ID,
  76600, 0, 362, 76238, 'VVD Ulaganathan Labour 24-30 Oct', ADMIN_ID, now, now);

// ─── 7. MUSEUM CLEANING – PITCHUMANI (24/10 to 30/10) ────────────────────────
// 24 labourers @ ₹650 = ₹15,600 | Auto Charge ₹2,400 | TOTAL: ₹18,000

const museum2410 = ['2026-10-24','2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30'];
for (const date of museum2410) {
  const eid = uid('att-mus2410', date.slice(5));
  insertAtt.run(eid, WEEK_START, 'team-pitchumani-museum', date, 'Heritage Museum Site', 'Regular',
    '08:00', '17:00', 0, 0, 0, 'Daily cleaning and maintenance',
    STAFF_ID, ADMIN_ID, now, STAFF_ID, STAFF_ID, now, now);
  insertLine.run(`${eid}-hlp`, eid, 'cat-helper', 'Helper', 4, 650, 2600, 2600);
}
insertChg.run(uid('chg-mus-auto','01'), 'team-pitchumani-museum', WEEK_START, '2026-10-30',
  'Transport', 'Weekly auto rickshaw charge for labourers', 1, 'week', 2400, 2400, 2400,
  '', STAFF_ID, STAFF_ID, now);
insertPmt.run(uid('pmt-mus2410','01'), WEEK_START, 'team-pitchumani-museum', STAFF_ID,
  15600, 2400, 0, 18000, 'Museum Cleaning Pitchumani 24-30 Oct', ADMIN_ID, now, now);

// ─── 8. VISHNU – IRON ROD SHIFTING (one-time task) ───────────────────────────
// Mason 3 x ₹850 = ₹2,550 | Helper 1 x ₹650 = ₹650 | TOTAL: ₹3,200
const eid_iron = uid('att-vish-iron','01');
insertAtt.run(eid_iron, WEEK_START, 'team-vishnu-iron-shift', '2026-10-30',
  'Admin Building to Lemuir Building', 'Special Task',
  '08:00', '17:00', 0, 0, 0, 'Iron rod shifting – Admin to Lemuir',
  STAFF_ID, ADMIN_ID, now, STAFF_ID, STAFF_ID, now, now);
insertLine.run(`${eid_iron}-mason`, eid_iron, 'cat-mason', 'Mason', 3, 850, 2550, 2550);
insertLine.run(`${eid_iron}-hlp`,   eid_iron, 'cat-helper', 'Helper', 1, 650, 650, 650);
insertPmt.run(uid('pmt-vish-iron','01'), WEEK_START, 'team-vishnu-iron-shift', STAFF_ID,
  3200, 0, 0, 3200, 'Vishnu Iron Rod Shifting', ADMIN_ID, now, now);

// ─── 9. TILE ARUN (24/10 to 30/10) ────────────────────────────────────────────
// Rate ₹1,250/person | Mason 18, Helper 10 | TOTAL: ₹35,000

const tileArun2410 = [
  { date: '2026-10-24', mason: 6, helper: 2 },
  { date: '2026-10-26', mason: 1, helper: 2 },
  { date: '2026-10-27', mason: 1, helper: 1 },
  { date: '2026-10-28', mason: 2, helper: 1 },
  { date: '2026-10-29', mason: 4, helper: 2 },
  { date: '2026-10-30', mason: 4, helper: 2 },
];

for (const d of tileArun2410) {
  const eid = uid('att-tile2410', d.date.slice(5));
  insertAtt.run(eid, WEEK_START, 'team-tile-arun', d.date, 'Lemuir Building', 'Tile Work',
    '08:00', '17:00', 0, 0, 0, 'Tile work – Lemuir Building',
    STAFF_ID, ADMIN_ID, now, STAFF_ID, STAFF_ID, now, now);
  insertLine.run(`${eid}-mason`, eid, 'cat-tile', 'Tile Mason', d.mason, 1250, d.mason * 1250, d.mason * 1250);
  insertLine.run(`${eid}-hlp`,   eid, 'cat-helper', 'Helper', d.helper, 1250, d.helper * 1250, d.helper * 1250);
}
insertPmt.run(uid('pmt-tile2410','01'), WEEK_START, 'team-tile-arun', STAFF_ID,
  35000, 0, 0, 35000, 'Tile Arun Labour 24-30 Oct', ADMIN_ID, now, now);

// ─── 10. SUBBAYYA WATER SUPPLY (24/10 to 30/10) ──────────────────────────────
// 10 loads x ₹900 = ₹9,000

const subbayya2410 = [
  { date: '2026-10-24', loads: 2 },
  { date: '2026-10-25', loads: 2 },
  { date: '2026-10-26', loads: 1 },
  { date: '2026-10-27', loads: 1 },
  { date: '2026-10-28', loads: 1 },
  { date: '2026-10-29', loads: 2 },
  { date: '2026-10-30', loads: 1 },
];

for (const d of subbayya2410) {
  insertChg.run(uid('chg-sub-ws', d.date.slice(5)), 'team-subbayya-water', WEEK_START, d.date,
    'Water Supply', `Water Supply – ${d.loads} Load(s) @ ₹900`, d.loads, 'load', 900, d.loads * 900, d.loads * 900,
    '', STAFF_ID, STAFF_ID, now);
}
insertPmt.run(uid('pmt-sub2410','01'), WEEK_START, 'team-subbayya-water', STAFF_ID,
  9000, 9000, 0, 9000, 'Subbayya Water Supply 24-30 Oct', ADMIN_ID, now, now);

// ─── 11. ANBURAJ PAINTER (24/10 to 30/10) ────────────────────────────────────
// Painter 53 x ₹950 = ₹50,350 | Late coming deduction -₹3,325 | Mestri ₹9,270 | TOTAL: ₹56,295

const anburaj2410 = [
  { date: '2026-10-24', count: 12 },
  { date: '2026-10-26', count: 14 },
  { date: '2026-10-27', count:  7 },
  { date: '2026-10-28', count:  6 },
  { date: '2026-10-29', count:  6 },
  { date: '2026-10-30', count:  8 },
];

for (const d of anburaj2410) {
  const eid = uid('att-anb2410', d.date.slice(5));
  insertAtt.run(eid, WEEK_START, 'team-anburaj-painter', d.date, 'Lemuir Building', 'Painting Batch',
    '08:30', '17:30', 0, 0, 0, 'Painting works',
    STAFF_ID, ADMIN_ID, now, STAFF_ID, STAFF_ID, now, now);
  insertLine.run(`${eid}-ptr`, eid, 'cat-painter', 'Painter', d.count, 950, d.count * 950, d.count * 950);
}
insertChg.run(uid('chg-anb-mestri','01'), 'team-anburaj-painter', WEEK_START, '2026-10-30',
  'Labour – Mestri', 'Mestri coolie charge (painter team)', 1, 'week', 9270, 9270, 9270,
  '', STAFF_ID, STAFF_ID, now);
insertAdj.run(uid('adj-anb-late','01'), 'team-anburaj-painter', WEEK_START, '2026-10-30',
  'fixed_deduction', 'Late coming deduction – 26 hrs', 3325, null, null, STAFF_ID, ADMIN_ID, now);
insertPmt.run(uid('pmt-anb2410','01'), WEEK_START, 'team-anburaj-painter', STAFF_ID,
  50350, 9270, 3325, 56295, 'Anburaj Painter 24-30 Oct', ADMIN_ID, now, now);

// ─── 12. JOSEPH PLUMBER (27/10 to 30/10) ─────────────────────────────────────
// 13 plumbers x ₹1,500 = ₹19,500

const joseph2410 = [
  { date: '2026-10-27', count: 4 },
  { date: '2026-10-28', count: 3 },
  { date: '2026-10-29', count: 3 },
  { date: '2026-10-30', count: 3 },
];

for (const d of joseph2410) {
  const eid = uid('att-jos2410', d.date.slice(5));
  insertAtt.run(eid, WEEK_START, 'team-joseph-plumber', d.date, 'Lemuir Building', 'Regular',
    '08:30', '17:30', 0, 0, 0, 'Plumbing works',
    STAFF_ID, ADMIN_ID, now, STAFF_ID, STAFF_ID, now, now);
  insertLine.run(`${eid}-plmb`, eid, 'cat-plumber', 'Plumber', d.count, 1500, d.count * 1500, d.count * 1500);
}
insertPmt.run(uid('pmt-jos2410','01'), WEEK_START, 'team-joseph-plumber', STAFF_ID,
  19500, 0, 0, 19500, 'Joseph Plumber 27-30 Oct', ADMIN_ID, now, now);

// ─── 13. ARUL ELECTRICIAN (24/10 to 30/10) ───────────────────────────────────
// 45 electricians x ₹1,200 = ₹54,000 | Late coming deduction 12.5% = -₹6,750 | TOTAL: ₹47,250

const arul2410 = [
  { date: '2026-10-24', count: 8 },
  { date: '2026-10-26', count: 8 },
  { date: '2026-10-27', count: 8 },
  { date: '2026-10-28', count: 7 },
  { date: '2026-10-29', count: 7 },
  { date: '2026-10-30', count: 7 },
];

for (const d of arul2410) {
  const eid = uid('att-arl2410', d.date.slice(5));
  insertAtt.run(eid, WEEK_START, 'team-electrician-arul', d.date, 'Lemuir Building', 'Regular',
    '10:00', '18:30', 0, 0, 0, 'Electrical works',
    STAFF_ID, ADMIN_ID, now, STAFF_ID, STAFF_ID, now, now);
  insertLine.run(`${eid}-elec`, eid, 'cat-electrician', 'Electrician', d.count, 1200, d.count * 1200, d.count * 1200);
}
insertAdj.run(uid('adj-arl-late','01'), 'team-electrician-arul', WEEK_START, '2026-10-30',
  'percentage_deduction', 'Late coming deduction 12.5% of ₹54,000', 6750, 12.5, 54000, STAFF_ID, ADMIN_ID, now);
insertPmt.run(uid('pmt-arl2410','01'), WEEK_START, 'team-electrician-arul', STAFF_ID,
  54000, 0, 6750, 47250, 'Arul Electrician 24-30 Oct', ADMIN_ID, now, now);

// ─── 14. SUPRAMANI – KADI / ELECTRICAL PIPE LINE WORK ────────────────────────
// Forbes ₹17,000 + Lemuir ₹29,000 = ₹46,000 | Advance ₹30,000 | BALANCE: ₹16,000
insertChg.run(uid('chg-sup-forbes','01'), 'team-kadi-supramani', WEEK_START, '2026-10-30',
  'Contractor Work', 'Kadi/Electrical pipe line work – Forbes Building', 1, 'lot', 17000, 17000, 17000,
  '', STAFF_ID, STAFF_ID, now);
insertChg.run(uid('chg-sup-lemuir','01'), 'team-kadi-supramani', WEEK_START, '2026-10-30',
  'Contractor Work', 'Kadi/Electrical pipe line work – Lemuir Building', 1, 'lot', 29000, 29000, 29000,
  '', STAFF_ID, STAFF_ID, now);
insertAdj.run(uid('adj-sup-adv','01'), 'team-kadi-supramani', WEEK_START, '2026-10-30',
  'advance_deduction', 'Advance paid deduction (₹10,000 + ₹20,000)', 30000, null, null, STAFF_ID, ADMIN_ID, now);
insertPmt.run(uid('pmt-sup2410','01'), WEEK_START, 'team-kadi-supramani', STAFF_ID,
  46000, 46000, 30000, 16000, 'Supramani Kadi Electrical Pipe Line Work', ADMIN_ID, now, now);

// ─── AKBAR ALI REPORTS ────────────────────────────────────────────────────────

// A1. VISHNU CIVIL (24/10 to 30/10) – Mason @850, Helper @650
// Mason 18 x ₹850 = ₹15,300 | Helper 31 x ₹650 = ₹20,150 | TOTAL: ₹35,450

const vishCivilAkbar = [
  { date: '2026-10-24', mason: 3, helper: 6 },
  { date: '2026-10-26', mason: 2, helper: 6 },
  { date: '2026-10-27', mason: 2, helper: 4 },
  { date: '2026-10-28', mason: 2, helper: 6 },
  { date: '2026-10-29', mason: 5, helper: 4 },
  { date: '2026-10-30', mason: 4, helper: 5 },
];

for (const d of vishCivilAkbar) {
  const eid = uid('att-vciv-ak', d.date.slice(5));
  insertAtt.run(eid, WEEK_START, 'team-vishnu-civil-akbar', d.date, 'Lemuir Building', 'Regular',
    '09:00', '18:00', 0, 0, 0, 'Vishnu Civil (Akbar Ali)',
    STAFF_ID, ADMIN_ID, now, STAFF_ID, STAFF_ID, now, now);
  insertLine.run(`${eid}-mason`, eid, 'cat-mason', 'Mason', d.mason, 850, d.mason * 850, d.mason * 850);
  insertLine.run(`${eid}-hlp`,   eid, 'cat-helper', 'Helper', d.helper, 650, d.helper * 650, d.helper * 650);
}
insertPmt.run(uid('pmt-vciv-ak','01'), WEEK_START, 'team-vishnu-civil-akbar', STAFF_ID,
  35450, 0, 0, 35450, 'Vishnu Civil (Akbar Ali) 24-30 Oct', ADMIN_ID, now, now);

// A2. VISHNU PAINTER (24/10 to 30/10) – Painter @900
// 26 x ₹900 = ₹23,400

const vishPainterAkbar = [
  { date: '2026-10-24', count: 5 },
  { date: '2026-10-26', count: 2 },
  { date: '2026-10-27', count: 5 },
  { date: '2026-10-28', count: 5 },
  { date: '2026-10-29', count: 5 },
  { date: '2026-10-30', count: 4 },
];

for (const d of vishPainterAkbar) {
  const eid = uid('att-vptr-ak', d.date.slice(5));
  insertAtt.run(eid, WEEK_START, 'team-vishnu-painter-akbar', d.date, 'Lemuir Building', 'Painting',
    '09:00', '18:00', 0, 0, 0, 'Vishnu Painter (Akbar Ali)',
    STAFF_ID, ADMIN_ID, now, STAFF_ID, STAFF_ID, now, now);
  insertLine.run(`${eid}-ptr`, eid, 'cat-painter', 'Painter', d.count, 900, d.count * 900, d.count * 900);
}
insertPmt.run(uid('pmt-vptr-ak','01'), WEEK_START, 'team-vishnu-painter-akbar', STAFF_ID,
  23400, 0, 0, 23400, 'Vishnu Painter (Akbar Ali) 24-30 Oct', ADMIN_ID, now, now);

// A3. ARUN MASON TEAM (24/10 to 30/10) – Mason @1250
// 40 x ₹1,250 = ₹50,000

const arunMasonAkbar = [
  { date: '2026-10-24', count: 6 },
  { date: '2026-10-25', count: 6 },
  { date: '2026-10-26', count: 6 },
  { date: '2026-10-27', count: 8 },
  { date: '2026-10-28', count: 6 },
  { date: '2026-10-29', count: 4 },
  { date: '2026-10-30', count: 4 },
];

for (const d of arunMasonAkbar) {
  const eid = uid('att-amson-ak', d.date.slice(5));
  insertAtt.run(eid, WEEK_START, 'team-arun-mason-akbar', d.date, 'Lemuir Building', 'Masonry',
    '09:00', '18:00', 0, 0, 0, 'Arun Mason Team (Akbar Ali)',
    STAFF_ID, ADMIN_ID, now, STAFF_ID, STAFF_ID, now, now);
  insertLine.run(`${eid}-mason`, eid, 'cat-mason', 'Mason', d.count, 1250, d.count * 1250, d.count * 1250);
}
insertPmt.run(uid('pmt-amson-ak','01'), WEEK_START, 'team-arun-mason-akbar', STAFF_ID,
  50000, 0, 0, 50000, 'Arun Mason Team (Akbar Ali) 24-30 Oct', ADMIN_ID, now, now);

// A4. SAKTHIVEL BOLERO PICKUP (24/10 to 30/10)
// Daily charges: 10 runs x ₹500 = ₹5,000 | Extra trips: 7 x ₹300 = ₹2,100 | TOTAL: ₹7,100

const boleroDaily = [
  { date: '2026-10-24', nos: 2 },
  { date: '2026-10-25', nos: 2 },
  { date: '2026-10-26', nos: 2 },
  { date: '2026-10-27', nos: 1 },
  { date: '2026-10-28', nos: 1 },
  { date: '2026-10-29', nos: 1 },
  { date: '2026-10-30', nos: 1 },
];
for (const d of boleroDaily) {
  insertChg.run(uid('chg-bol-daily', d.date.slice(5)), 'team-sakthivel-bolero', WEEK_START, d.date,
    'Transport – Daily', `Bolero daily pickup x${d.nos}`, d.nos, 'run', 500, d.nos * 500, d.nos * 500,
    '', STAFF_ID, STAFF_ID, now);
}

const boleroExtra = [
  { date: '2026-10-24', desc: 'Vishnu team trip' },
  { date: '2026-10-25', desc: 'Tile paste 30 bags' },
  { date: '2026-10-26', desc: 'Vishnu team trip' },
  { date: '2026-10-27', desc: 'Vishnu team trip' },
  { date: '2026-10-27', desc: 'Scaffolding team labour' },
  { date: '2026-10-28', desc: 'Vishnu team trip (1)' },
  { date: '2026-10-28', desc: 'Vishnu team trip (2)' },
];
for (let i = 0; i < boleroExtra.length; i++) {
  const t = boleroExtra[i];
  insertChg.run(uid('chg-bol-ext', String(i + 1).padStart(2,'0')), 'team-sakthivel-bolero', WEEK_START, t.date,
    'Transport – Extra Trip', t.desc, 1, 'trip', 300, 300, 300,
    '', STAFF_ID, STAFF_ID, now);
}
insertPmt.run(uid('pmt-bol-sak','01'), WEEK_START, 'team-sakthivel-bolero', STAFF_ID,
  7100, 7100, 0, 7100, 'Sakthivel Bolero Pickup 24-30 Oct', ADMIN_ID, now, now);

// A5. ANSARI TEAM – CARPENTRY (24/10 to 30/10)
// Carpenter 15 x ₹1,200 = ₹18,000 | Helper 12 x ₹850 = ₹10,200 | TOTAL: ₹28,200

const ansari2410 = [
  { date: '2026-10-24', carp: 3, helper: 3 },
  { date: '2026-10-26', carp: 3, helper: 3 },
  { date: '2026-10-27', carp: 3, helper: 2 },
  { date: '2026-10-28', carp: 3, helper: 2 },
  { date: '2026-10-29', carp: 3, helper: 2 },
];

for (const d of ansari2410) {
  const eid = uid('att-ans2410', d.date.slice(5));
  insertAtt.run(eid, WEEK_START, 'team-ansari-carpenter', d.date, 'Lemuir Building', 'Carpentry',
    '09:00', '18:00', 0, 0, 0, 'Ansari Carpentry Team',
    STAFF_ID, ADMIN_ID, now, STAFF_ID, STAFF_ID, now, now);
  insertLine.run(`${eid}-carp`, eid, 'cat-carpenter', 'Carpenter', d.carp, 1200, d.carp * 1200, d.carp * 1200);
  insertLine.run(`${eid}-hlp`,  eid, 'cat-helper', 'Helper', d.helper, 850, d.helper * 850, d.helper * 850);
}
insertPmt.run(uid('pmt-ans2410','01'), WEEK_START, 'team-ansari-carpenter', STAFF_ID,
  28200, 0, 0, 28200, 'Ansari Carpentry Team 24-30 Oct', ADMIN_ID, now, now);

// A6. ALI TEAM – CARPENTRY (24/10 to 30/10)
// Carpenter 36 x ₹1,200 = ₹43,200 | Helper 36 x ₹850 = ₹30,600 | OT ₹768 | TOTAL: ₹74,568

const ali2410 = [
  { date: '2026-10-24', carp: 6, helper: 6, carpOTHrs: 3, helpOTHrs: 3 },
  { date: '2026-10-26', carp: 6, helper: 6, carpOTHrs: 0, helpOTHrs: 0 },
  { date: '2026-10-27', carp: 6, helper: 6, carpOTHrs: 0, helpOTHrs: 0 },
  { date: '2026-10-28', carp: 6, helper: 6, carpOTHrs: 0, helpOTHrs: 0 },
  { date: '2026-10-29', carp: 6, helper: 6, carpOTHrs: 0, helpOTHrs: 0 },
  { date: '2026-10-30', carp: 6, helper: 6, carpOTHrs: 0, helpOTHrs: 0 },
];

for (const d of ali2410) {
  const otAmt = d.carpOTHrs > 0 ? (d.carpOTHrs * 150) + (d.helpOTHrs * 106) : 0;
  const eid = uid('att-ali2410', d.date.slice(5));
  insertAtt.run(eid, WEEK_START, 'team-ali-carpenter', d.date, 'Lemuir Building', 'Carpentry',
    '09:00', '18:00', d.carpOTHrs, 150, otAmt, 'Ali Carpentry Team',
    STAFF_ID, ADMIN_ID, now, STAFF_ID, STAFF_ID, now, now);
  insertLine.run(`${eid}-carp`, eid, 'cat-carpenter', 'Carpenter', d.carp, 1200, d.carp * 1200, d.carp * 1200);
  insertLine.run(`${eid}-hlp`,  eid, 'cat-helper', 'Helper', d.helper, 850, d.helper * 850, d.helper * 850);
}
insertPmt.run(uid('pmt-ali2410','01'), WEEK_START, 'team-ali-carpenter', STAFF_ID,
  74568, 0, 0, 74568, 'Ali Carpentry Team 24-30 Oct – incl. OT ₹768', ADMIN_ID, now, now);

// A7. SAKTHIVEL DEMOLISHER – GREEN GATE (26/10 to 29/10)
// Breaker 4 x ₹1,900 = ₹7,600 | Other items ₹5,280 | Deduction ₹325 | TOTAL: ₹12,555

const sakDem2410 = ['2026-10-26','2026-10-27','2026-10-28','2026-10-29'];
for (const date of sakDem2410) {
  const eid = uid('att-sdem2410', date.slice(5));
  insertAtt.run(eid, WEEK_START, 'team-sakthivel-demolish', date, 'Green Gate', 'Demolition',
    '08:00', '17:00', 0, 0, 0, 'Sakthivel Demolisher – Green Gate',
    STAFF_ID, ADMIN_ID, now, STAFF_ID, STAFF_ID, now, now);
  insertLine.run(`${eid}-brk`, eid, 'cat-breaker', 'Demolition / Breaker', 1, 1900, 1900, 1900);
}
insertChg.run(uid('chg-sdem-items','01'), 'team-sakthivel-demolish', WEEK_START, '2026-10-29',
  'Material & Tools', 'Cutting machine (6d) ₹600 + Steel blade 6pc ₹1380 + Cambi 10pc ₹300 + Wheelbarrow (6d) ₹3000', 1, 'lot', 5280, 5280, 5280,
  '', STAFF_ID, STAFF_ID, now);
insertAdj.run(uid('adj-sdem-ded','01'), 'team-sakthivel-demolish', WEEK_START, '2026-10-29',
  'fixed_deduction', 'Quality / shortage deduction', 325, null, null, STAFF_ID, ADMIN_ID, now);
insertPmt.run(uid('pmt-sdem2410','01'), WEEK_START, 'team-sakthivel-demolish', STAFF_ID,
  12880, 5280, 325, 12555, 'Sakthivel Demolisher Green Gate 26-29 Oct', ADMIN_ID, now, now);

// ─── Summary total (for verification) ────────────────────────────────────────
console.log('\n✅ Weekly Report seed complete for week: 24.10.2026 – 30.10.2026');
console.log('   Grand total from document: ₹10,92,643');
console.log('   All attendance entries, charges, adjustments and payment records inserted.\n');
