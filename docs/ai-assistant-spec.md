# AI assistant, bring your own key

Status: spec, not built. Target 0.3.
Owner: t21 dev

## What it is

An optional layer that summarises what is in your feeds. You supply the key,
Turbo Reader supplies the plumbing. No account, no proxy, no telemetry. If you
never open the Assistant tab, no network call is ever made to a model provider.

The shape to aim for: open the app in the morning, read six sentences, and know
whether anything in 300 unread articles is worth your time.

## Why bring your own key

Three reasons, in order of weight.

1. Nobody has to trust a server we run, because there is no server we run. The
   key lives in the OS keychain, the request goes straight to the provider.
2. It costs us nothing to run and costs the user what they already pay. A
   summary of 40 headlines is under a tenth of a cent on a small model.
3. It keeps the privacy claim honest. Articles leave the machine only for the
   provider the user chose, only when the user asks, and the app says so each
   time with a count of what is about to be sent.

## Providers

Everything speaks the OpenAI chat-completions shape, so one client covers all of
them. The provider list is presets over a single transport, not separate code
paths.

| Preset | Base URL | Notes |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | reference implementation |
| Anthropic | `https://api.anthropic.com/v1` | OpenAI-compatible endpoint; `x-api-key` header |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | OpenAI-compatible endpoint |
| Moonshot (Kimi) | `https://api.moonshot.ai/v1` | |
| DeepSeek | `https://api.deepseek.com/v1` | |
| Groq | `https://api.groq.com/openai/v1` | fast, good for the daily digest |
| OpenRouter | `https://openrouter.ai/api/v1` | one key, many models |
| Ollama | `http://localhost:11434/v1` | local, no key needed |
| Custom | user supplied | anything else that speaks the same shape |

A preset fills in the base URL, the auth header style and a default model. Every
field stays editable, because a new provider should not need a release.

## The three things it does

### 1. Summarise one article

A button in the reader toolbar, beside "Load full content". Sends the article
title and sanitised body, gets back four to six sentences and up to five key
points. The summary is stored next to the article, so reopening it costs
nothing.

Prompt shape: a system message that fixes the register (plain, no preamble, no
"this article discusses"), then the article. Output is parsed as JSON with
`summary` and `points[]`, with a plain-text fallback when a model ignores the
schema.

### 2. The digest, on the home page

A panel at the top of the card grid, for the current scope. Takes the unread
titles and snippets, not full bodies, and returns:

- one paragraph on what the day actually holds
- three to six clusters, each a theme with the article IDs that belong to it
- a short "probably skip" list

Clicking a cluster filters the grid to those articles. The clustering is the
part that earns its keep: twelve feeds covering the same launch collapse into
one line.

Cost control: titles and snippets only, capped at 120 articles per run, and the
digest is cached per scope until the next successful refresh.

### 3. Ask about what you have read

A text box in the Assistant tab. The question is answered from a retrieval pass
over the local FTS5 index, not from a dump of the whole library: find the top 20
matching articles, send their snippets with their IDs, and require the model to
cite the IDs it used. Answers render with the cited articles underneath as real
links. An answer with no citations is shown as "nothing in your feeds covers
this" rather than a guess, because a reader that invents articles is worse than
one with no assistant at all.

## Settings

A new "Assistant" section, below Reading.

**Connection**
- Provider preset, base URL, API key, model name
- Temperature, max output tokens, request timeout
- A "Test connection" button

**Behaviour**
- Off by default. One master switch.
- Summarise automatically on open: off, starred only, everything
- Daily digest: off, on open, or at a set hour
- Language for output, defaulting to the interface language
- Monthly spend cap in tokens, after which the assistant stops and says so

**Usage**
- Calls, input tokens, output tokens, and estimated cost
- Broken out by feature and by day, with a 30-day sparkline
- Buttons to reset the counter and to export the log as CSV

### Test connection

Pressing it does four checks and shows each one as it lands, because "it
doesn't work" is the least useful error message there is.

1. The base URL resolves and TLS completes
2. `GET /models` returns 200, and the chosen model appears in the list
3. A one-token completion round trips
4. The latency of that round trip, in milliseconds

Each failure gets a specific message. A 401 says the key was rejected. A 404 on
`/models` says the base URL is probably missing its `/v1`. A timeout names the
host. The raw response body goes behind a disclosure triangle for the cases none
of that covers.

## Usage accounting

Every call writes one row.

```sql
CREATE TABLE ai_usage (
    id           INTEGER PRIMARY KEY,
    at           INTEGER NOT NULL,  -- unix seconds
    feature      TEXT    NOT NULL,  -- 'summary' | 'digest' | 'ask' | 'test'
    provider     TEXT    NOT NULL,
    model        TEXT    NOT NULL,
    prompt_tok   INTEGER NOT NULL,
    output_tok   INTEGER NOT NULL,
    latency_ms   INTEGER NOT NULL,
    ok           INTEGER NOT NULL,
    error        TEXT
);
```

Token counts come from the provider's `usage` block. When a provider omits it,
the row is marked estimated and the number comes from a 4-characters-per-token
approximation, shown with a tilde so an estimate never passes as a measurement.

Cost is a local price table keyed on provider and model, editable, with the date
it was last updated shown next to the total. Prices move; a number that silently
goes stale is worse than one labelled as of a date.

## Where the code goes

```
src-tauri/src/ai/
  mod.rs        the command surface: summarise, digest, ask, test, usage
  client.rs     one OpenAI-shaped client, streaming and not
  prompts.rs    the prompts, as consts, with tests on the parsing
  usage.rs      the ledger and the price table
src/components/
  Assistant.tsx     the tab
  DigestPanel.tsx   the home-page panel
  AiSettings.tsx    the settings section
```

The key is stored with `keyring` in the OS credential store, not in SQLite and
not in `localStorage`. The settings row holds everything except the key.

All of it runs in Rust for the same reason feed parsing does: the webview never
needs to hold the key, and a provider returning something unexpected cannot
reach the renderer.

## What it will not do

- No calls without an explicit action or an explicit schedule the user set
- No sending full article bodies for the digest, only titles and snippets
- No silent retries that double a bill
- No default-on anything
- No cloud fallback when the user's own key fails

## Open questions

- Streaming the single-article summary token by token looks good and
  complicates the cache. Probably worth it for the one-article case, not for
  the digest.
- Local embeddings for clustering would cut the digest cost to near zero and
  add a model download. Likely a later option rather than the default.
- Whether "Ask" should be able to fetch an article's full text mid-answer. It
  would help, and it turns one predictable call into an agent loop with an
  unpredictable bill.
