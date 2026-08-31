import { Kobo, naira } from './money';

/**
 * The cap table, and the one distinction that makes it correct.
 *
 * A TRANSFER moves shares between holders. Total unchanged, no capital
 * increase, no CAC filing.
 * An ISSUE creates new shares. Total rises, capital rises at par, and the
 * memorandum has to be amended.
 *
 * Getting these the same way round is the difference between Laniyan going
 * from 10.00% to 9.65% -- correct, because the new issues to other people
 * dilute her even though she received shares herself -- and showing her going
 * up, which would be wrong.
 */

export type ClassCode = 'A' | 'B';

export interface ShareClass {
  code: ClassCode;
  name: string;
  votesPerShare: number;
  parValue: Kobo;
  /** Class A may only be ISSUED to the Founder (Articles, Part 2). */
  founderOnly: boolean;
}

export const SHARE_CLASSES: Record<ClassCode, ShareClass> = {
  A: { code: 'A', name: 'Class A Ordinary', votesPerShare: 10,
       parValue: naira(10), founderOnly: true },
  B: { code: 'B', name: 'Class B Ordinary', votesPerShare: 1,
       parValue: naira(10), founderOnly: false },
};

export interface Holding { holderId: string; classCode: ClassCode; shares: number; }

export interface Holder {
  id: string;
  name: string;
  role?: string;
  isFounder?: boolean;
  /** Article 3: the only people other than the Founder who may hold Class A. */
  isFoundingTeam?: boolean;
}

export type MovementKind = 'issue' | 'transfer' | 'buyback' | 'conversion';

export interface Movement {
  kind: MovementKind;
  classCode: ClassCode;
  shares: number;
  toHolderId: string;
  /** Required for a transfer: the shares have to come from somewhere. */
  fromHolderId?: string;
  note?: string;
}

export interface HolderPosition {
  holderId: string;
  name: string;
  role?: string;
  isFounder: boolean;
  byClass: Record<ClassCode, number>;
  totalShares: number;
  votes: number;
  /** Full precision. Round only at the edge, for display. */
  economicPct: number;
  votingPct: number;
  paidInValue: Kobo;
}

export interface CapTableState {
  holders: HolderPosition[];
  totalShares: number;
  totalVotes: number;
  sharesByClass: Record<ClassCode, number>;
  issuedCapital: Kobo;
}

/**
 * Applies movements to a starting set of holdings and returns the resulting
 * table. Pure, so the same inputs always give the same answer, which is what
 * makes the golden tests worth anything.
 */
export function computeCapTable(
  holders: Holder[],
  holdings: Holding[],
  movements: Movement[] = [],
): CapTableState {
  const byHolder = new Map<string, Record<ClassCode, number>>();
  for (const h of holders) byHolder.set(h.id, { A: 0, B: 0 });

  for (const h of holdings) {
    const row = byHolder.get(h.holderId);
    if (!row) throw new Error(`Holding for unknown holder ${h.holderId}`);
    row[h.classCode] += h.shares;
  }

  for (const m of movements) {
    const to = byHolder.get(m.toHolderId);
    if (!to) throw new Error(`Movement to unknown holder ${m.toHolderId}`);

    if (m.kind === 'transfer') {
      if (!m.fromHolderId) {
        throw new Error('A transfer needs a fromHolderId. Shares cannot appear from nowhere.');
      }
      const from = byHolder.get(m.fromHolderId);
      if (!from) throw new Error(`Movement from unknown holder ${m.fromHolderId}`);
      if (from[m.classCode] < m.shares) {
        throw new Error(
          `${m.fromHolderId} holds ${from[m.classCode]} class ${m.classCode} shares, `
          + `cannot transfer ${m.shares}.`);
      }

      // Article 4: Class A converts one for one into Class B the moment it
      // reaches anyone who is not the Founder or a designated Founding Team
      // Member. Modelled here so the table can never show Class A votes in
      // hands that are not entitled to them.
      const recipient = holders.find((h) => h.id === m.toHolderId)!;
      const keepsClassA = m.classCode !== 'A'
        || recipient.isFounder === true
        || recipient.isFoundingTeam === true;

      from[m.classCode] -= m.shares;
      to[keepsClassA ? m.classCode : 'B'] += m.shares;

    } else if (m.kind === 'issue') {
      const recipient = holders.find((h) => h.id === m.toHolderId)!;
      if (SHARE_CLASSES[m.classCode].founderOnly && !recipient.isFounder) {
        throw new Error(
          `${SHARE_CLASSES[m.classCode].name} may only be ISSUED to the Founder `
          + `(Article 3a). It reaches a Founding Team Member by transfer instead.`);
      }
      to[m.classCode] += m.shares;

    } else if (m.kind === 'buyback') {
      if (to[m.classCode] < m.shares) {
        throw new Error(`Cannot buy back more shares than ${m.toHolderId} holds.`);
      }
      to[m.classCode] -= m.shares;

    } else if (m.kind === 'conversion') {
      if (to.A < m.shares) throw new Error('Not enough Class A to convert.');
      to.A -= m.shares;
      to.B += m.shares;
    }
  }

  const sharesByClass: Record<ClassCode, number> = { A: 0, B: 0 };
  let totalShares = 0;
  let totalVotes = 0;

  for (const [, row] of byHolder) {
    sharesByClass.A += row.A;
    sharesByClass.B += row.B;
    totalShares += row.A + row.B;
    totalVotes += row.A * SHARE_CLASSES.A.votesPerShare
                + row.B * SHARE_CLASSES.B.votesPerShare;
  }

  const positions: HolderPosition[] = holders.map((h) => {
    const row = byHolder.get(h.id)!;
    const total = row.A + row.B;
    const votes = row.A * SHARE_CLASSES.A.votesPerShare
                + row.B * SHARE_CLASSES.B.votesPerShare;
    return {
      holderId: h.id,
      name: h.name,
      role: h.role,
      isFounder: !!h.isFounder,
      byClass: { ...row },
      totalShares: total,
      votes,
      // Guarded, so an empty table is zeroes rather than NaN.
      economicPct: totalShares > 0 ? (total / totalShares) * 100 : 0,
      votingPct: totalVotes > 0 ? (votes / totalVotes) * 100 : 0,
      paidInValue: row.A * SHARE_CLASSES.A.parValue
                 + row.B * SHARE_CLASSES.B.parValue,
    };
  }).filter((p) => p.totalShares > 0);

  return {
    holders: positions,
    totalShares,
    totalVotes,
    sharesByClass,
    issuedCapital: sharesByClass.A * SHARE_CLASSES.A.parValue
                 + sharesByClass.B * SHARE_CLASSES.B.parValue,
  };
}

/**
 * Test G. Run after every operation that changes the table, so a drift is
 * caught where it happened rather than being discovered in a CAC filing.
 */
export function assertCapTableInvariants(s: CapTableState): void {
  const sumEcon = s.holders.reduce((a, h) => a + h.economicPct, 0);
  const sumVote = s.holders.reduce((a, h) => a + h.votingPct, 0);
  const sumShares = s.holders.reduce((a, h) => a + h.totalShares, 0);

  if (s.totalShares > 0 && Math.abs(sumEcon - 100) > 0.0001) {
    throw new Error(`Economic percentages sum to ${sumEcon}, not 100.`);
  }
  if (s.totalVotes > 0 && Math.abs(sumVote - 100) > 0.0001) {
    throw new Error(`Voting percentages sum to ${sumVote}, not 100.`);
  }
  if (sumShares !== s.totalShares) {
    throw new Error(`Holder shares sum to ${sumShares}, table says ${s.totalShares}.`);
  }
  if (!Number.isInteger(s.totalShares)) {
    throw new Error('Share counts must be whole numbers.');
  }
  const expectedCapital = s.totalShares * naira(10);
  if (s.issuedCapital !== expectedCapital) {
    throw new Error(
      `Issued capital ${s.issuedCapital} does not equal shares x par ${expectedCapital}.`);
  }
}

/** What a set of movements would mean for the memorandum and CAC. */
export function filingImpact(movements: Movement[]) {
  const newShares = movements
    .filter((m) => m.kind === 'issue')
    .reduce((a, m) => a + m.shares, 0);
  return {
    newShares,
    capitalIncrease: newShares * naira(10),
    // A transfer needs neither. Only an issue changes the share capital.
    requiresMemorandumAmendment: newShares > 0,
    requiresCacFiling: newShares > 0,
  };
}
