<?php

namespace Tests\Unit;

use App\Models\Concerns\BelongsToOrganization;
use App\Services\AI\AiActionMatrix;
use App\Services\AI\AiWriteToolRegistry;
use App\Services\Workspace\WorkspaceFeaturePermissions;
use ReflectionClass;
use Tests\TestCase;

class AiActionMatrixTest extends TestCase
{
    public function test_every_permission_in_the_matrix_exists(): void
    {
        $known = WorkspaceFeaturePermissions::keys();

        foreach (AiActionMatrix::all() as $key => $row) {
            foreach ($row['permissions'] as $permission) {
                $this->assertContains($permission, $known, "{$key} uses unknown permission {$permission}");
            }
        }
    }

    public function test_permanent_deletion_is_never_granted_to_the_assistant(): void
    {
        foreach (AiActionMatrix::all() as $key => $row) {
            $this->assertNotSame('delete', $row['operation'], "{$key} must archive, not delete");
            $this->assertSame([], array_intersect($row['permissions'], AiActionMatrix::FORBIDDEN_PERMISSIONS), $key);
        }
    }

    public function test_financial_posting_actions_need_finance_approval_and_a_reversal_path(): void
    {
        $rows = AiActionMatrix::all();

        foreach ($rows as $key => $row) {
            if ($row['operation'] === 'create' || ! in_array($row['module'], ['finance_documents', 'cash_payments'], true)) {
                continue;
            }

            $this->assertSame(AiActionMatrix::APPROVAL_FINANCE, $row['approval'], $key);

            if ($row['operation'] === 'post' || $row['operation'] === 'credit') {
                $this->assertNotNull($row['reversal'], "{$key} needs a reversal path");
                $this->assertArrayHasKey($row['reversal'], $rows);
            }
        }
    }

    public function test_services_exist_and_models_are_tenant_scoped(): void
    {
        foreach (AiActionMatrix::all() as $key => $row) {
            if ($row['service'] !== null) {
                $this->assertTrue(class_exists($row['service']), "{$key} service missing");
            }

            if ($row['model'] !== null) {
                $this->assertContains(
                    BelongsToOrganization::class,
                    array_keys((new ReflectionClass($row['model']))->getTraits()),
                    "{$key} model is not tenant scoped",
                );
            }

            if ($row['reversal'] !== null) {
                $this->assertArrayHasKey($row['reversal'], AiActionMatrix::all());
            }
        }
    }

    public function test_write_tools_never_write_to_tables_directly(): void
    {
        foreach (glob(dirname(__DIR__, 2).'/app/Services/AI/Tools/SmartImport*.php') as $file) {
            $this->assertDoesNotMatchRegularExpression(
                '/DB::(table|insert|update|delete|statement|unprepared)\(|forceDelete\(/',
                (string) file_get_contents($file),
                basename($file).' must go through a domain service',
            );
        }
    }

    public function test_every_registered_write_tool_is_listed_in_the_matrix(): void
    {
        $tools = (new ReflectionClass(AiWriteToolRegistry::class))->getReflectionConstant('TOOLS')->getValue();

        foreach ($tools as $class) {
            $name = app($class)->name();

            $this->assertNotNull(AiActionMatrix::forTool($name), "{$name} is not in the action matrix");
        }
    }
}
