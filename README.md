# Webcore AI

A self-hosted AI chat app that runs entirely on Cloudflare's edge — one Worker file, one D1 database, no server to manage. It talks to Cloudflare Workers AI for inference, optionally grounds answers in live web search, and keeps a full branching history of every conversation (including every regenerated variant), similar to claude.ai.

## Features

- **Chat with a choice of open models** — Llama 4 Scout, GPT‑OSS 120B, Gemma 4, GLM 4.7 Flash, Qwen 3.8 — all served through Workers AI, picked per-message from the composer.
- **Branching regeneration** — regenerating a reply never deletes anything. It creates a sibling branch, so every past variant stays reachable via the ◀ ▶ version controls, even after a reload or from another device.
- **Long-conversation memory** — the most recent ~30 messages are always sent to the model word-for-word. Anything older is folded into a running summary instead of being silently dropped, so very long conversations don't lose context.
- **Optional web search grounding** — toggle the globe icon in the composer to ground a reply in live search results (via Tavily or Brave). Sources are appended to the reply and persisted with it.
- **Live status while it works** — the composer shows "Searching the web…" / "Thinking…" as it happens, streamed from the server rather than a generic spinner.
- **Daily neuron usage dashboard** — tracks Workers AI usage against `DAILY_NEURON_LIMIT` so you don't get an unpleasant surprise.
- **Light/dark theme**, mobile-friendly layout with swipe-to-open sidebar, and a centered landing composer for new chats.
- Everything — UI, API, and routing — lives in a single Worker script. No build step, no frontend framework, no separate hosting.

## Requirements

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (Workers AI and D1 are available on the free plan)
- [Node.js](https://nodejs.org/) and the [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm install -g wrangler`)
- (Optional, recommended) A free [Tavily](https://tavily.com) account if you want web search grounding

## Setup

### 1. Create the D1 database

```bash
wrangler d1 create webcore-ai-db
```

This prints a `database_id` — you'll need it in the next step. The Worker creates its own tables on first request (conversations, messages, neuron usage), so there's no schema file to run by hand.

### 2. Configure `wrangler.toml`

Create a `wrangler.toml` next to `worker.js`:

```toml
name = "webcore-ai"
main = "worker.js"
compatibility_date = "2024-09-23"

[[d1_databases]]
binding = "DB"
database_name = "webcore-ai-db"
database_id = "<the database_id from step 1>"

[ai]
binding = "AI"
```

The binding names (`DB` and `AI`) must match exactly — the Worker code refers to `env.DB` and `env.AI`.

### 3. (Optional) Enable web search

Without a key, the web-search toggle in the UI will show a clear error instead of failing silently — the rest of the app works fine without it.

**Recommended: Tavily** — free, no card required, 1,000 searches/month, built specifically for grounding LLM answers:

```bash
wrangler secret put TAVILY_API_KEY
```

Get a key at [tavily.com](https://tavily.com).

**Alternative: Brave Search API** — used automatically if `TAVILY_API_KEY` isn't set. Note Brave's free tier now requires a card at signup.

```bash
wrangler secret put BRAVE_API_KEY
```

If neither secret is set, search requests return: *"Web search needs a free API key. Sign up at tavily.com..."*

### 4. Deploy

```bash
wrangler deploy
```

Wrangler prints your Worker's URL (`https://webcore-ai.<your-subdomain>.workers.dev`). Open it — that's the whole app.

### Local development

```bash
wrangler dev
```

Runs the Worker locally with a local D1 instance. Note: web search calls a real external API even in local dev, so set the secret in `.dev.vars` (a local file, not committed) if you want to test it:

```
TAVILY_API_KEY=tvly-your-key-here
```

## How it works

### Everything is one file

`worker.js` contains the backend (a standard `fetch` handler), the database schema/migrations, and the entire frontend — the UI is a single HTML string served at `GET /`, with its CSS and vanilla JS inlined. There's no build step because there's nothing to build.

### Conversation model: a tree, not a list

Each row in the `messages` table has a `parent_id` and an `active_child_id`. A conversation is a tree; the "active path" (root → active leaf, following `active_child_id` at each step) is what's displayed. Regenerating a message inserts a new sibling under the same parent and repoints `active_child_id` — nothing is ever deleted, so switching back to an older variant with the ◀ button is always possible.

### Memory

Config values `MEMORY_RECENT_VERBATIM` (30) and `MEMORY_SUMMARY_TRIGGER` (20) control this. When a conversation's context exceeds the verbatim window, the messages older than that window get summarized by the model itself (a small, cheap call capped at `MEMORY_SUMMARY_MAX_TOKENS`), and the summary is stored on the conversation row (`memory_summary`, `memory_covered_count`). It's only regenerated once enough new older messages accumulate, not on every turn.

### Neuron budget

`DAILY_NEURON_LIMIT` (10,000 by default) is checked before every model call, tracked per calendar day in the `neuron_usage` table. The sidebar dashboard reflects this. Cloudflare's actual Workers AI free allocation may differ — adjust the constant to match your plan.

## Configuration reference

All of these are constants at the top of `worker.js` (no redeploy-free env-based config — edit and `wrangler deploy` again):

| Constant | Default | Meaning |
|---|---|---|
| `MODEL` | Llama 4 Scout | Fallback model if none is specified in a request |
| `TEMPERATURE` | 0.7 | Default sampling temperature |
| `MAX_PROMPT_LENGTH` | 2000 | Max characters per user message |
| `DAILY_NEURON_LIMIT` | 10000 | Daily Workers AI neuron budget |
| `MAX_SEARCH_RESULTS` | 5 | Search results fetched per query |
| `SEARCH_TIMEOUT_MS` | 8000 | Hard timeout on search provider requests |
| `MEMORY_RECENT_VERBATIM` | 30 | Messages kept word-for-word before summarizing |
| `MEMORY_SUMMARY_TRIGGER` | 20 | New older messages needed before re-summarizing |

`FREE_MODELS` is the allowlist of selectable models and their per-model `maxTokens` ceiling — add or remove entries here to change what appears in the composer's model picker (must be model IDs available to your Workers AI account).

## API

All endpoints are same-origin, JSON in/out (except the two streaming ones), and CORS-open by default (`CORS_ORIGIN: '*'` in `CONFIG`).

| Method & path | Purpose |
|---|---|
| `GET /` | The app itself (HTML/CSS/JS) |
| `GET /api/neurons` | Today's neuron usage vs. limit |
| `GET /api/conversations` | List conversations (id, title, timestamps, message count) |
| `POST /api/conversations` | Create a conversation (`{title}`) |
| `GET /api/conversations/:id` | Get a conversation's active message path |
| `PUT /api/conversations/:id` | Rename (`{title}`) |
| `DELETE /api/conversations/:id` | Delete a conversation and its messages |
| `POST /api/conversations/:id/branch` | Switch which sibling variant is active (`{message_id}`) |
| `POST /api/chat` | Send a message; **streams** newline-delimited JSON status/result events |
| `POST /api/regenerate` | Regenerate a message; **streams** the same way (`{conversation_id, message_id, model, web_search}`) |

`/api/chat` and `/api/regenerate` return `application/x-ndjson`: one or more `{"type":"status","stage":"searching"|"generating"}` lines while working, followed by exactly one `{"type":"result", success, ...}` line. Because the HTTP status is always 200 once streaming starts, check `success` in the result event rather than the response status code.

## Limitations worth knowing

- **Web search free tiers are capped, not unlimited** — Tavily's is 1,000/month. There's no genuinely free *and* unlimited *and* official search API; this app fails soft (a toast, not a crash) if you exceed a quota or haven't configured a key.
- **Neuron accounting is an estimate** pre-call and reconciled with whatever Workers AI reports post-call — it's a budgeting guardrail, not a billing-grade meter.
- **No authentication** — anyone with the Worker's URL can use it and see all conversations. Fine for personal/single-user use; put it behind Cloudflare Access (or add your own auth check at the top of `fetch`) before sharing the URL.
- **Single Worker file** — great for zero-build simplicity, painful to code-review as a diff once it grows much further. If you plan to extend this a lot, consider splitting the embedded UI out into its own asset.

## License

Use it, modify it, ship it — no license restrictions implied by this README. Add your own `LICENSE` file if you need one.
