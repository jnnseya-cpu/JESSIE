#!/usr/bin/env node
/**
 * INTERNAL — Jess Move unit-economics report.
 *
 * The model is not published. It exposes per-user cost, supplier unit
 * rates, overhead composition, contribution and margin — none of which
 * belongs on a public website. It lives here so the team can read it, and
 * it runs against the same `@jessmove/shared` engine the product uses, so
 * it cannot drift from the rules the code actually enforces.
 *
 *   pnpm economics
 *   pnpm economics --json      machine-readable, for a spreadsheet
 */

import {
  ACU_TOPUP_TIERS,
  APP_STORE_COMMISSION,
  COST_MODEL_CAVEAT,
  COST_MODEL_DATE,
  COST_MODEL_VERSION,
  COST_PROTECTION_MULTIPLE,
  MIN_CONTRACT_SEATS,
  MIN_TRANSACTION_GBP,
  MODEL_FINDINGS,
  OVERHEAD_PER_PAID_USER_MONTH,
  OVERHEAD_TOTAL,
  PROFIT_MULTIPLE,
  acuAllowanceFor,
  fixedFeeBurden,
  freeTierSubsidy,
  monthlyCost,
  planEconomics,
  priceAction,
  revenueSplit,
  stress,
} from '@jessmove/shared';

const json = process.argv.includes('--json');
const gbp = (n) => `£${n.toFixed(2)}`;
const gbp4 = (n) => `£${n.toFixed(4)}`;

/* ---------------- modelled usage ---------------- */

const mid = (n, i, o, img) =>
  Array.from({ length: n }, () => ({
    tier: 'mid',
    inputTokens: i,
    outputTokens: o,
    ...(img ? { images: img } : {}),
  }));
const front = (n, i, o) =>
  Array.from({ length: n }, () => ({ tier: 'frontier', inputTokens: i, outputTokens: o }));
const cloud = (m) => ({
  firestoreReads: 24000 * m,
  firestoreWrites: 3200 * m,
  firestoreStorageGb: 0.012 * m,
  cloudRunVcpuSeconds: 420 * m,
  cloudRunGibSeconds: 210 * m,
  requests: 5600 * m,
  functionInvocations: 3400 * m,
  storageGb: 0.05 * m,
  egressGb: 0.35 * m,
  bigQueryStorageGb: 0.02 * m,
  bigQueryQueryTb: 0.00015 * m,
  redisGbHours: 0.4 * m,
});
const noMsg = { smsCount: 0, whatsappConversations: 0 };

const PREMIUM = {
  label: 'Premium',
  carriesOverhead: true,
  messaging: noMsg,
  cloud: cloud(1),
  aiCalls: [
    ...mid(30, 2200, 320),
    ...front(4, 7000, 1400),
    ...front(2, 14000, 2200),
    ...mid(20, 1400, 600, 1),
  ],
};
const CHILD = {
  label: 'Child seat',
  carriesOverhead: true,
  messaging: noMsg,
  cloud: cloud(0.4),
  aiCalls: [...mid(20, 1500, 260), ...front(2, 4000, 700)],
};
const LATER = {
  label: 'Later-life seat',
  carriesOverhead: true,
  messaging: noMsg,
  cloud: cloud(0.35),
  aiCalls: [...mid(16, 1400, 240), ...front(2, 4000, 700)],
};
const EMPLOYEE = {
  label: 'Employee',
  carriesOverhead: true,
  messaging: noMsg,
  cloud: cloud(0.45),
  aiCalls: [...mid(14, 1800, 280), ...front(2, 5000, 900), ...mid(4, 1400, 600, 1)],
};
const FREE = {
  label: 'Free',
  carriesOverhead: false,
  messaging: noMsg,
  cloud: cloud(0.25),
  aiCalls: mid(8, 1600, 240),
};
const LIGHT = {
  ...PREMIUM,
  label: 'Lightweight (T3)',
  messaging: { smsCount: 60, whatsappConversations: 30 },
};

const PROFILES = [FREE, CHILD, LATER, EMPLOYEE, PREMIUM, LIGHT];

const PLANS = [
  planEconomics({ plan: 'Premium £5.99', grossGbp: 5.99, profile: PREMIUM }),
  planEconomics({ plan: 'Premium £8.99', grossGbp: 8.99, profile: PREMIUM }),
  planEconomics({
    plan: 'Family £12.99 (4 seats)',
    grossGbp: 12.99,
    seatProfiles: [PREMIUM, PREMIUM, CHILD, CHILD],
  }),
  planEconomics({
    plan: 'Family £17.99 (6 seats)',
    grossGbp: 17.99,
    seatProfiles: [PREMIUM, PREMIUM, CHILD, CHILD, LATER, LATER],
  }),
  planEconomics({
    plan: `Org £2/seat (${MIN_CONTRACT_SEATS} seats)`,
    grossGbp: 2 * MIN_CONTRACT_SEATS,
    seatProfiles: Array.from({ length: MIN_CONTRACT_SEATS }, () => EMPLOYEE),
    vatInclusive: false,
  }),
  planEconomics({
    plan: 'Org £3/seat (250 seats)',
    grossGbp: 750,
    seatProfiles: Array.from({ length: 250 }, () => EMPLOYEE),
    vatInclusive: false,
  }),
];

const PREM = PLANS[1];
const FREE_COST = monthlyCost(FREE).total;

if (json) {
  console.log(
    JSON.stringify(
      {
        version: COST_MODEL_VERSION,
        date: COST_MODEL_DATE,
        rules: { PROFIT_MULTIPLE, COST_PROTECTION_MULTIPLE, MIN_TRANSACTION_GBP, MIN_CONTRACT_SEATS },
        costPerUser: Object.fromEntries(PROFILES.map((p) => [p.label, monthlyCost(p)])),
        plans: PLANS,
        revenueSplit: revenueSplit(PREM),
        findings: MODEL_FINDINGS,
        caveat: COST_MODEL_CAVEAT,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const rule = (c = '─') => console.log(c.repeat(78));
const h = (t) => {
  console.log('');
  rule();
  console.log(`  ${t.toUpperCase()}`);
  rule();
};

console.log('');
console.log('  JESS MOVE — UNIT ECONOMICS · INTERNAL, NOT FOR PUBLICATION');
console.log(`  Cost model v${COST_MODEL_VERSION} · ${COST_MODEL_DATE}`);

h('rules');
console.log(`  Margin rule            net revenue >= ${PROFIT_MULTIPLE}x fully-loaded cost`);
console.log(`  AI protection          customer revenue >= ${COST_PROTECTION_MULTIPLE}x provider cost`);
console.log(`  Minimum charge         ${gbp(MIN_TRANSACTION_GBP)} — nothing below is taken`);
console.log(`  Minimum contract       ${MIN_CONTRACT_SEATS} seats`);

h('monthly cost per user');
console.log('  user                       AI      cloud    msg      people    TOTAL');
for (const p of PROFILES) {
  const c = monthlyCost(p);
  console.log(
    `  ${p.label.padEnd(24)} ${gbp4(c.ai).padStart(8)} ${gbp4(c.cloud).padStart(8)} ` +
      `${gbp4(c.messaging).padStart(8)} ${gbp(c.overhead).padStart(8)} ${gbp(c.total).padStart(8)}`,
  );
}
console.log('');
console.log(`  Overhead per paid user: ${gbp(OVERHEAD_TOTAL)}`);
for (const [k, v] of Object.entries(OVERHEAD_PER_PAID_USER_MONTH)) {
  console.log(`    ${k.padEnd(20)} ${gbp(v)}`);
}

h('plans');
console.log('  plan                          gross      net     cost   contrib  margin   mult   floor');
for (const p of PLANS) {
  console.log(
    `  ${p.plan.padEnd(28)} ${gbp(p.grossGbp).padStart(8)} ${gbp(p.netRevenue).padStart(8)} ` +
      `${gbp(p.cost.total).padStart(8)} ${gbp(p.contribution).padStart(9)} ` +
      `${String(p.grossMarginPct).padStart(6)}% ${String(p.profitMultiple).padStart(6)}x ` +
      `${gbp(p.priceFloor).padStart(8)}  ${p.clearsTarget ? 'PASS' : '*** FAIL ***'}`,
  );
}

h('where £8.99 goes');
for (const r of revenueSplit(PREM)) {
  console.log(`  ${r.label.padEnd(24)} ${gbp(r.gbp).padStart(8)}  ${String(r.pct).padStart(6)}%`);
}

h('minimum charge');
console.log('  charge        fixed fee alone');
for (const amount of [1, 2, MIN_TRANSACTION_GBP, 8.99, 20]) {
  const ok = amount >= MIN_TRANSACTION_GBP;
  console.log(
    `  ${gbp(amount).padStart(8)}   ${String(fixedFeeBurden(amount)).padStart(6)}%   ` +
      `${ok ? 'accepted' : 'REFUSED'}`,
  );
}
console.log('');
console.log('  top-up tiers:');
for (const t of ACU_TOPUP_TIERS) {
  console.log(
    `    ${gbp(t.gbp).padStart(7)}  ${String(t.acus).padStart(5)} ACU  ` +
      `${t.bonusAcus ? `+${t.bonusAcus} bonus` : 'no bonus'}  (fee ${fixedFeeBurden(t.gbp)}%)`,
  );
}

h('action pricing');
for (const [name, a] of [
  ['daily adaptive command', priceAction({ providerCostGbp: 0.004, cloudCostGbp: 0.0002, supportShareGbp: 0.0001 })],
  ['30-day trajectory', priceAction({ providerCostGbp: 0.002, cloudCostGbp: 0.03, supportShareGbp: 0.02 })],
]) {
  console.log(
    `  ${name.padEnd(24)} loaded ${gbp4(a.fullyLoaded)}  ` +
      `provider-rule ${gbp4(a.byProviderRule)}  margin-rule ${gbp4(a.byMarginRule)}  ` +
      `-> ${gbp4(a.priceGbp)} (${a.bindingRule})`,
  );
}
console.log('');
console.log(`  Premium monthly ACU allowance: ${acuAllowanceFor(PREM)} ACUs`);

h('stress — AI cost shock');
for (const m of [1, 2, 4, 6, 8]) {
  const s = stress(PREM, { aiMultiplier: m });
  console.log(
    `  x${String(m).padStart(2)}   contribution ${gbp(s.contribution).padStart(8)}   ` +
      `${String(s.profitMultiple).padStart(5)}x   ${s.clearsTarget ? 'clears' : '*** FAILS ***'}`,
  );
}
console.log('');
console.log(
  `  App-store commission on ${gbp(PREM.grossGbp)}: ` +
    `${gbp(PREM.grossGbp * APP_STORE_COMMISSION.standardRate)} at ` +
    `${Math.round(APP_STORE_COMMISSION.standardRate * 100)}%, ` +
    `${gbp(PREM.grossGbp * APP_STORE_COMMISSION.smallBusinessRate)} at ` +
    `${Math.round(APP_STORE_COMMISSION.smallBusinessRate * 100)}% — against ` +
    `${gbp(PREM.cost.total)} of cost to serve.`,
);

h('free tier — 10,000 users');
console.log('  conversion   free cost    paid contribution    blended');
for (const c of [0.02, 0.05, 0.08, 0.12, 0.15, 0.2]) {
  const paid = Math.round(10000 * c);
  const s = freeTierSubsidy({
    freeUsers: 10000 - paid,
    paidUsers: paid,
    freeMonthlyCost: FREE_COST,
    paidContribution: PREM.contribution,
  });
  console.log(
    `  ${String(Math.round(c * 100)).padStart(8)}%   ` +
      `${gbp(s.totalFreeCost).padStart(10)}   ${gbp(s.totalPaidContribution).padStart(18)}   ` +
      `${(s.blendedContribution > 0 ? '+' : '') + gbp(s.blendedContribution)}`,
  );
}

h('findings');
for (const f of MODEL_FINDINGS) {
  console.log(`  • ${f.headline}`);
  console.log(
    `    ${f.detail.replace(/(.{1,72})(\s|$)/g, '$1\n    ').trim()}`,
  );
  console.log('');
}

rule();
console.log(`  ${COST_MODEL_CAVEAT.replace(/(.{1,74})(\s|$)/g, '$1\n  ').trim()}`);
rule();
console.log('');
