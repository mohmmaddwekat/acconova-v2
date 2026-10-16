<?php

namespace App\Services\AI;

use App\Actions\Parties\CreateParty;
use App\Actions\Parties\DeleteParty;
use App\Actions\Parties\RestoreParty;
use App\Actions\Parties\UpdateParty;
use App\Actions\Products\CreateProduct;
use App\Actions\Products\DeleteProduct;
use App\Actions\Products\RestoreProduct;
use App\Actions\Products\UpdateProduct;
use App\Actions\Staff\UpsertStaffMemberFromImport;
use App\Models\AiImportDraft;
use App\Models\Party;
use App\Models\Product;
use App\Models\StaffMember;
use App\Models\User;
use App\Services\Workspace\WorkspaceFeaturePermissions;

/**
 * The single source of truth for what the executive chat may do to business
 * data. Every write the assistant performs must be a row here: it names the
 * permission(s) the user must hold, the domain service that performs the
 * write (tools never touch tables directly), the tenant-scoped model it
 * affects, whether a human approval is needed, and how it is undone.
 *
 * Rows with `status` "planned" document the intended contract for modules
 * whose chat tools are not built yet; they are never executable.
 *
 * Rules enforced by the registry and by tests:
 *  - deny by default: a tool absent from this matrix cannot run;
 *  - permanent deletion is never offered (see FORBIDDEN_PERMISSIONS);
 *  - an approved financial document is only ever changed through a reversal
 *    path (void / correct / credit / reverse), never edited or deleted.
 */
final class AiActionMatrix
{
    public const APPROVAL_NONE = 'none';

    /** The user must explicitly confirm in chat before the call runs. */
    public const APPROVAL_USER = 'user_confirm';

    /** Needs the user's confirmation and `finance.approvals.review`. */
    public const APPROVAL_FINANCE = 'finance_approval';

    /**
     * Permissions that grant irreversible deletion. The assistant must never
     * be wired to any of them; deletion is always archive + restore.
     *
     * @var list<string>
     */
    public const FORBIDDEN_PERMISSIONS = [
        'products.delete_permanent',
        'parties.delete_permanent',
        'inventory.warehouses.delete_permanent',
        'staff.delete',
        'finance.documents.delete',
        'production.runs.delete',
        'reports.builder.delete',
    ];

    /** @var array<string, array<string, mixed>> */
    private static array $testRows = [];

    /**
     * Test seam: registers extra matrix rows for test doubles. Never call
     * this from application code.
     *
     * @param  array<string, array<string, mixed>>  $rows
     */
    public static function fakeForTests(array $rows): void
    {
        self::$testRows = $rows;
    }

    /**
     * @return array<string, array{
     *     module:string, tool:?string, status:'available'|'planned', operation:string,
     *     permissions:list<string>, entity_permission:bool, service:?class-string, model:?class-string,
     *     approval:string, reversal:?string
     * }>
     */
    public static function all(): array
    {
        $ai = 'ai.business_data.write';

        return [
            ...self::$testRows,
            // Smart import: entity permission (parties/products/staff import) is added per destination.
            'import.propose' => self::row('import', 'smart_import_propose', 'available', 'draft', [$ai], true, null, AiImportDraft::class, self::APPROVAL_NONE, null),
            'import.revise' => self::row('import', 'smart_import_revise', 'available', 'draft', [$ai], true, null, AiImportDraft::class, self::APPROVAL_NONE, null),
            'import.confirm' => self::row('import', 'smart_import_confirm', 'available', 'import', [$ai], true, null, AiImportDraft::class, self::APPROVAL_USER, 'import.rollback'),
            'import.cancel' => self::row('import', 'smart_import_cancel', 'available', 'draft', [$ai], true, null, AiImportDraft::class, self::APPROVAL_NONE, null),
            'import.rollback' => self::row('import', 'smart_import_rollback', 'available', 'reverse', [$ai], true, null, AiImportDraft::class, self::APPROVAL_USER, null),

            // Parties
            'party.create' => self::tool('party_create', 'parties', 'create', ['parties.create'], CreateParty::class, Party::class),
            'party.update' => self::tool('party_update', 'parties', 'update', ['parties.update'], UpdateParty::class, Party::class),
            'party.archive' => self::tool('party_archive', 'parties', 'archive', ['parties.archive'], DeleteParty::class, Party::class, self::APPROVAL_USER, 'party.restore'),
            'party.restore' => self::tool('party_restore', 'parties', 'restore', ['parties.archive'], RestoreParty::class, Party::class),

            // Products
            'product.create' => self::tool('product_create', 'products', 'create', ['products.create'], CreateProduct::class, Product::class),
            'product.update' => self::tool('product_update', 'products', 'update', ['products.update'], UpdateProduct::class, Product::class),
            'product.archive' => self::tool('product_archive', 'products', 'archive', ['products.archive'], DeleteProduct::class, Product::class, self::APPROVAL_USER, 'product.restore'),
            'product.restore' => self::tool('product_restore', 'products', 'restore', ['products.archive'], RestoreProduct::class, Product::class),

            // Staff
            'staff.upsert' => self::planned('staff', 'update', ['staff.manage'], UpsertStaffMemberFromImport::class, StaffMember::class, self::APPROVAL_USER),

            // Inventory (stock moves are posted adjustments, undone by an opposite adjustment)
            'inventory.adjust' => self::planned('inventory', 'post', ['inventory.adjustments.manage'], null, null, self::APPROVAL_USER, 'inventory.adjust'),
            'inventory.transfer' => self::planned('inventory', 'post', ['inventory.stock_transfer.manage'], null, null, self::APPROVAL_USER, 'inventory.transfer'),

            // Production
            'production.run.create' => self::planned('production', 'create', ['production.runs.create'], null, null),
            'production.run.post' => self::planned('production', 'post', ['production.runs.post'], null, null, self::APPROVAL_USER, 'production.run.reverse'),
            'production.run.reverse' => self::planned('production', 'reverse', ['production.runs.reverse'], null, null, self::APPROVAL_FINANCE),

            // Finance documents: issued documents are immutable; fix them with void / correct / credit.
            'finance.document.draft' => self::planned('finance_documents', 'create', ['finance.documents.create'], null, null),
            'finance.document.issue' => self::planned('finance_documents', 'post', ['finance.documents.issue'], null, null, self::APPROVAL_FINANCE, 'finance.document.void'),
            'finance.document.void' => self::planned('finance_documents', 'void', ['finance.documents.void'], null, null, self::APPROVAL_FINANCE),
            'finance.document.correct' => self::planned('finance_documents', 'reverse', ['finance.documents.correct'], null, null, self::APPROVAL_FINANCE),
            'finance.document.apply_credit' => self::planned('finance_documents', 'credit', ['finance.documents.apply_credit'], null, null, self::APPROVAL_FINANCE, 'finance.document.void'),

            // Cash & payments
            'cash.receive' => self::planned('cash_payments', 'post', ['finance.cash.receive'], null, null, self::APPROVAL_FINANCE, 'cash.reverse'),
            'cash.pay' => self::planned('cash_payments', 'post', ['finance.cash.pay'], null, null, self::APPROVAL_FINANCE, 'cash.reverse'),
            'cash.reverse' => self::planned('cash_payments', 'reverse', ['finance.cash.reverse'], null, null, self::APPROVAL_FINANCE),
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    public static function forTool(string $toolName): ?array
    {
        foreach (self::all() as $key => $row) {
            if ($row['status'] === 'available' && $row['tool'] === $toolName) {
                return ['key' => $key, ...$row];
            }
        }

        return null;
    }

    /**
     * Whether the user holds every permission the matrix requires for the
     * tool, plus finance approval when the action demands it. The tool's
     * own destination permission (for imports) is still checked by the tool.
     */
    public static function userMayRun(User $user, string $toolName): bool
    {
        $row = self::forTool($toolName);

        if ($row === null) {
            return false;
        }

        foreach ($row['permissions'] as $permission) {
            if (! WorkspaceFeaturePermissions::allows($user, $permission)) {
                return false;
            }
        }

        return $row['approval'] !== self::APPROVAL_FINANCE
            || WorkspaceFeaturePermissions::allows($user, 'finance.approvals.review');
    }

    /**
     * @param  list<string>  $permissions
     * @param  class-string|null  $service
     * @param  class-string|null  $model
     * @return array<string, mixed>
     */
    private static function row(
        string $module,
        ?string $tool,
        string $status,
        string $operation,
        array $permissions,
        bool $entityPermission,
        ?string $service,
        ?string $model,
        string $approval,
        ?string $reversal,
    ): array {
        return [
            'module' => $module,
            'tool' => $tool,
            'status' => $status,
            'operation' => $operation,
            'permissions' => $permissions,
            'entity_permission' => $entityPermission,
            'service' => $service,
            'model' => $model,
            'approval' => $approval,
            'reversal' => $reversal,
        ];
    }

    /**
     * @param  list<string>  $permissions
     * @param  class-string|null  $service
     * @param  class-string|null  $model
     * @return array<string, mixed>
     */
    private static function tool(
        string $tool,
        string $module,
        string $operation,
        array $permissions,
        ?string $service,
        ?string $model,
        string $approval = self::APPROVAL_NONE,
        ?string $reversal = null,
    ): array {
        return self::row($module, $tool, 'available', $operation, $permissions, false, $service, $model, $approval, $reversal);
    }

    /**
     * @param  list<string>  $permissions
     * @param  class-string|null  $service
     * @param  class-string|null  $model
     * @return array<string, mixed>
     */
    private static function planned(
        string $module,
        string $operation,
        array $permissions,
        ?string $service,
        ?string $model,
        string $approval = self::APPROVAL_NONE,
        ?string $reversal = null,
    ): array {
        return self::row($module, null, 'planned', $operation, $permissions, false, $service, $model, $approval, $reversal);
    }
}
