import { Env, ReportType } from "./types";

// OTTO CSV header -> DB column.
const COLUMN_MAP: Record<string, string> = {
  EVENT_DATE_CET: "event_date",
  CAMPAIGN_ID: "campaign_id",
  SKU: "sku",
  KEYWORD: "keyword",
  SEARCHTERM: "searchterm",
  TOTAL_VIEWS: "views",
  TOTAL_CLICKS: "clicks",
  TOTAL_COSTS: "costs",
  TOTAL_SALES: "sales",
  TOTAL_ORDERED_SKUS: "ordered_skus",
};

const TABLE_BY_TYPE: Record<ReportType, string> = {
  campaign: "fact_campaign_daily",
  product: "fact_product_daily",
  keyword: "fact_keyword_daily",
};

// Minimal CSV parser (handles quoted fields + escaped quotes). Reports are small.
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toUpperCase());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => (obj[h] = r[idx] ?? ""));
    return obj;
  });
}

function num(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Parse CSV and idempotently upsert into the matching fact table.
export async function upsertFacts(env: Env, type: ReportType, csv: string): Promise<number> {
  const table = TABLE_BY_TYPE[type];
  const rows = parseCsv(csv);
  const stmts: D1PreparedStatement[] = [];
  const campaignIds = new Set<string>();

  for (const raw of rows) {
    const mapped: Record<string, string | number | null> = {};
    for (const [csvCol, val] of Object.entries(raw)) {
      const dbCol = COLUMN_MAP[csvCol];
      if (dbCol) mapped[dbCol] = val === "" ? null : val;
    }
    if (!mapped.event_date || !mapped.campaign_id) continue;
    ["views", "clicks", "ordered_skus", "costs", "sales"].forEach((k) => {
      if (k in mapped) mapped[k] = num(mapped[k] as string);
    });
    campaignIds.add(mapped.campaign_id as string);

    const cols = Object.keys(mapped);
    const placeholders = cols.map(() => "?").join(", ");
    stmts.push(
      env.DB.prepare(
        `INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`,
      ).bind(...cols.map((c) => mapped[c])),
    );
  }
  for (const cid of campaignIds) {
    stmts.push(env.DB.prepare("INSERT OR IGNORE INTO campaigns (campaign_id) VALUES (?)").bind(cid));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return rows.length;
}

// ---- pending-report state machine ----
export async function addPendingReport(
  env: Env, reportId: string, type: ReportType, fromDate: string, toDate: string,
) {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO pending_reports
       (report_id, report_type, from_date, to_date, status, attempts, created_at)
     VALUES (?, ?, ?, ?, 'IN_PROGRESS', 0, ?)`,
  ).bind(reportId, type, fromDate, toDate, new Date().toISOString()).run();
}

export interface PendingRow {
  report_id: string;
  report_type: ReportType;
  from_date: string;
  to_date: string;
  attempts: number;
}

export async function listPending(env: Env): Promise<PendingRow[]> {
  const res = await env.DB.prepare(
    "SELECT report_id, report_type, from_date, to_date, attempts FROM pending_reports WHERE status = 'IN_PROGRESS' ORDER BY created_at",
  ).all<PendingRow>();
  return res.results ?? [];
}

export async function markReport(env: Env, reportId: string, status: string) {
  await env.DB.prepare("UPDATE pending_reports SET status = ? WHERE report_id = ?")
    .bind(status, reportId).run();
}

export async function bumpAttempts(env: Env, reportId: string) {
  await env.DB.prepare("UPDATE pending_reports SET attempts = attempts + 1 WHERE report_id = ?")
    .bind(reportId).run();
}
