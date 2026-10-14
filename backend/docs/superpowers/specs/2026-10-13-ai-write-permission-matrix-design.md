# AI Write-Action Permission Matrix — Design Spec

Date: 2026-10-13
Status: Approved (conversational design), pending written-spec review
Related Notion task: صمّم مصفوفة صلاحيات شات AI للإضافة/التعديل/الحذف

## 1. Problem

The smart import engine (shipped 2026-10-10 → 2026-10-13) introduced
AccoNova's first AI tools that write business data
(`smart_import_propose`/`revise`/`confirm`). Building and reviewing it
surfaced a narrow, import-specific version of several problems every
future AI write action will also face:

- What permission(s) does a write action need, beyond the broad
  "AI may write at all" gate?
- When does a write need an *extra* confirmation step, beyond the
  model's own judgment?
- How is an AI-initiated write audited the same way a human-initiated
  one is?
- How does a user cancel or recover from an AI action in progress?

This spec generalizes the narrow answers the import engine gave into a
reusable matrix every future `AiWriteTool` follows, and applies that
matrix back onto the import tools to close three gaps their own final
review explicitly deferred here.

## 2. Non-Goals

- Building a new, concrete *destructive* (delete) AI tool. This spec
  defines how one would plug into the severity/confirmation system; it
  does not ship one.
- Second-person approval (a different user, e.g. a manager, signing off
  on an AI action before it runs). Every write action in this spec is
  confirmed by the same user who initiated it, via an explicit chat
  turn. The existing `ApprovalWorkflowService` (Finance-specific,
  threshold-based, second-person) is not touched or generalized here —
  noted as a natural extension point for later, not built now.
- Configurable per-tenant severity thresholds (e.g. "treat updates over
  $X as destructive"). Severity is a fixed property of the action type,
  not a workspace setting.

## 3. Severity Tiers

A new `WriteActionSeverity` enum (`App\Enums\WriteActionSeverity`):

- `Standard` — create/update. Requires `ai.business_data.write` plus
  the target entity's own permission (unchanged from today). Needs
  exactly one explicit user confirmation, which may happen in the same
  conversation across turns (the existing propose → revise* → confirm
  flow).
- `Destructive` — delete, or any action with no practical undo.
  Requires the same permissions, **plus**: the tool that performs the
  destructive step must never execute in the same planner turn as the
  tool call that produced its target. This is exactly the rule already
  built for `smart_import_confirm` (2026-10-13 final-review fix),
  generalized.

`AiWriteTool` (the existing contract) gains one new method:

```php
public function severity(): WriteActionSeverity;
```

`AiToolPlanner::plan()`'s existing `enforceConfirmRequiresPriorPreview()`
filter (today, hardcoded to the three import tool names) is replaced by
a generic rule: for every call in a planned batch, if that tool's
`severity()` is `Destructive`, drop it from the batch if any OTHER call
in the same batch is a `Standard`-or-higher-severity write call that
could have produced its target. Concretely: at most one write call of
any severity survives per plan, and a `Destructive` call surviving
requires it be the *only* write call in that plan (never paired with
a propose/revise-shaped call in the same turn). `smart_import_propose`/
`revise` declare `severity(): WriteActionSeverity::Standard`;
`smart_import_confirm` declares `Destructive` — its `commit()` writes
real rows with no built-in rollback, matching this section's own
definition of `Destructive` better than `Standard`'s "create/update"
framing. This also turned out to be load-bearing, not just more
accurate: a purely `Standard`-based cap-at-one-first-wins rule does not
reproduce the old hardcoded filter's order-independence (a plan listing
`confirm` before `propose` would let confirm win the cap and commit a
stale draft), while classifying `confirm` as `Destructive` closes that
gap for free, since the `Destructive` rule above already drops a call
that only survived by beating another write call.

## 4. Audit: extend `AiToolRun`, don't build a new table

New nullable JSON columns on `ai_tool_runs`: `before_payload`,
`after_payload` — same shape/intent as `FinanceAuditEvent`'s columns,
reused on the table that already captures every AI tool call (read and
write). A tool that mutates data populates these when it calls
`recordRun()` (the existing logging path in `AiAssistantOrchestrator`)
succeeds; a read-only tool leaves both null, same as today.

For the import tools: `confirm` records `before_payload: null`
(records are newly created, not updated-in-place at the Party/Product/
Staff level — Task 4-12's duplicate-mode logic can update an existing
record, in which case `before_payload` is that record's prior field
values) and `after_payload` as the entity's own `commit()` summary
(`{created, updated, skipped, total}`) plus the committed `target_entity`
and row count. `propose`/`revise` record the classification result
(`target_entity`, confidence) as `after_payload` with `before_payload`
being the draft's prior classification state (useful for diagnosing the
I1-class bug class: "what did propose overwrite").

## 5. Closing the three deferred import-engine findings

### 5.1 Richer preview + validation (closes I2)

`ImportableEntity` gains one new method:

```php
/** @return array{valid_rows:int, error_rows:int, errors:list<array{row:int,message:string}>} */
public function preview(Collection $rows): array;
```

`PartyImportable`/`ProductImportable` delegate to the existing
`ImportPartiesFromSpreadsheet::preview()`/`ImportProductsFromSpreadsheet::preview()`
(already built, already used by the manual import wizards — this spec
just wires the AI path to call them too). `StaffMemberImportable` adds
an equivalent dry-run validation (reusing `UpsertStaffMemberFromImport`'s
same per-row checks, without the `DB::transaction`/write).

`SmartImportProposeTool`/`SmartImportReviseTool` call `preview()` after
remapping rows via the classifier's `field_mapping`, and include
`field_mapping`, `valid_rows`, `error_rows`, and `errors` (capped at a
reasonable sample, e.g. first 10) in their returned payload — so the
answer model can actually tell the user what will happen and what's
wrong, before confirm.

`SmartImportConfirmTool::execute()` wraps the `commit()` call: on
`ValidationException`/`InvalidArgumentException`, catch it and return a
structured result (`{status: 'rejected', errors: [...]}`) instead of
letting the generic orchestrator catch turn it into "The tool could not
return data." The draft stays `STATUS_DRAFT` on this path (unchanged
behavior — only the error's visibility to the user improves).

### 5.2 AI usage billing (closes I3)

`ImageRowExtractor::extract()`'s return type changes from
`Collection<int, array<string, mixed>>` to
`array{rows: Collection<int, array<string, mixed>>, usage: array{input_tokens:int, output_tokens:int, total_tokens:int}}`.
`AiAssistantController::extractImportRows()` (the controller's eager
extraction step) bills this usage the same way it already bills the
`image` field's analysis (`$credits->consumeOverage(...)`).

`ImportClassifier::classify()`'s usage (already present on
`AiGateway::chat()`'s response, currently discarded) is returned
alongside the classification result and added to
`AiAssistantOrchestrator::chat()`'s `$answer['total_tokens']` accumulator,
the same way planner and answer-call usage already accumulate today.

### 5.3 Draft lifecycle (closes I4)

- New tool `smart_import_cancel` (`severity(): Standard`, same
  ownership-scoped lookup as the other three): sets
  `status = AiImportDraft::STATUS_CANCELLED` if currently `STATUS_DRAFT`
  (same locked-reload pattern as revise/confirm — re-check status under
  `lockForUpdate()` before saving, for the same race-safety reason).
- `propose`/`revise`/`confirm`/`cancel` all add `ai_conversation_id` to
  their ownership-scoped lookup (`where('user_id', ...)->where('ai_conversation_id', ...)`),
  not just `user_id` — a draft from one conversation can no longer be
  acted on from a different conversation, even by the same user.
- `confirm` additionally rejects (same `RuntimeException` path as the
  existing status guard) a draft whose `created_at` is older than a
  fixed 24-hour window. No new column needed — this reads the existing
  timestamp.

## 6. Error Handling

- A `Destructive`-severity call dropped by the planner's filter is
  silently removed from that turn's plan (same as the existing
  propose+confirm filter) — the model's next turn can retry it alone,
  same UX as today's import confirmation flow.
- `preview()`/validation failures surface as structured, row-level
  errors through the tool's own return value (never a thrown exception
  the orchestrator's generic catch has to translate), except genuinely
  unexpected failures (e.g. a DB connection error), which still
  propagate and get logged via the existing `recordRun()` failure path.
- Billing failures (if `consumeOverage` itself fails) follow the
  existing `rescue(..., report: true)` pattern already used for the
  image branch — never block the user-facing response over a billing
  hiccup.

## 7. Testing

- `WriteActionSeverity` enum + `AiToolPlanner`'s generalized filter:
  unit/feature tests proving a `Destructive` call is dropped when
  paired with any other write call, and survives alone.
- `ai_tool_runs.before_payload`/`after_payload`: a migration test plus
  one feature test per import tool proving the columns are populated
  with the right shape on a real commit/propose/revise.
- `ImportableEntity::preview()`: one test per entity (Party, Product,
  Staff) proving it reports the same valid/error counts the existing
  wizard-path `preview()`/dry-run already proves for its own tests —
  no new validation logic, just a new call site.
- Billing: a test proving an image-based import's token usage reaches
  `consumeOverage` (mirroring the existing image-branch test), and a
  test proving the classifier's usage reaches the final `total_tokens`.
- Draft lifecycle: `smart_import_cancel`'s happy path + its locked
  status guard (mirroring revise/confirm's existing lock tests);
  conversation-scoping tests for all four tools (a draft from
  conversation A is unreachable from conversation B, same user); the
  24-hour confirm-age-limit test.

## 8. Rollout

This is one iteration, not phased — every piece above (severity enum,
planner generalization, audit columns, the three import-engine fixes,
the new cancel tool) ships together, since the import tools are both
the only existing consumer of this system and the concrete proof it
works. Future AI write tools (e.g. a hypothetical delete tool, or write
tools for Finance/Production/Governance) are out of scope; they adopt
this same system when they're built, per this spec's §3-4.
