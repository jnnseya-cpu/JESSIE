/**
 * Load, concurrency and soak, against whatever API you point it at.
 *
 * **This is not a production load test and must never be reported as one.**
 * It runs against one process on one machine with a local database, so the
 * absolute numbers say nothing about Vercel, about a managed Postgres, or
 * about a network. What it does find is the class of defect that is a
 * property of the code rather than of the hardware: a p99 that collapses
 * under concurrency, an error rate that appears only in parallel, a
 * connection pool that exhausts, memory that grows and never comes back,
 * and a system that does not recover after being pushed over.
 *
 *   API=http://localhost:4000/api node scripts/load-test.mjs
 */

const API = process.env.API ?? 'http://localhost:4000/api';

const percentile = (sorted, p) =>
  sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

/** Fires `total` requests, `concurrency` in flight at once. */
async function run(label, make, { total, concurrency }) {
  const latencies = [];
  const codes = new Map();
  let errors = 0;
  let next = 0;

  const started = Date.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < total) {
        const mine = next;
        next += 1;
        const at = Date.now();
        try {
          const res = await make(mine);
          const ms = Date.now() - at;
          latencies.push(ms);
          codes.set(res.status, (codes.get(res.status) ?? 0) + 1);
          if (res.status >= 500) errors += 1;
          // The body has to be drained or the socket is never released,
          // which turns a load test into a measurement of its own leak.
          await res.arrayBuffer().catch(() => undefined);
        } catch {
          errors += 1;
          latencies.push(Date.now() - at);
        }
      }
    }),
  );
  const seconds = (Date.now() - started) / 1000;

  latencies.sort((a, b) => a - b);
  const result = {
    label,
    total,
    concurrency,
    seconds: Number(seconds.toFixed(2)),
    rps: Number((total / seconds).toFixed(1)),
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    max: latencies[latencies.length - 1] ?? 0,
    errors,
    errorRate: Number(((errors / total) * 100).toFixed(2)),
    codes: [...codes.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}×${n}`).join(' '),
  };

  console.log(
    `  ${label.padEnd(34)} ${String(result.rps).padStart(7)} rps  ` +
      `p50 ${String(result.p50).padStart(4)}ms  p95 ${String(result.p95).padStart(5)}ms  ` +
      `p99 ${String(result.p99).padStart(5)}ms  err ${result.errorRate}%  ${result.codes}`,
  );
  return result;
}

const GET = (path) => () => fetch(`${API}${path}`);
const POST = (path, body) => () =>
  fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

async function rss() {
  // The process under test is not this one, so memory is read from its
  // own health output where available; otherwise it is reported unknown.
  try {
    const res = await fetch(`${API}/health`);
    const body = await res.json();
    return body?.data?.memoryMb ?? body?.data?.rssMb ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const results = [];
  let failed = 0;
  const fail = (why) => {
    failed += 1;
    console.log(`  FAIL  ${why}`);
  };

  console.log(`\nLoad profile against ${API}`);
  console.log('(one process, one machine, local database — shapes not absolutes)\n');

  console.log('1. Baseline, one at a time');
  results.push(await run('GET /health', GET('/health'), { total: 200, concurrency: 1 }));
  results.push(await run('GET /movements', GET('/movements'), { total: 100, concurrency: 1 }));

  console.log('\n2. Expected launch load');
  results.push(await run('GET /health @ 20', GET('/health'), { total: 1000, concurrency: 20 }));
  results.push(await run('GET /blog/posts @ 20', GET('/blog/posts'), { total: 600, concurrency: 20 }));
  results.push(
    await run(
      'POST /prescriptions/next @ 20',
      POST('/prescriptions/next', {
        userId: 'u_load',
        mode: 'momentum',
        availableSeconds: 900,
        capabilityNormaliser: 1,
        permittedVariants: ['seated', 'standing'],
        signals: {
          userId: 'u_load',
          motionState: 'still',
          locationClass: 'office',
          onCall: false,
          doNotDisturb: false,
          localHour: 14,
          snapsDeliveredToday: 1,
          dailyCap: 6,
          minutesSinceLastNudge: 95,
          consentedSignals: ['calendar', 'motion', 'device_state'],
        },
      }),
      { total: 400, concurrency: 20 },
    ),
  );

  console.log('\n3. Peak — every request touches the database');
  results.push(
    await run(
      'POST /blog/views @ 50',
      POST('/blog/views', {
        slug: 'the-nudge-we-did-not-send',
        dwellSeconds: 30,
        scrollPercent: 50,
        device: 'desktop',
      }),
      { total: 1000, concurrency: 50 },
    ),
  );

  console.log('\n4. Spike — well past anything expected');
  const spike = await run('GET /health @ 200', GET('/health'), { total: 2000, concurrency: 200 });
  results.push(spike);

  console.log('\n5. Recovery after the spike');
  await new Promise((r) => setTimeout(r, 3000));
  const recovered = await run('GET /health @ 20 (after)', GET('/health'), { total: 400, concurrency: 20 });
  results.push(recovered);

  console.log('\n6. Soak — sustained, watching for drift');
  const before = await rss();
  const soakStart = await run('GET /movements @ 10 (start)', GET('/movements'), { total: 300, concurrency: 10 });
  await new Promise((r) => setTimeout(r, 2000));
  const soakEnd = await run('GET /movements @ 10 (end)', GET('/movements'), { total: 300, concurrency: 10 });
  const after = await rss();
  results.push(soakStart, soakEnd);

  /* ------------------------------------------------------------------ *
   * What the numbers have to mean
   * ------------------------------------------------------------------ */
  console.log('\nVerdicts');

  const baseline = results[0];
  const launch = results.find((r) => r.label.startsWith('GET /health @ 20'));

  for (const r of results) {
    if (r.errorRate > 1) fail(`${r.label} returned ${r.errorRate}% server errors`);
  }

  if (launch && baseline && launch.p99 > Math.max(250, baseline.p99 * 25)) {
    fail(`p99 collapses under concurrency: ${baseline.p99}ms alone, ${launch.p99}ms at 20`);
  } else {
    console.log(`  ok    p99 holds under concurrency — ${baseline?.p99}ms alone, ${launch?.p99}ms at 20`);
  }

  if (spike.errorRate > 5) {
    fail(`the spike produced ${spike.errorRate}% errors`);
  } else {
    console.log(`  ok    a 200-way spike degrades without failing — ${spike.errorRate}% errors`);
  }

  const drift = launch && recovered ? recovered.p99 - launch.p99 : 0;
  if (recovered && launch && recovered.p99 > launch.p99 * 3 + 50) {
    fail(`no recovery after the spike: p99 ${launch.p99}ms before, ${recovered.p99}ms after`);
  } else {
    console.log(`  ok    the system recovers after the spike — p99 drift ${drift >= 0 ? '+' : ''}${drift}ms`);
  }

  if (soakEnd.p99 > soakStart.p99 * 3 + 50) {
    fail(`latency drifts upward under sustained load: ${soakStart.p99}ms then ${soakEnd.p99}ms`);
  } else {
    console.log(`  ok    latency does not drift under sustained load — ${soakStart.p99}ms then ${soakEnd.p99}ms`);
  }

  if (before !== null && after !== null) {
    console.log(`  info  memory ${before}MB → ${after}MB across the run`);
  }

  console.log(`\n${failed === 0 ? 'no load failures' : `${failed} load failure(s)`}\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
