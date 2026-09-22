<?php

namespace App\Http\Controllers;

use App\Actions\Parties\UpdateParty;
use App\Models\Party;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

class PartyBulkEditController extends Controller
{
    public function __invoke(
        Request $request,
        UpdateParty $updateParty,
    ): JsonResponse {
        Gate::authorize(
            'viewAny',
            Party::class,
        );

        $data = $request->validate([
            'party_ids' => [
                'required',
                'array',
                'min:1',
                'max:100',
            ],
            'party_ids.*' => [
                'required',
                'integer',
                'distinct',
                'min:1',
            ],
            'changes' => [
                'required',
                'array',
            ],
            'changes.city' => [
                'sometimes',
                'nullable',
                'string',
                'max:100',
            ],
            'changes.state' => [
                'sometimes',
                'nullable',
                'string',
                'max:100',
            ],
            'changes.country_code' => [
                'sometimes',
                'nullable',
                'string',
                'size:2',
            ],
        ]);

        $changes = collect(
            $data['changes'],
        )
            ->only([
                'city',
                'state',
                'country_code',
            ])
            ->map(
                fn ($value, $key) => $key === 'country_code'
                    && $value !== null
                        ? strtoupper(
                            trim(
                                (string) $value,
                            ),
                        )
                        : (
                            is_string($value)
                                ? trim($value)
                                : $value
                        ),
            )
            ->all();

        if ($changes === []) {
            throw ValidationException::withMessages([
                'changes' => [
                    'Choose at least one field to update.',
                ],
            ]);
        }

        $ids = collect(
            $data['party_ids'],
        )
            ->map(
                fn ($id): int => (int) $id,
            )
            ->values();

        $parties = Party::query()
            ->whereKey(
                $ids->all(),
            )
            ->get()
            ->keyBy('id');

        abort_if(
            $parties->count()
            !== $ids->count(),
            404,
        );

        $ordered = $ids->map(
            fn (int $id): Party => $parties->get($id),
        );

        $ordered->each(
            fn (Party $party) => Gate::authorize(
                'update',
                $party,
            ),
        );

        DB::transaction(
            function () use (
                $ordered,
                $changes,
                $updateParty,
                $request,
            ): void {
                foreach (
                    $ordered as $party
                ) {
                    $updateParty->execute(
                        $party,
                        $changes,
                    );
                }

                DB::table(
                    'bulk_action_history',
                )->insert([
                    'organization_id' => app(
                        TenantContext::class,
                    )->id(),
                    'user_id' => $request->user()->id,
                    'entity_type' => 'party',
                    'action' => 'bulk_edit',
                    'record_count' => $ordered->count(),
                    'record_ids' => json_encode(
                        $ordered
                            ->pluck('id')
                            ->map(
                                fn ($id): int => (int) $id,
                            )
                            ->values()
                            ->all(),
                        JSON_THROW_ON_ERROR,
                    ),
                    'changes' => json_encode(
                        $changes,
                        JSON_THROW_ON_ERROR,
                    ),
                    'created_at' => now(),
                ]);
            },
            3,
        );

        return response()->json([
            'data' => [
                'affected' => $ordered->count(),
                'changes' => $changes,
            ],
        ]);
    }
}
