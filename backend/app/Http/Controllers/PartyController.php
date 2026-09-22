<?php

namespace App\Http\Controllers;

use App\Actions\Parties\CreateParty;
use App\Actions\Parties\DeleteParty;
use App\Actions\Parties\RestoreParty;
use App\Actions\Parties\UpdateParty;
use App\Http\Requests\DeletePartyRequest;
use App\Http\Requests\IndexPartyRequest;
use App\Http\Requests\RestorePartyRequest;
use App\Http\Requests\ShowPartyRequest;
use App\Http\Requests\StorePartyRequest;
use App\Http\Requests\UpdatePartyNotesRequest;
use App\Http\Requests\UpdatePartyRequest;
use App\Http\Resources\PartyResource;
use App\Queries\Parties\PartyIndexQuery;
use App\Services\FinanceAuthorization;
use App\Services\MentionNotifier;
use App\Services\PartyBalanceSummary;
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
    ): AnonymousResourceCollection {
        $parties =
            $partyIndexQuery->execute(
                $request->validated(),
            );

        $collection =
            $parties->getCollection();

        $balances =
            $partyBalanceSummary->forParties(
                $collection,
                FinanceAuthorization::allows(
                    $request->user(),
                    'finance.sales.view',
                ),
                FinanceAuthorization::allows(
                    $request->user(),
                    'finance.purchases.view',
                ),
                FinanceAuthorization::allows(
                    $request->user(),
                    'finance.cash.view',
                ),
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
            $currency,
        ): void {
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
