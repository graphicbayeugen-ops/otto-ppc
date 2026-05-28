// Minimal functional dashboard. Intentionally bare — the styled frontend
// (matching the Bild-Generator look) comes as a separate step. This just proves
// the API end-to-end: campaign table with Auto/Manual split + key metrics.
export function renderDashboard(): string {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OTTO PPC Dashboard</title>
<style>
  body { font: 14px system-ui, sans-serif; margin: 24px; color: #1a1a1a; }
  h1 { font-size: 18px; } .sub { color:#666; font-size:12px; margin-bottom:16px; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  th, td { padding: 6px 10px; border-bottom: 1px solid #eee; text-align: right; }
  th:first-child, td:first-child { text-align: left; }
  th { background:#fafafa; font-weight:600; cursor:default; }
  .auto { color:#9333ea; } .manual { color:#0369a1; }
  .num { font-variant-numeric: tabular-nums; }
  nav button { margin-right:6px; padding:4px 10px; cursor:pointer; }
</style></head>
<body>
  <h1>OTTO PPC Dashboard</h1>
  <div class="sub">Letzte 30 Tage · Daten aus OTTO SPA Reporting API</div>
  <nav>
    <button onclick="load('campaigns')">Kampagnen</button>
    <button onclick="load('products')">Produkte (SKU)</button>
    <button onclick="load('keywords')">Keywords (nur Manual)</button>
  </nav>
  <nav style="margin-top:8px">
    <button onclick="runAction('run-daily')">1) Daten anfordern</button>
    <button onclick="runAction('poll')">2) Daten einsammeln</button>
    <span id="status" style="font-size:12px;color:#666;margin-left:8px"></span>
  </nav>
  <div id="out" style="margin-top:12px">lädt…</div>
<script>
async function runAction(action){
  const s = document.getElementById('status');
  s.textContent = '… läuft';
  try {
    const r = await (await fetch('/api/'+action, {method:'POST'})).json();
    s.textContent = r.error ? ('Fehler: '+r.error)
      : (action==='run-daily' ? 'Reports angefordert – ~1 Min warten, dann „Daten einsammeln" (ggf. mehrfach).'
                              : 'Eingesammelt. Tabs neu laden zum Anzeigen.');
  } catch(e){ s.textContent = 'Fehler: '+e; }
}
const f = (n, d=2) => (n==null ? "–" : Number(n).toFixed(d));
const pct = (n) => (n==null ? "–" : (n*100).toFixed(1)+"%");
async function load(kind){
  const out = document.getElementById('out'); out.textContent = 'lädt…';
  const rows = await (await fetch('/api/'+kind)).json();
  if(!rows.length){ out.textContent = 'Noch keine Daten – Ingest läuft per Cron, oder /api/run-daily aufrufen.'; return; }
  let cols, render;
  if(kind==='campaigns'){
    cols=['Kampagne','Typ','Spend','Sales','ACOS','ROAS','RPC','CVR','Clicks'];
    render=r=>['<td>'+r.name+'</td>','<td class="'+(r.type||'').toLowerCase()+'">'+r.type+'</td>',
      td(f(r.costs)),td(f(r.sales)),td(pct(r.acos)),td(f(r.roas)),td(f(r.rpc,3)),td(pct(r.cvr)),td(r.clicks||0)];
  } else if(kind==='products'){
    cols=['SKU','Spend','Sales','ACOS','RPC','Bid-Ceiling','Clicks'];
    render=r=>['<td>'+r.sku+'</td>',td(f(r.costs)),td(f(r.sales)),td(pct(r.acos)),
      td(f(r.rpc,3)),td(r.bid_ceiling==null?'–':f(r.bid_ceiling,3)+' €'),td(r.clicks||0)];
  } else {
    cols=['Keyword','Spend','Sales','ACOS','RPC','Clicks'];
    render=r=>['<td>'+r.keyword+'</td>',td(f(r.costs)),td(f(r.sales)),td(pct(r.acos)),td(f(r.rpc,3)),td(r.clicks||0)];
  }
  out.innerHTML='<table><thead><tr>'+cols.map(c=>'<th>'+c+'</th>').join('')+
    '</tr></thead><tbody>'+rows.map(r=>'<tr>'+render(r).join('')+'</tr>').join('')+'</tbody></table>';
}
const td = (v)=>'<td class="num">'+v+'</td>';
load('campaigns');
</script>
</body></html>`;
}
