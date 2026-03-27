# Trending Jokes Dashboard — Design Spec

## Goal

Build a semi-automated system that scrapes trending AI/LLM/dev jokes and commentary from X, Reddit, and TikTok across 8 supported locales, filters them through a local LLM (Ollama), and presents them in a Next.js dashboard for admin review before publishing to the oh-my-claude joke server.

## Phase 1 Scope

Content focus: **AI / LLM / Claude** related jokes and commentary only. General dev humor deferred to Phase 2.

## Architecture

Monolith local app — all components run on the admin's machine:

```
┌─────────────────────────────────────────────────┐
│                LOCAL MACHINE                     │
│                                                  │
│  ┌──────────┐    ┌──────────┐    ┌───────────┐  │
│  │ Scraper  │───▶│  Ollama  │───▶│  SQLite   │  │
│  │ (cron)   │    │ (filter) │    │   DB      │  │
│  └──────────┘    └──────────┘    └─────┬─────┘  │
│   X/Reddit/                            │         │
│   TikTok                               ▼         │
│                               ┌──────────────┐   │
│                               │  Next.js     │   │
│                               │  Dashboard   │   │
│                               │  (localhost)  │   │
│                               └──────┬───────┘   │
│                                      │            │
│                               ┌──────▼───────┐   │
│                               │  Publisher   │   │
│                               │  (git push)  │   │
│                               └──────┬───────┘   │
└──────────────────────────────────────┼───────────┘
                                       │
                                       ▼
                          ┌────────────────────┐
                          │  ohmyclaude.       │
                          │  vercel.app        │
                          │  (auto-deploy)     │
                          └────────────────────┘
```

**Components:**
1. **Scraper** — Node.js scripts, cron 2x/day. Fetch trending content from X, Reddit, TikTok about AI/LLM/Claude in 8 languages.
2. **Ollama Filter** — Local LLM (llama3.1:8b or gemma2:9b) for relevance check, humor scoring, joke rewrite, quality rating.
3. **SQLite DB** — Raw posts, filtered candidates (review queue), approved jokes, scrape run logs.
4. **Next.js Dashboard** — Admin UI on localhost:3000. Review queue, approve/reject, joke library, publish trigger.
5. **Publisher** — Writes approved jokes to server/data/*.json, git commit + push, Vercel auto-deploys.

## Supported Locales & Search Strategy

| Pack ID | Language | X Search Keywords | Reddit Subreddits | TikTok Tags |
|---------|----------|-------------------|-------------------|-------------|
| viet-dev | Vietnamese | `Claude AI lang:vi`, `LLM lập trình` | r/VietNam, r/webdev (vi) | #laptrinhvien #AIvietnam |
| us-dev | English (US) | `Claude AI`, `LLM funny`, `ChatGPT vs Claude` | r/ProgrammerHumor, r/ClaudeAI, r/LocalLLaMA | #codehumor #aidev |
| china-dev | Chinese | `Claude AI lang:zh`, `大模型 程序员` | r/China_irl, r/programming (zh) | #程序员 #AI编程 |
| korea-dev | Korean | `Claude AI lang:ko`, `개발자 AI` | r/hanguk, r/programming (ko) | #개발자 #AI코딩 |
| de-dev | German | `Claude AI lang:de`, `KI Entwickler` | r/de, r/programmierer | #entwickler #KI |
| uk-dev | English (UK) | `Claude AI UK dev`, `AI developer British` | r/CasualUK, r/cscareerquestionsUK | #ukdev #aidev |
| desi-dev | Hinglish | `Claude AI lang:hi`, `developer jugaad AI` | r/india, r/developersIndia | #indiandev #AIindia |
| pl-dev | Polish | `Claude AI lang:pl`, `programista AI` | r/Polska, r/programowanie | #polskidev #AI |

### API Strategy

- **X/Twitter**: Twitter API v2 search endpoint. Basic tier or unofficial scraping via nitter as fallback.
- **Reddit**: Official API (free, OAuth2). Endpoints: `/search.json`, `/r/{sub}/hot.json`. Rate limit: 60 req/min.
- **TikTok**: Unofficial scraping of public search results. No free official search API.

## Ollama AI Filter Pipeline

### Model
- Primary: `llama3.1:8b` or `gemma2:9b`
- System prompt per locale in target language for better context understanding

### Filter Steps (per raw post)

1. **Relevance Check** — "Is this about AI/LLM/dev culture?" → Yes/No filter
2. **Humor Score** — Rate 1-10, classify type (joke, sarcasm, observation, commentary) → score >= 6 passes
3. **Rewrite as Joke** — Standalone 1-3 sentence joke in original language, remove @mentions/URLs
4. **Quality Check** — "Would this work as joke-of-the-day for a {locale} developer?" → 1-5 stars, ★★★+ to review queue

### Batch Processing
- 20 posts per Ollama call (JSON mode)
- ~100-200 raw posts/locale/day → ~10-30 candidates after filter
- ~2-5 min per locale on consumer hardware

## Database Schema (SQLite)

```sql
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,          -- 'x', 'reddit', 'tiktok'
  locale TEXT NOT NULL,          -- 'viet-dev', 'us-dev', etc.
  external_id TEXT UNIQUE,       -- original post ID (dedup)
  author TEXT,
  content TEXT NOT NULL,         -- raw post/comment text
  url TEXT,                      -- link to original
  engagement INTEGER DEFAULT 0,  -- likes/upvotes/hearts
  scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE candidates (
  id INTEGER PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id),
  locale TEXT NOT NULL,
  joke_text TEXT NOT NULL,       -- rewritten joke by Ollama
  humor_score REAL,              -- 1-10
  quality_stars INTEGER,         -- 1-5
  ai_notes TEXT,                 -- Ollama reasoning
  status TEXT DEFAULT 'pending', -- pending/approved/rejected/published
  reviewed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE scrape_runs (
  id INTEGER PRIMARY KEY,
  locale TEXT NOT NULL,
  source TEXT NOT NULL,
  posts_found INTEGER DEFAULT 0,
  candidates_created INTEGER DEFAULT 0,
  started_at DATETIME,
  finished_at DATETIME,
  error TEXT
);
```

## Dashboard UI (Next.js)

### Pages

**`/` — Overview**
- Stats: total scraped, pending, approved, rejected per locale
- Last scrape timestamps per source
- "Run Scraper Now" button

**`/review` — Review Queue**
- Filter by locale/source/score
- Cards: joke text, original post (expandable), source, scores, AI notes
- Actions: Approve / Reject / Edit & Approve / Skip
- Bulk actions with checkboxes
- Keyboard shortcuts: `a` approve, `r` reject, `→` next

**`/jokes` — Approved Library**
- Grouped by pack, search + date/source filter
- Edit/delete individual jokes
- "Publish" button → git commit + push

**`/settings` — Configuration**
- Scraper cron schedule
- Ollama model + endpoint
- Search keywords per locale (editable)
- Min humor score threshold

### Tech Stack
- Next.js 15, App Router, Server Components
- Tailwind CSS + shadcn/ui
- better-sqlite3 (Node.js native SQLite binding)
- Auth: env var token (local-only)

## Publish Flow

1. Admin clicks "Publish" on dashboard
2. Query approved candidates grouped by locale
3. For each locale: read existing `server/data/{locale}.json`, append new jokes (dedup), write back
4. `git add server/data/*.json`
5. `git commit -m "feat(jokes): add {N} trending jokes for {locales}"`
6. `git push origin main`
7. Vercel auto-deploys → ohmyclaude.vercel.app updated
8. Mark published candidates as 'published' in DB

## Project Structure

```
server/
├── dashboard/                  # Next.js app
│   ├── app/
│   │   ├── page.tsx           # Overview
│   │   ├── review/page.tsx    # Review queue
│   │   ├── jokes/page.tsx     # Approved library
│   │   └── settings/page.tsx  # Config
│   ├── lib/
│   │   ├── db.ts              # SQLite client
│   │   ├── ollama.ts          # Ollama API client
│   │   └── scrapers/
│   │       ├── x.ts           # Twitter/X scraper
│   │       ├── reddit.ts      # Reddit scraper
│   │       └── tiktok.ts      # TikTok scraper
│   ├── package.json
│   └── next.config.js
├── api/                        # Existing joke API (unchanged)
├── data/                       # Existing joke JSONs (updated by publisher)
├── db/                         # SQLite database file
├── scripts/
│   └── scrape.ts              # CLI entry for cron job
├── package.json
└── vercel.json
```

## Non-Goals (Phase 1)

- General dev humor (non-AI topics)
- User-submitted jokes
- Multi-user auth / roles
- Cloud deployment of dashboard
- Automated publishing without review
- Analytics / joke performance tracking
