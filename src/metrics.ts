import { Env } from "./types";

// Derived metrics, computed in SQL/JS from raw columns.
//   CTR=clicks/views  CPC=costs/clicks  RPC=sales/clicks
//   CVR=ordered_skus/clicks  ACOS=costs/sales  ROAS=sales/costs
//   bid_ceiling = RPC * (contribution_margin / sell_price)   [breakeven CPC]
const div = (a: number | null, b: number | null) => (a != null && b ? a / b : null);

function enrich<T extends Record<string, any>>(r: T) {
  const views = r.views ?? 0, clicks = r.clicks ?? 0, costs = r.costs ?? 0;
  const sales = r.sales ?? 0, orders = r.ordered_skus ?? 0;
  return {
    ...r,
    ctr: div(clicks, views), cpc: div(costs, clicks), rpc: div(sales, clicks),
    cvr: div(orders, clicks), acos: div(costs, sales), roas: div(sales, costs),
  };
}

export async function campaignPerformance(env: Env, from: string, to: string) {
  const res = await env.DB.prepare(
    `SELECT c.campaign_id, COALESCE(c.name, c.campaign_id) AS name, c.type,
            SUM(f.views) views, SUM(f.clicks) clicks, SUM(f.costs) costs,
            SUM(f.sales) sales, SUM(f.ordered_skus) ordered_skus
     FROM fact_campaign_daily f JOIN campaigns c USING (campaign_id)
     WHERE f.event_date BETWEEN ? AND ?
     GROUP BY c.campaign_id ORDER BY costs DESC`,
  ).bind(from, to).all();
  return (res.results ?? []).map(enrich);
}

export async function productPerformance(env: Env, from: string, to: string) {
  const res = await env.DB.prepare(
    `SELECT f.sku, SUM(f.views) views, SUM(f.clicks) clicks, SUM(f.costs) costs,
            SUM(f.sales) sales, SUM(f.ordered_skus) ordered_skus,
            cg.sell_price, cg.contribution_margin
     FROM fact_product_daily f LEFT JOIN cogs cg USING (sku)
     WHERE f.event_date BETWEEN ? AND ?
     GROUP BY f.sku ORDER BY costs DESC`,
  ).bind(from, to).all();
  return (res.results ?? []).map((r: any) => {
    const e = enrich(r);
    const marginRatio = div(r.contribution_margin, r.sell_price);
    return { ...e, margin_ratio: marginRatio, bid_ceiling: e.rpc != null && marginRatio != null ? e.rpc * marginRatio : null };
  });
}

export async function keywordPerformance(env: Env, from: string, to: string, manualOnly = true) {
  const filter = manualOnly ? "AND c.type = 'MANUAL'" : "";
  const res = await env.DB.prepare(
    `SELECT f.campaign_id, c.type, f.keyword,
            SUM(f.views) views, SUM(f.clicks) clicks, SUM(f.costs) costs,
            SUM(f.sales) sales, SUM(f.ordered_skus) ordered_skus
     FROM fact_keyword_daily f JOIN campaigns c USING (campaign_id)
     WHERE f.event_date BETWEEN ? AND ? ${filter}
     GROUP BY f.campaign_id, f.keyword ORDER BY costs DESC`,
  ).bind(from, to).all();
  return (res.results ?? []).map(enrich);
}

export async function dailyTrend(env: Env, from: string, to: string) {
  const res = await env.DB.prepare(
    `SELECT event_date, SUM(views) views, SUM(clicks) clicks, SUM(costs) costs,
            SUM(sales) sales, SUM(ordered_skus) ordered_skus
     FROM fact_campaign_daily WHERE event_date BETWEEN ? AND ?
     GROUP BY event_date ORDER BY event_date`,
  ).bind(from, to).all();
  return (res.results ?? []).map(enrich);
}
