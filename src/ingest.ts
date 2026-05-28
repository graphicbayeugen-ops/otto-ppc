import { Env, ReportType } from "./types";
import { getToken, requestReport, reportStatus, downloadReport } from "./otto";
import { addPendingReport, listPending, markReport, bumpAttempts, upsertFacts } from "./db";

const REPORT_TYPES: ReportType[] = ["campaign", "product", "keyword"];
const MAX_ATTEMPTS = 36; // ~3h of 5-min polls before giving up

function yesterday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Daily cron: request all three reports for yesterday, store their reportIds.
export async function kickoffDaily(env: Env): Promise<void> {
  const token = await getToken(env);
  const day = yesterday();
  for (const type of REPORT_TYPES) {
    try {
      const id = await requestReport(env, token, type, day, day);
      await addPendingReport(env, id, type, day, day);
      console.log(`requested ${type} report ${id} for ${day}`);
    } catch (e) {
      console.error(`kickoff ${type} failed:`, e);
    }
  }
}

// 5-min cron: poll pending reports. To stay within free-tier CPU/subrequest
// limits, download at most ONE ready report per invocation; the rest get picked
// up on the next tick.
export async function pollPending(env: Env): Promise<void> {
  const pending = await listPending(env);
  if (!pending.length) return;
  const token = await getToken(env);
  let downloadedOne = false;

  for (const p of pending) {
    if (p.attempts >= MAX_ATTEMPTS) { await markReport(env, p.report_id, "FAILED"); continue; }
    try {
      const status = await reportStatus(env, token, p.report_type, p.report_id);
      if (status === "FAILED") { await markReport(env, p.report_id, "FAILED"); continue; }
      if (status === "READY" && !downloadedOne) {
        const csv = await downloadReport(env, token, p.report_id);
        const n = await upsertFacts(env, p.report_type, csv);
        await markReport(env, p.report_id, "DONE");
        console.log(`downloaded ${p.report_type} report ${p.report_id}: ${n} rows`);
        downloadedOne = true; // one heavy op per invocation
      } else {
        await bumpAttempts(env, p.report_id);
      }
    } catch (e) {
      console.error(`poll ${p.report_id} failed:`, e);
      await bumpAttempts(env, p.report_id);
    }
  }
}
