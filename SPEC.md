# Edge Setter — Product Specification v5.1
**"Intelligence Verified"** | Updated Post-Session 12

---

## QUICK START SUMMARY
*(Paste this at the start of any new Claude Code session)*

Edge Setter is a fully autonomous sports intelligence platform at **edgesetter.net**.
- Codebase: github.com/ddcolletti-edgesetter/edge-setter
- Deployed on: Render (Starter plan, $7/mo, persistent disk)
- Database: SQLite/Drizzle ORM (pipeline.db + storage.db)
- Auth: Supabase
- Billing: Stripe
- Email: Resend (**domain now verified as of May 3**)
- Stack: TypeScript/Node.js backend, React/Tailwind/shadcn frontend
- Admin base URL: https://edge-setter.onrender.com (not edgesetter.net)
- Admin password: edgesetter-admin-2026
- Pro test account: ddcolletti@gmail.com

---

## Sessions Completed

| Session | What Was Built |
|---------|---------------|
| 1 | Auth fixed — isPro reads from real database |
| 2 | Accuracy Ledger — auto-settles real outcomes |
| 3 | Evidence retrieval — real source fetching |
| 4 | NFL + CFB agents — automated ingestion adapters |
| 5 | Alerts system — email + push notifications |
| 6 | Ops Dashboard — at /admin/ops |
| 7 | Social auto-posting — X, Discord, Telegram |
| 8 | Historical backfill — NFL 570, CFB 1816, NBA 400, MLB 2982 games |
| 9 | DFS/Betting impact layer (partial) |
| 10 | Discord + Telegram live and posting |
| 11 | Engine debugging, ESPN NBA adapter, MLB dedup fix, login button, mobile fixes, social dedup guard |
| 12 | Fixed zero_live_signals bug (site-watch was calling edgesetter.net SPA instead of localhost), Resend domain verified, Render upgraded to Starter |

---

## Current System State

### What's Working
- Ingestion cycle runs every 15 minutes, active hours 12:00–06:00 UTC (8am–2am ET)
- MLB data flowing: transactions, probable pitchers, games via MLB StatsAPI
- NBA data flowing: games with odds via Odds API + ESPN free API for injuries
- Odds API connected: NBA and MLB spreads/totals/moneylines (free tier, ~400 requests remaining)
- Discord and Telegram posting with dedup guard (social_posts table)
- Login button in nav (NavLoginButton in V2Shell + AppLayout)
- Boards live at edgesetter.net/nba and edgesetter.net/mlb
- Alerts firing: dispatched 1, users_notified 1 per cycle
- Site-watch: clean cycles, zero_live_signals warning resolved
- Resend domain verified — email alerts now deliverable
- Auto-seed owner as Pro on first boot
- UptimeRobot monitoring every 5 min

### What's Still Broken / Priority Issues

**P0 — Core product:**
1. **Stale signals on boards** — /api/signals returns same signals 22+ hours old. Ingestion processes 50 events per cycle but fresh RawEvents aren't becoming new LiveSignals in the public feed. live_signals table may be empty or not being written to.
2. **Line movement = 0 events** — Odds API returns games (5 NBA, 15 MLB) but 0 line movement events detected every cycle. Threshold too high or comparison logic broken.

**P1 — Data quality:**
3. **NBA injuries = 0** — ESPN NBA adapter returns 0 created, 0 skipped every cycle.
4. **Font contrast too light** — signal titles and descriptions on NBA/MLB boards hard to read. Color definitions in SportVisuals.tsx.
5. **Source leaderboard duplicates** — dedup issue in display.
6. **Accuracy Ledger empty** — settled: 0 every cycle. No live signals have been graded yet.

**P2 — User experience:**
7. **Onboarding unclear** — new visitor doesn't understand the product on first load.
8. **Resend email spam in logs** — 20+ errors per cycle until guard added. Add: if 403 returned, log once and skip all email sends for that cycle.
9. **X/Twitter disabled** — SOCIAL_X_ENABLED=false. Twitter Basic plan required ($100/mo).
10. **VAPID keys not set** — push notifications disabled.

---

## Architecture — Four Pillars

### Pillar 1 — Agent Network

| Agent | Data Source | Status |
|-------|-------------|--------|
| MLB Ingestion | MLB StatsAPI (free) | ✅ Running |
| NBA Ingestion | ESPN free API + Odds API | ⚠️ Injuries = 0, odds events = 0 |
| NFL Agent | ESPN + Odds API | ⏸ Off-season, season-gated |
| CFB Agent | ESPN + Odds API | ⏸ Off-season, season-gated |
| Line Movement | Odds API | ⚠️ 0 events detected |
| Social Agent | Discord + Telegram | ✅ Live, deduped |
| X/Twitter | Twitter API v2 | ❌ Disabled |

### Pillar 2 — Consensus & Weighting Engine

Source tiers:
- Major aggregators (ESPN, MLB StatsAPI): have data, high weight by default
- Local beat reporters: registered as sources, zero historical data, weight stuck at 0.50
- Gap: No mechanism pulling from beat reporter feeds or X accounts

Signal states:
- 🔴 Developing — single source, unconfirmed
- 🟡 Verified — 2+ independent sources OR 1 high-weight source
- 🟢 Confirmed — 3+ sources OR official + high-weight consensus

### Pillar 3 — Accuracy Ledger
- Historical backfill complete: NFL 570, CFB 1816, NBA 400, MLB 2982 games
- Source leaderboard has duplicate entries
- settled: 0 — no live signals graded yet
- Public at edgesetter.net but thin until signals start settling

### Pillar 4 — Autonomous Operations
- Ingestion logs: Ingestion/Start, Ingestion/Odds, Ingestion/NBAInjuries, Ingestion/MLB, Ingestion/Complete, Ingestion/Failed
- SiteWatch: clean after Session 12 fix
- Self-healing via Anthropic API — ANTHROPIC_API_KEY set in Render
- Admin endpoints: /api/admin/ops, /api/admin/make-pro, /api/admin/seed-social-posts

---

## Environment Variables (Render)

| Variable | Status |
|----------|--------|
| BALLDONTLIE_API_KEY | ✅ Set — /player_injuries is paid-only, switched to ESPN |
| THE_ODDS_API_KEY | ✅ Set — ~400 requests remaining (500/mo free tier) |
| ANTHROPIC_API_KEY | ✅ Set |
| RESEND_API_KEY | ✅ Set — domain verified May 3 |
| STRIPE_SECRET_KEY | ✅ Set |
| SUPABASE_URL + ANON_KEY | ✅ Set |
| DISCORD_WEBHOOK_URL | ✅ Set |
| TELEGRAM_BOT_TOKEN + CHAT_ID | ✅ Set |
| SOCIAL_X_ENABLED | false — Twitter disabled |
| TWITTER_API_KEY/SECRET | ✅ Set — unusable until paid plan |
| VAPID keys | ❌ Not set — push notifications disabled |

---

## Remaining Build Sessions

### Session 13 — Fix Stale Signals + Font Contrast + Resend Guard
**Prompt:**
> "Session 13. Three things: 1) /api/signals keeps returning the same signals 22+ hours old even though ingestion processes 50 events per cycle. Trace exactly why fresh RawEvents aren't becoming new LiveSignals in the public feed — show me what's in the live_signals table vs what ingestion is writing before touching anything. 2) Signal titles and descriptions on the NBA and MLB boards are too light to read — fix contrast across all board pages, color definitions are in SportVisuals.tsx. 3) Add a guard in the email alert sender: if Resend returns a 403 validation_error, log it once per cycle and skip all further email attempts that cycle, no retries. Show me the plan before making changes."

### Session 14 — Beat Reporter Feeds
**Prompt:**
> "Session 14. Currently only ESPN and MLB StatsAPI provide signal data. Build a beat reporter ingestion adapter that: 1) Monitors a configurable list of X/Twitter accounts for injury/lineup news without requiring Twitter API — use RSS or nitter-style scraping, 2) Parses content for player names, injury keywords, lineup keywords, 3) Creates RawEvents with source type 'reporter' and lower initial weight (0.40), 4) Show the configurable reporter list as a starting point for NFL, NBA, MLB. Show me the plan before making changes."

### Session 15 — Onboarding + Homepage
**Prompt:**
> "Session 15. A new visitor lands on edgesetter.net and doesn't know what to do or why they should care. The homepage needs: 1) A clear 10-second value proposition, 2) A live signal preview showing real signals that updates automatically, 3) A clear path to sign up free or go Pro, 4) The Accuracy Ledger teased with real numbers. Frontend only — do not change the signal pipeline or backend. Show me the plan before making changes."

### Session 16 — Accuracy Ledger Cleanup
**Prompt:**
> "Session 16. Fix the source leaderboard duplicate entries. Build out the Accuracy Ledger public page with: real settled signal history, rolling accuracy % by sport, source leaderboard cleaned up, and shareable signal receipt URLs. Show me what data is currently in the ledger before making changes."

### Session 17 — Push Notifications + VAPID
**Prompt:**
> "Session 17. Set up VAPID keys for web push notifications. Walk me through generating them, adding to Render env vars, and wiring into the existing alerts system so Pro users can opt in to browser push alerts."

---

## Data Sources — Current vs Target

| Source Type | Current | Target |
|-------------|---------|--------|
| MLB official data | ✅ MLB StatsAPI | Keep |
| NBA official data | ✅ ESPN free API | Keep + add official NBA API |
| NFL/CFB | ✅ ESPN (season-gated) | Keep |
| Line movement | ⚠️ Odds API (0 events) | Fix detection logic |
| Beat reporters | ❌ None | Session 14 |
| Local team sources | ❌ None | Session 14 |
| Weather | ❌ Not built | Future |

---

## The One-Line Pitch
*"We don't tell you what to play. We make sure you know everything before you do."*

---

## 90-Day Targets

| Metric | Target |
|--------|--------|
| System uptime | >99.5% |
| Signal accuracy | >85% |
| Lead time vs ESPN | >20 minutes |
| False positive rate | <8% |
| Pro subscribers | 500 |
| MRR | $9,500+ |
| Owner interventions | <2/week |

---

*Edge Setter — Intelligence Verified*
*Version 5.1 — Post Session 12*
*Target: DFS players and sports bettors who make their own decisions*
