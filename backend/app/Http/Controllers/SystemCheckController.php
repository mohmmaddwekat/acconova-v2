<?php

namespace App\Http\Controllers;

use App\Services\WorkspaceFeaturePermissions;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Throwable;

class SystemCheckController extends Controller
{
    public function __invoke(
        Request $request,
    ): JsonResponse {
        abort_unless(
            WorkspaceFeaturePermissions::allows(
                $request->user(),
                'audit.system_checks.view',
            ),
            403,
        );

        $checks = [];

        $checks[] = $this->check(
            'database_connection',
            'Database connection',
            function (): array {
                $row = DB::selectOne(
                    'SELECT 1 AS ok',
                );

                return [
                    'passed' =>
                        (int) ($row->ok ?? 0)
                        === 1,
                    'detail' =>
                        DB::connection()
                            ->getDriverName(),
                ];
            },
        );

        $requiredTables = [
            'invoice_templates',
            'recurring_invoice_profiles',
            'record_tags',
            'record_taggables',
            'record_comments',
            'record_attachments',
            'record_reminders',
            'party_relationship_links',
            'party_product_prices',
            'financial_line_fulfillments',
            'approval_requests',
            'inventory_transfer_requests',
            'purchase_requisitions',
            'bank_statement_lines',
        ];

        foreach ($requiredTables as $table) {
            $checks[] = [
                'key' => 'table:'.$table,
                'label' => 'Table '.$table,
                'passed' =>
                    Schema::hasTable(
                        $table,
                    ),
                'detail' =>
                    Schema::hasTable(
                        $table,
                    )
                        ? 'ready'
                        : 'missing migration/table',
            ];
        }

        $namedRoutes = [
            'app.finance',
            'app.finance.cashflow',
            'app.finance.anomalies',
            'app.finance.approvals',
            'app.finance.bank-reconciliation',
            'app.purchases.requisitions',
            'app.parties.intelligence',
            'app.inventory.intelligence',
            'app.inventory.transfers',
            'app.follow-ups',
        ];

        foreach ($namedRoutes as $routeName) {
            $checks[] = [
                'key' => 'route:'.$routeName,
                'label' => 'Route '.$routeName,
                'passed' =>
                    Route::has(
                        $routeName,
                    ),
                'detail' =>
                    Route::has(
                        $routeName,
                    )
                        ? route(
                            $routeName,
                            [],
                            false,
                        )
                        : 'missing',
            ];
        }

        $apiUris = [
            'api/customer-intelligence',
            'api/inventory/intelligence',
            'api/approval-requests',
            'api/purchase-requisitions',
            'api/bank-reconciliation',
            'api/inventory/transfer-requests',
        ];

        $registeredUris =
            collect(
                Route::getRoutes(),
            )
                ->map(
                    fn ($route): string =>
                        $route->uri(),
                )
                ->all();

        foreach ($apiUris as $uri) {
            $passed =
                in_array(
                    $uri,
                    $registeredUris,
                    true,
                );

            $checks[] = [
                'key' => 'api:'.$uri,
                'label' => 'API /'.$uri,
                'passed' => $passed,
                'detail' =>
                    $passed
                        ? 'registered'
                        : 'missing',
            ];
        }

        $checks[] = [
            'key' => 'storage',
            'label' => 'Laravel storage writable',
            'passed' =>
                is_writable(
                    storage_path(),
                ),
            'detail' =>
                storage_path(),
        ];

        $passed =
            collect(
                $checks,
            )
                ->where(
                    'passed',
                    true,
                )
                ->count();

        return response()->json([
            'data' => [
                'workspace' => [
                    'id' =>
                        app(TenantContext::class)
                            ->id(),
                    'name' =>
                        app(TenantContext::class)
                            ->organization()
                            ->name,
                ],
                'summary' => [
                    'passed' => $passed,
                    'failed' =>
                        count($checks)
                        - $passed,
                    'total' =>
                        count($checks),
                ],
                'checks' => $checks,
                'checked_at' =>
                    now()->toIso8601String(),
            ],
        ]);
    }

    /**
     * @param callable(): array{passed: bool, detail?: string} $callback
     *
     * @return array{key: string, label: string, passed: bool, detail: string}
     */
    private function check(
        string $key,
        string $label,
        callable $callback,
    ): array {
        try {
            $result =
                $callback();

            return [
                'key' => $key,
                'label' => $label,
                'passed' =>
                    (bool) $result['passed'],
                'detail' =>
                    (string) (
                        $result['detail']
                        ?? ''
                    ),
            ];
        } catch (Throwable $exception) {
            return [
                'key' => $key,
                'label' => $label,
                'passed' => false,
                'detail' =>
                    class_basename(
                        $exception,
                    )
                    .': '
                    .$exception->getMessage(),
            ];
        }
    }
}
