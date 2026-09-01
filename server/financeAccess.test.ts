import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { financeGuard, liveGuard, peopleGuard } from './financeAccess';

/**
 * The guard is default-deny, which is the right way round for salary data and
 * the wrong way round for a route somebody forgot to map. This test closes
 * that gap: it reads the actual route tables out of the router sources and
 * walks every one of them through the guard, so adding a finance route
 * without a permission rule fails here rather than as a 403 in production.
 */

const ROOT = join(__dirname, '..');

function routePathsOf(file: string): string[] {
  const src = readFileSync(join(ROOT, 'server', file), 'utf8');
  const found = new Set<string>();
  const re = /router\.(get|post|put|delete|patch)\(\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    // ':id' is a placeholder; the guard matches on the literal prefix, so any
    // stand-in value exercises the same rule a real request would.
    found.add(m[2].replace(/:[A-Za-z0-9_]+/g, 'x'));
  }
  return [...found];
}

function run(guard: any, path: string, perms: any, email = 'staff@example.com') {
  const req: any = { path, adminEmail: email, adminPermissions: perms };
  let status = 200;
  let body: any = null;
  let passed = false;
  const res: any = {
    status(c: number) { status = c; return res; },
    json(b: any) { body = b; return res; },
  };
  guard(req, res, () => { passed = true; });
  return { passed, status, body };
}

const ALL_SCREENS = [
  'overview', 'live', 'grossprofit', 'payroll', 'captable', 'milestones',
  'round', 'mystake', 'schools', 'people', 'record', 'reports',
];

const everything = { pages: ['finance'], finance_tabs: ALL_SCREENS };

describe('finance screen guard', () => {
  it('has a rule for every route in financeRoutes', () => {
    const unmapped = routePathsOf('financeRoutes.ts').filter((p) => {
      const r = run(financeGuard, p, everything);
      return !r.passed && /has no permission rule/.test(r.body?.error || '');
    });
    expect(unmapped).toEqual([]);
  });

  it('has a rule for every route in financeV2Routes', () => {
    const unmapped = routePathsOf('financeV2Routes.ts').filter((p) => {
      const r = run(financeGuard, p, everything);
      // The Access screen is founder-only and refused on purpose, not
      // unmapped. Only a missing rule counts as a failure here.
      return !r.passed && /has no permission rule/.test(r.body?.error || '');
    });
    expect(unmapped).toEqual([]);
  });

  it('has a rule for every route in liveRoutes', () => {
    const unmapped = routePathsOf('liveRoutes.ts').filter((p) => {
      const r = run(liveGuard, p, everything);
      return !r.passed && /has no permission rule/.test(r.body?.error || '');
    });
    expect(unmapped).toEqual([]);
  });

  it('lets the super-admin through regardless of permissions', () => {
    const r = run(financeGuard, '/payroll', {}, 'allowancemobileapp@gmail.com');
    expect(r.passed).toBe(true);
  });

  it('refuses an account that was never granted the Finance page', () => {
    const r = run(financeGuard, '/payroll',
                  { pages: ['dashboard'], finance_tabs: ['payroll'] });
    expect(r.passed).toBe(false);
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/not been granted Company Finance/);
  });

  it('refuses a screen that was not granted', () => {
    const r = run(financeGuard, '/payroll',
                  { pages: ['finance'], finance_tabs: ['schools'] });
    expect(r.passed).toBe(false);
    expect(r.status).toBe(403);
  });

  it('allows a screen that was granted', () => {
    const r = run(financeGuard, '/payroll',
                  { pages: ['finance'], finance_tabs: ['payroll'] });
    expect(r.passed).toBe(true);
  });

  it('treats an absent finance_tabs key as nothing granted', () => {
    // The key did not exist before per-screen permissions did. An account
    // saved back then must not inherit everybody's salaries.
    const r = run(financeGuard, '/payroll', { pages: ['finance'] });
    expect(r.passed).toBe(false);
  });

  it('lets the page shell load for anyone holding one screen', () => {
    const perms = { pages: ['finance'], finance_tabs: ['schools'] };
    for (const p of ['/role', '/bootstrap', '/settings']) {
      expect(run(financeGuard, p, perms).passed).toBe(true);
    }
  });

  it('allows a path that serves several screens if any one is held', () => {
    // /expenses feeds Money in & out, Gross profit and Record.
    const r = run(financeGuard, '/expenses',
                  { pages: ['finance'], finance_tabs: ['grossprofit'] });
    expect(r.passed).toBe(true);
  });

  it('keeps the Access screen founder-only whatever is granted', () => {
    const r = run(financeGuard, '/users', everything);
    expect(r.passed).toBe(false);
    expect(r.body.error).toMatch(/Only the founder/);
  });

  it('gates every staff record behind the People screen', () => {
    const withPeople = { pages: ['finance'], finance_tabs: ['people'] };
    const without = { pages: ['finance'], finance_tabs: ['overview'] };
    for (const p of routePathsOf('peopleRoutes.ts')) {
      if (p.startsWith('/me')) continue;
      expect(run(peopleGuard, p, withPeople).passed).toBe(true);
      expect(run(peopleGuard, p, without).passed).toBe(false);
    }
  });

  it("always allows a person's own record", () => {
    const perms = { pages: ['finance'], finance_tabs: [] };
    expect(run(peopleGuard, '/me/summary', perms).passed).toBe(true);
    expect(run(financeGuard, '/me', perms).passed).toBe(true);
  });

  it('does not let Campuses reach the payroll or the cap table', () => {
    const perms = { pages: ['finance'], finance_tabs: ['schools'] };
    expect(run(liveGuard, '/schools', perms).passed).toBe(true);
    expect(run(financeGuard, '/payroll', perms).passed).toBe(false);
    expect(run(financeGuard, '/cap-table', perms).passed).toBe(false);
    expect(run(financeGuard, '/share-price', perms).passed).toBe(false);
    expect(run(peopleGuard, '/', perms).passed).toBe(false);
  });
});
