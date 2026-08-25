# Webcore AI

A single-file Cloudflare Worker that provides a chat interface with multiple AI models, persistent conversation storage, and neuron usage tracking — all running on Cloudflare's Free Tier.

```
https://your-worker.workers.dev/
```

---

## Contents

- `worker.js` — the Worker. Deploy this file as-is.
- `README.md` — this documentation.

---

## How it works

### Architecture

The Worker serves a complete chat application with:

1. **AI Model Integration** — Uses Cloudflare Workers AI with support for multiple models:
   - Llama 4 Scout 17B (`@cf/meta/llama-4-scout-17b-16e-instruct`)
   - GPT-OSS 120B (`@cf/openai/gpt-oss-120b`)
   - Gemma 4 26B (`@cf/google/gemma-4-26b-a4b-it`)
   - GLM 4.7 Flash (`@cf/zai-org/glm-4.7-flash`)
   - Qwen 3.8 27B (`@cf/qwen/qwen3.8-27b`)

2. **Persistent Storage** — Uses D1 database to store:
   - Conversations with titles and timestamps
   - Message history with role and content
   - Daily neuron usage tracking

3. **Conversation Management**:
   - Create new conversations with custom titles
   - Rename existing conversations
   - Delete conversations (with cascade deletion of messages)
   - Persistent conversation history across sessions

4. **Regeneration System**:
   - Replace the last assistant response with a new version
   - Version history with navigation arrows (←/→)
   - Parallel versions stored in memory
   - Counter showing current/total versions (e.g., "2/3")

5. **Neuron Dashboard**:
   - Real-time tracking of daily neuron usage
   - Visual progress bar (color-coded: green → yellow → red)
   - Shows used/remaining neurons (10,000/day free limit)
   - Prevents requests when daily limit is exceeded

6. **Markdown Rendering**:
   - Full markdown support including:
     - Headers (H1-H4)
     - Lists (ordered and unordered)
     - Code blocks with syntax highlighting
     - Inline code
     - Blockquotes
     - Tables
     - Bold and italic text
     - Links and images

7. **UI Features**:
   - Sidebar with conversation list
   - Model selector dropdown
   - Message actions (regenerate)
   - Custom modals (no browser popups)
   - Mobile-responsive design
   - Light/dark theme
   - Auto-resizing text input
   - Typing indicator
   - Error toast notifications

### Database Schema

The Worker automatically creates and manages three tables:

**conversations**
```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at INTEGER,
  updated_at INTEGER
)
```

**messages**
```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT,
  role TEXT,
  content TEXT,
  timestamp INTEGER,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
)
```

**neuron_usage**
```sql
CREATE TABLE neuron_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT UNIQUE,
  used INTEGER DEFAULT 0
)
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Serves the HTML UI |
| `/api/conversations` | GET | Lists all conversations |
| `/api/conversations` | POST | Creates a new conversation |
| `/api/conversations/:id` | GET | Gets a conversation with messages |
| `/api/conversations/:id` | PUT | Renames a conversation |
| `/api/conversations/:id` | DELETE | Deletes a conversation and its messages |
| `/api/chat` | POST | Sends a message and gets AI response |
| `/api/regenerate` | POST | Regenerates the last assistant response |
| `/api/neurons` | GET | Gets today's neuron usage |

### Request/Response Formats

**POST /api/chat**
```json
{
  "conversation_id": "uuid",
  "prompt": "What is Cloudflare?",
  "model": "@cf/meta/llama-4-scout-17b-16e-instruct",
  "temperature": 0.7,
  "max_tokens": 1000
}
```

**Response:**
```json
{
  "success": true,
  "response": "Cloudflare is...",
  "messages": [...],
  "neurons_used": 45,
  "total_neurons_used": 234,
  "remaining_neurons": 9766
}
```

**POST /api/regenerate**
```json
{
  "conversation_id": "uuid",
  "history": [...],
  "prompt": "What is Cloudflare?",
  "model": "@cf/meta/llama-4-scout-17b-16e-instruct",
  "temperature": 0.7,
  "max_tokens": 1000
}
```

### Model Allowlist

The Worker enforces a server-side model allowlist to prevent bypassing the UI:

```javascript
var FREE_MODELS = {
  '@cf/meta/llama-4-scout-17b-16e-instruct': { name: 'Llama 4 17B', maxTokens: 1000 },
  '@cf/openai/gpt-oss-120b': { name: 'GPT-OSS 120B', maxTokens: 1000 },
  '@cf/google/gemma-4-26b-a4b-it': { name: 'Gemma 4 26B', maxTokens: 800 },
  '@cf/zai-org/glm-4.7-flash': { name: 'GLM 4.7 Flash', maxTokens: 800 },
  '@cf/qwen/qwen3.8-27b': { name: 'Qwen 3.8 27B', maxTokens: 1000 }
};
```

### Security Features

1. **Server-side validation** — All inputs are validated before processing
2. **Model allowlist** — Only approved models can be used
3. **Prompt length limit** — 2,000 character maximum
4. **Token clamping** — Temperature and max_tokens are clamped to safe values
5. **Neuron limit enforcement** — Prevents exceeding the 10,000 daily limit
6. **CORS headers** — Configurable CORS origin
7. **SQL injection protection** — Uses prepared statements

### Performance Optimizations

1. **Cached database initialization** — Tables are created once per instance
2. **Limited history** — Only the last 20 messages are sent to the AI
3. **Parallel operations** — Database writes use `Promise.all()` and `batch()`
4. **Order by ID** — Messages are ordered by auto-incrementing ID, not timestamp
5. **No unnecessary queries** — The final message query is eliminated
6. **ON DELETE CASCADE** — Messages are automatically deleted with conversations

---

## Deploying

### Prerequisites

1. Cloudflare account with Workers and D1 access
2. Wrangler CLI (optional, can deploy via dashboard)

### Step 1: Create D1 Database

Using Wrangler:
```bash
wrangler d1 create whitedragon-ai
```

Or via the Cloudflare Dashboard:
1. Go to Workers & Pages → D1
2. Click **Create database**
3. Name: `whitedragon-ai`
4. Click **Create**

### Step 2: Deploy the Worker

**Option A: Dashboard (Recommended for quick deployment)**
1. Go to Workers & Pages → Create application
2. Click **Create Worker**
3. Name your worker and click **Deploy**
4. Click **Edit code**
5. Paste the entire `worker.js` file
6. Add D1 binding:
   - Go to Settings → Variables
   - Under D1 Database Bindings, click **Add binding**
   - Variable name: `DB`
   - Select database: `whitedragon-ai`
7. Click **Save and Deploy**

**Option B: Wrangler CLI**
```bash
wrangler deploy worker.js
```

### Step 3: Accept Model Licenses

Before using each model, you must accept the license in the Cloudflare dashboard:
1. Go to AI → Models
2. Find each model you want to use
3. Click **Agree** to accept the terms

### Step 4: (Optional) Enable Cloudflare Access

For production use, protect your Worker with authentication:
1. Go to Zero Trust → Access → Applications
2. Add your Worker URL
3. Configure authentication method (email, OTP, etc.)
4. Set access policies

---

## Using it

1. Open your Worker's URL (e.g., `https://webcore-ai.your-subdomain.workers.dev/`)
2. The sidebar shows your conversations
3. Click **+ New Chat** to start a conversation
4. Select a model from the dropdown
5. Type your message and press Enter or click Send
6. Hover over any assistant message and click **⟳** to regenerate
7. Use **←** and **→** to navigate between versions
8. Rename conversations by clicking **✎**
9. Delete conversations by clicking **✕**

---

## Known limitations

- **No authentication built-in** — The Worker is publicly accessible by default. Use Cloudflare Access for authentication.
- **Neuron tracking starts from 0** — Previous usage before this version isn't tracked.
- **History limited to 20 messages** — Older messages are not sent to the AI (but are preserved in storage).
- **Regeneration versions are in-memory only** — Versions are not persisted to the database.
- **Model availability depends on Cloudflare** — Some models may require acceptance or have different availability.
- **Neuron estimation is approximate** — Actual neuron usage may vary from estimates.

---

## Testing checklist

| # | Action | What you're checking | Expected result |
|---|---|---|---|
| 1 | Open the Worker's bare URL | UI loads | White theme, sidebar, conversation list, input area |
| 2 | Click + New Chat, enter a title | Conversation creation | New conversation appears in sidebar, welcome message shown |
| 3 | Type a prompt and send | Basic chat | Message appears, typing indicator shows, AI responds with markdown |
| 4 | Switch models using dropdown | Model switching | Badge updates, next response uses new model |
| 5 | Hover over assistant message, click ⟳ | Regeneration | Shows "Regenerating...", new response replaces old |
| 6 | Click ← and → on regenerated message | Version navigation | Content switches between versions, counter updates (e.g., "2/3") |
| 7 | Click ✎ on a conversation | Rename | Modal appears, enter new name, sidebar updates |
| 8 | Click ✕ on a conversation | Delete | Delete confirmation modal, conversation removed |
| 9 | Refresh the page | Persistence | Conversation and messages reload from database |
| 10 | Send multiple messages | History tracking | All messages preserved, scrolling works |
| 11 | Check neuron dashboard | Usage tracking | Used neurons increase, remaining decreases, progress bar updates |
| 12 | Click the theme toggle | Theme switch | Dark/light theme persists across reloads |
| 13 | Use mobile view (DevTools) | Responsive | Sidebar collapses, hamburger menu appears |
| 14 | Send a very long prompt (>2000 chars) | Server-side validation | Error message: "Prompt too long" |
| 15 | Try to use a model not in the dropdown | Model allowlist | Error: "Model is not available on this deployment" |

---

## Architecture diagram

```
                    ┌──────────────────────┐
                    │    Client Browser    │
                    │   (HTML + JS + CSS)  │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   Cloudflare Worker  │
                    │      (worker.js)     │
                    └──────────┬───────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
┌───────▼───────┐    ┌────────▼────────┐   ┌─────────▼─────────┐
│   D1 Database │    │  Workers AI     │   │  Neuron Usage     │
│ whitedragon-ai│    │  (env.AI.run)   │   │  (tracking)       │
│               │    │                 │   │                   │
│ conversations │    │  Llama 4 17B    │   │  Daily limit      │
│ messages      │    │  GPT-OSS 120B   │   │  10,000 neurons   │
│ neuron_usage  │    │  Gemma 4 26B    │   │                   │
│               │    │  GLM 4.7 Flash  │   │                   │
│               │    │  Qwen 3.8 27B   │   │                   │
└───────────────┘    └─────────────────┘   └───────────────────┘
```

---

## File map

```
worker.js
├─ CONFIG                    → Model defaults, limits, CORS
├─ FREE_MODELS               → Server-side model allowlist
├─ UI_HTML                   → Complete HTML/CSS/JS UI
│   ├─ Sidebar
│   ├─ Conversation list
│   ├─ Chat container
│   ├─ Message rendering
│   ├─ Markdown renderer
│   ├─ Modals (new/rename/delete)
│   ├─ Neuron dashboard
│   └─ Model selector
├─ initDatabase()            → Idempotent D1 table creation
├─ default.fetch()           → Request routing
│   ├─ GET /                 → Serve UI
│   ├─ GET /api/neurons      → Get neuron usage
│   ├─ GET /api/conversations → List conversations
│   ├─ POST /api/conversations → Create conversation
│   ├─ PUT /api/conversations/:id → Rename
│   ├─ DELETE /api/conversations/:id → Delete with cascade
│   ├─ POST /api/chat        → Send message with AI
│   └─ POST /api/regenerate  → Regenerate response
└─ Database operations        → Prepared statements, batch writes
```

---

## Troubleshooting

| Issue | Likely cause | Solution |
|-------|--------------|----------|
| "Model is not available on this deployment" | License not accepted | Go to AI → Models, accept terms for the model |
| "Daily neuron limit exceeded" | Used all 10,000 neurons | Wait for daily reset (midnight UTC) or upgrade plan |
| Database tables not created | Permission issue | Ensure D1 binding is named "DB" |
| "Could not find the previous user message" | No user message to regenerate | Only regenerate after a user message |
| Regeneration not working | Version history empty | Ensure at least one assistant message exists |
| UI not loading | Wrong Worker URL | Check you're accessing the correct URL |
| Sidebar empty | No conversations | Create a new conversation with + New Chat |
| Markdown not rendering | Invalid markdown format | Check the AI response format |
