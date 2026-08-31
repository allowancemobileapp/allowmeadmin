import { ClassCode } from './capTable';

/**
 * CONTINGENT EQUITY.
 *
 * Four award schemes. None have vested. The cap table has to be viewable as
 * Current, If-all-vest, and Scenario.
 *
 * THE ONE RULE THAT IS EASY TO GET WRONG, and changes the outcome:
 *
 *   default_award = award_total - SUM(shares allocated to any Challenge EVER
 *                                     ISSUED)
 *
 * It subtracts ALLOCATED, not LAPSED. So a declined Challenge's shares are
 * taken off the default award AND lapse -- the holder loses them twice. That
 * asymmetry is deliberate and is what stops a Challenge being declined as a
 * cost-free way of falling back to the default.
 *
 * The other half: lapsed shares NEVER come back. They are not "unallocated"
 * and are not awarded at the longstop date.
 */

export type ChallengeStatus =
  | 'issued'        // waiting on accept/decline, 5 business days
  | 'accepted'      // in progress
  | 'declined'      // lapsed
  | 'completed'     // vested
  | 'not_completed' // lapsed
  | 'expired';      // deadline missed, lapsed

export interface Challenge {
  id: string;
  description: string;
  acceptanceCriteria: string;
  allocatedShares: number;
  issuedOn: string;      // ISO date
  respondBy: string;     // issuedOn + 5 business days
  deliverBy: string;
  status: ChallengeStatus;
  outcome?: string;
  assessedBy?: string;
  assessedOn?: string;
}

export type AwardMechanism = 'transfer' | 'issue';

export interface AwardScheme {
  id: string;
  holderId: string;
  holderName: string;
  awardTotal: number;
  classCode: ClassCode;
  mechanism: AwardMechanism;
  /** Only set for a transfer. Whose shares move. */
  transferFromHolderId?: string;
  longstopDate: string;
  /** James's scheme has fixed tranches and no challenge/default mechanics. */
  kind: 'challenge' | 'tranche';
  challenges?: Challenge[];
  tranches?: Tranche[];
}

/**
 * James's scheme. Five tranches of 10,000 Class A, each with one milestone.
 * No challenge flow, no default award, no partial award, no carry-over.
 */
export interface Tranche {
  id: string;
  index: 1 | 2 | 3 | 4 | 5;
  shares: number;
  milestoneDescription: string | null;
  /** Milestones must be RECORDED by this date or the tranche cannot be earned. */
  recordedOn?: string;
  achieved: boolean;
  /** Must be a director other than James. Enforced by certifierIsValid. */
  certifiedBy?: string;
  certifiedOn?: string;
}

/** Milestones for the founder's scheme must be recorded by this date. */
export const MILESTONE_RECORDING_DEADLINE = '2026-09-30';

/** A director may certify the founder's milestones. The founder may not. */
export function certifierIsValid(
  certifierId: string,
  founderId: string,
  directorIds: string[],
): boolean {
  if (certifierId === founderId) return false;
  return directorIds.includes(certifierId);
}

export function milestoneRecordingLocked(now = new Date()): boolean {
  // End of the deadline day, not the start -- a milestone recorded on the
  // 30th is in time.
  return now > new Date(`${MILESTONE_RECORDING_DEADLINE}T23:59:59.999Z`);
}

const LAPSED: ChallengeStatus[] = ['declined', 'not_completed', 'expired'];

export interface AwardOutcome {
  schemeId: string;
  holderId: string;
  holderName: string;
  classCode: ClassCode;
  mechanism: AwardMechanism;
  awardTotal: number;
  /** Every challenge ever issued, whatever became of it. */
  allocatedToChallenges: number;
  vestedFromChallenges: number;
  lapsed: number;
  /** Awarded automatically at the longstop date. */
  defaultAward: number;
  totalVested: number;
  pending: number;
}

/**
 * Works out where a scheme stands.
 *
 * atLongstop=false gives the position today: only completed challenges have
 * vested and the default award is still pending. atLongstop=true is the
 * if-all-resolves view used by the scenario toggle.
 */
export function resolveAward(
  scheme: AwardScheme,
  atLongstop = false,
): AwardOutcome {
  if (scheme.kind === 'tranche') {
    const tranches = scheme.tranches ?? [];
    const vested = tranches
      .filter((t) => t.achieved && t.certifiedBy)
      .reduce((a, t) => a + t.shares, 0);
    const lapsed = atLongstop
      ? tranches.filter((t) => !(t.achieved && t.certifiedBy))
                .reduce((a, t) => a + t.shares, 0)
      : 0;
    return {
      schemeId: scheme.id,
      holderId: scheme.holderId,
      holderName: scheme.holderName,
      classCode: scheme.classCode,
      mechanism: scheme.mechanism,
      awardTotal: scheme.awardTotal,
      allocatedToChallenges: 0,
      vestedFromChallenges: vested,
      lapsed,
      // No default award on this scheme. Miss the milestone and it dies.
      defaultAward: 0,
      totalVested: vested,
      pending: atLongstop ? 0 : scheme.awardTotal - vested - lapsed,
    };
  }

  const challenges = scheme.challenges ?? [];

  // ALLOCATED, not lapsed. See the header.
  const allocated = challenges.reduce((a, c) => a + c.allocatedShares, 0);
  const vested = challenges
    .filter((c) => c.status === 'completed')
    .reduce((a, c) => a + c.allocatedShares, 0);
  const lapsed = challenges
    .filter((c) => LAPSED.includes(c.status))
    .reduce((a, c) => a + c.allocatedShares, 0);

  // Never negative: over-allocating challenges beyond the award simply means
  // no default award, not a share debt.
  const defaultAward = Math.max(0, scheme.awardTotal - allocated);

  const totalVested = atLongstop ? vested + defaultAward : vested;

  return {
    schemeId: scheme.id,
    holderId: scheme.holderId,
    holderName: scheme.holderName,
    classCode: scheme.classCode,
    mechanism: scheme.mechanism,
    awardTotal: scheme.awardTotal,
    allocatedToChallenges: allocated,
    vestedFromChallenges: vested,
    lapsed,
    defaultAward,
    totalVested,
    pending: atLongstop
      ? 0
      : scheme.awardTotal - vested - lapsed - defaultAward,
  };
}

/** The movements a set of resolved awards would put through the cap table. */
export function movementsFromAwards(outcomes: AwardOutcome[], schemes: AwardScheme[]) {
  return outcomes
    .filter((o) => o.totalVested > 0)
    .map((o) => {
      const scheme = schemes.find((s) => s.id === o.schemeId)!;
      return {
        kind: o.mechanism === 'transfer' ? ('transfer' as const) : ('issue' as const),
        classCode: o.classCode,
        shares: o.totalVested,
        toHolderId: o.holderId,
        fromHolderId: scheme.transferFromHolderId,
        note: `${scheme.holderName} milestone award`,
      };
    });
}

/** Five business days from an issue date, for the accept/decline window. */
export function respondByDate(issuedOn: string): string {
  const d = new Date(issuedOn);
  let added = 0;
  while (added < 5) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}
