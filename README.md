# Collective Reading

A next-generation web-based collective reading & knowledge-production tool.
See [`BLUEPRINT.md`](./BLUEPRINT.md) for the full architectural & conceptual blueprint.

## Status — Phase 0a (runnable foundation)

- Document library + PDF upload → HTML ingestion with block anchors
- Reading surface rendering converted HTML
- Text-selection annotation (highlight / comment / question) using W3C Web Annotation `TextQuoteSelector`
- Threaded annotations, groups, REST API, SQLite persistence

> Realtime presence (Yjs), structured schemas, AI layer, and the knowledge graph
> arrive in later increments per the blueprint roadmap.

## Tech stack

- **Monorepo**: Bun workspaces (`client` / `server` / `shared`)
- **Server**: Hono on Bun + `bun:sqlite` (abstracted → Postgres+pgvector later)
- **Client**: React + Vite + TypeScript + Tailwind v4
- **PDF→HTML**: `pdf-parse` (Phase 0) → position-aware converter (Phase 1)

## Getting started

```bash
bun install

# terminal 1 — API server on :3000
bun run dev:server

# terminal 2 — Vite client on :5173
bun run dev:client
```

Open http://localhost:5173 — create a group, upload a PDF, read & annotate.

## Layout

```
shared/   # shared TS types (W3C annotation, document, group)
server/   # Hono API + SQLite + PDF ingestion
client/   # React reading surface + annotation UI
```
