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
use App\Services\MentionNotifier;
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
    ): AnonymousResourceCollection {
        return PartyResource::collection(
            $partyIndexQuery->execute(
                $request->validated(),
            ),
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
    ): JsonResponse {
        $party =
            $updateParty->execute(
                $request->party(),
                $request->validated(),
            );

        $notes = (string) ($request->validated()['notes'] ?? '');

        $mentions->notify(
            app(TenantContext::class)->id(),
            $request->user(),
            $notes,
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
