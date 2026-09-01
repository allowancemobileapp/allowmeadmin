import type { Request, Response, NextFunction } from "express";

/**
 * Server-side enforcement of the per-screen finance permissions.
 *
 * WHY THIS FILE EXISTS. Hiding a tab in the client hides the tab, not the
 * data. Anyone who can reach the admin API at all could call
 * /api/finance/payroll and read what every officer is paid, whether or not
 * the tab was on their screen. A permission that only exists in React is a
 * suggestion.
 *
 * DEFAULT DENY. A finance path that matches nothing below is refused rather
 * than allowed. That direction is deliberate: a route I forgot to map is a
 * 403 on a screen somebody was granted -- visible, reported, and a one-line
 * fix -- whereas the other default leaks salaries silently for as long as
 * nobody happens to look. If you add a finance route, add it here too; the
 * refusal message says so.
 *
 * ONE PATH CAN SERVE SEVERAL SCREENS. /expenses feeds Money in & out, Gross
 * profit and Record, so it lists all three and passes if the account holds
 * ANY of them. Mapping each path to a single screen would mean granting
 * Record in order to see the overview.
 *
 * WHAT THIS IS NOT. It is authorisation, not authentication. It reads
 * req.adminEmail, which requireAdmin now takes from a Firebase ID token
 * verified against Google's public keys on every request -- so the identity
 * it acts on is proved rather than claimed, and this decides only what that
 * proved identity is allowed to reach.
 */

export type Rule = { test: RegExp; screens: string[] };

// Needed by the page shell no matter which screen is open: the role lookup,
// the bootstrap payload the tab strip is built from, and display settings.
// Gating these would mean an account granted one screen could not load the
// page that screen lives on.
const SHELL = /^\/(role|bootstrap|settings|expense-categories)(\/|$)/;

const FINANCE_RULES: Rule[] = [
  // -- Money in & out ------------------------------------------------------
  { test: /^\/(summary|timeseries)(\/|$)/, screens: ['overview'] },
  { test: /^\/revenue(\/|$)/,              screens: ['overview', 'reports'] },
  { test: /^\/income(\/|$)/,               screens: ['overview', 'record'] },
  { test: /^\/expenses(\/|$)/,
    screens: ['overview', 'grossprofit', 'record'] },

  // -- Gross profit --------------------------------------------------------
  { test: /^\/gross-profit(\/|$)/, screens: ['grossprofit'] },

  // -- Payroll -------------------------------------------------------------
  // /reconciliation lives here because the bank comparison is only meaningful
  // to somebody who can already see what left the account in wages.
  { test: /^\/(payroll|deferred|pay-scales|salaries|reconciliation)(\/|$)/,
    screens: ['payroll'] },

  // -- Ownership and the share price ---------------------------------------
  { test: /^\/(cap-table|share-price|share-transactions|shareholders|valuations)(\/|$)/,
    screens: ['captable', 'record'] },
  // Everyone's stake side by side. The Live split screen is built on it, and
  // so is Ownership.
  { test: /^\/(stakeholders|snapshot)(\/|$)/,
    screens: ['captable', 'live', 'reports'] },

  // -- Milestones ----------------------------------------------------------
  { test: /^\/(awards|challenges|tranches)(\/|$)/, screens: ['milestones'] },

  // -- Round modelling -----------------------------------------------------
  { test: /^\/(model-round|safes)(\/|$)/, screens: ['round'] },
  { test: /^\/capital(\/|$)/,             screens: ['round', 'record'] },

  // -- My own stake --------------------------------------------------------
  // Always allowed. It returns the signed-in person's own holding and
  // nothing else, so there is nobody it could expose them to.
  { test: /^\/me(\/|$)/, screens: ['*'] },

  // -- Investments and liabilities -----------------------------------------
  { test: /^\/(investments|liabilities)(\/|$)/,
    screens: ['record', 'overview', 'reports'] },

  // -- Reports -------------------------------------------------------------
  { test: /^\/(balance-sheet|audit)(\/|$)/, screens: ['reports'] },

  // -- The Access tab ------------------------------------------------------
  // Finance roles are handed out here, so anyone who could reach it could
  // grant themselves everything else. Founder-only inside the router already;
  // this makes it unreachable rather than merely refused.
  { test: /^\/users(\/|$)/, screens: ['__founder_only__'] },
];

const LIVE_RULES: Rule[] = [
  { test: /^\/split(\/|$)/,     screens: ['live'] },
  { test: /^\/schools(\/|$)/,   screens: ['schools'] },
  // The named investors are the dropdown on Round modelling, and the same
  // list names people on the Live split.
  { test: /^\/investors(\/|$)/, screens: ['round', 'live'] },
];

// Every route under /api/people is a staff record: contracts, salaries,
// rewards. One screen governs all of it. The exception is a person's own
// summary, which exposes nobody but themselves.
const PEOPLE_RULES: Rule[] = [
  { test: /^\/me(\/|$)/, screens: ['*'] },
  { test: /.*/,          screens: ['people'] },
];

const SUPER_ADMINS = [
  'allowancemobileapp@gmail.com',
  'allowancemobielapp@gmail.com',
];

/**
 * Build the middleware for one mount point.
 *
 * `label` names the mount in the refusal, so a 403 says which screen to grant
 * rather than leaving somebody guessing which of thirteen it was.
 */
export function financeScreenGuard(rules: Rule[], label: string) {
  return function guard(req: Request, res: Response, next: NextFunction) {
    const email = String((req as any).adminEmail || '').toLowerCase();
    if (SUPER_ADMINS.includes(email)) return next();

    const perms = (req as any).adminPermissions || {};
    if (perms.all) return next();

    const granted: string[] = Array.isArray(perms.finance_tabs)
      ? perms.finance_tabs : [];

    // The page itself has to be granted before any screen on it counts.
    const pages: string[] = Array.isArray(perms.pages) ? perms.pages : [];
    if (!pages.includes('finance')) {
      return res.status(403).json({
        error: 'This account has not been granted Company Finance. It can be '
             + 'turned on from Account Permissions.',
      });
    }

    // req.path is the path WITHIN the mounted router, which is what the rules
    // are written against. req.url would still carry the query string.
    const path = req.path || '/';

    if (label === 'finance' && SHELL.test(path)) return next();

    const rule = rules.find((r) => r.test.test(path));

    if (!rule) {
      // Default deny. See the note at the top of this file.
      console.warn(`[finance-access] unmapped ${label} path: ${path}`);
      return res.status(403).json({
        error: `This part of Company Finance (${path}) has no permission rule, `
             + 'so it is refused by default. If you are seeing this on a screen '
             + 'you were granted, it needs a rule adding in '
             + 'server/financeAccess.ts.',
      });
    }

    if (rule.screens.includes('*')) return next();

    if (rule.screens.includes('__founder_only__')) {
      return res.status(403).json({
        error: 'Only the founder can open the Access screen.',
      });
    }

    if (rule.screens.some((sc) => granted.includes(sc))) return next();

    return res.status(403).json({
      error: 'This account has not been granted that Company Finance screen. '
           + `It needs one of: ${rule.screens.join(', ')}.`,
    });
  };
}

export const financeGuard = financeScreenGuard(FINANCE_RULES, 'finance');
export const liveGuard    = financeScreenGuard(LIVE_RULES, 'live');
export const peopleGuard  = financeScreenGuard(PEOPLE_RULES, 'people');
