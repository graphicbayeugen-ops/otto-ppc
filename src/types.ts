// Shared types and report configuration.

export interface Env {
  DB: D1Database;
  OTTO_BASE_URL: string;
  OTTO_TOKEN_URL: string;
  OTTO_USERNAME: string; // secret
  OTTO_PASSWORD: string; // secret
}

export type ReportType = "campaign" | "product" | "keyword";

export const MAX_LOOKBACK_DAYS = 90;

// KPI columns requested. The ingest tolerates missing columns (stored NULL),
// since OTTO's docs are ambiguous about TOTAL_SALES / TOTAL_ORDERED_SKUS in
// async CSV reports.
const KPI = ["TOTAL_VIEWS", "TOTAL_CLICKS", "TOTAL_COSTS", "TOTAL_SALES", "TOTAL_ORDERED_SKUS"];

export const REPORT_SPEC: Record<ReportType, { endpoint: string; dimensions: string[] }> = {
  campaign: { endpoint: "campaign-performance", dimensions: ["EVENT_DATE_CET", "CAMPAIGN_ID"] },
  product:  { endpoint: "product-performance",  dimensions: ["EVENT_DATE_CET", "CAMPAIGN_ID", "SKU"] },
  keyword:  { endpoint: "keyword-performance",  dimensions: ["EVENT_DATE_CET", "CAMPAIGN_ID", "KEYWORD", "SEARCHTERM"] },
};

export function reportColumns(t: ReportType): string[] {
  return [...REPORT_SPEC[t].dimensions, ...KPI];
}

export function spaBase(env: Env): string {
  return `${env.OTTO_BASE_URL.replace(/\/$/, "")}/v1/spa-reporting`;
}
