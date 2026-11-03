import { describe, it, expect, beforeAll } from 'vitest';
import { db, initDatabase, logAudit } from '../src/server/db';
import bcrypt from 'bcryptjs';

describe('5. Database Schema, Constraints & Authorization Tests', () => {
  beforeAll(() => {
    initDatabase();
  });

  it('provisions designated initial administrator and staff accounts with hashed credentials', () => {
    const admin = db.prepare('SELECT id, email, role, status, password_hash FROM users WHERE role = ?').get('admin') as any;
    expect(admin).toBeDefined();
    expect(admin.email).toBe('admin@company.erp');
    expect(admin.status).toBe('active');
    expect(bcrypt.compareSync('Admin@ERP2026!', admin.password_hash)).toBe(true);

    const staff = db.prepare('SELECT id, email, role, status, password_hash FROM users WHERE role = ?').get('staff') as any;
    expect(staff).toBeDefined();
    expect(staff.email).toBe('staff@company.erp');
    expect(staff.status).toBe('active');
    expect(bcrypt.compareSync('Staff@ERP2026!', staff.password_hash)).toBe(true);
  });

  it('seeds standard labour categories and initial teams with role templates', () => {
    const categories = db.prepare('SELECT * FROM labour_categories').all();
    expect(categories.length).toBeGreaterThanOrEqual(10);

    const mason = categories.find((c: any) => c.code === 'MASON') as any;
    expect(mason).toBeDefined();
    expect(mason.default_rate).toBe(1400);

    const helper = categories.find((c: any) => c.code === 'HELPER') as any;
    expect(helper).toBeDefined();
    expect(helper.default_rate).toBe(1000);

    const teams = db.prepare('SELECT * FROM teams').all();
    expect(teams.length).toBeGreaterThanOrEqual(8);
  });

  it('supports multiple attendance entries on the same date for the same team', () => {
    const testDate = '2026-10-17';
    const teamId = 'team-heeralal';
    const entryId1 = `test-att-1-${Date.now()}`;
    const entryId2 = `test-att-2-${Date.now()}`;

    // Batch 1: Morning regular shift
    db.prepare(`
      INSERT INTO attendance_entries (id, week_start_date, team_id, date, shift_batch, created_by, updated_by, created_at, updated_at)
      VALUES (?, '2026-10-17', ?, ?, 'Regular Shift', 'usr-admin-01', 'usr-admin-01', datetime('now'), datetime('now'))
    `).run(entryId1, teamId, testDate);

    // Batch 2: Night concrete pour shift on same date
    db.prepare(`
      INSERT INTO attendance_entries (id, week_start_date, team_id, date, shift_batch, created_by, updated_by, created_at, updated_at)
      VALUES (?, '2026-10-17', ?, ?, 'Night Shift Concrete', 'usr-admin-01', 'usr-admin-01', datetime('now'), datetime('now'))
    `).run(entryId2, teamId, testDate);

    const entriesOnDate = db.prepare('SELECT * FROM attendance_entries WHERE team_id = ? AND date = ?').all(teamId, testDate);
    expect(entriesOnDate.length).toBeGreaterThanOrEqual(2);

    // Cleanup test records
    db.prepare('DELETE FROM attendance_entries WHERE id IN (?, ?)').run(entryId1, entryId2);
  });

  it('records immutable audit logs with actor and previous values', () => {
    const testEntityId = `test-ent-${Date.now()}`;
    logAudit({
      actorId: 'usr-admin-01',
      actorName: 'ERP Administrator',
      actorRole: 'admin',
      action: 'UPDATE_RATE_OVERRIDE',
      entityType: 'attendance_lines',
      entityId: testEntityId,
      previousValues: { rate: 1000, finalAmount: 5000 },
      newValues: { rate: 1000, finalAmount: 5500 },
      reason: 'Approved hazard allowance for 10th floor exterior plastering',
    });

    const audit = db.prepare('SELECT * FROM audit_logs WHERE entity_id = ?').get(testEntityId) as any;
    expect(audit).toBeDefined();
    expect(audit.actor_role).toBe('admin');
    expect(audit.reason).toContain('hazard allowance');
    expect(JSON.parse(audit.new_values_json).finalAmount).toBe(5500);

    // Cleanup
    db.prepare('DELETE FROM audit_logs WHERE entity_id = ?').run(testEntityId);
  });
});
