<?php

namespace App\Http\Controllers\Parties;

use App\Actions\Parties\CreateParty;
use App\Actions\Parties\DeleteParty;
use App\Actions\Parties\RestoreParty;
use App\Actions\Parties\UpdateParty;
use App\Http\Controllers\Controller;
use App\Http\Requests\DeletePartyRequest;
use App\Http\Requests\IndexPartyRequest;
use App\Http\Requests\RestorePartyRequest;
use App\Http\Requests\ShowPartyRequest;
use App\Http\Requests\StorePartyRequest;
use App\Http\Requests\UpdatePartyNotesRequest;
use App\Http\Requests\UpdatePartyRequest;
use App\Http\Resources\PartyResource;
use App\Queries\Parties\PartyIndexQuery;
use App\Services\Collaboration\MentionNotifier;
use App\Services\Finance\FinanceAuthorization;
use App\Services\Parties\PartyBalanceOverview;
use App\Services\Parties\PartyBalanceSummary;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class PartyController extends Controller
{
    /**
     * Return a searchable and paginated Party list for the active tenant.
     */
    public function index(
        IndexPartyRequest $request,
        PartyIndexQuery $partyIndexQuery,
        PartyBalanceSummary $partyBalanceSummary,
        PartyBalanceOverview $partyBalanceOverview,
    ): AnonymousResourceCollection {
        [$canSales, $canPurchases, $canCash] = $this->balancePermissions($request);

        $filters = $request->validated();

        if (! empty($filters['balance'])) {
            $filters['party_ids'] = $partyBalanceOverview->matchingIds(
                $filters['balance'],
                $canSales,
                $canPurchases,
                $canCash,
            );
        }

        $parties =
            $partyIndexQuery->execute(
                $filters,
            );

        $collection =
            $parties->getCollection();

        $balances =
            $partyBalanceSummary->forParties(
                $collection,
                $canSales,
                $canPurchases,
                $canCash,
            );

        $aging = $partyBalanceOverview->aging(
            $balances,
            $canSales,
            $canPurchases,
        );

        $organization =
            app(TenantContext::class)
                ->organization();

        $currency =
            strtoupper(
                (string) (
                    $organization
                        ->preferences['currency']
                    ?? 'ILS'
                ),
            );

        $collection->each(function (
            $party,
        ) use (
            $balances,
            $aging,
            $currency,
            $canSales,
            $canPurchases,
            $canCash,
        ): void {
            $roles =
                $party->roles
                    ->pluck('role')
                    ->map(
                        fn ($role): string => $role instanceof \BackedEnum
                            ? (string) $role->value
                            : (string) $role,
                    )
                    ->all();

            if (! PartyBalanceOverview::canSeeBalance($roles, $canSales, $canPurchases, $canCash)) {
                $party->setAttribute(
                    'balance_summary',
                    null,
                );

                return;
            }

            $summary =
                $balances[$party->id]
                ?? [
                    'customer_position' => 0.0,
                    'supplier_position' => 0.0,
                    'owed_to_us' => 0.0,
                    'we_owe' => 0.0,
                ];

            $party->setAttribute(
                'balance_summary',
                [
                    'customer_position' => number_format(
                        (float) $summary['customer_position'],
                        4,
                        '.',
                        '',
                    ),
                    'supplier_position' => number_format(
                        (float) $summary['supplier_position'],
                        4,
                        '.',
                        '',
                    ),
                    'owed_to_us' => number_format(
                        (float) $summary['owed_to_us'],
                        4,
                        '.',
                        '',
                    ),
                    'we_owe' => number_format(
                        (float) $summary['we_owe'],
                        4,
                        '.',
                        '',
                    ),
                    'currency' => $currency,
                    'aging' => $aging[$party->id] ?? null,
                ],
            );
        });

        $parties->setCollection(
            $collection,
        );

        return PartyResource::collection(
            $parties,
        );
    }

    /**
     * Return workspace-wide balance totals and tab counts for the Party index.
     */
    public function overview(
        IndexPartyRequest $request,
        PartyBalanceOverview $partyBalanceOverview,
    ): JsonResponse {
        [$canSales, $canPurchases, $canCash] = $this->balancePermissions($request);

        $currency = strtoupper(
            (string) (app(TenantContext::class)->organization()->preferences['currency'] ?? 'ILS'),
        );

        return response()->json([
            'data' => [
                ...$partyBalanceOverview->overview($canSales, $canPurchases, $canCash),
                'balances_visible' => $canCash && ($canSales || $canPurchases),
                'currency' => $currency,
                'aging_days' => [
                    'current' => PartyBalanceOverview::BUCKET_CURRENT_DAYS,
                    'late' => PartyBalanceOverview::BUCKET_LATE_DAYS,
                ],
            ],
        ]);
    }

    /**
     * Resolve which finance areas the viewer may read balances from.
     *
     * @return array{0: bool, 1: bool, 2: bool}
     */
    private function balancePermissions(
        IndexPartyRequest $request,
    ): array {
        return [
            FinanceAuthorization::allows($request->user(), 'finance.sales.view'),
            FinanceAuthorization::allows($request->user(), 'finance.purchases.view'),
            FinanceAuthorization::allows($request->user(), 'finance.cash.view'),
        ];
    }

    /**
     * Return one authorized active Party from the current tenant.
     */
    public function show(
        ShowPartyRequest $request,
    ): JsonResponse {
        return (
            new PartyResource(
                $request->party(),
            )
        )->response();
    }

    /**
     * Create a new Party for the current organization.
     */
    public function store(
        StorePartyRequest $request,
        CreateParty $createParty,
    ): JsonResponse {
        $party =
            $createParty->execute(
                $request->validated(),
            );

        return (
            new PartyResource(
                $party,
            )
        )
            ->response()
            ->setStatusCode(
                201,
            );
    }

    /**
     * Update an authorized Party and optionally synchronize its roles.
     */
    public function update(
        UpdatePartyRequest $request,
        UpdateParty $updateParty,
        MentionNotifier $mentions,
    ): JsonResponse {
        $party =
            $updateParty->execute(
                $request->party(),
                $request->validated(),
            );

        if ($request->has('notes')) {
            $mentions->notify(
                app(TenantContext::class)->id(),
                $request->user(),
                (string) ($request->validated()['notes'] ?? ''),
                'party-notes:'.$party->id.':'.$party->updated_at?->getTimestamp(),
                '/app/parties?focus='.$party->id,
            );
        }

        return (
            new PartyResource(
                $party,
            )
        )->response();
    }

    /**
     * Update internal Party notes using the normal Party update action so the
     * standard PartyUpdated domain event remains consistent.
     */
    public function updateNotes(
        UpdatePartyNotesRequest $request,
        UpdateParty $updateParty,
        MentionNotifier $mentions,
    ): JsonResponse {
        $party =
            $updateParty->execute(
                $request->party(),
                $request->validated(),
            );

        $mentions->notify(
            app(TenantContext::class)->id(),
            $request->user(),
            (string) ($request->validated()['notes'] ?? ''),
            'party-notes:'.$party->id.':'.$party->updated_at?->getTimestamp(),
            '/app/parties?focus='.$party->id,
        );

        return (
            new PartyResource(
                $party,
            )
        )->response();
    }

    /**
     * Soft-delete an authorized Party while preserving historical data.
     */
    public function destroy(
        DeletePartyRequest $request,
        DeleteParty $deleteParty,
    ): Response {
        $deleteParty->execute(
            $request->party(),
        );

        return response()
            ->noContent();
    }

    /**
     * Restore a previously archived Party inside the current tenant.
     */
    public function restore(
        RestorePartyRequest $request,
        RestoreParty $restoreParty,
    ): JsonResponse {
        $party =
            $restoreParty->execute(
                $request->party(),
            );

        return (
            new PartyResource(
                $party,
            )
        )->response();
    }
}
