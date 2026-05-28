-- OTTO PPC dashboard schema for Cloudflare D1 (SQLite).
-- Run: wrangler d1 execute otto_ppc --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS campaigns (
  campaign_id TEXT PRIMARY KEY,
  name        TEXT,
  type        TEXT NOT NULL DEFAULT 'UNKNOWN'   -- AUTO | MANUAL | UNKNOWN
);

CREATE TABLE IF NOT EXISTS cogs (
  sku                 TEXT PRIMARY KEY,
  sell_price          REAL,   -- gross price the customer pays (EUR)
  contribution_margin REAL    -- EUR profit per unit BEFORE ad spend
);

CREATE TABLE IF NOT EXISTS fact_campaign_daily (
  event_date   TEXT NOT NULL,
  campaign_id  TEXT NOT NULL,
  views        INTEGER,
  clicks       INTEGER,
  costs        REAL,
  sales        REAL,
  ordered_skus INTEGER,
  PRIMARY KEY (event_date, campaign_id)
);

CREATE TABLE IF NOT EXISTS fact_product_daily (
  event_date   TEXT NOT NULL,
  campaign_id  TEXT NOT NULL,
  sku          TEXT NOT NULL,
  views        INTEGER,
  clicks       INTEGER,
  costs        REAL,
  sales        REAL,
  ordered_skus INTEGER,
  PRIMARY KEY (event_date, campaign_id, sku)
);

CREATE TABLE IF NOT EXISTS fact_keyword_daily (
  event_date   TEXT NOT NULL,
  campaign_id  TEXT NOT NULL,
  keyword      TEXT NOT NULL,
  searchterm   TEXT,
  views        INTEGER,
  clicks       INTEGER,
  costs        REAL,
  sales        REAL,
  ordered_skus INTEGER,
  PRIMARY KEY (event_date, campaign_id, keyword)
);

-- Async report state machine. The daily cron inserts rows here; the 5-min cron
-- polls each IN_PROGRESS report and downloads it when READY.
CREATE TABLE IF NOT EXISTS pending_reports (
  report_id   TEXT PRIMARY KEY,
  report_type TEXT NOT NULL,         -- campaign | product | keyword
  from_date   TEXT NOT NULL,
  to_date     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'IN_PROGRESS',  -- IN_PROGRESS | READY | DONE | FAILED
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
