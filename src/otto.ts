import { Env, ReportType, REPORT_SPEC, reportColumns, spaBase } from "./types";
import { getToken } from "./auth";

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// Submit an async report job; returns its reportId.
export async function requestReport(
  env: Env, token: string, type: ReportType, fromDate: string, toDate: string,
): Promise<string> {
  const spec = REPORT_SPEC[type];
  const body = {
    name: `${type}-${fromDate}-${toDate}`,
    fromDate,
    toDate,
    configuration: {
      columns: reportColumns(type),
      groupBy: spec.groupBy,
      format: "CSV",
    },
  };
  const resp = await fetch(`${spaBase(env)}/${spec.endpoint}`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`requestReport ${type} failed: ${resp.status} ${await resp.text()}`);
  const data = (await resp.json()) as { reportId: string };
  return data.reportId;
}

// Poll a report's status.
export async function reportStatus(
  env: Env, token: string, type: ReportType, reportId: string,
): Promise<string> {
  const spec = REPORT_SPEC[type];
  const url = `${spaBase(env)}/${spec.endpoint}/status?reportId=${encodeURIComponent(reportId)}`;
  const resp = await fetch(url, { headers: authHeaders(token) });
  if (!resp.ok) throw new Error(`reportStatus failed: ${resp.status}`);
  const data = (await resp.json()) as { status: string };
  return data.status;
}

// Download a READY report as raw CSV text.
export async function downloadReport(env: Env, token: string, reportId: string): Promise<string> {
  const url = `${spaBase(env)}/reports/download?reportId=${encodeURIComponent(reportId)}`;
  const resp = await fetch(url, { headers: authHeaders(token) });
  if (!resp.ok) throw new Error(`downloadReport failed: ${resp.status}`);
  return await resp.text();
}

export { getToken };
