# Smart Import Engine — Design Spec

Date: 2026-10-10
Status: Approved (conversational design), pending written-spec review
Related Notion task: Acconova: صمّم محرك الاستيراد الذكي الشامل

## 1. Problem

Acconova currently has separate, hand-built import flows per domain
(Parties, Products, Staff, Finance), each with its own fixed
spreadsheet template, controller, and preview/commit pair. Adding a
new importable entity means writing a new wizard from scratch.

The goal is a single, AI-driven import path that:

- Accepts a file of any type (spreadsheet first; image, then PDF/DOCX
  later) with an optional free-text hint from the user.
- Lets the AI infer what the data represents and which module it
  belongs to, across the whole app, not one page.
- Never commits automatically. The user always sees a preview and can
  ask for changes in natural language ("عدّل هاي الشغلة") before giving
  an explicit final confirmation.
- Lives inside the existing general AI Assistant chat, not a separate
  wizard page.

## 2. Non-Goals (this iteration)

- PDF and DOCX extraction — deferred; would require a new Composer
  dependency, which needs explicit approval first per project rules.
- Full write-permission matrix for all AI chat actions — that is a
  separate task (scheduled 2026-10-11). This spec only defines the
  narrow permission gate needed for import commits; tomorrow's task
  generalizes it to every AI write action.
- Importing into modules without an existing create/update Action
  (Finance, Production, Governance, Documents, etc.). Rolled out
  per-module as follow-up tasks register new catalog entries.

## 3. User Flow

1. User uploads a file in the AI Assistant chat, optionally with a
   text hint ("هدول موظفين جدد").
2. AI extracts structured rows from the file and classifies which
   module they belong to, then proposes a mapping and shows a preview
   (counts, sample rows, any rows it's unsure about).
3. User replies in plain language to adjust anything. The AI revises
   the same draft and re-shows the preview. This can repeat any number
   of times.
4. User gives an explicit confirmation. Only then does the system
   validate and commit, through the same domain Actions the normal UI
   uses (e.g. `CreateParty`, `UpdateParty`).
5. User gets a summary (created/updated/skipped/error counts), same
   shape as existing import summaries.

## 4. Architecture

### 4.1 Two-phase pipeline: Extraction → Classification → Commit

- **Extraction**: file → generic rows (`list<array<string, mixed>>`).
  One extractor per source type:
  - `SpreadsheetRowExtractor` — reuses the existing CSV/XLSX/JSON
    parsing already used by the per-domain importers.
  - `ImageRowExtractor` — wraps the existing `AiImageAnalyzer` to pull
    structured data out of a photo/scan.
  - PDF/DOCX extractors: not built this iteration (see Non-Goals).
- **Classification**: rows + optional user hint → target entity +
  field mapping. Driven by the AI, constrained to the
  `ImportDestinationCatalog` (section 4.3) so it can only propose
  destinations that actually exist and have a commit path.
- **Commit**: reuses the existing per-domain preview/execute Actions
  (`ImportPartiesFromSpreadsheet`, equivalent Product/Staff actions)
  so validation and business rules are never bypassed. The AI layer
  never writes to the database directly.

Rejected alternatives:
- Single AI call that returns commit-ready data directly: faster to
  build, but no seam to enforce per-module validation/business rules
  before writing, and hard to extend safely to new modules.
- Heuristic-only classification with AI as fallback: cheaper, but
  fails the "AI understands content" requirement for unstructured
  input (e.g. a handwritten list photo) which has no headers to sniff.

### 4.2 `AiImportDraft` model (new)

Holds the state of one in-progress import across chat turns, so
"عدّل هاي الشغلة" can edit the same draft instead of losing context.

Table `ai_import_drafts`:

| Column | Type | Notes |
|---|---|---|
| id | bigint pk | |
| organization_id | fk | tenant scope, via `BelongsToOrganization` |
| ai_conversation_id | fk → ai_conversations | |
| user_id | fk → users | |
| source_file_name | string | |
| source_file_type | string | `spreadsheet` \| `image` |
| target_entity | string, nullable | e.g. `party`, `product`, `staff_member` |
| extracted_rows | json | generic rows from the extraction phase |
| field_mapping | json, nullable | proposed column → field mapping |
| ai_notes | text, nullable | AI's own notes/uncertainty flags shown in preview |
| status | string | `draft` \| `confirmed` \| `committed` \| `cancelled` |
| commit_summary | json, nullable | created/updated/skipped/error counts, set after commit |
| created_at / updated_at | timestamps | |

Standard tenant scoping (global scope on `organization_id`) matching
`PartyRole`'s pattern. Soft deletes not needed — a draft is disposable
once `committed` or `cancelled`.

### 4.3 `ImportDestinationCatalog` (new)

A registry describing which entities can currently be targeted and
how to commit to them. Each entry implements a small
`ImportableEntity` contract:

```php
interface ImportableEntity
{
    public function key(): string; // 'party', 'product', 'staff_member'
    public function label(): string; // shown to the AI for classification
    public function fieldSchema(): array; // field name => description/type, for the AI prompt
    public function requiredPermission(): string; // e.g. 'parties.create'
    public function commit(Collection $rows): array; // delegates to existing domain Action
}
```

V1 registers three entries only: Party, Product, StaffMember — the
three domains that already have working preview/execute Actions to
delegate to. New entries are added as their own follow-up tasks; the
AI tool and draft model do not change when a new entity is registered.

### 4.4 `SmartImportTool` (new AI tool)

A new tool exposed to the AI Assistant chat, separate from the
existing read-only `AiBusinessTool` contract (those tools never write).
Three operations, mirroring the user flow:

- `propose(file, hint?)` → runs extraction + classification, creates
  an `AiImportDraft`, returns the preview payload.
- `revise(draft_id, instruction)` → re-runs classification against the
  same extracted rows with the new instruction folded in, updates the
  draft, returns the updated preview.
- `confirm(draft_id)` → checks the permission gate (4.5), validates,
  commits via the catalog entry's `commit()`, marks the draft
  `committed`, returns the summary.

### 4.5 Permission gate (narrow, for this spec only)

`confirm()` must check **both**:
1. A new `ai.business_data.write` permission key (registered in
   `WorkspaceFeaturePermissions::groups()` under the existing `ai`
   group), confirming the user may let the AI write data at all.
2. The target entity's own `requiredPermission()` (e.g.
   `staff.create`), using the existing permission-check path — the AI
   never gets to bypass a module's normal permission rules.

This is intentionally minimal. The 2026-10-11 task designs the full
write-action permission matrix for all AI chat tools; when that lands,
`SmartImportTool::confirm()` should be updated to go through whatever
general gate that design introduces instead of checking
`ai.business_data.write` directly.

## 5. Error Handling

- Extraction failure (corrupt file, unsupported type) → draft is not
  created; AI responds with a clear reason, same tone as existing
  `ImportSourceController` validation messages.
- Classification lands on no matching catalog entry, or confidence is
  low → draft is still created (`status: draft`) but `target_entity`
  is null and `ai_notes` explains the ambiguity; the AI asks the user
  to clarify rather than guessing silently.
- Commit-time validation errors (e.g. a row fails domain validation)
  → follow the existing per-domain behavior: nothing is written,
  errors are surfaced per row, same as `ImportPartiesFromSpreadsheet`.

## 6. Testing

- Feature tests per extractor (spreadsheet, image) covering valid and
  malformed input.
- Feature tests for the three-step tool flow (propose → revise →
  confirm) including: permission denial at confirm, low-confidence
  classification requiring clarification, and a full happy path that
  asserts the underlying domain Action actually ran (e.g. a Party row
  really appears afterward).
- No test coverage needed for PDF/DOCX or non-catalog entities — out
  of scope this iteration.

## 7. Rollout

1. This iteration: Party, Product, StaffMember catalog entries;
   spreadsheet + image extractors; narrow permission gate.
2. Follow-up tasks (not scheduled yet): register Finance, Production,
   Governance, Documents catalog entries one at a time; add PDF/DOCX
   extractors (pending dependency approval); fold the permission gate
   into the general AI write-action matrix once 2026-10-11's design
   lands.
