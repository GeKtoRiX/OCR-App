import { mkdir, writeFile } from 'node:fs/promises';

export function nowMs() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

export function percentile(samples, percentileValue) {
  if (samples.length === 0) {
    return null;
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );
  return Number(sorted[index].toFixed(2));
}

export function summarizeDurations(durations, totalRuns) {
  if (durations.length === 0) {
    return {
      samples: [],
      count: 0,
      min: null,
      max: null,
      p50: null,
      p95: null,
      avg: null,
      failureRate: totalRuns === 0 ? 0 : 1,
    };
  }

  const sum = durations.reduce((accumulator, value) => accumulator + value, 0);
  return {
    samples: durations.map((value) => Number(value.toFixed(2))),
    count: durations.length,
    min: Number(Math.min(...durations).toFixed(2)),
    max: Number(Math.max(...durations).toFixed(2)),
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
    avg: Number((sum / durations.length).toFixed(2)),
    failureRate: Number(((totalRuns - durations.length) / totalRuns).toFixed(4)),
  };
}

export async function measureScenario({
  iterations,
  run,
}) {
  const durations = [];
  const failures = [];

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const startedAt = nowMs();
    try {
      await run(iteration);
      durations.push(nowMs() - startedAt);
    } catch (error) {
      failures.push({
        iteration,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    stats: summarizeDurations(durations, iterations),
    failures,
  };
}

export async function writeJsonReport(outputPath, payload) {
  const directory = outputPath.split('/').slice(0, -1).join('/');
  if (directory) {
    await mkdir(directory, { recursive: true });
  }
  await writeFile(outputPath, JSON.stringify(payload, null, 2));
}
