# Status — Reading Group Tool

> Living document. Update this whenever you pick up or pause work.
> Last updated: 2026-07-03

---

## What this is

A next-generation web-based collective reading & knowledge-production tool. The full vision, theoretical foundations (Lévy, Surowiecki, Malone, Mulgan; social-annotation research; collaborative-learning theory), feature taxonomy (Necessary / Possible / Exceptional tiers), AI strategy, and phased roadmap live in **[`BLUEPRINT.md`](./BLUEPRINT.md)** — read that first for the "why."

This document tracks **where the build is right now**.

---

## Repository

- **Remote:** https://github.com/martinussuijkerbuijk/reading-group-tool.git
- **Branch:** `main` (tracks `origin/main`)
- **How to push:** `git push` (remote already configured with `-u`)

---

## How to run

Prerequisites: Node 24, npm, Bun 1.3+ (uv installed too, for Python-side needs).

```bash
bun install

# terminal 1 — API server on :3001
bun run dev:server

# terminal 2 — Vite client on :5173
bun run dev:client
```

Open http://localhost:5173 → create a group → upload a text-based PDF → select text to annotate.

**Port note:** the server defaults to **3001** because port 3000 is occupied on the dev machine. Both the server default (`server/src/index.ts`) and the Vite proxy target (`client/vite.config.ts`) are set to 3001. To change the port, set the `PORT` env var on the server and update the proxy target to match.

**To test:** open the same document in two browser tabs to see realtime presence + live annotation sync.

---

## Tech stack (as built)

| Layer | Choice |
|---|---|
| Monorepo | Bun workspaces (`client` / `server` / `shared`) |
| Server | Hono on Bun + `bun:sqlite` (abstracted → Postgres+pgvector later) |
| Client | React 18 + Vite 5 + TypeScript + Tailwind v4 |
| PDF→HTML | `pdf-parse` (Phase 0; → position-aware MinerU/Marker in Phase 1) |
| Realtime | Bun native WebSocket via Hono `createBunWebSocket` |
| Annotation | W3C Web Annotation model, `TextQuoteSelector` anchoring |

---

## Current state — Phase 0 complete ✅

### What works now

A group can **read a PDF together in realtime**:

- ✅ **PDF upload → HTML ingestion** with block-level anchors (`data-anchor="bN"`)
- ✅ **Reading surface** — renders converted HTML, reflowable, dark mode via CSS
- ✅ **Text selection → annotation** (comment / question / highlight / note) with tags
- ✅ **W3C TextQuoteSelector anchoring** — annotations store exact text + prefix/suffix context for disambiguation
- ✅ **Highlight rendering** — annotated text wrapped in yellow `<mark>`; prefix/suffix disambiguates multiple matches
- ✅ **Annotation popover** — draft panel floats at the selection location (not page bottom)
- ✅ **Threaded replies** — inline reply UI on annotations; replies inherit parent context
- ✅ **Tag support** — comma-separated tags on creation; tag chips displayed in sidebar
- ✅ **Filtering** — filter annotations by type (comment/question/highlight/note)
- ✅ **Realtime presence** — colored avatars showing who's reading now (top-right)
- ✅ **Live annotation sync** — others' annotations appear instantly via WebSocket
- ✅ **Click sidebar → scroll to highlight** — smooth scroll, centered
- ✅ **SQLite persistence** — groups, documents, annotations all persist

### Known limitations (Phase 0)

- **Single-user identity** — all annotations attributed to "you" (Phase 0 placeholder; real auth comes later)
- **PDF extraction is text-only** — `pdf-parse` extracts text but loses figures, tables, layout; scanned/image PDFs produce no selectable text (a red warning shows when this happens)
- **Highlight anchoring is first-match** — uses prefix/suffix to pick the best match among duplicates, but isn't bulletproof across complex layouts
- **No cross-document features yet** — annotations are per-document only
- **No AI layer yet** — the differentiating intelligence layer (RAG, clustering, synthesis) is unbuilt
- **No knowledge graph yet** — the emergent knowledge-structure spine is unbuilt
- **SQLite, not Postgres** — fine for dev; the DB layer is abstracted for a later swap

---

## File structure (source only)

```
BLUEPRINT.md                     ← vision, theory, feature taxonomy, roadmap (READ FIRST)
STATUS.md                        ← this file
README.md                        ← quickstart
package.json                     ← monorepo root, dev scripts
.gitignore

shared/                          ← shared TS types (W3C annotation model)
  src/types.ts                     Annotation, DocumentRecord, Group, TextQuoteSelector
  src/index.ts
  package.json

server/                          ← Hono API + SQLite + PDF ingestion
  src/index.ts                     API routes: groups, documents, annotations, WebSocket
  src/db.ts                        SQLite schema + connection
  src/ingest.ts                    PDF→HTML via pdf-parse (block-anchored paragraphs)
  src/realtime.ts                  Per-document rooms: presence + annotation broadcast
  package.json
  tsconfig.json

client/                          ← React + Vite + TS + Tailwind v4
  src/App.tsx                      Root: group picker → library → reader
  src/api.ts                       REST client + selectionToSelector() helper
  src/useRealtime.ts               WebSocket hook: presence + live annotation events
  src/components/
    Library.tsx                      Group document list + PDF upload
    Reader.tsx                       Reading surface + annotation UI (popover, sidebar, highlights)
  src/index.css                    Tailwind + prose + highlight styles
  src/main.tsx
  index.html
  vite.config.ts                   proxy /api → :3001
  package.json
  tsconfig.json
```

---

## Commit history (as of last update)

```
7221e26 ux: annotation popover floats at selection; click sidebar to scroll to highlight
1ac645a fix(Reader): move useMemo before early return — hooks order violation
9c8a76b Phase 0c: realtime collaboration — live annotation sync + presence
3522fa4 Phase 0b: highlight rendering, reply UI, tags, annotation filtering
77ec68a chore: default server port to 3001 (3000 occupied); fix dev scripts
efab2a7 Phase 0a: runnable foundation — PDF ingestion, reading surface, W3C annotations
```

---

## What's next — Phase 1 (the differentiating core)

Per the BLUEPRINT roadmap (§8), Phase 1 moves from "social annotation" toward "collective intelligence." Pick whichever increment appeals; they're roughly independent.

### Option A — Structured annotation schemas (BLUEPRINT R6)
Definable annotation types with fields per group (e.g. "claim", "evidence", "counterargument", "definition"). **The single highest-leverage differentiator per the empirical literature** — scaffolding is what separates higher-order reasoning from noise. Self-contained, no external deps.
- Files: `shared/src/types.ts`, `server/src/db.ts` (new schema table), new API routes, `client/src/components/Reader.tsx` (schema picker)

### Option B — AI layer (BLUEPRINT §5, Tier 1)
Grounded document Q&A (RAG) + theme clustering of annotations + tension map + diversity-preserving collective synthesis. **The differentiating heart of the tool.**
- **Needs an LLM** — do you have an API key (OpenAI / Anthropic / local Ollama)? This gates feasibility.
- Files: new `server/src/ai/` service (isolated), new client panels
- Requires adding a vector store (pgvector or in-memory for dev)

### Option C — Equity dashboard (BLUEPRINT C5)
Participation balance, turn-taking, voice-distribution visualization. Self-contained, high visual impact, directly enforces the "CI ≠ loudest" principle.
- Files: new `client/src/components/Equity.tsx`, server aggregation endpoint

### Option D — Blind first-pass mode (BLUEPRINT C4)
Annotations hidden until a participant has made their own — protects Surowiecki's independence condition.
- Files: `server/src/index.ts` (visibility logic), `client/src/components/Reader.tsx`

### Suggested order
A → C → D → B (build the scaffolding + equity + independence protections first, then add AI on top of a solid collective base). But if you have an LLM key, B is the most transformative and can start immediately.

---

## Open questions to resolve before/during Phase 1

From BLUEPRINT §9 — these gate design decisions:

1. **Primary persona** — academic seminar? classroom? citizen deliberation? analyst team? (Determines the feature spine.)
2. **Group scale** — 5–30 vs. 100s–1000s concurrent? (CI features change character with N.)
3. **Corpus size** — single doc, small set, large library? (Cross-doc/graph features only pay off at scale.)
4. **Sync vs. async primary model?** (Real-time facilitation vs. async synthesis differ.)
5. **LLM deployment** — cloud API acceptable? On-prem required? Budget per session? (Gates AI feasibility & latency.)
6. **Document confidentiality** — can content/annotations leave the trust boundary? (Hard gate on RAG pipelines.)
7. **Multilingual / cross-lingual needs?**
8. **Research prototype vs. production SLA?**
9. **Evaluation metrics** — engagement lift? learning gain? decision quality? diversity preservation?
10. **Governance & moderation** — who curates/deletes AI structures? Consent model for AI processing of annotations?

---

## How to pick up

1. `git pull` to get latest
2. `bun install` (in case deps changed)
3. `bun run dev:server` + `bun run dev:client` (two terminals)
4. Read this STATUS.md, then BLUEPRINT.md §8 (roadmap) for context
5. Pick an increment from "What's next" above
6. Update this file when you pause
