# OTTO PPC Dashboard — Cloudflare Edition

Read-only PPC-Monitoring-Dashboard auf Basis der **OTTO Market SPA Reporting API**,
komplett auf Cloudflare gehostet und **im Free-Tier kostenfrei** betreibbar.

## Architektur (alles Workers Free Plan)

- **Worker (TypeScript)** — ein einziger Worker für alles: Cron-Ingest *und*
  JSON-API *und* Dashboard-HTML.
- **D1** (SQLite at the edge) — Datenspeicher. Free-Tier reicht mit großem Abstand.
- **2 Cron Triggers** (kostenfrei):
  - `0 3 * * *` — fordert täglich die drei Reports (Campaign/Product/Keyword) für
    *gestern* an und legt die `reportId`s in `pending_reports` ab.
  - `*/5 * * * *` — pollt offene Reports; sobald `READY`, lädt es **einen** Report
    pro Tick herunter und schreibt ihn in die Fact-Tabellen (hält CPU < 10 ms und
    Subrequests niedrig → bleibt im Free-Tier).

Keine Workflows, keine kostenpflichtigen Bausteine. Async-Report-Handling läuft
als D1-State-Machine über die zwei Crons.

## Setup

```bash
npm install
npx wrangler login

# D1 anlegen und die database_id in wrangler.toml eintragen
npm run db:create
npm run db:migrate          # Schema in die Remote-DB schreiben

# OTTO-Zugangsdaten als Secrets (nicht in den Code!)
npx wrangler secret put OTTO_USERNAME
npx wrangler secret put OTTO_PASSWORD

npm run deploy
```

Danach ist das Dashboard unter `https://otto-ppc.<dein-subdomain>.workers.dev`
erreichbar.

### Zugriff absichern (wichtig, da öffentlich)

Das Dashboard ist sonst für jeden mit der URL sichtbar. Setz **Cloudflare Access**
(Zero Trust, im Free-Plan für kleine Teams kostenlos) davor: Zero Trust → Access →
Applications → Self-hosted, Domain des Workers eintragen, Policy „nur deine
E-Mail". Dann kommst nur du nach Login rein.

## Erste Daten / Test

```bash
curl -X POST https://<worker-url>/api/run-daily   # Reports anfordern
# 1-2 Min warten, dann mehrfach:
curl -X POST https://<worker-url>/api/poll        # Reports einsammeln
```

Im Normalbetrieb passiert das automatisch per Cron.

## COGS & Kampagnentyp pflegen

Bid-Ceiling braucht COGS pro SKU; der Keyword-Drilldown braucht den Kampagnentyp:

```bash
curl -X POST https://<worker-url>/api/cogs \
  -H 'content-type: application/json' \
  -d '{"sku":"DEINE-SKU","sell_price":20.99,"contribution_margin":2.28}'

curl -X POST https://<worker-url>/api/campaign-type \
  -H 'content-type: application/json' \
  -d '{"campaign_id":"abc123","type":"MANUAL","name":"Bambus Exact"}'
```

## API-Endpunkte

| Pfad | Zweck |
|------|-------|
| `GET /` | Dashboard (HTML) |
| `GET /api/campaigns?from=&to=` | Kampagnen-Performance (inkl. Typ Auto/Manual) |
| `GET /api/products?from=&to=` | SKU-Performance inkl. `bid_ceiling` |
| `GET /api/keywords?from=&to=` | Keywords (nur MANUAL; `?all=1` für alle) |
| `GET /api/trend?from=&to=` | Tages-Zeitreihe für Charts |
| `POST /api/cogs` · `POST /api/campaign-type` | Stammdaten pflegen |
| `POST /api/run-daily` · `POST /api/poll` | manueller Ingest-Trigger (Test) |

Zeitfenster default: letzte 30 Tage. Parameter `from`/`to` als `YYYY-MM-DD`.

## ⚠️ Vor Produktiv-Lauf prüfen (wie in der Python-Version)

1. **OAuth2** in `src/auth.ts` / `OTTO_TOKEN_URL` gegen die aktuelle
   Seller-Integration-Doku abgleichen — einziger aus dem OAuth2-Flow
   rekonstruierter Teil.
2. **Sales-Spalten** in Async-Reports: Ingest toleriert fehlende Spalten (NULL).
   Falls kein Umsatz in den Reports → notfalls aus den Sync-Endpunkten nachziehen.

## Hinweis Frontend

`src/ui.ts` ist bewusst ein minimaler funktionaler Platzhalter (beweist die API
end-to-end). Das gestylte Dashboard im Look deines Bild-Generators kommt als
eigener Schritt — es liest nur die `/api/*`-Endpunkte.

## Verhältnis zur Python-Version

Schema und Metrik-Logik sind 1:1 aus der lokalen Python/SQLite-Version portiert
(D1 *ist* SQLite). Du kannst lokal mit Python entwickeln/testen und Cloudflare als
gehostete Produktion fahren — beide sprechen dasselbe Schema.
