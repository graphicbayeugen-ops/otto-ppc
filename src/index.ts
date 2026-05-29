import { Env } from "./types";
import { kickoffDaily, pollPending } from "./ingest";
import { campaignPerformance, productPerformance, keywordPerformance, dailyTrend } from "./metrics";
import { renderDashboard } from "./ui";
import { getToken } from "./auth";

// Default reporting window if none supplied: last 30 days (excluding today).
function defaultWindow(): { from: string; to: string } {
  const to = new Date(); to.setUTCDate(to.getUTCDate() - 1);
  const from = new Date(); from.setUTCDate(from.getUTCDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export default {
  // Cron Triggers (free). controller.cron tells us which schedule fired.
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (controller.cron === "0 3 * * *") {
      ctx.waitUntil(kickoffDaily(env));
    } else {
      ctx.waitUntil(pollPending(env));
    }
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const p = url.searchParams;
    const win = { from: p.get("from") ?? defaultWindow().from, to: p.get("to") ?? defaultWindow().to };

    try {
      switch (url.pathname) {
        case "/":
          return new Response(renderDashboard(), {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });

        case "/api/campaigns":
          return json(await campaignPerformance(env, win.from, win.to));
        case "/api/products":
          return json(await productPerformance(env, win.from, win.to));
        case "/api/keywords":
          return json(await keywordPerformance(env, win.from, win.to, p.get("all") !== "1"));
        case "/api/trend":
          return json(await dailyTrend(env, win.from, win.to));

        // --- admin: tag campaign type & set COGS (POST JSON) ---
        case "/api/campaign-type": {
          if (request.method !== "POST") return json({ error: "POST only" }, 405);
          const b = (await request.json()) as { campaign_id: string; type: string; name?: string };
          await env.DB.prepare(
            `INSERT INTO campaigns (campaign_id, name, type) VALUES (?, ?, ?)
             ON CONFLICT(campaign_id) DO UPDATE SET type=excluded.type,
               name=COALESCE(excluded.name, campaigns.name)`,
          ).bind(b.campaign_id, b.name ?? null, b.type.toUpperCase()).run();
          return json({ ok: true });
        }
        case "/api/cogs": {
          if (request.method !== "POST") return json({ error: "POST only" }, 405);
          const b = (await request.json()) as { sku: string; sell_price: number; contribution_margin: number };
          await env.DB.prepare(
            "INSERT OR REPLACE INTO cogs (sku, sell_price, contribution_margin) VALUES (?, ?, ?)",
          ).bind(b.sku, b.sell_price, b.contribution_margin).run();
          return json({ ok: true });
        }

        // Manual trigger for first-run/backfill testing.
        case "/api/run-daily":
          await kickoffDaily(env);
          return json({ ok: true, note: "reports requested; poll cron will ingest them" });
        case "/api/poll":
          await pollPending(env);
          return json({ ok: true });

        // Debug: inspect pending_reports table without needing D1 console access.
        case "/api/debug-pending": {
          const res = await env.DB.prepare(
            "SELECT report_id, report_type, status, attempts, from_date, to_date, created_at FROM pending_reports ORDER BY created_at DESC LIMIT 20",
          ).all();
          return json(res.results ?? []);
        }

        // Sandbox only: ask OTTO to seed test data so subsequent reports actually generate.
        case "/api/generate-testdata": {
          const token = await getToken(env);
          const tdUrl = `${env.OTTO_BASE_URL.replace(/\/$/, "")}/v1/spa-reporting/testdata`;
          const resp = await fetch(tdUrl, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          const body = await resp.text();
          return json({ status: resp.status, body });
        }

        default:
          return json({ error: "not found" }, 404);
      }
    } catch (e: any) {
      return json({ error: String(e?.message ?? e) }, 500);
    }
  },
};
