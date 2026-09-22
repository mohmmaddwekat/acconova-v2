<?php

namespace App\Http\Controllers;

use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class NotificationRuleController extends Controller
{
    public function index(
        Request $request,
    ): JsonResponse {
        return response()->json([
            'data' => DB::table(
                'notification_rules',
            )
                ->where(
                    'organization_id',
                    app(
                        TenantContext::class,
                    )->id(),
                )
                ->where(
                    'user_id',
                    $request->user()->id,
                )
                ->latest('id')
                ->get(),
            'meta' => [
                'categories' => [
                    'stock',
                    'payments',
                    'activity',
                    'messages',
                ],
                'kinds' => [
                    'low_stock',
                    'out_of_stock',
                    'inventory_expiry',
                    'payment_due',
                    'payment_soon',
                    'payment_recorded',
                    'approval_required',
                    'contract_expiry',
                    'document_expiry',
                    'follow_up_due',
                ],
                'fields' => [
                    'amount',
                    'stock_quantity',
                    'invoice_total',
                    'count',
                ],
            ],
        ]);
    }

    public function store(
        Request $request,
    ): JsonResponse {
        $data =
            $this->validated(
                $request,
            );

        $id = DB::table(
            'notification_rules',
        )->insertGetId([
            'organization_id' => app(
                TenantContext::class,
            )->id(),
            'user_id' => $request->user()->id,
            ...$data,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'data' => DB::table(
                'notification_rules',
            )
                ->where(
                    'id',
                    $id,
                )
                ->first(),
        ], 201);
    }

    public function update(
        Request $request,
        string $rule,
    ): JsonResponse {
        $row =
            $this->ownedRule(
                $request,
                (int) $rule,
            );

        $data =
            $this->validated(
                $request,
            );

        DB::table(
            'notification_rules',
        )
            ->where(
                'id',
                $row->id,
            )
            ->update([
                ...$data,
                'updated_at' => now(),
            ]);

        return response()->json([
            'data' => DB::table(
                'notification_rules',
            )
                ->where(
                    'id',
                    $row->id,
                )
                ->first(),
        ]);
    }

    public function destroy(
        Request $request,
        string $rule,
    ): JsonResponse {
        $row =
            $this->ownedRule(
                $request,
                (int) $rule,
            );

        DB::table(
            'notification_rules',
        )
            ->where(
                'id',
                $row->id,
            )
            ->delete();

        return response()->json([
            'ok' => true,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(
        Request $request,
    ): array {
        return $request->validate([
            'name' => [
                'required',
                'string',
                'max:160',
            ],
            'category' => [
                'nullable',
                Rule::in([
                    'stock',
                    'payments',
                    'activity',
                    'messages',
                ]),
            ],
            'kind' => [
                'nullable',
                'string',
                'max:80',
            ],
            'field' => [
                'required',
                Rule::in([
                    'amount',
                    'stock_quantity',
                    'invoice_total',
                    'count',
                ]),
            ],
            'operator' => [
                'required',
                Rule::in([
                    'gt',
                    'gte',
                    'lt',
                    'lte',
                    'eq',
                ]),
            ],
            'threshold' => [
                'required',
                'string',
                'max:160',
            ],
            'active' => [
                'nullable',
                'boolean',
            ],
        ]) + [
            'active' => true,
        ];
    }

    private function ownedRule(
        Request $request,
        int $id,
    ): object {
        $row = DB::table(
            'notification_rules',
        )
            ->where(
                'organization_id',
                app(
                    TenantContext::class,
                )->id(),
            )
            ->where(
                'user_id',
                $request->user()->id,
            )
            ->where(
                'id',
                $id,
            )
            ->first();

        abort_unless(
            $row,
            404,
        );

        return $row;
    }
}
