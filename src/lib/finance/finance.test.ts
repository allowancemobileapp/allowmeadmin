import { describe, it, expect } from 'vitest';
import { naira } from './money';
import {
  computeCapTable, assertCapTableInvariants, filingImpact,
  Holder, Holding, Movement,
} from './capTable';
import { computeGrossProfit, isDeductible } from './grossProfit';
import {
  bandFor, payFor, applyAccrual, band5TriggerMet, founderPaymentBlocked,
  DEFERRED_CAP,
} from './payroll';
import { resolveAward, AwardScheme, certifierIsValid } from './milestones';

// The real company, from the amended MEMART.
const JAMES = 'james', LANIYAN = 'laniyan', AZEEZ = 'azeez';
const ARINZE = 'arinze', AMINAT = 'aminat', LINDA = 'linda';

const HOLDERS: Holder[] = [
  { id: JAMES,   name: 'Ezenwammadu Izuchukwu James', role: 'Founder / CEO / CPO',
    isFounder: true, isFoundingTeam: true },
  { id: LANIYAN, name: 'Laniyan Moboluwasore', role: 'COO', isFoundingTeam: true },
  { id: AZEEZ,   name: 'Akpala Abdulazeez Olanrewaju', role: 'CTO', isFoundingTeam: true },
  { id: ARINZE,  name: 'Ezenwammadu Arinzechukwu Christian', role: 'Shareholder' },
  { id: AMINAT,  name: 'Adesope Aminat', role: 'CIO', isFoundingTeam: true },
  { id: LINDA,   name: 'Okwuego Linda Ogechukwu', role: 'Shareholder' },
];

const HOLDINGS: Holding[] = [
  { holderId: JAMES,   classCode: 'A', shares: 800_000 },
  { holderId: LANIYAN, classCode: 'B', shares: 100_000 },
  { holderId: AZEEZ,   classCode: 'B', shares:  50_000 },
  { holderId: ARINZE,  classCode: 'B', shares:  30_000 },
  { holderId: AMINAT,  classCode: 'B', shares:  10_000 },
  { holderId: LINDA,   classCode: 'B', shares:  10_000 },
];

const find = (s: ReturnType<typeof computeCapTable>, id: string) =>
  s.holders.find((h) => h.holderId === id)!;

// ---------------------------------------------------------------------------

describe('Test A - current cap table', () => {
  const s = computeCapTable(HOLDERS, HOLDINGS);

  it('has 1,000,000 shares and N10,000,000 capital', () => {
    expect(s.totalShares).toBe(1_000_000);
    expect(s.issuedCapital).toBe(naira(10_000_000));
  });

  it('has 8,200,000 votes', () => {
    expect(s.totalVotes).toBe(8_200_000);
  });

  it('gives James 80.00% economic and 97.5610% voting', () => {
    const j = find(s, JAMES);
    expect(j.economicPct).toBeCloseTo(80.0, 4);
    expect(j.votingPct).toBeCloseTo(97.5610, 4);
  });

  it('gives Laniyan 1.2195% voting and Azeez 0.6098%', () => {
    expect(find(s, LANIYAN).votingPct).toBeCloseTo(1.2195, 4);
    expect(find(s, AZEEZ).votingPct).toBeCloseTo(0.6098, 4);
  });

  it('sums to 100 on both measures', () => {
    expect(s.holders.reduce((a, h) => a + h.economicPct, 0)).toBeCloseTo(100, 4);
    expect(s.holders.reduce((a, h) => a + h.votingPct, 0)).toBeCloseTo(100, 4);
    expect(() => assertCapTableInvariants(s)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------

describe('Test B - everything vests', () => {
  // Laniyan's award is a TRANSFER from James. The other three are ISSUES.
  // That distinction is the whole point of this test.
  const movements: Movement[] = [
    { kind: 'transfer', classCode: 'A', shares: 10_000,
      toHolderId: LANIYAN, fromHolderId: JAMES },
    { kind: 'issue', classCode: 'B', shares: 50_000, toHolderId: AZEEZ },
    { kind: 'issue', classCode: 'B', shares: 40_000, toHolderId: AMINAT },
    { kind: 'issue', classCode: 'A', shares: 50_000, toHolderId: JAMES },
  ];
  const s = computeCapTable(HOLDERS, HOLDINGS, movements);

  it('reaches 1,140,000 shares and N11,400,000 capital', () => {
    expect(s.totalShares).toBe(1_140_000);
    expect(s.issuedCapital).toBe(naira(11_400_000));
  });

  it('splits 850,000 Class A and 290,000 Class B', () => {
    expect(s.sharesByClass.A).toBe(850_000);
    expect(s.sharesByClass.B).toBe(290_000);
  });

  it('reaches 8,790,000 votes', () => {
    expect(s.totalVotes).toBe(8_790_000);
  });

  it('matches the spec table for every holder', () => {
    const expected: Record<string, [number, number]> = {
      [JAMES]:   [73.68, 95.56],
      [LANIYAN]: [ 9.65,  2.28],
      [AZEEZ]:   [ 8.77,  1.14],
      [AMINAT]:  [ 4.39,  0.57],
      [ARINZE]:  [ 2.63,  0.34],
      [LINDA]:   [ 0.88,  0.11],
    };
    for (const [id, [econ, vote]] of Object.entries(expected)) {
      const h = find(s, id);
      expect(h.economicPct).toBeCloseTo(econ, 2);
      expect(h.votingPct).toBeCloseTo(vote, 2);
    }
  });

  it('DILUTES Laniyan from 10.00% to 9.65% despite her receiving shares', () => {
    const before = find(computeCapTable(HOLDERS, HOLDINGS), LANIYAN);
    const after = find(s, LANIYAN);
    expect(before.economicPct).toBeCloseTo(10.0, 4);
    expect(after.economicPct).toBeCloseTo(9.65, 2);
    // If this ever goes the other way, the transfer/issue split is wrong.
    expect(after.economicPct).toBeLessThan(before.economicPct);
  });

  it('keeps James at 840,000 Class A - 800k less 10k transferred plus 50k issued', () => {
    expect(find(s, JAMES).byClass.A).toBe(840_000);
  });

  it('holds the invariants', () => {
    expect(() => assertCapTableInvariants(s)).not.toThrow();
  });

  it('needs a memorandum amendment for 140,000 new shares', () => {
    const f = filingImpact(movements);
    expect(f.newShares).toBe(140_000);
    expect(f.capitalIncrease).toBe(naira(1_400_000));
    expect(f.requiresMemorandumAmendment).toBe(true);
  });
});

describe('cap table rules', () => {
  it('refuses to ISSUE Class A to anyone but the Founder', () => {
    expect(() => computeCapTable(HOLDERS, HOLDINGS, [
      { kind: 'issue', classCode: 'A', shares: 1000, toHolderId: LANIYAN },
    ])).toThrow(/only be ISSUED to the Founder/);
  });

  it('converts Class A to Class B on transfer to a non-founding-team holder', () => {
    const s = computeCapTable(HOLDERS, HOLDINGS, [
      { kind: 'transfer', classCode: 'A', shares: 10_000,
        toHolderId: LINDA, fromHolderId: JAMES },
    ]);
    // Linda is not a Founding Team Member, so Article 4 converts them.
    expect(find(s, LINDA).byClass.A).toBe(0);
    expect(find(s, LINDA).byClass.B).toBe(20_000);
    expect(s.totalShares).toBe(1_000_000);
  });

  it('refuses a transfer of more shares than are held', () => {
    expect(() => computeCapTable(HOLDERS, HOLDINGS, [
      { kind: 'transfer', classCode: 'A', shares: 900_000,
        toHolderId: LANIYAN, fromHolderId: JAMES },
    ])).toThrow(/cannot transfer/);
  });
});

// ---------------------------------------------------------------------------

describe('Test C - gross profit and payroll', () => {
  it('works the spec example: N3,200,000 is Band 3', () => {
    const gp = naira(3_200_000);
    expect(bandFor(gp).band).toBe(3);

    const officers = [payFor('officer', gp), payFor('officer', gp), payFor('officer', gp)];
    const founder = payFor('founder', gp);

    for (const o of officers) expect(o.cash).toBe(naira(200_000));
    expect(founder.cash).toBe(naira(300_000));

    const totalCash = officers.reduce((a, o) => a + o.cash, 0) + founder.cash;
    expect(totalCash).toBe(naira(900_000));

    const totalAccrual = officers.reduce((a, o) => a + o.accrual, 0) + founder.accrual;
    expect(totalAccrual).toBe(naira(450_000));
    for (const o of officers) expect(o.accrual).toBe(naira(100_000));
    expect(founder.accrual).toBe(naira(150_000));
  });

  it('works the section 3 example end to end', () => {
    const r = computeGrossProfit({
      collections: naira(1_000_000),
      gatewayFees: naira(15_000),
      sellerPayouts: naira(700_000),
      directInfrastructure: naira(40_000),
      refunds: naira(25_000),
    });
    expect(r.grossProfit).toBe(naira(220_000));
    expect(bandFor(r.grossProfit).band).toBe(1);
    expect(payFor('officer', r.grossProfit).cash).toBe(0);
    expect(payFor('founder', r.grossProfit).cash).toBe(0);
  });

  it('never deducts salaries, marketing, G&A or tax', () => {
    for (const id of ['payroll', 'marketing', 'g_and_a', 'professional',
                      'tax', 'capex', 'financing']) {
      expect(isDeductible(id)).toBe(false);
    }
    for (const id of ['payment_processing', 'seller_payouts',
                      'infrastructure', 'refunds']) {
      expect(isDeductible(id)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------

describe('Test D - band boundaries', () => {
  const cases: [number, number][] = [
    [1_499_999, 1],
    [1_500_000, 2],
    [6_999_999, 4],
    [7_000_000, 5],
    [2_999_999, 2],
    [3_000_000, 3],
    [4_499_999, 3],
    [4_500_000, 4],
  ];
  for (const [amount, band] of cases) {
    it(`N${amount.toLocaleString()} is Band ${band}`, () => {
      expect(bandFor(naira(amount)).band).toBe(band);
    });
  }

  it('treats a loss-making month as Band 1', () => {
    expect(bandFor(naira(-500_000)).band).toBe(1);
  });
});

// ---------------------------------------------------------------------------

describe('Test E - accrual cap', () => {
  it('caps an officer at N1,000,000 after 5 months and holds there', () => {
    let balance = 0;
    const gp = naira(1_000_000); // Band 1
    for (let m = 1; m <= 5; m++) {
      const line = payFor('officer', gp);
      balance = applyAccrual('officer', balance, line.accrual).newBalance;
    }
    expect(balance).toBe(naira(1_000_000));
    expect(balance).toBe(DEFERRED_CAP.officer);

    const sixth = applyAccrual('officer', balance, payFor('officer', gp).accrual);
    expect(sixth.newBalance).toBe(naira(1_000_000));
    expect(sixth.accrued).toBe(0);
    expect(sixth.extinguishedByCap).toBe(naira(200_000));
  });

  it('caps the founder at N1,500,000 after 5 months and holds there', () => {
    let balance = 0;
    const gp = naira(1_000_000);
    for (let m = 1; m <= 5; m++) {
      balance = applyAccrual('founder', balance, payFor('founder', gp).accrual).newBalance;
    }
    expect(balance).toBe(naira(1_500_000));

    const sixth = applyAccrual('founder', balance, payFor('founder', gp).accrual);
    expect(sixth.newBalance).toBe(naira(1_500_000));
    expect(sixth.accrued).toBe(0);
  });

  it('fires the Band 5 trigger only on three consecutive Band 5 months', () => {
    const b5 = naira(8_000_000), b3 = naira(3_500_000);
    expect(band5TriggerMet([b5, b5, b5])).toBe(true);
    expect(band5TriggerMet([b5, b5, b3])).toBe(false);
    expect(band5TriggerMet([b5, b5])).toBe(false);
    // Newest first: a bad current month breaks the run even after good ones.
    expect(band5TriggerMet([b3, b5, b5, b5])).toBe(false);
  });

  it('blocks the founder while any officer is unpaid', () => {
    const r = founderPaymentBlocked([
      { name: 'Laniyan', due: naira(200_000), paid: naira(200_000) },
      { name: 'Azeez',   due: naira(200_000), paid: naira(100_000) },
    ]);
    expect(r.blocked).toBe(true);
    expect(r.outstanding).toEqual([{ name: 'Azeez', shortfall: naira(100_000) }]);

    expect(founderPaymentBlocked([
      { name: 'Laniyan', due: naira(200_000), paid: naira(200_000) },
    ]).blocked).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('Test F - challenge lapse and the default award', () => {
  const scheme: AwardScheme = {
    id: 's1', holderId: AZEEZ, holderName: 'Azeez',
    awardTotal: 50_000, classCode: 'B', mechanism: 'issue',
    longstopDate: '2026-12-25', kind: 'challenge',
    challenges: [
      { id: 'X', description: 'Challenge X', acceptanceCriteria: '',
        allocatedShares: 20_000, issuedOn: '2026-01-01', respondBy: '2026-01-08',
        deliverBy: '2026-06-01', status: 'declined' },
      { id: 'Y', description: 'Challenge Y', acceptanceCriteria: '',
        allocatedShares: 10_000, issuedOn: '2026-02-01', respondBy: '2026-02-06',
        deliverBy: '2026-07-01', status: 'completed' },
    ],
  };

  it('vests 30,000 in total at the longstop', () => {
    const o = resolveAward(scheme, true);
    expect(o.vestedFromChallenges).toBe(10_000);
    expect(o.lapsed).toBe(20_000);
    // 50,000 less 30,000 ALLOCATED -- not less 20,000 lapsed.
    expect(o.allocatedToChallenges).toBe(30_000);
    expect(o.defaultAward).toBe(20_000);
    expect(o.totalVested).toBe(30_000);
  });

  it('does NOT let the 20,000 lapsed shares reappear', () => {
    const o = resolveAward(scheme, true);
    expect(o.totalVested).not.toBe(50_000);
    expect(o.totalVested + o.lapsed).toBe(50_000);
  });

  it('awards the full amount if no challenge was ever issued', () => {
    const o = resolveAward({ ...scheme, challenges: [] }, true);
    expect(o.defaultAward).toBe(50_000);
    expect(o.totalVested).toBe(50_000);
  });

  it('vests nothing from the default award before the longstop', () => {
    const o = resolveAward(scheme, false);
    expect(o.totalVested).toBe(10_000);
  });
});

describe("founder's tranche scheme", () => {
  const scheme: AwardScheme = {
    id: 's4', holderId: JAMES, holderName: 'James',
    awardTotal: 50_000, classCode: 'A', mechanism: 'issue',
    longstopDate: '2026-12-25', kind: 'tranche',
    tranches: [
      { id: 't1', index: 1, shares: 10_000, milestoneDescription: 'M1',
        achieved: true, certifiedBy: LANIYAN, certifiedOn: '2026-05-01' },
      { id: 't2', index: 2, shares: 10_000, milestoneDescription: 'M2',
        achieved: true, certifiedBy: undefined },
      { id: 't3', index: 3, shares: 10_000, milestoneDescription: null, achieved: false },
      { id: 't4', index: 4, shares: 10_000, milestoneDescription: null, achieved: false },
      { id: 't5', index: 5, shares: 10_000, milestoneDescription: null, achieved: false },
    ],
  };

  it('vests only tranches that are both achieved AND certified', () => {
    const o = resolveAward(scheme, true);
    expect(o.totalVested).toBe(10_000);
    expect(o.defaultAward).toBe(0); // no default award on this scheme
    expect(o.lapsed).toBe(40_000);
  });

  it('refuses to let James certify his own milestone', () => {
    expect(certifierIsValid(JAMES, JAMES, [JAMES, LANIYAN, AZEEZ])).toBe(false);
    expect(certifierIsValid(LANIYAN, JAMES, [JAMES, LANIYAN, AZEEZ])).toBe(true);
    // A non-director cannot certify either.
    expect(certifierIsValid(LINDA, JAMES, [JAMES, LANIYAN, AZEEZ])).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('Test G - invariants hold after every operation', () => {
  const ops: Movement[][] = [
    [],
    [{ kind: 'transfer', classCode: 'A', shares: 10_000, toHolderId: LANIYAN, fromHolderId: JAMES }],
    [{ kind: 'issue', classCode: 'B', shares: 50_000, toHolderId: AZEEZ }],
    [{ kind: 'issue', classCode: 'A', shares: 50_000, toHolderId: JAMES }],
    [{ kind: 'buyback', classCode: 'B', shares: 5_000, toHolderId: LINDA }],
    [{ kind: 'conversion', classCode: 'A', shares: 100_000, toHolderId: JAMES }],
  ];

  for (let i = 0; i < ops.length; i++) {
    it(`holds after operation set ${i}`, () => {
      const s = computeCapTable(HOLDERS, HOLDINGS, ops[i]);
      expect(() => assertCapTableInvariants(s)).not.toThrow();
      expect(Number.isInteger(s.totalShares)).toBe(true);
      expect(s.issuedCapital).toBe(s.totalShares * naira(10));
    });
  }

  it('holds when every operation is applied cumulatively', () => {
    const all = ops.flat();
    const s = computeCapTable(HOLDERS, HOLDINGS, all);
    expect(() => assertCapTableInvariants(s)).not.toThrow();
  });
});
