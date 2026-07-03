# Collective Reading Tool — Architectural & Conceptual Blueprint

> A next-generation web-based collective reading and knowledge-production platform.
> Status: Blueprint v0.1 — concept + architecture, pre-implementation.
> Date: 2026-07-03

---

## 0. How to read this document

This blueprint is built bottom-up: it first establishes **why** such a tool should exist and **what** the literature demands of it (§1–§3), then derives a concrete **feature taxonomy** of necessary / possible / exceptional capabilities (§4), an **AI augmentation strategy** with guardrails (§5), and finally a **technical architecture** and **phased roadmap** (§6–§8).

A consolidated **design-principles summary** and **citation-confidence notes** appear at the end (§9–§10).

---

## 1. Vision

The dominant paradigm for shared reading online is **comment-and-reply over a document** — Hypothesis, Perusall, Google Docs. This is social annotation, and it is valuable, but it is *not yet collective intelligence*. Social annotation captures the *raw material* of collective thought (highlights, comments, tags); it rarely **mobilizes** that material into shared, durable, evolving knowledge.

**The thesis of this tool:** a reading group is not a comment thread — it is a *knowledge-production collective*. The tool's job is to turn the act of reading together into the act of **thinking together**, producing artifacts that persist beyond any single session or document: living glossaries, argument maps, concept graphs, tension maps, and collective syntheses that *emerge* from the group's reading and that the group continuously refines.

> **One-line definition:** A collaborative reading surface for PDF/HTML where annotations are first-class, AI-augmented, and — crucially — feed an emergent, group-owned knowledge structure that turns reading into knowledge production.

The tool must therefore do three things at once:

1. **Read well** — an excellent immersive reading experience for PDF and HTML, with precise, anchoring-aware annotation.
2. **Think together** — make collective cognition *legible*: surface convergence, divergence, gaps, and under-heard voices.
3. **Produce knowledge** — grow a persistent, cross-document knowledge graph from annotations, AI extraction, and group curation.

---

## 2. Theoretical foundations

The design is grounded in four bodies of literature. Citations are given by author; bibliographic details requiring verification are flagged in §10.

### 2.1 Collective intelligence — the four foundational lenses

| Lens | Core claim | Design consequence |
|---|---|---|
| **Lévy (1994/1997)** — *Collective Intelligence* | Intelligence is distributed across people and artifacts and must be *mobilized in real time*; a collective knows *who knows what*. | Make skills, roles, and expertise legible so competencies can be activated — not just store annotations. |
| **Surowiecki (2004)** — *The Wisdom of Crowds* | Crowds are wise under four conditions: **diversity, independence, decentralization, aggregation**. Homogenization *destroys* CI. | Protect independence (blind first-pass annotation); measure and surface diversity; treat consensus as one outcome among many. |
| **Malone, Laubacher & Dellarocas (2010)** — *The CI Genome* | Every CI system combines four genes: **What** (Create/Decide/Predict), **Who** (Crowd/Hierarchy), **Why** (incentives), **How** (aggregation method). Most annotation tools use only the *Collection* gene and never invoke consensus, voting, markets, or structured deliberation. | Treat the tool as a deliberate combinatorial design; the frontier is the **aggregation gene**. |
| **Woolley et al. (2010, 2015)** — the "c" factor | A group has a general collective-intelligence capacity correlated with *social sensitivity, turn-taking, and equitable participation* — not with average/max individual IQ. | Design for equitable participation and visible turn-taking; amplify quiet voices. |
| **Mulgan (2017)** — *Big Mind* | CI is not emergent by default; it must be **engineered** through orchestration loops: observe → predict → judge → remember. | The tool must close the loop: aggregate → synthesize → feed back into next reading. |

**Synthesis:** the literature is unanimous that collective intelligence is *not* the sum of annotations. It requires (a) protecting the conditions that make crowds wise, (b) deliberate aggregation mechanisms, and (c) persistence/memory across time. Existing tools do (a) weakly, (b) barely, and (c) not at all.

### 2.2 Collaborative reading & social annotation — what the evidence supports

Drawing on the empirical literature (Perusall/King, Hypothesis/Kalir, Annotation Studio, Lacuna Stories, NB, COERLL):

| Claim | Evidence strength |
|---|---|
| Social annotation increases reading completion / pre-session preparation | **Strong, replicated** (esp. Perusall) |
| Improves engagement & social presence | **Moderate–strong** |
| Improves surface comprehension | **Moderate** |
| Improves critical thinking / higher-order reasoning | **Moderate but conditional** — depends on prompts, scaffolding, grouping |
| Produces durable knowledge artifacts beyond the reading | **Weak / under-studied** ← *this is the gap we target* |
| Supports equity / under-heard voices | **Emerging** (Kalir) |

**Key empirical insight:** unstructured annotation produces noise ("I agree"); **schema/prompt scaffolding** is the difference between annotation that produces higher-order reasoning and annotation that doesn't. The "confusion report" (Perusall) is a rare example of CI engineering — an aggregation mechanism over the crowd's annotations.

### 2.3 Knowledge-construction theory — what the tool should scaffold

- **Vygotsky** — social constructivism; learning happens in the *zone of proximal development* through interaction with more capable peers. → The tool should make peer expertise discoverable (ZPD-matching is a frontier feature).
- **Scardamalia & Bereiter** — *Knowledge-building* communities: discourse moves beyond "I think" toward collective improvement of ideas; ideas are *improvable artifacts*. → Annotations are not terminal; they are improvable.
- **Bloom** — higher-order thinking (analyze, evaluate, create) must be scaffolded, not left to emerge. → Prompt templates tiered by Bloom level.
- **Garrison's Community of Inquiry** — learning needs cognitive presence *and* social presence *and* teaching presence. → A facilitator role (human or AI) must exist.
- **Engeström — Activity Theory** — reading is a mediated, socially-situated activity system with rules, division of labor, and object. → The tool must make the *activity system* (roles, norms, shared object) visible.
- **Siemens — Connectivism** — knowledge lives in networks; learning is pattern-recognition across nodes. → The knowledge graph *is* the learning substrate.
- **Klein — Deliberatorium / computational deliberation; van Gelder — argument mapping** — structured argumentation (IBIS/Toulmin) produces better collective reasoning than flat discussion. → Argument maps as a first-class output.

### 2.4 Generative collective intelligence — from annotation to knowledge production

The frontier that no current tool inhabits well: moving from **annotating a text** to **producing a shared knowledge artifact**. Models to learn from:

- **Concept maps / argument maps** as emergent outputs of collective reading (Cohere's vision, but manual).
- **Shared glossaries** that converge across documents.
- **Polymath / Zooniverse** (Nielsen, *Reinventing Discovery*) — networked science where many contributors incrementally build a result; the tool should support *modular, improvable* contributions.
- **Wikipedia's NPOV model** — multiple viewpoints represented, not flattened.

---

## 3. Core design principles (literature-derived)

These principles govern every feature decision below.

1. **An annotation is an improvable artifact, not a terminal comment.** (Scardamalia & Bereiter)
2. **Protect independence before aggregation.** Blind first-pass modes; delayed visibility; measure diversity as a metric. (Surowiecki)
3. **Mobilize competencies.** Make who-knows-what legible; route passages/questions to the right reader. (Lévy)
4. **Make collective cognition legible.** Convergence, divergence, gaps, and equity must be *visible*, not implicit. (Woolley; Mulgan)
5. **Scaffold higher-order moves.** Prompt templates, schema, Bloom tiers — don't leave structure to chance. (Bloom; empirical annotation literature)
6. **Dissensus is a feature, not a failure.** Surface and preserve disagreement; never flatten minority perspectives. (Surowiecki; R3)
7. **Close the loop.** Aggregate → synthesize → feed back into the next reading. Memory across documents and sessions. (Mulgan)
8. **Augment, don't replace.** AI provokes before it answers; require human effort before unlocking synthesis. (§5)
9. **Provenance is sacred.** Every generated structure traces back to the humans (and AI acts) that produced it.
10. **Equity by construction.** Amplify under-heard voices; CI ≠ loudest-cluster intelligence. (Woolley)

---

## 4. Feature taxonomy

Features are classified into three tiers derived from the tool-landscape gap analysis:

- **Tier N — Necessary (table stakes).** What every modern collaborative reader must have; the baseline you cannot ship without. (Hypothesis/Perusall set the floor.)
- **Tier P — Possible / differentiating.** Feasible today, uncommon or poorly implemented; where the tool wins.
- **Tier E — Exceptional / frontier.** Cutting-edge, AI-native, or research-grade; where the tool *leads*.

### 4.1 Reading & document layer

| ID | Feature | Tier | Rationale |
|---|---|---|---|
| R1 | PDF → HTML conversion pipeline preserving structure (headings, paragraphs, reading order, figures, tables, citations) | N | Foundational; the reading surface is HTML. Use MinerU/Marker/Nougat-class converters; retain block-level addressability. |
| R2 | HTML-native reading surface with reflow, typography controls, dark mode, accessibility (WCAG AA, screen-reader) | N | Immersive reading is non-negotiable; existing tools are clunky here. |
| R3 | Block/position-addressable anchors (W3C TextQuoteSelector + TextPositionSelector + XPath/CSS) | N | Annotation must survive reflow and re-conversion; the W3C Web Annotation model is the standard. |
| R4 | Selection → highlight, note, question, tag, reply (threaded) | N | Baseline annotation vocabulary. |
| R5 | Multi-format ingest: PDF, HTML, EPUB, plain URL | N | A reading group reads varied sources. |
| R6 | **Structured annotation schemas / layers** — definable annotation types with fields (e.g. "claim", "evidence", "counterargument", "definition", "lived experience") | P | The single highest-leverage differentiator per the empirical literature: scaffolding separates higher-order reasoning from noise. (Annotation Studio's idea, rarely done well.) |
| R7 | **Figure/table/equation annotation** with caption anchoring | P | Academic PDFs are not just prose; existing tools lose figures. |
| R8 | **Reading-presence & shared cursor** over the document | P | Social presence (CoI); "reading together" feeling. |
| R9 | **Adaptive reading view** — difficulty leveling, glossary-on-hover, translation | P | Supports diverse-ability collectives; Lévy's mobilization. |
| R10 | **Multi-document reading workspace** with cross-document navigation | P | The unit of knowledge production is a *corpus*, not a page. |

### 4.2 Collaboration & social layer

| ID | Feature | Tier | Rationale |
|---|---|---|---|
| C1 | Reading groups / cohorts with roles (reader, facilitator, synthesizer, critic) and permissions | N | Lévy's competencies; Engeström's division of labor. |
| C2 | Threaded discussion on annotations; @mention; resolve/reopen | N | Baseline discourse. |
| C3 | Group activity feed & reading-progress dashboard | N | Social presence. |
| C4 | **Blind / independent first-pass mode** — annotations hidden until a participant has made their own | P | Surowiecki's independence condition; R4-anchoring mitigation. |
| C5 | **Equity dashboard** — participation balance, turn-taking, voice distribution | P | Woolley's "c" factor; CI ≠ loudest. |
| C6 | **Voting / endorsement / "I had the same thought"** (non-verbal aggregation) | P | Malone's aggregation gene — cheap consensus signal without forcing it. |
| C7 | **Structured deliberation moves** — propose, support, counter, question, synthesize (IBIS-flavored) | P | Klein/van Gelder; turns comment threads into argument structures. |
| C8 | **ZPD / expertise matching** — route a question/passage to the reader best positioned to engage | E | Lévy + Vygotsky; novel, little operational precedent. |
| C9 | **"Reading room" synchronous sessions** with live facilitation | P | Real-time CI for cohorts. |

### 4.3 Knowledge-production layer — *the differentiating spine*

This tier is where the tool moves from annotation to collective intelligence. **This is the gap no current tool fills.**

| ID | Feature | Tier | Rationale |
|---|---|---|---|
| K1 | **Living glossary** — terms auto-extracted from doc + annotations, definitions collaboratively refined, persists across documents | P | Connectivism; convergent knowledge artifact. |
| K2 | **Concept graph** — entities/claims as nodes, typed relations as edges, extracted from annotations + AI, group-curated | E | The core emergent structure; Cohere's vision made automatic. |
| K3 | **Argument map** — claims, evidence, counterarguments as a visual IBIS/Toulmin structure, derived from structured annotations | E | Klein/van Gelder; structured collective reasoning. |
| K4 | **Tension map** — surfaces points of convergence *and* divergence across the group | E | Dissensus-as-feature (P6); the antidote to homogenization. |
| K5 | **Collective synthesis** — diversity-preserving summary of the group's reading, attributed, improvable | E | The headline CI output (Malone's aggregation gene). |
| K6 | **Cross-document knowledge accumulation** — a persistent KB that grows across sessions; past annotations inform current reading | E | Mulgan's "memory"; the loop-closer. |
| K7 | **Provenance & link states** — every node/edge tagged human-authored / AI-suggested / group-confirmed; editable, declinable | P | P9; combats authority laundering. |
| K8 | **"Storylines"** — manually or AI-assisted threads linking annotations across documents into a narrative (Lacuna's idea, made emergent) | P | Cross-document synthesis. |
| K9 | **Knowledge-gap surfacing** — "everyone wondered, no one resolved"; drives next reading list | E | Drives the next iteration of the loop. |

### 4.4 AI augmentation layer

Detailed in §5. Headline features: grounded document Q&A, theme clustering, tension mapping, diversity-preserving collective synthesis, Socratic probing, cross-document linking, devil's advocate, facilitation summaries.

### Feature-tier summary

- **Necessary (N):** R1–R5, C1–C3 + a competent annotation model. This is the MVP floor — *not* sufficient to be "next-generation."
- **Possible (P):** R6–R10, C4–C7, C9, K1, K7, K8. This is the differentiating core.
- **Exceptional (E):** C8, K2–K6, K9 + the AI layer. This is the frontier and the product's identity.

---

## 5. AI augmentation strategy

### 5.1 Design philosophy: augment, don't replace

The AI must **surface and structure what the group already produced**, not generate opinion de novo. Synthesis = aggregation with provenance, not authorship. The AI is a *facilitator and a mirror*, never an oracle that does the reading for the group.

> COMMENT: What could also be sueful is further literature suggestions. Think when someone places a comment the AI could consult or inform of existing literature regarding the comment, and commented context.

**Twelve guardrail principles** (from the AI-augmentation research):

| # | Principle |
|---|---|
| P-AI1 | **Effort-first.** AI provokes before it answers; require human annotation before unlocking synthesis features. |
| P-AI2 | **Ground everything.** Every AI claim cites a source span or annotation; hallucination budget enforced with abstention ("I don't know"). |
| P-AI3 | **Provenance labels.** human-authored / AI-suggested / group-confirmed states on every generated structure; editable, declinable. |
| P-AI4 | **Diversity by construction.** Summarization/clustering optimize for viewpoint coverage, not centroid similarity; evaluated on diversity metrics, not only ROUGE. |
| P-AI5 | **Model the group, not just the document.** AI reasons about participation, convergence, gaps, equity — the *state of the collective*. |
| P-AI6 | **Transparency of mechanism.** Users see *why* a suggestion appeared (which annotations drove it). |
| P-AI7 | **Know when to stay silent** — see §5.4. |
| P-AI8 | **Dissensus-preserving.** Never melt viewpoints into an average; surface tension explicitly. |
| P-AI9 | **Consent & boundary.** Participants opt in to AI processing; confidential content never leaves the trust boundary without policy. |
| P-AI10 | **Augment the quiet.** Equity-aware: surface under-heard voices; don't amplify the dominant cluster. |
| P-AI11 | **Juxtapose, don't replace.** AI output sits *alongside* the source, never replacing the act of reading. |
| P-AI12 | **Retractable.** When source annotations change, derived structures update or are flagged stale. |

### 5.2 AI feature catalogue (ranked by composite impact = sensemaking-value × feasibility × differentiation)

**Tier 1 — ship first (highest composite impact):**

1. **Grounded document Q&A (RAG)** — chunk PDF/HTML, embed, retrieve top-k with inline citation spans; abstention enforced. *(feasible; table-stakes-but-collective when shared)*
2. **Theme clustering of annotations** — embed annotations, cluster (HDBSCAN), LLM-label clusters; turns 500 highlights into 8 readable themes with attribution. *(high value, feasible)*
3. **Tension map / divergence detection** — argument mining + stance detection; surface opposing claims as a visual map. *(the anti-homogenization signature feature)*
4. **Diversity-preserving collective synthesis** — multi-perspective summary weighted by participant, attributed, improvable. *(headline output)*

**Tier 2 — core differentiators:**

5. **Concept extraction & cross-document entity linking** → feeds the concept graph (K2).
6. **Living glossary generation** (K1) — terms + context-anchored definitions, converging across the corpus.
7. **Socratic probing** — adaptive question generation calibrated to annotation depth (Bloom-tiered); never gives the answer.
8. **Cross-document annotation linking** — "Reader B in doc 2 raised a related point" (requires K2/K6 infra).
9. **Facilitation summary** — "here's where the group agrees, disagrees, and what's unresolved" (C9 sessions).
10. **Knowledge-gap identification** (K9) — thinly-covered topics, unanswered questions.

**Tier 3 — frontier:**

11. **Devil's advocate / steelman** — constructive counter-argument to the dominant cluster; "what would change your mind?"
12. **Passage recommendation** — content + collaborative filtering; respect serendipity (include dissimilar-but-relevant).
13. **"Recommend a reader" matching** — route passages/questions by expertise graph (needs consent).
14. **Difficulty leveling & translation** — readability tiers, cross-lingual entity linking.
15. **AI-assisted concept/argument map construction** — proposed nodes/edges the group accepts/rejects (K2/K3).

### 5.3 Individual vs. collective AI

A critical distinction (from the research): individual-assistant features (summarization, Q&A, glossary) are *table-stakes and well-trodden* (NotebookLM, Perplexity). Their collective value emerges **only when outputs are shared and aggregated** — that is the differentiator. The architecture must treat individual-AI outputs as inputs to collective-AI synthesis, not as ends.

### 5.4 When the AI must stay silent

The AI stays silent (or defaults to passive presence) when:

1. **Low confidence / no grounding** — abstain rather than fabricate.
2. **Low annotation density** — not enough collective signal to synthesize; synthesizing noise is worse than silence.
3. **Contested or affective topics** — don't flatten genuine disagreement or personal experience into an "answer."
4. **Productive divergence in progress** — don't prematurely close an open exploration.
5. **First-read flow** — don't interrupt immersive reading; delayed/offers-only.
6. **Opt-out** — participant or group has disabled AI.
7. **Zero marginal value** — restating what's already obvious adds noise.

### 5.5 Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Hallucination in RAG/Q&A | High | Grounding, inline citations, abstention budget, user-editable source spans (P-AI2) |
| Privacy leakage to third-party LLMs | High | On-prem/local options, redaction, data-residency, consent (P-AI9) |
| Homogenization of thought | High | Diversity-preserving summarization, dissensus surfacing (P-AI4, P-AI8) |
| Anchoring bias from early summaries | Med-High | Delayed/optional summaries, blind-first-read mode (P-AI11) |
| Cognitive offloading / over-reliance | High | Effort-first UX (P-AI1) |
| Cost explosion at scale | Medium | Tiered/cached computation, sampling, batched async jobs |
| Cold-start for emergent structures | Medium | Seed from document structure + LLM extraction of source text |
| Authority laundering of AI links | Medium | Provenance labels, link states (P-AI3, K7) |

---

## 6. System architecture

### 6.1 Architectural principles

- **Open-standard annotation** (W3C Web Annotation) for portability and interoperability — learn from Hypothesis's openness, but add the intelligence layer Hypothesis lacks.
- **CRDT-based real-time collaboration** (Yjs) for conflict-free concurrent editing/annotation with offline support and presence.
- **Event-driven, agent-friendly** — both humans and AI agents produce/consume annotation events over a shared bus; no tight coupling between AI and the reading surface.
- **Graph-first knowledge layer** — a persistent knowledge graph (concepts, claims, relations) that is the substrate for all collective-intelligence features and that grows across documents.
- **LLM-agnostic, grounding-first** — the AI layer is a service boundary; any provider (cloud or local) plugs in, but all outputs are grounded and provenance-tagged.

### 6.2 High-level component map

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Web)                             │
│  React + TypeScript  │  TipTap/ProseMirror reading surface      │
│  Yjs provider (CRDT) │  Annotation overlay (W3C selectors)      │
│  Knowledge-graph viz │  Presence & shared cursor                │
└───────────────┬─────────────────────────────────────────────────┘
                │  WebSocket (Yjs sync) + REST/GraphQL (CRUD)
┌───────────────▼─────────────────────────────────────────────────┐
│                      APPLICATION SERVER                          │
│  Auth/identity & roles  │  Groups/cohorts  │  Permissions       │
│  Annotation service (W3C Web Annotation CRUD)                   │
│  Schema/layer service  │  Session/facilitation orchestration    │
└──────┬────────────────┬──────────────────────────┬──────────────┘
       │                │                          │
┌──────▼──────┐  ┌──────▼────────┐         ┌──────▼──────────┐
│  REALTIME    │  │  DOCUMENT      │         │  AI ORCHESTRATOR │
│  SYNC        │  │  PIPELINE      │         │  (event-driven)  │
│  Yjs server  │  │  PDF→HTML conv │         │  - RAG/Q&A       │
│  (WebSockets │  │  (MinerU/Marker│         │  - clustering    │
│   /Durable   │  │   /Nougat)     │         │  - synthesis     │
│   Objects)   │  │  Chunk+embed   │         │  - tension map   │
│              │  │  Anchor store  │         │  - facilitation  │
└──────────────┘  └────────────────┘         │  - probing       │
                                             │  LLM-agnostic     │
                                             └────────┬──────────┘
                                                      │
┌─────────────────────────────────────────────────────▼───────────┐
│                    KNOWLEDGE GRAPH STORE                         │
│   Concepts, claims, relations, glossary terms, argument nodes    │
│   Provenance tags (human/AI-suggested/group-confirmed)           │
│   Cross-document; persistent across sessions                     │
│   (Neo4j / Apache AGE / RDF-store)                               │
└──────────────────────────────────────────────────────────────────┘
       │                                          │
┌──────▼──────────┐                      ┌────────▼────────┐
│  ANNOTATION DB   │                      │  VECTOR STORE    │
│  (Postgres +     │                      │  (embeddings of  │
│   W3C JSON)      │                      │   chunks +       │
│                  │                      │   annotations)   │
└──────────────────┘                      └──────────────────┘
```

### 6.3 Key technology choices (recommended, swappable)

| Concern | Choice | Why |
|---|---|---|
| Real-time collaboration | **Yjs** (CRDT) | Conflict-free, offline-capable, network-agnostic; proven in production collaborative editors |
| Annotation standard | **W3C Web Annotation** (Data Model + Selectors) | Portability, interoperability, addressability that survives reflow |
| PDF→HTML conversion | MinerU / Marker / Nougat-class, retaining block-level addressability | Block-addressable HTML enables stable anchors and figures/tables |
| Frontend | React + TypeScript; ProseMirror/TipTap for reading surface; D3/Cytoscape for graph viz | Mature, ecosystem, accessibility |
| Realtime transport | WebSockets or Cloudflare Durable Objects | Low-latency presence + sync |
| Primary DB | PostgreSQL (annotations as W3C JSON; relational metadata) | Relational integrity + JSON flexibility |
| Knowledge graph | Neo4j / Apache AGE (Postgres graph) / RDF store (I would suggest simple in the beginning, and alternative would be FalkorDB) | Typed relations, cross-document traversal, provenance |
| Vector store | pgvector or dedicated (Qdrant/Weaviate) Great but pinecone is preferred | RAG + annotation clustering + semantic search |
| AI orchestration | Event-driven service; LLM-agnostic provider interface | Pluggable cloud/local; grounding-first |
| Auth | OIDC; group/role model | Cohort + role-based permissions (Lévy/Engeström) |

### 6.4 Data model — core entities

- **Document** → converted HTML with block anchors; source PDF retained.
- **Annotation** (W3C-compliant): `id, target{selector}, body{type, text, schema-fields}, creator, created, group, tags, thread, provenance{human|ai-suggested|group-confirmed}`.
- **Group/Cohort**: members, roles (reader, facilitator, synthesizer, critic), norms, permissions.
- **Concept node**: `id, label, type, definition, sources[], provenance, confidence`.
- **Relation edge**: `from, to, type{supports, counters, defines, relates-to, ...}, sources[], provenance`.
- **Glossary term**: `term, definition, documents[], contributors[], status{draft|confirmed}`.
- **Argument node**: `claim, type{claim|evidence|counter|question}, stance, sources[]`.
- **Synthesis artifact**: `collective summary, perspective views[], attribution[], version, derived-from[]`.
- **Session/facilitation log**: events, participation metrics, convergence/divergence state.

### 6.5 The collective-intelligence loop (Mulgan's orchestration)

```
 READ → ANNOTATE (independently) → AGGREGATE (cluster, vote, stance)
   → SYNTHESIZE (themes, tension map, collective summary)
   → STRUCTURE (concept graph, argument map, glossary)  [group-curated]
   → FEED BACK (gaps → next reading; synthesis → improvable artifact)
   → READ (next document, informed by persistent KB) → ...
```

The knowledge graph is the **memory** that closes the loop across documents and sessions — the thing no current tool has.

---

## 7. What makes this "next-generation" (vs. the field)

| Capability | Hypothesis | Perusall | Notion/Docs | Glasp/Readwise | Cohere | **This tool** |
|---|---|---|---|---|---|---|
| W3C open annotation | ✅ | ❌ | ❌ | ❌ | partial | ✅ |
| Confusion/analytics | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ (semantic, not just behavioral) |
| Structured schemas | partial | ❌ | ❌ | ❌ | ❌ | ✅ |
| Cross-doc synthesis | ❌ | ❌ | backlinks | ❌ | manual | ✅ (emergent + AI) |
| Knowledge graph | ❌ | ❌ | backlinks | ❌ | ✅ manual | ✅ **auto + curated** |
| Argument/tension maps | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Diversity-preserving synthesis | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| AI facilitation (Socratic, probing) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Equity / independence protection | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Persistent cross-session KB | ❌ | ❌ | partial | ❌ | ❌ | ✅ |

The white space: **annotation → emergent, group-owned knowledge structure, AI-augmented but diversity-preserving, persistent across documents.**

---

## 8. Phased roadmap

### Phase 0 — Foundation (MVP floor, Tier N)
- PDF→HTML pipeline with block anchors (R1)
- HTML reading surface + W3C annotation CRUD (R2–R4)
- Groups, roles, threaded discussion (C1–C3)
- Yjs real-time presence (R8 minimal)
- *Exit criterion: a group can read a PDF together and annotate it, with annotations surviving reflow.*

### Phase 1 — Differentiating core (Tier P)
- Structured annotation schemas/layers (R6)
- Blind first-pass mode + equity dashboard (C4–C5)
- Endorsement/voting aggregation (C6)
- Deliberation moves (C7)
- Living glossary (K1) + provenance/link states (K7)
- Grounded document Q&A (AI #1) + theme clustering (AI #2)
- *Exit criterion: reading produces structured, attributed, improvable knowledge artifacts, not just comments.*

### Phase 2 — Collective intelligence (Tier E)
- Concept graph (K2) + argument map (K3) + tension map (K4) + AI #3
- Diversity-preserving collective synthesis (K5) + AI #4
- Cross-document knowledge accumulation (K6)
- Knowledge-gap surfacing (K9) + AI #10
- Cross-document annotation linking (AI #8)
- *Exit criterion: the loop closes — the KB informs the next reading; dissensus is legible and preserved.*

### Phase 3 — Frontier
- ZPD/expertise matching (C8) + recommend-a-reader (AI #13)
- Devil's advocate / steelman (AI #11)
- AI-assisted map construction (AI #15)
- Synchronous reading-room facilitation (C9) + facilitation summaries (AI #9)
- Multi-lingual / cross-lingual reading (R9 advanced)

---

## 9. Open questions to resolve before build

| # | Question | Impact | Answer |
|---|---|---|---|
| Q1 | Primary persona(s) — academic seminar? classroom? citizen deliberation? analyst team? | Determines the feature "spine." | Academic seminar |
| Q2 | Group scale — 5–30 vs. 100s–1000s concurrent? | CI features change character with N. | 5-30 per group will be enough |
| Q3 | Corpus size — single doc, small set, large library? | Cross-doc/graph features only pay off at scale. | I would say we can create projects that will have a small set of texts |
| Q4 | Sync vs. async primary model? | Real-time facilitation vs. async synthesis differ. | what works most convenient |
| Q5 | LLM deployment — cloud API acceptable? On-prem required? Budget per session? | Gates AI feasibility & latency. | Yes cloud solution, cheap model like GLM5.2 of Z.ai |
| Q6 | Document confidentiality — can content/annotations leave the trust boundary? | Hard gate on RAG pipelines. | We have to create user bases and groups. Users are edited to specific groups will only be visible there, unless we specifically indicate public access. |
| Q7 | Multilingual / cross-lingual needs? | Affects translation & entity-linking scope. | Let's focus on English first |
| Q8 | Research prototype vs. production SLA? | Affects guardrail rigor & evaluation. | Research prototype first |
| Q9 | Evaluation metrics — engagement lift? learning gain? decision quality? diversity preservation? | Needed per-feature before build. | Learning and collective satisfaction are key |
| Q10 | Governance & moderation — who curates/deletes AI structures? Consent model for AI processing of annotations? | Design before build. | Yes consent is necessary and manual override shoudl be possible |

---

## 10. Citation-confidence & follow-up notes

This blueprint synthesizes research from a literature/theory pass, a tool-landscape analysis, and an AI-augmentation analysis. Conceptual content and core claims are drawn from well-established sources and are reliable. **Bibliographic metadata (exact years, venues, co-author orderings) should be verified against primary sources before any academic/grant use.** Items to confirm:

- Lévy, *Collective Intelligence* (1994/1997 translation) — reliable.
- Surowiecki, *The Wisdom of Crowds* (2004) — reliable.
- Malone, Laubacher & Dellarocas, "The Collective Intelligence Genome," *MIT Sloan Management Review* (2010) — reliable.
- Woolley et al., *Science* ("c" factor) — verify exact year (2010; follow-up 2015).
- Mulgan, *Big Mind* (2017) — reliable.
- King on Perusall / social annotation — verify exact venue/year (~2017, *On the Horizon*).
- Kalir — social annotation scholarship; verify exact book/journal titles (~2021).
- Scardamalia & Bereiter (knowledge building) — verify *American Psychermanist* year.
- Garrison et al., Community of Inquiry — verify 2000 venue/title.
- Klein (Deliberatorium) and van Gelder (argument mapping) — verify publications.
- Nielsen, *Reinventing Discovery* (2012) — reliable.
- 2024–2025 research on LLM-mediated collective sensemaking, AI-facilitated deliberation, diversity-aware summarization, argument mining on annotated corpora — **targeted literature search recommended** (Semantic Scholar / ACL Anthology / arXiv cs.HC, cs.CL, cs.CY) before citing recent work.

**Recommended next research steps:**
1. Verify citations (above) for any publishable artifact.
2. Targeted literature search on: LLM-mediated collective sensemaking; effect of structured argumentation (IBIS/Toulmin) on collective-reading outcomes; cross-text synthesis & post-reading knowledge persistence; ZPD-matching algorithms for reading groups.
3. Prototype spike of Tier-1 AI features (grounded RAG, theme clustering + tension map, diversity-preserving synthesis) — highest composite impact.
4. Resolve Q1–Q10 before feature prioritization for a build phase.

---

## 11. One-paragraph summary

A collective reading tool worthy of the name "next-generation" must do three things at once: provide an excellent reading surface for PDF/HTML with precise, W3C-standard, schema-scaffolded annotation; make the group's collective cognition *legible* by protecting independent thought and surfacing convergence, divergence, gaps, and equity; and — the part no current tool does well — turn annotations into an emergent, group-owned, cross-document knowledge structure (concept graphs, argument maps, tension maps, living glossaries, diversity-preserving syntheses) that closes the collective-intelligence loop and persists across sessions. AI augments this as a grounded, provenance-tagged, diversity-preserving facilitator that provokes before it answers and stays silent when the group needs to think — never an oracle that does the reading for the collective.
