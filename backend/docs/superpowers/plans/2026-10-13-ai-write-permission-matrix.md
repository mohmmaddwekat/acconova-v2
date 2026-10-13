# AI Write-Action Permission Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the import engine's ad-hoc severity/confirmation/audit rules into a reusable system any future `AiWriteTool` follows, and apply it back to close the three gaps the import engine's final review deferred (richer preview/validation, AI usage billing, draft lifecycle).

**Architecture:** A new `WriteActionSeverity` enum and a `severity()` method on the `AiWriteTool` contract let `AiToolPlanner` generalize its import-specific "never confirm in the same turn as propose" rule into "never run a `Destructive` call alongside any other write call." `AiToolRun` gains `before_payload`/`after_payload` columns so it becomes the single audit trail for every AI tool call, read or write. The three existing import tools are updated to this contract and gain a fourth sibling, `smart_import_cancel`.

**Tech Stack:** Laravel 13, PHP 8.4, MySQL, PHPUnit.

**Spec:** `docs/superpowers/specs/2026-10-13-ai-write-permission-matrix-design.md`

## Global Constraints

- No second-person approval workflow in this iteration — every write is confirmed by the same user who initiated it (spec §2).
- No new concrete destructive (delete) tool ships in this iteration — only the mechanism that would gate one (spec §2).
- Severity is a fixed property of the action type, never a per-tenant configurable threshold (spec §2).
- Follow this repo's PHP conventions: constructor property promotion, explicit return/param types, curly braces on every control structure, PHPDoc array shapes.
- Run `vendor/bin/pint --dirty --format agent` after any PHP edit, before committing.
- Run the narrowest relevant test file/filter per task via `php artisan test --filter=... --compact`.

## Review Focus

- A `Destructive`-severity call paired with ANY other write call in the same plan (not just propose/confirm specifically) must be dropped — covered in Task 3.
- A draft from one AI conversation must be unreachable from a different conversation, even by the same user — covered in Task 2.
- `preview()`/validation errors must surface as structured, row-level data the tool returns, never as an exception the orchestrator's generic catch swallows into "The tool could not return data." — covered in Task 6.
- Image-row-extraction and classifier AI usage must reach billing (`consumeOverage`) exactly once each, not zero times (lost revenue) or twice (double-charged) — covered in Task 7.
- Confirming a draft older than the fixed age window must be rejected even though the draft's own status is still `draft` (it hasn't been touched, just aged out) — covered in Task 9.

---

### Task 1: `WriteActionSeverity` enum

**Files:**
- Create: `app/Enums/WriteActionSeverity.php`
- Test: `tests/Unit/WriteActionSeverityTest.php`

**Interfaces:**
- Produces: `App\Enums\WriteActionSeverity` backed enum with cases `Standard` and `Destructive` (string-backed, values `'standard'` and `'destructive'`, TitleCase keys per this repo's enum convention).

- [ ] **Step 1: Write the failing test**

```php
public function test_enum_has_exactly_two_cases(): void
{
    $this->assertSame(['Standard', 'Destructive'], array_map(fn ($case) => $case->name, WriteActionSeverity::cases()));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --filter=WriteActionSeverityTest --compact`
Expected: FAIL — class does not exist.

- [ ] **Step 3: Implement the enum** as a simple string-backed enum, matching the style of an existing enum in this repo (check `app/Enums/PartyType.php` or similar for the exact convention — attribute ordering, whether a `label()` helper method is present on siblings).

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --filter=WriteActionSeverityTest --compact`
Expected: PASS

- [ ] **Step 5: Format and commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Enums/WriteActionSeverity.php tests/Unit/WriteActionSeverityTest.php
git commit -m "feat: add WriteActionSeverity enum"
```

---

### Task 2: `AiWriteTool` contract gains `severity()` and conversation-scoped `execute()`

**Files:**
- Modify: `app/Services/AI/Contracts/AiWriteTool.php`
- Modify: `app/Services/AI/Tools/SmartImportProposeTool.php`
- Modify: `app/Services/AI/Tools/SmartImportReviseTool.php`
- Modify: `app/Services/AI/Tools/SmartImportConfirmTool.php`
- Modify: `app/Services/AI/AiWriteToolRegistry.php`
- Modify: `app/Services/AI/AiAssistantOrchestrator.php`
- Test: `tests/Feature/AI/Tools/SmartImportProposeToolTest.php`, `SmartImportReviseToolTest.php`, `SmartImportConfirmToolTest.php` (extend existing files)

**Interfaces:**
- Consumes: `WriteActionSeverity` (Task 1).
- Produces: `AiWriteTool::severity(): WriteActionSeverity`; `AiWriteTool::execute(User $user, array $arguments, AiConversation $conversation): array` (signature change — `AiConversation` added as a third, required parameter); `AiWriteToolRegistry::execute(User $user, string $name, array $arguments, AiConversation $conversation): array` (same parameter threaded through); `AiWriteToolRegistry::severityOf(string $name): ?WriteActionSeverity` (new method — resolves a registered tool by name and returns its `severity()`, or `null` if the name isn't registered).

This task makes every existing draft lookup in these three tools conversation-scoped: change
`AiImportDraft::query()->where('user_id', $user->id)->findOrFail($draftId)`
(and the equivalent `lockForUpdate()` variants) to also
`->where('ai_conversation_id', $conversation->id)`.

- [ ] **Step 1: Write the failing tests** — one new test per tool proving conversation-scoping:

```php
public function test_propose_rejects_a_draft_owned_by_a_different_conversation(): void
{
    $otherConversation = AiConversation::factory()->for($this->user)->create();
    $draft = AiImportDraft::factory()->for($this->user)->create([
        'ai_conversation_id' => $otherConversation->id,
        'status' => AiImportDraft::STATUS_DRAFT,
    ]);

    $this->expectException(ModelNotFoundException::class);
    app(SmartImportProposeTool::class)->execute($this->user, ['draft_id' => $draft->id], $this->conversation);
}
```

(Mirror this shape for revise and confirm, using each tool's own existing test fixtures/conversation property.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `php artisan test --filter=SmartImportProposeToolTest --compact` (and the revise/confirm equivalents)
Expected: FAIL — `execute()` doesn't accept a third argument yet, or the lookup isn't conversation-scoped yet.

- [ ] **Step 3: Implement the contract change and update all three tools, the registry, and the orchestrator call site.**

In `AiAssistantOrchestrator::chat()`, the call site that currently does
`$registry->execute($user, $name, $arguments)` becomes
`$registry->execute($user, $name, $arguments, $conversation)` — `$conversation` is already a parameter of `chat()`, just not threaded into this call yet.

Each tool's `severity()` returns `WriteActionSeverity::Standard`.

- [ ] **Step 4: Run tests to verify they pass, then run the full existing suite for these three tools plus the orchestrator test to confirm no regression**

Run: `php artisan test --filter=SmartImportProposeToolTest --compact`
Run: `php artisan test --filter=SmartImportReviseToolTest --compact`
Run: `php artisan test --filter=SmartImportConfirmToolTest --compact`
Run: `php artisan test --filter=AiAssistantOrchestratorSmartImportTest --compact`
Expected: all PASS.

- [ ] **Step 5: Format and commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/AI/Contracts/AiWriteTool.php app/Services/AI/Tools/SmartImportProposeTool.php app/Services/AI/Tools/SmartImportReviseTool.php app/Services/AI/Tools/SmartImportConfirmTool.php app/Services/AI/AiWriteToolRegistry.php app/Services/AI/AiAssistantOrchestrator.php tests/Feature/AI/Tools/SmartImportProposeToolTest.php tests/Feature/AI/Tools/SmartImportReviseToolTest.php tests/Feature/AI/Tools/SmartImportConfirmToolTest.php
git commit -m "feat: add severity() and conversation-scoped execute() to AiWriteTool"
```

---

### Task 3: Generalize the planner's single-write-call filter by severity

**Files:**
- Modify: `app/Services/AI/AiToolPlanner.php`
- Test: `tests/Feature/AI/AiAssistantOrchestratorSmartImportTest.php` (extend)

**Interfaces:**
- Consumes: `AiWriteToolRegistry::severityOf(string $name): ?WriteActionSeverity` (Task 2).
- Produces: `AiToolPlanner::plan()`'s filtering behavior — unchanged return shape.

Replace the existing hardcoded `enforceConfirmRequiresPriorPreview()`-style method (named per whatever the Task 14-era implementation actually called it — read the current file first) with a severity-driven version:

1. Among the calls that survive the existing per-call `available()` check, partition them into write-tool calls (anything `$writeTools->available($user, $name)` is true for) and everything else.
2. If there is more than one write-tool call, keep only the first (this is the existing "cap at one write call per plan" behavior — preserve it, don't remove it).
3. If exactly one write-tool call survives and `$writeTools->severityOf($name) === WriteActionSeverity::Destructive`, and that call's presence in the ORIGINAL (pre-filter) list was accompanied by any OTHER write-tool call (i.e., it was paired with something before step 2 dropped the others), drop it too — a destructive call that had to win a fight to survive is not allowed to run alone either, since the thing it "won against" is exactly the preview/propose step a destructive action must never be batched with.

This means: `Standard` severity calls behave exactly as today (cap at one, no special same-batch rule). A `Destructive` call only survives when the model proposed it completely alone in that plan.

Since no real `Destructive`-severity tool exists yet, write the test against a minimal test-double: define a small private/test-local class implementing `AiWriteTool` with `severity(): WriteActionSeverity::Destructive`, register it into a throwaway `AiWriteToolRegistry`-shaped double for this one test (check how the existing `AiAssistantOrchestratorSmartImportTest` constructs its dependencies — follow the same DI/container-binding approach rather than inventing a new one).

- [ ] **Step 1: Write the failing test**

```php
public function test_a_destructive_call_paired_with_any_other_write_call_is_dropped(): void
{
    // Fake planner HTTP response proposing both smart_import_propose and a
    // test-double destructive tool call for the same draft, then assert
    // only one (or neither) reaches execute() — never both, and the
    // destructive one specifically never reaches execute() when paired.
}

public function test_a_destructive_call_alone_in_a_plan_survives(): void
{
    // Same test-double, proposed alone — assert it DOES reach execute().
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `php artisan test --filter=AiAssistantOrchestratorSmartImportTest --compact`

- [ ] **Step 3: Implement the generalized filter in `AiToolPlanner::plan()`**

- [ ] **Step 4: Run tests to verify they pass, plus the existing propose+confirm-same-turn test still passes unchanged**

Run: `php artisan test --filter=AiAssistantOrchestratorSmartImportTest --compact`
Expected: PASS, including the pre-existing `test_orchestrator_never_executes_a_confirm_call_planned_alongside_propose_in_the_same_turn`.

- [ ] **Step 5: Format and commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/AI/AiToolPlanner.php tests/Feature/AI/AiAssistantOrchestratorSmartImportTest.php
git commit -m "feat: generalize the planner's write-call filter by severity"
```

---

### Task 4: `before_payload`/`after_payload` on `ai_tool_runs`

**Files:**
- Create: `database/migrations/2026_10_13_190000_add_audit_payloads_to_ai_tool_runs_table.php`
- Modify: `app/Models/AiToolRun.php`
- Modify: `app/Services/AI/AiAssistantOrchestrator.php`
- Test: `tests/Feature/AiToolRunAuditTest.php`

**Interfaces:**
- Produces: `ai_tool_runs.before_payload`, `ai_tool_runs.after_payload` — nullable `json` columns. `AiToolRun`'s casts gain `'before_payload' => 'array'`, `'after_payload' => 'array'`, added to `$fillable`.
- Convention (used by Task 6/8's tools): a write tool's returned array may include an `'audit'` key shaped `array{before?: array<string,mixed>, after?: array<string,mixed>}`. `AiAssistantOrchestrator`'s tool-execution loop extracts this key (if present) before building the result it folds into the LLM-facing context, and passes `before`/`after` into `recordRun()`. A result with no `'audit'` key records both columns as `null`, same as every tool today.

- [ ] **Step 1: Write the migration** (two nullable `json` columns, no default, same style as the existing `ai_tool_runs` columns — check the original `2026_09_22_090000_create_ai_tool_runs_table.php` migration for the exact `Schema::table`/column style to match).

- [ ] **Step 2: Write the failing test**

```php
public function test_a_tool_result_with_an_audit_key_is_recorded_on_the_tool_run(): void
{
    // Dispatch a tool whose result includes ['audit' => ['before' => [...], 'after' => [...]]]
    // and assert the resulting ai_tool_runs row's before_payload/after_payload match.
}

public function test_a_tool_result_without_an_audit_key_records_null_payloads(): void
{
    // An existing read tool's call still records null/null, unchanged.
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `php artisan test --filter=AiToolRunAuditTest --compact`

- [ ] **Step 4: Run the migration, update `AiToolRun`, and update `AiAssistantOrchestrator::recordRun()`'s signature/call site to accept and persist the optional `before`/`after` values, extracting them from the tool result's `'audit'` key (and stripping that key out of the value shown to the LLM, so the model never sees its own audit trail as if it were business data).**

- [ ] **Step 5: Run tests to verify they pass**

Run: `php artisan test --filter=AiToolRunAuditTest --compact`
Run: `php artisan test tests/Feature/AI --compact` (confirm no regression to any existing tool's recorded run)

- [ ] **Step 6: Format and commit**

```bash
vendor/bin/pint --dirty --format agent
git add database/migrations/2026_10_13_190000_add_audit_payloads_to_ai_tool_runs_table.php app/Models/AiToolRun.php app/Services/AI/AiAssistantOrchestrator.php tests/Feature/AiToolRunAuditTest.php
git commit -m "feat: add before/after audit payloads to ai_tool_runs"
```

---

### Task 5: `ImportableEntity::preview()` for Party, Product, Staff

**Files:**
- Modify: `app/Services/AI/Import/Contracts/ImportableEntity.php`
- Modify: `app/Services/AI/Import/Entities/PartyImportable.php`
- Modify: `app/Services/AI/Import/Entities/ProductImportable.php`
- Modify: `app/Services/AI/Import/Entities/StaffMemberImportable.php`
- Test: `tests/Feature/AI/Import/PartyImportableTest.php`, `ProductImportableTest.php`, `StaffMemberImportableTest.php` (extend existing files)

**Interfaces:**
- Produces: `ImportableEntity::preview(Collection $rows): array{valid_rows:int, error_rows:int, errors:list<array{row:int,message:string}>}` (new contract method).

`PartyImportable`/`ProductImportable` delegate to `ImportPartiesFromSpreadsheet::preview()`/`ImportProductsFromSpreadsheet::preview()` (read these methods' current return shapes first — adapt to the contract's shape above, don't assume they already match it exactly). `StaffMemberImportable` has no existing `preview()`-equivalent to delegate to (confirmed during Task 4 of the import-engine plan — Staff never had a separate Action class); implement a dry-run loop reusing `UpsertStaffMemberFromImport`'s per-row validation checks WITHOUT calling its write path (read that class first — you may need to extract its validation logic into something `preview()` can call without writing, or duplicate just the validation checks if extracting cleanly isn't straightforward; prefer extraction if it's a clean, small change, otherwise duplicate rather than risk destabilizing the already-approved write path).

- [ ] **Step 1: Write the failing tests** — one per entity:

```php
public function test_preview_reports_valid_and_error_row_counts(): void
{
    $rows = collect([
        ['name' => 'Acme', 'type' => 'person', 'roles' => 'customer'], // valid
        ['name' => '', 'type' => 'person', 'roles' => 'customer'],      // invalid: missing name
    ]);

    $result = app(PartyImportable::class)->preview($rows);

    $this->assertSame(1, $result['valid_rows']);
    $this->assertSame(1, $result['error_rows']);
    $this->assertCount(1, $result['errors']);
}
```

(Mirror for Product and Staff, using each entity's own required-field shape.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `php artisan test --filter=PartyImportableTest --compact` (and Product/Staff equivalents)

- [ ] **Step 3: Implement `preview()` on the contract and all three entities**

- [ ] **Step 4: Run tests to verify they pass**

Run the same three filters above.
Expected: PASS.

- [ ] **Step 5: Format and commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/AI/Import/Contracts/ImportableEntity.php app/Services/AI/Import/Entities/PartyImportable.php app/Services/AI/Import/Entities/ProductImportable.php app/Services/AI/Import/Entities/StaffMemberImportable.php tests/Feature/AI/Import/PartyImportableTest.php tests/Feature/AI/Import/ProductImportableTest.php tests/Feature/AI/Import/StaffMemberImportableTest.php
git commit -m "feat: add preview() to ImportableEntity for validation reporting"
```

---

### Task 6: Wire `preview()` into propose/revise; structured errors in confirm

**Files:**
- Modify: `app/Services/AI/Tools/SmartImportProposeTool.php`
- Modify: `app/Services/AI/Tools/SmartImportReviseTool.php`
- Modify: `app/Services/AI/Tools/SmartImportConfirmTool.php`
- Test: `tests/Feature/AI/Tools/SmartImportProposeToolTest.php`, `SmartImportReviseToolTest.php`, `SmartImportConfirmToolTest.php` (extend)

**Interfaces:**
- Consumes: `ImportableEntity::preview(Collection $rows)` (Task 5); the `'audit'`-key convention on a tool's returned array (Task 4).
- Produces: propose/revise's returned array gains `field_mapping`, `valid_rows`, `error_rows`, `errors` (capped at the first 10 entries) keys, computed by remapping `extracted_rows` via the classifier's `field_mapping` and calling the resolved entity's `preview()`. Confirm's returned array, on a caught validation failure, becomes `array{status: 'rejected', errors: list<array{row:int,message:string}>}` instead of letting the exception propagate to the orchestrator's generic catch.

In `SmartImportConfirmTool::execute()`, wrap the call to `$entity->commit($remappedRows)` in a `try`/`catch (ValidationException|InvalidArgumentException $exception)` block. On catch: do NOT change the draft's status (it stays `STATUS_DRAFT`), return the rejected-shape array above instead of rethrowing. Let every other exception type propagate unchanged (this preserves the existing "genuine errors still surface loudly" behavior from the import-engine plan's Task 12).

This task is also where propose/revise/confirm start populating the `'audit'` key (Task 4's convention) on their SUCCESS paths, since there was no real caller of it until now:
- `SmartImportProposeTool`/`SmartImportReviseTool`: `'audit' => ['before' => ['target_entity' => <prior value>, 'field_mapping' => <prior value>], 'after' => ['target_entity' => <new value>, 'field_mapping' => <new value>]]`, read from the draft's values immediately before and after the classifier-driven update.
- `SmartImportConfirmTool`: on a successful commit only (never on the rejected path above), `'audit' => ['before' => null, 'after' => $result]` where `$result` is the `{created,updated,skipped,total}` array `commit()` returned (matches spec §4's "before_payload: null... after_payload as the entity's own commit() summary").

- [ ] **Step 1: Write the failing tests**

```php
public function test_propose_returns_field_mapping_and_validation_counts(): void
{
    // Fake classifier response with a field_mapping; assert the tool's
    // returned array contains field_mapping, valid_rows, error_rows, errors.
}

public function test_confirm_returns_a_structured_rejection_instead_of_throwing_on_invalid_rows(): void
{
    $result = app(SmartImportConfirmTool::class)->execute($user, ['draft_id' => $draft->id], $conversation);

    $this->assertSame('rejected', $result['status']);
    $this->assertNotEmpty($result['errors']);
    $this->assertSame(AiImportDraft::STATUS_DRAFT, $draft->fresh()->status);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run the three tool test filters.

- [ ] **Step 3: Implement the changes in all three tools**

- [ ] **Step 4: Run tests to verify they pass, plus confirm the existing "aborts on invalid row" test from the import-engine plan still passes unchanged for the exception types NOT caught here**

Run the three tool test filters again.
Expected: PASS.

- [ ] **Step 5: Format and commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/AI/Tools/SmartImportProposeTool.php app/Services/AI/Tools/SmartImportReviseTool.php app/Services/AI/Tools/SmartImportConfirmTool.php tests/Feature/AI/Tools/SmartImportProposeToolTest.php tests/Feature/AI/Tools/SmartImportReviseToolTest.php tests/Feature/AI/Tools/SmartImportConfirmToolTest.php
git commit -m "feat: surface field mapping, validation, and structured confirm errors"
```

---

### Task 7: AI usage billing for image extraction and classification

**Files:**
- Modify: `app/Services/AI/Import/ImageRowExtractor.php`
- Modify: `app/Http/Controllers/AI/AiAssistantController.php`
- Modify: `app/Services/AI/Import/ImportClassifier.php`
- Modify: `app/Services/AI/Tools/SmartImportProposeTool.php`
- Modify: `app/Services/AI/Tools/SmartImportReviseTool.php`
- Modify: `app/Services/AI/AiAssistantOrchestrator.php`
- Test: `tests/Feature/AI/Import/ImageRowExtractorTest.php`, `ImportClassifierTest.php`, `AiAssistantImportUploadTest.php`, `AiAssistantOrchestratorSmartImportTest.php` (extend)

**Interfaces:**
- Produces: `ImageRowExtractor::extract(array $image): array{rows: Collection<int, array<string, mixed>>, usage: array{input_tokens:int, output_tokens:int, total_tokens:int}}` (return type changes from a bare `Collection` — update every call site). `ImportClassifier::classify()`'s returned array gains a `usage` key with the same shape, read from the existing `AiGateway::chat()` response it already receives (currently discarded).
- Convention: any tool's returned array may include a top-level `usage` key shaped `array{input_tokens:int, output_tokens:int, total_tokens:int}`. `AiAssistantOrchestrator::chat()`'s tool-execution loop accumulates every call's `usage` (if present) into `$answer['total_tokens']`/`input_tokens`/`output_tokens` the same way it already accumulates the planner's and the final answer call's usage, then strips the `usage` key before the result is folded into the LLM-facing tool-result context (the model doesn't need to see its own token counts).

`SmartImportProposeTool`/`SmartImportReviseTool` include the classifier's `usage` under their own returned array's `usage` key (so the orchestrator's generic accumulation picks it up without the orchestrator needing to know about `ImportClassifier` specifically).

`AiAssistantController::extractImportRows()` (the eager-extraction step) bills `ImageRowExtractor`'s usage via `$credits->consumeOverage(...)`, the same call already used for the `image` field's analysis — read that existing call site first and mirror it exactly (same `rescue(..., report: true)` wrapping).

- [ ] **Step 1: Write the failing tests**

```php
// ImageRowExtractorTest.php
public function test_extract_returns_usage_alongside_rows(): void
{
    $result = app(ImageRowExtractor::class)->extract($image);

    $this->assertArrayHasKey('rows', $result);
    $this->assertArrayHasKey('usage', $result);
    $this->assertArrayHasKey('total_tokens', $result['usage']);
}

// ImportClassifierTest.php
public function test_classify_returns_usage(): void { /* similar */ }

// AiAssistantImportUploadTest.php
public function test_an_image_import_file_bills_ai_usage(): void
{
    // Assert consumeOverage (or its observable effect on the org's credit
    // balance) reflects the image analysis's token usage.
}

// AiAssistantOrchestratorSmartImportTest.php
public function test_classifier_usage_from_a_write_tool_call_reaches_total_tokens(): void
{
    $result = app(AiAssistantOrchestrator::class)->chat(...);
    $this->assertGreaterThan(0, $result['total_tokens']); // and specifically greater than just the planner+answer calls' own usage
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run each filter above.

- [ ] **Step 3: Implement the changes across all six files listed**

Update `ImageRowExtractor`'s one call site in `AiAssistantController::extractImportRows()` for the new return shape.

- [ ] **Step 4: Run tests to verify they pass, then run the full AI suite to confirm no regression to the existing image-analysis billing path**

Run the four filters above.
Run: `php artisan test tests/Feature/AI --compact`
Expected: all PASS.

- [ ] **Step 5: Format and commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/AI/Import/ImageRowExtractor.php app/Http/Controllers/AI/AiAssistantController.php app/Services/AI/Import/ImportClassifier.php app/Services/AI/Tools/SmartImportProposeTool.php app/Services/AI/Tools/SmartImportReviseTool.php app/Services/AI/AiAssistantOrchestrator.php tests/Feature/AI/Import/ImageRowExtractorTest.php tests/Feature/AI/Import/ImportClassifierTest.php tests/Feature/AI/AiAssistantImportUploadTest.php tests/Feature/AI/AiAssistantOrchestratorSmartImportTest.php
git commit -m "feat: bill AI usage for image extraction and classification"
```

---

### Task 8: `SmartImportCancelTool`

**Files:**
- Create: `app/Services/AI/Tools/SmartImportCancelTool.php`
- Modify: `app/Services/AI/AiWriteToolRegistry.php`
- Test: `tests/Feature/AI/Tools/SmartImportCancelToolTest.php`

**Interfaces:**
- Consumes: `AiWriteTool` (Task 2's updated contract — `severity()` + conversation-scoped `execute()`).
- Produces: `SmartImportCancelTool::name() === 'smart_import_cancel'`, `severity(): WriteActionSeverity::Standard`, `inputSchema()` requires `draft_id`. `execute()`: ownership+conversation-scoped `lockForUpdate()` reload (mirror `SmartImportReviseTool`'s locked-save pattern exactly), re-check `status === STATUS_DRAFT` under the lock, set `status = AiImportDraft::STATUS_CANCELLED` and save; throw `RuntimeException` if the draft is already in any other status.

- [ ] **Step 1: Write the failing tests** — mirror `SmartImportReviseToolTest`'s shape: happy path (cancels a draft), rejects a committed/already-cancelled draft, rejects cross-user, rejects cross-conversation, `allowed()` deny/grant.

- [ ] **Step 2: Run tests to verify they fail**

Run: `php artisan test --filter=SmartImportCancelToolTest --compact`

- [ ] **Step 3: Implement `SmartImportCancelTool` and register it in `AiWriteToolRegistry::TOOLS`**

- [ ] **Step 4: Run tests to verify they pass**

Run: `php artisan test --filter=SmartImportCancelToolTest --compact`
Run: `php artisan test --filter=AiWriteToolRegistryTest --compact` (confirm the registry still dispatches correctly with a 4th tool)

- [ ] **Step 5: Format and commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/AI/Tools/SmartImportCancelTool.php app/Services/AI/AiWriteToolRegistry.php tests/Feature/AI/Tools/SmartImportCancelToolTest.php
git commit -m "feat: add smart_import_cancel AI write tool"
```

---

### Task 9: 24-hour confirm age limit

**Files:**
- Modify: `app/Services/AI/Tools/SmartImportConfirmTool.php`
- Test: `tests/Feature/AI/Tools/SmartImportConfirmToolTest.php` (extend)

**Interfaces:**
- Produces: `SmartImportConfirmTool::execute()` additionally rejects (same `RuntimeException` path as the existing status/target_entity guard) when the draft's `created_at` is more than 24 hours old, checked at the SAME point as the existing fast-path guard (before the locked reload — no need to re-check age under the lock, since age only increases and can't be "fixed" by a concurrent action the way status can change).

- [ ] **Step 1: Write the failing test**

```php
public function test_confirm_rejects_a_draft_older_than_24_hours(): void
{
    $draft = AiImportDraft::factory()->for($this->user)->create([
        'status' => AiImportDraft::STATUS_DRAFT,
        'target_entity' => 'party',
        'created_at' => now()->subHours(25),
    ]);

    $this->expectException(RuntimeException::class);
    app(SmartImportConfirmTool::class)->execute($this->user, ['draft_id' => $draft->id], $this->conversation);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --filter=SmartImportConfirmToolTest --compact`

- [ ] **Step 3: Implement the age check**

- [ ] **Step 4: Run test to verify it passes, plus the full confirm test file to confirm no regression**

Run: `php artisan test --filter=SmartImportConfirmToolTest --compact`
Expected: all PASS.

- [ ] **Step 5: Format and commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/AI/Tools/SmartImportConfirmTool.php tests/Feature/AI/Tools/SmartImportConfirmToolTest.php
git commit -m "feat: reject confirming a draft older than 24 hours"
```
