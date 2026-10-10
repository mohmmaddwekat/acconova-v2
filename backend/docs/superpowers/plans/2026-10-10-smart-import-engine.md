# Smart Import Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user upload any file (spreadsheet first, image second) into the existing AI Assistant chat, have the AI classify and map it to a target business entity, and commit it through existing domain Actions only after explicit user confirmation.

**Architecture:** Extraction (file → generic rows) happens eagerly server-side when the file is attached, mirroring the existing image-analysis path in `AiAssistantController::message()`. Classification (rows → target entity + field mapping) and commit are exposed as three new AI tools (`smart_import_propose`, `smart_import_revise`, `smart_import_confirm`) in a new write-capable tool registry, parallel to the existing read-only `AiBusinessToolRegistry`. Commit always delegates to the existing per-domain Create/Update Actions, so validation and business rules are never bypassed.

**Tech Stack:** Laravel 13, PHP 8.4, MySQL, PHPUnit.

**Spec:** `docs/superpowers/specs/2026-10-10-smart-import-engine-design.md`

## Global Constraints

- No PDF/DOCX extraction in this iteration; no new Composer dependency without explicit approval (spec §2, §4.1).
- V1 catalog entries: Party, Product, StaffMember only (spec §4.3).
- The database is written to only by `smart_import_confirm`; `propose`/`revise` never write business data (spec §1, §4.4).
- `smart_import_confirm` must check both the `ai.business_data.write` permission and the target entity's own `requiredPermission()` before committing (spec §4.5).
- Commit reuses the existing per-domain Actions (e.g. `CreateParty`, `UpdateParty`) — never writes directly via Eloquent from the AI layer (spec §4.1).
- Follow this repo's PHP conventions: constructor property promotion, explicit return types and param types, curly braces on every control structure, PHPDoc array shapes for array returns.
- Run `vendor/bin/pint --dirty --format agent` after any PHP edit, before committing.
- Run only the narrowest relevant test file/filter per task, per `php artisan test --compact`.

## Review Focus

- Ambiguous/low-confidence classification (file content doesn't clearly match any catalog entity) must leave the draft in `draft` status with `target_entity` null and an explanation, never a silent guess — covered in Task 8.
- Missing permission at confirm time (either `ai.business_data.write` or the target entity's `requiredPermission()`) must block the commit with zero writes — covered in Task 12.
- Calling `revise` or `confirm` on a draft that is already `committed` or `cancelled` must be rejected, not silently reprocessed — covered in Task 11 and Task 12.
- A draft created by one user/organization must not be revisable or confirmable by a different user or tenant — covered in Task 10.
- A multi-row commit where one row fails domain validation must write zero rows (atomic), matching the existing `ImportPartiesFromSpreadsheet` transaction pattern — covered in Task 12.

---

### Task 1: `AiImportDraft` model and migration

**Files:**
- Create: `database/migrations/2026_10_10_190000_create_ai_import_drafts_table.php`
- Create: `app/Models/AiImportDraft.php`
- Create: `database/factories/AiImportDraftFactory.php`
- Test: `tests/Feature/AiImportDraftTest.php`

**Interfaces:**
- Produces: `AiImportDraft` model with fillable `ai_conversation_id, user_id, source_file_name, source_file_type, target_entity, extracted_rows, field_mapping, ai_notes, status, commit_summary`; casts `extracted_rows: array`, `field_mapping: array`, `commit_summary: array`; constants `AiImportDraft::STATUS_DRAFT = 'draft'`, `STATUS_CONFIRMED = 'confirmed'`, `STATUS_COMMITTED = 'committed'`, `STATUS_CANCELLED = 'cancelled'`.

- [ ] **Step 1: Write the migration**

Mirror `database/migrations/2026_09_22_090000_create_ai_tool_runs_table.php`'s structure: `organization_id` (`foreignId()->constrained()->cascadeOnDelete()`), `ai_conversation_id` (`foreignId()->constrained('ai_conversations')->cascadeOnDelete()`), `user_id` (`foreignId()->constrained()->cascadeOnDelete()`), `source_file_name` string(255), `source_file_type` string(24), `target_entity` string(40) nullable, `extracted_rows` json, `field_mapping` json nullable, `ai_notes` text nullable, `status` string(24) default `'draft'`, `commit_summary` json nullable, timestamps, index on `['organization_id', 'ai_conversation_id', 'created_at']`.

- [ ] **Step 2: Write the failing test**

```php
test('draft is scoped to the current organization', function () {
    $draft = AiImportDraft::factory()->create();

    switchToOrganization(OtherOrganizationFactory::make()); // use whatever tenant-switch helper existing tenant tests use
    expect(AiImportDraft::find($draft->id))->toBeNull();
});

test('draft fillable fields round-trip through casts', function () {
    $draft = AiImportDraft::factory()->create([
        'extracted_rows' => [['name' => 'Jane']],
        'status' => AiImportDraft::STATUS_DRAFT,
    ]);

    expect($draft->fresh()->extracted_rows)->toBe([['name' => 'Jane']]);
});
```

Use this repo's actual test style (PHPUnit `TestCase` + `RefreshDatabase`, not Pest, unless `tests/Feature/StaffImportTemplateTest.php` shows otherwise — check it first and match it).

- [ ] **Step 3: Run test to verify it fails**

Run: `php artisan test --filter=AiImportDraftTest --compact`
Expected: FAIL — table/model do not exist yet.

- [ ] **Step 4: Implement the model and factory**

Model mirrors `app/Models/AiToolRun.php` (uses `BelongsToOrganization`, same fillable/casts shape). Factory mirrors `database/factories` conventions for an existing AI model (check `AiToolRun`'s factory if one exists, else follow `PartyFactory`'s style) and must set a valid `ai_conversation_id`/`user_id` via nested factories.

- [ ] **Step 5: Run migration and test**

Run: `php artisan migrate --env=testing` (or however this repo's test suite migrates — check `phpunit.xml`), then `php artisan test --filter=AiImportDraftTest --compact`
Expected: PASS

- [ ] **Step 6: Format and commit**

```bash
vendor/bin/pint --dirty --format agent
git add database/migrations/2026_10_10_190000_create_ai_import_drafts_table.php app/Models/AiImportDraft.php database/factories/AiImportDraftFactory.php tests/Feature/AiImportDraftTest.php
git commit -m "feat: add AiImportDraft model for smart-import draft state"
```

---

### Task 2: `ImportableEntity` contract, `ImportDestinationCatalog`, and `PartyImportable`

**Files:**
- Create: `app/Services/AI/Import/Contracts/ImportableEntity.php`
- Create: `app/Services/AI/Import/ImportDestinationCatalog.php`
- Create: `app/Services/AI/Import/Entities/PartyImportable.php`
- Test: `tests/Feature/AI/Import/PartyImportableTest.php`

**Interfaces:**
- Produces: `ImportableEntity` interface with `key(): string`, `label(): string`, `fieldSchema(): array`, `requiredPermission(): string`, `commit(Collection $rows): array` (return shape `array{created:int,updated:int,skipped:int,total:int}`, matching `ImportPartiesFromSpreadsheet::execute()`'s return shape).
- Produces: `ImportDestinationCatalog::all(): list<ImportableEntity>`, `ImportDestinationCatalog::find(string $key): ?ImportableEntity`, `ImportDestinationCatalog::definitionsFor(User $user): list<array{key:string,label:string,fields:array<string,mixed>}>` (filters out entries the user lacks `requiredPermission()` for).

- [ ] **Step 1: Write the failing test**

```php
public function test_party_importable_commits_via_existing_import_action(): void
{
    $rows = collect([['name' => 'Acme Co', 'type' => 'customer']]);

    $result = app(PartyImportable::class)->commit($rows);

    $this->assertSame(['created' => 1, 'updated' => 0, 'skipped' => 0, 'total' => 1], $result);
    $this->assertDatabaseHas('parties', ['name' => 'Acme Co']);
}

public function test_catalog_hides_entries_the_user_cannot_import_to(): void
{
    $user = User::factory()->create(); // no parties.create permission

    $definitions = app(ImportDestinationCatalog::class)->definitionsFor($user);

    $this->assertNotContains('party', array_column($definitions, 'key'));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --filter=PartyImportableTest --compact`
Expected: FAIL — classes do not exist.

- [ ] **Step 3: Implement `ImportableEntity`, `ImportDestinationCatalog`, `PartyImportable`**

`PartyImportable::commit()` delegates to the existing `App\Actions\Parties\ImportPartiesFromSpreadsheet` (inject it via constructor), passing `$rows` and a duplicate mode (use `'update'` as the default — confirm this matches the existing controller's default by checking `PartyImportRequest`). `requiredPermission()` returns whatever permission key existing Party-creation code checks (look it up in `WorkspaceFeaturePermissions::groups()` rather than guessing). `ImportDestinationCatalog` holds a hard-coded `const ENTITIES = [PartyImportable::class]` for this task (Tasks 3–4 append to it).

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --filter=PartyImportableTest --compact`
Expected: PASS

- [ ] **Step 5: Format and commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/AI/Import/Contracts/ImportableEntity.php app/Services/AI/Import/ImportDestinationCatalog.php app/Services/AI/Import/Entities/PartyImportable.php tests/Feature/AI/Import/PartyImportableTest.php
git commit -m "feat: add import destination catalog with Party entry"
```

---

### Task 3: `ProductImportable` entity

**Files:**
- Create: `app/Services/AI/Import/Entities/ProductImportable.php`
- Modify: `app/Services/AI/Import/ImportDestinationCatalog.php` (append to `ENTITIES`)
- Test: `tests/Feature/AI/Import/ProductImportableTest.php`

**Interfaces:**
- Consumes: `ImportableEntity` from Task 2.
- Produces: same shape as `PartyImportable`, `key() === 'product'`.

- [ ] **Step 1: Write the failing test** (mirror Task 2's Party test, using `App\Actions\Products\ImportProductsFromSpreadsheet` and a product fixture row)
- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --filter=ProductImportableTest --compact`

- [ ] **Step 3: Implement `ProductImportable`**, delegating to `App\Actions\Products\ImportProductsFromSpreadsheet`, and add it to `ImportDestinationCatalog::ENTITIES`.
- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --filter=ProductImportableTest --compact`

- [ ] **Step 5: Format and commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/AI/Import/Entities/ProductImportable.php app/Services/AI/Import/ImportDestinationCatalog.php tests/Feature/AI/Import/ProductImportableTest.php
git commit -m "feat: add Product entry to import destination catalog"
```

---

### Task 4: `StaffMemberImportable` entity

**Files:**
- Create: `app/Services/AI/Import/Entities/StaffMemberImportable.php`
- Modify: `app/Services/AI/Import/ImportDestinationCatalog.php` (append to `ENTITIES`)
- Test: `tests/Feature/AI/Import/StaffMemberImportableTest.php`

**Interfaces:**
- Consumes: `ImportableEntity` from Task 2.
- Produces: same shape, `key() === 'staff_member'`.

Staff import today runs through `StaffImportController`/`StaffImportPreviewController`/`StaffImportCommitController`, not a single Action class — before writing this task's implementation, read those three controllers to find the one committing method to delegate to (likely a service/action they call internally), and use that, not the controllers themselves (controllers are HTTP-layer, not callable from a tool).

- [ ] **Step 1: Write the failing test** (mirror Task 2's shape with a staff-row fixture)
- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --filter=StaffMemberImportableTest --compact`

- [ ] **Step 3: Implement `StaffMemberImportable`**, delegating to the underlying staff-import commit service found above, and add it to `ImportDestinationCatalog::ENTITIES`.
- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --filter=StaffMemberImportableTest --compact`

- [ ] **Step 5: Format and commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/AI/Import/Entities/StaffMemberImportable.php app/Services/AI/Import/ImportDestinationCatalog.php tests/Feature/AI/Import/StaffMemberImportableTest.php
git commit -m "feat: add StaffMember entry to import destination catalog"
```

---

### Task 5: `SpreadsheetRowExtractor`

**Files:**
- Create: `app/Services/AI/Import/SpreadsheetRowExtractor.php`
- Test: `tests/Feature/AI/Import/SpreadsheetRowExtractorTest.php`

**Interfaces:**
- Produces: `SpreadsheetRowExtractor::extract(string $path, string $mime): Collection` returning `Collection<int, array<string, mixed>>` — one array per row, keyed by the spreadsheet's header row. Throws `ValidationException` on an unreadable/empty file, matching `ImportSourceController`'s message style.

- [ ] **Step 1: Write the failing test**

```php
public function test_extracts_rows_keyed_by_header(): void
{
    $path = $this->fixtureCsv("name,email\nJane,jane@example.com\n");

    $rows = app(SpreadsheetRowExtractor::class)->extract($path, 'text/csv');

    $this->assertSame([['name' => 'Jane', 'email' => 'jane@example.com']], $rows->toArray());
}

public function test_throws_validation_exception_on_empty_file(): void
{
    $this->expectException(ValidationException::class);

    app(SpreadsheetRowExtractor::class)->extract($this->fixtureCsv(''), 'text/csv');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --filter=SpreadsheetRowExtractorTest --compact`

- [ ] **Step 3: Implement `SpreadsheetRowExtractor`**

Reuse whatever spreadsheet-reading library/helper the existing `ImportPartiesFromSpreadsheet`/`ProductImportRequest` pipeline already uses to turn an uploaded file into rows (check their controllers for the actual reader call — likely `maatwebsite/excel` or similar, already a dependency) rather than adding a new one.

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --filter=SpreadsheetRowExtractorTest --compact`

- [ ] **Step 5: Format and commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/AI/Import/SpreadsheetRowExtractor.php tests/Feature/AI/Import/SpreadsheetRowExtractorTest.php
git commit -m "feat: add spreadsheet row extractor for smart import"
```

---

### Task 6: `ImageRowExtractor`

**Files:**
- Create: `app/Services/AI/Import/ImageRowExtractor.php`
- Test: `tests/Feature/AI/Import/ImageRowExtractorTest.php`

**Interfaces:**
- Consumes: `App\Services\AI\AiImageAnalyzer::analyze(array $image, string $userQuestion): array` (existing, returns `content` as free text).
- Produces: `ImageRowExtractor::extract(array $image): Collection` returning `Collection<int, array<string,mixed>>`, by asking `AiImageAnalyzer` to return rows as JSON (fixed prompt instructing it to respond with a JSON array of objects) and parsing that JSON. Throws `RuntimeException` if the response isn't valid JSON.

- [ ] **Step 1: Write the failing test**

```php
public function test_parses_json_rows_from_image_analysis(): void
{
    $this->mock(AiImageAnalyzer::class)
        ->shouldReceive('analyze')
        ->once()
        ->andReturn(['content' => '[{"name":"Jane"}]', 'total_tokens' => 10 /* ...other keys as needed */]);

    $rows = app(ImageRowExtractor::class)->extract(['data_url' => 'data:image/png;base64,...']);

    $this->assertSame([['name' => 'Jane']], $rows->toArray());
}

public function test_throws_on_non_json_response(): void
{
    $this->mock(AiImageAnalyzer::class)->shouldReceive('analyze')->once()->andReturn(['content' => 'not json']);

    $this->expectException(RuntimeException::class);

    app(ImageRowExtractor::class)->extract(['data_url' => 'data:image/png;base64,...']);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --filter=ImageRowExtractorTest --compact`

- [ ] **Step 3: Implement `ImageRowExtractor`**, injecting `AiImageAnalyzer` and passing a fixed instruction string as `$userQuestion` ("Extract every record visible in this image as a JSON array of objects. Respond with JSON only.").
- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --filter=ImageRowExtractorTest --compact`

- [ ] **Step 5: Format and commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/AI/Import/ImageRowExtractor.php tests/Feature/AI/Import/ImageRowExtractorTest.php
git commit -m "feat: add image row extractor for smart import"
```

---

### Task 7: Eager extraction in `AiAssistantController::message()`

**Files:**
- Modify: `app/Http/Controllers/AI/AiAssistantController.php`
- Test: `tests/Feature/AI/AiAssistantImportUploadTest.php`

**Interfaces:**
- Consumes: `SpreadsheetRowExtractor` (Task 5), `ImageRowExtractor` (Task 6), `AiImportDraft` (Task 1).
- Produces: an `import_file` request field (`array{data_url:string, name:string, mime:string}`, validated like the existing `image` field) that, when present, creates an `AiImportDraft` (`status: draft`, `target_entity: null`, `extracted_rows` from the matching extractor, `source_file_name`/`source_file_type` set) and folds a `[[ACCONOVA_IMPORT_DRAFT_V1]]\nDraft-Id: {id}\nRows: {count}\n[[/ACCONOVA_IMPORT_DRAFT_V1]]` block into the stored user message content, mirroring the existing `imageContextText()` method.

Accept the same spreadsheet mimes `ImportSourceController` already accepts (csv/xlsx/xls/json) for `source_file_type = 'spreadsheet'`, and `image/jpeg|png|webp` for `source_file_type = 'image'`. Reject anything else with the same `ValidationException` style used elsewhere in this controller.

- [ ] **Step 1: Write the failing test**

```php
public function test_uploading_a_csv_creates_a_draft_and_tags_the_message(): void
{
    $response = $this->actingAs($user)->postJson("/api/ai/conversations/{$conversation->id}/messages", [
        'message' => 'import these',
        'import_file' => ['data_url' => $this->csvDataUrl("name\nJane\n"), 'name' => 'x.csv', 'mime' => 'text/csv'],
    ]);

    $response->assertOk();
    $this->assertDatabaseHas('ai_import_drafts', ['status' => AiImportDraft::STATUS_DRAFT]);
    $this->assertStringContainsString('ACCONOVA_IMPORT_DRAFT_V1', AiMessage::where('role', 'user')->latest('id')->first()->content);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --filter=AiAssistantImportUploadTest --compact`

- [ ] **Step 3: Implement the controller change**

Add validation rules for `import_file.*` next to the existing `image.*` rules. Add a private `importContextText(AiImportDraft $draft): string` method mirroring `imageContextText()`. Dispatch to `SpreadsheetRowExtractor` or `ImageRowExtractor` based on `mime`, wrap extraction failure in the same `AI_IMAGE_UNAVAILABLE`-style JSON error response pattern already used for images (use a new code, e.g. `AI_IMPORT_FILE_UNAVAILABLE`).

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --filter=AiAssistantImportUploadTest --compact`

- [ ] **Step 5: Format and commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Controllers/AI/AiAssistantController.php tests/Feature/AI/AiAssistantImportUploadTest.php
git commit -m "feat: extract smart-import drafts eagerly on file upload"
```

---

### Task 8: `ImportClassifier`

**Files:**
- Create: `app/Services/AI/Import/ImportClassifier.php`
- Test: `tests/Feature/AI/Import/ImportClassifierTest.php`

**Interfaces:**
- Consumes: `AiGateway::chat(array $messages, ?int $maxTokens, ?string $preferredProvider): array` (existing, same shape used by `AiToolPlanner`), `ImportDestinationCatalog::definitionsFor(User $user)` (Task 2).
- Produces: `ImportClassifier::classify(User $user, AiImportDraft $draft, ?string $hint): array{target_entity:?string, field_mapping:?array<string,string>, confidence:float, notes:string}`.

This is the Review Focus item for ambiguous input: when the model can't confidently match a catalog entry, `classify()` must return `target_entity: null` rather than guessing. Build the prompt so the model is explicitly told to return `null` in that case (mirror `AiToolPlanner`'s "return JSON only, exactly in this shape" instruction style), and treat unparsable JSON the same way `AiToolPlanner::decodePlan()` does (try fenced-code-block stripping, then brace-matching, then give up).

- [ ] **Step 1: Write the failing test**

```php
public function test_classify_returns_null_target_when_model_is_unsure(): void
{
    $this->mockGatewayToReturn('{"target_entity":null,"field_mapping":null,"confidence":0.2,"notes":"Unclear what this data represents."}');

    $result = app(ImportClassifier::class)->classify($user, $draft, null);

    $this->assertNull($result['target_entity']);
}

public function test_classify_maps_rows_to_a_catalog_entity(): void
{
    $this->mockGatewayToReturn('{"target_entity":"party","field_mapping":{"name":"name"},"confidence":0.9,"notes":""}');

    $result = app(ImportClassifier::class)->classify($user, $draft, 'these are customers');

    $this->assertSame('party', $result['target_entity']);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --filter=ImportClassifierTest --compact`

- [ ] **Step 3: Implement `ImportClassifier`**
- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --filter=ImportClassifierTest --compact`

- [ ] **Step 5: Format and commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/AI/Import/ImportClassifier.php tests/Feature/AI/Import/ImportClassifierTest.php
git commit -m "feat: add AI classifier for smart-import drafts"
```

---

### Task 9: `ai.business_data.write` permission key

**Files:**
- Modify: `app/Services/Workspace/WorkspaceFeaturePermissions.php`
- Test: `tests/Feature/WorkspaceFeaturePermissionsTest.php` (extend if it exists, else create)

**Interfaces:**
- Produces: a new permission entry in the `ai` group, key `ai.business_data.write`, `depends: ['ai.business_data.use']`, no `builtin` roles (opt-in only — nobody gets it by default, unlike the read-only `ai.business_data.use`).

- [ ] **Step 1: Write the failing test**

```php
public function test_ai_business_data_write_depends_on_business_data_use(): void
{
    $groups = WorkspaceFeaturePermissions::groups();
    $permission = collect($groups['ai']['permissions'])->firstWhere('key', 'ai.business_data.write');

    $this->assertNotNull($permission);
    $this->assertSame(['ai.business_data.use'], $permission['depends']);
    $this->assertArrayNotHasKey('builtin', $permission);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --filter=WorkspaceFeaturePermissionsTest --compact`

- [ ] **Step 3: Add the permission entry** to the `ai` group's `permissions` array in `WorkspaceFeaturePermissions::groups()`, right after `ai.business_data.use`.
- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --filter=WorkspaceFeaturePermissionsTest --compact`

- [ ] **Step 5: Format and commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/Workspace/WorkspaceFeaturePermissions.php tests/Feature/WorkspaceFeaturePermissionsTest.php
git commit -m "feat: add ai.business_data.write permission key"
```

---

### Task 10: `AiWriteTool` contract and `SmartImportProposeTool`

**Files:**
- Create: `app/Services/AI/Contracts/AiWriteTool.php`
- Create: `app/Services/AI/Tools/SmartImportProposeTool.php`
- Test: `tests/Feature/AI/Tools/SmartImportProposeToolTest.php`

**Interfaces:**
- Produces: `AiWriteTool` interface — same shape as `AiBusinessTool` (`name(): string`, `description(): string`, `inputSchema(): array`, `allowed(User $user): bool`, `execute(User $user, array $arguments): array`) — kept as a separate interface per spec §4.4 so write tools are never accidentally registered in the read-only registry.
- Produces: `SmartImportProposeTool::name() === 'smart_import_propose'`, `inputSchema()` requires `draft_id` (int) and optional `hint` (string). `execute()` loads the `AiImportDraft` by id scoped to the current user (not just organization — see Review Focus on cross-user access), runs `ImportClassifier::classify()` (Task 8), updates the draft's `target_entity`/`field_mapping`/`ai_notes`, and returns `{draft_id, target_entity, sample_rows (first 5), row_count, notes}`.

This is the Review Focus item for cross-tenant/cross-user access: loading the draft must fail (throw, caught by the orchestrator same as any tool exception) for a draft belonging to a different user, even within the same organization, matching `AiAssistantController::assertOwner()`'s ownership model for conversations.

- [ ] **Step 1: Write the failing test**

```php
public function test_propose_updates_the_draft_with_classification(): void
{
    $draft = AiImportDraft::factory()->for($user)->create(['status' => AiImportDraft::STATUS_DRAFT]);
    $this->mockClassifierToReturn(['target_entity' => 'party', 'field_mapping' => ['name' => 'name'], 'confidence' => 0.9, 'notes' => '']);

    $result = app(SmartImportProposeTool::class)->execute($user, ['draft_id' => $draft->id]);

    $this->assertSame('party', $draft->fresh()->target_entity);
    $this->assertSame('party', $result['target_entity']);
}

public function test_propose_rejects_a_draft_owned_by_another_user(): void
{
    $draft = AiImportDraft::factory()->for($otherUser)->create();

    $this->expectException(ModelNotFoundException::class);

    app(SmartImportProposeTool::class)->execute($user, ['draft_id' => $draft->id]);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --filter=SmartImportProposeToolTest --compact`

- [ ] **Step 3: Implement `AiWriteTool` and `SmartImportProposeTool`**
- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --filter=SmartImportProposeToolTest --compact`

- [ ] **Step 5: Format and commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/AI/Contracts/AiWriteTool.php app/Services/AI/Tools/SmartImportProposeTool.php tests/Feature/AI/Tools/SmartImportProposeToolTest.php
git commit -m "feat: add smart_import_propose AI write tool"
```

---

### Task 11: `SmartImportReviseTool`

**Files:**
- Create: `app/Services/AI/Tools/SmartImportReviseTool.php`
- Test: `tests/Feature/AI/Tools/SmartImportReviseToolTest.php`

**Interfaces:**
- Consumes: `AiWriteTool` (Task 10), `ImportClassifier` (Task 8).
- Produces: `SmartImportReviseTool::name() === 'smart_import_revise'`, `inputSchema()` requires `draft_id` and `instruction` (string). `execute()` loads the draft (same ownership check as Task 10), rejects with a clear error if `status` is not `draft` (Review Focus item), otherwise re-runs `ImportClassifier::classify()` with `instruction` as the hint, updates the draft, returns the same preview shape as `propose`.

- [ ] **Step 1: Write the failing test**

```php
public function test_revise_rejects_a_committed_draft(): void
{
    $draft = AiImportDraft::factory()->for($user)->create(['status' => AiImportDraft::STATUS_COMMITTED]);

    $this->expectException(RuntimeException::class);

    app(SmartImportReviseTool::class)->execute($user, ['draft_id' => $draft->id, 'instruction' => 'change x']);
}

public function test_revise_reclassifies_with_the_new_instruction(): void
{
    $draft = AiImportDraft::factory()->for($user)->create(['status' => AiImportDraft::STATUS_DRAFT, 'target_entity' => 'party']);
    $this->mockClassifierToReturn(['target_entity' => 'product', 'field_mapping' => [], 'confidence' => 0.8, 'notes' => '']);

    $result = app(SmartImportReviseTool::class)->execute($user, ['draft_id' => $draft->id, 'instruction' => 'actually these are products']);

    $this->assertSame('product', $result['target_entity']);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --filter=SmartImportReviseToolTest --compact`

- [ ] **Step 3: Implement `SmartImportReviseTool`**
- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --filter=SmartImportReviseToolTest --compact`

- [ ] **Step 5: Format and commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/AI/Tools/SmartImportReviseTool.php tests/Feature/AI/Tools/SmartImportReviseToolTest.php
git commit -m "feat: add smart_import_revise AI write tool"
```

---

### Task 12: `SmartImportConfirmTool`

**Files:**
- Create: `app/Services/AI/Tools/SmartImportConfirmTool.php`
- Test: `tests/Feature/AI/Tools/SmartImportConfirmToolTest.php`

**Interfaces:**
- Consumes: `AiWriteTool` (Task 10), `ImportDestinationCatalog::find()` (Task 2), `WorkspaceFeaturePermissions::allows()` (existing).
- Produces: `SmartImportConfirmTool::name() === 'smart_import_confirm'`, `inputSchema()` requires `draft_id`. `execute()`:
  1. Loads the draft (same ownership check as Task 10).
  2. Rejects if `status` is not `draft` or `target_entity` is null (Review Focus: no committing an unresolved/already-finalized draft).
  3. Rejects (throws `RuntimeException`, no DB writes) if the user lacks `ai.business_data.write` **or** the target `ImportableEntity::requiredPermission()` (spec §4.5, Review Focus item).
  4. Calls the target entity's `commit(Collection $rows)` using `field_mapping` to remap `extracted_rows` first, inside the same kind of `DB::transaction` the per-domain Actions already use, so a mid-batch validation failure writes nothing (Review Focus item — verify this is naturally atomic because `commit()` delegates to Actions that already wrap in `DB::transaction`; do not wrap twice).
  5. Sets `status: committed`, `commit_summary` to the result, returns it.

- [ ] **Step 1: Write the failing test**

```php
public function test_confirm_requires_business_data_write_permission(): void
{
    $draft = AiImportDraft::factory()->for($user)->create(['status' => AiImportDraft::STATUS_DRAFT, 'target_entity' => 'party']);
    // $user lacks ai.business_data.write

    $this->expectException(RuntimeException::class);
    app(SmartImportConfirmTool::class)->execute($user, ['draft_id' => $draft->id]);

    $this->assertDatabaseMissing('parties', ['name' => $draft->extracted_rows[0]['name']]);
}

public function test_confirm_commits_through_the_catalog_entity_and_marks_draft_committed(): void
{
    $user = $this->userWithPermissions(['ai.business_data.write', 'parties.create']);
    $draft = AiImportDraft::factory()->for($user)->create([
        'status' => AiImportDraft::STATUS_DRAFT,
        'target_entity' => 'party',
        'extracted_rows' => [['name' => 'Acme']],
        'field_mapping' => ['name' => 'name'],
    ]);

    $result = app(SmartImportConfirmTool::class)->execute($user, ['draft_id' => $draft->id]);

    $this->assertSame(AiImportDraft::STATUS_COMMITTED, $draft->fresh()->status);
    $this->assertDatabaseHas('parties', ['name' => 'Acme']);
    $this->assertSame(1, $result['created']);
}

public function test_confirm_rejects_a_draft_with_no_resolved_target(): void
{
    $draft = AiImportDraft::factory()->for($user)->create(['status' => AiImportDraft::STATUS_DRAFT, 'target_entity' => null]);

    $this->expectException(RuntimeException::class);
    app(SmartImportConfirmTool::class)->execute($user, ['draft_id' => $draft->id]);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --filter=SmartImportConfirmToolTest --compact`

- [ ] **Step 3: Implement `SmartImportConfirmTool`**
- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --filter=SmartImportConfirmToolTest --compact`

- [ ] **Step 5: Format and commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/AI/Tools/SmartImportConfirmTool.php tests/Feature/AI/Tools/SmartImportConfirmToolTest.php
git commit -m "feat: add smart_import_confirm AI write tool"
```

---

### Task 13: `AiWriteToolRegistry`

**Files:**
- Create: `app/Services/AI/AiWriteToolRegistry.php`
- Test: `tests/Feature/AI/AiWriteToolRegistryTest.php`

**Interfaces:**
- Consumes: `SmartImportProposeTool`, `SmartImportReviseTool`, `SmartImportConfirmTool` (Tasks 10–12).
- Produces: same public shape as `AiBusinessToolRegistry` (`definitionsFor(User $user): array`, `execute(User $user, string $name, array $arguments): array`, `available(User $user, string $name): bool`), gated on `ai.business_data.write` instead of `ai.business_data.use`.

- [ ] **Step 1: Write the failing test**

```php
public function test_definitions_are_empty_without_business_data_write(): void
{
    $user = User::factory()->create(); // no ai.business_data.write

    $this->assertSame([], app(AiWriteToolRegistry::class)->definitionsFor($user));
}

public function test_execute_dispatches_to_the_matching_tool(): void
{
    $user = $this->userWithPermissions(['ai.business_data.write']);
    $draft = AiImportDraft::factory()->for($user)->create();

    $result = app(AiWriteToolRegistry::class)->execute($user, 'smart_import_propose', ['draft_id' => $draft->id]);

    $this->assertArrayHasKey('draft_id', $result);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --filter=AiWriteToolRegistryTest --compact`

- [ ] **Step 3: Implement `AiWriteToolRegistry`**, copying `AiBusinessToolRegistry`'s structure exactly (same `TOOLS` constant pattern, same `find()`/`tools()` helpers), swapping the gating permission.
- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --filter=AiWriteToolRegistryTest --compact`

- [ ] **Step 5: Format and commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/AI/AiWriteToolRegistry.php tests/Feature/AI/AiWriteToolRegistryTest.php
git commit -m "feat: add AiWriteToolRegistry for smart-import tools"
```

---

### Task 14: Wire `AiWriteToolRegistry` into `AiToolPlanner` and `AiAssistantOrchestrator`

**Files:**
- Modify: `app/Services/AI/AiToolPlanner.php`
- Modify: `app/Services/AI/AiAssistantOrchestrator.php`
- Test: `tests/Feature/AI/AiAssistantOrchestratorSmartImportTest.php`

**Interfaces:**
- Consumes: `AiWriteToolRegistry` (Task 13).
- Modifies: `AiToolPlanner`'s constructor gains `private readonly AiWriteToolRegistry $writeTools`; `plan()`'s tool catalog becomes `array_merge($this->tools->definitionsFor($user), $this->writeTools->definitionsFor($user))`, and the `available()` check in the calls loop becomes `$this->tools->available($user, $name) || $this->writeTools->available($user, $name)`.
- Modifies: `AiAssistantOrchestrator`'s constructor gains `private readonly AiWriteToolRegistry $writeTools`; in `chat()`, dispatch `$this->tools->execute(...)` vs `$this->writeTools->execute(...)` based on which registry's `available($user, $name)` is true, trying `$tools` first then `$writeTools` (mirrors the merge order in `AiToolPlanner`).

- [ ] **Step 1: Write the failing test**

```php
public function test_orchestrator_can_execute_a_write_tool_the_planner_selected(): void
{
    $user = $this->userWithPermissions(['ai.business_data.write']);
    $draft = AiImportDraft::factory()->for($user)->create();
    $this->mockPlannerToReturnCall('smart_import_propose', ['draft_id' => $draft->id]);

    $result = app(AiAssistantOrchestrator::class)->chat($conversation, $user, $messages);

    $this->assertContains('smart_import_propose', $result['tool_calls']);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --filter=AiAssistantOrchestratorSmartImportTest --compact`

- [ ] **Step 3: Implement the wiring** in both classes as described above.
- [ ] **Step 4: Run test to verify it passes, then run the full AI test suite**

Run: `php artisan test --filter=AiAssistantOrchestratorSmartImportTest --compact`
Run: `php artisan test tests/Feature/AI --compact`
Expected: all PASS (confirms the merge didn't break existing read-tool behavior).

- [ ] **Step 5: Format and commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/AI/AiToolPlanner.php app/Services/AI/AiAssistantOrchestrator.php tests/Feature/AI/AiAssistantOrchestratorSmartImportTest.php
git commit -m "feat: wire smart-import write tools into the AI tool planner"
```
