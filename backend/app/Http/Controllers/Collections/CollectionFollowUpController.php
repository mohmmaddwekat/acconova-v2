<?php

namespace App\Http\Controllers\Collections;

use App\Http\Controllers\Controller;
use App\Models\CollectionAlert;
use App\Models\CollectionContact;
use App\Models\Party;
use App\Services\Collections\CollectionAlertService;
use App\Services\Finance\FinanceAuthorization;
use App\Services\Workspace\WorkspaceFeaturePermissions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The collections follow-up queue, its alert rules and the contact log.
 * Viewing needs collections and sales visibility; recording contacts or
 * snoozing needs promise management; changing rules needs sales management.
 */
class CollectionFollowUpController extends Controller
{
    public function index(Request $request, CollectionAlertService $service): JsonResponse
    {
        $this->authorizeView($request);

        if ($request->boolean('refresh')) {
            $service->evaluate();
        } else {
            $service->evaluateIfStale();
        }

        return response()->json([
            'data' => $service->followUps(),
            'meta' => ['outbound_messages' => 'never_automatic'],
        ]);
    }

    public function rules(Request $request, CollectionAlertService $service): JsonResponse
    {
        $this->authorizeView($request);

        return response()->json(['data' => $service->rules()->values()->map(fn ($rule): array => $this->rulePayload($rule))]);
    }

    public function updateRule(Request $request, string $kind, CollectionAlertService $service): JsonResponse
    {
        abort_unless(FinanceAuthorization::allows($request->user(), 'finance.sales.manage'), 403);

        return response()->json(['data' => $this->rulePayload($service->updateRule($kind, $request->only([
            'enabled', 'threshold_days', 'min_amount', 'repeat_after_days', 'approved_channels',
        ])))]);
    }

    public function contacts(Request $request, int $party): JsonResponse
    {
        $this->authorizeView($request);
        $record = Party::withTrashed()->findOrFail($party);

        return response()->json(['data' => CollectionContact::query()
            ->where('party_id', $record->id)
            ->latest('contacted_at')
            ->limit(30)
            ->get()
            ->map(fn (CollectionContact $contact): array => [
                'id' => $contact->id,
                'channel' => $contact->channel,
                'outcome' => $contact->outcome,
                'note' => $contact->note,
                'contacted_at' => $contact->contacted_at->toIso8601String(),
                'next_contact_on' => $contact->next_contact_on?->toDateString(),
                'by' => $contact->user_id,
            ])->values()]);
    }

    public function logContact(Request $request, int $party, CollectionAlertService $service): JsonResponse
    {
        $this->authorizeAct($request);
        $record = Party::withTrashed()->findOrFail($party);

        $contact = $service->logContact($record, $request->only(['channel', 'outcome', 'note', 'contacted_at', 'next_contact_on']), $request->user());

        return response()->json(['data' => ['id' => $contact->id]], 201);
    }

    public function snooze(Request $request, int $alert, CollectionAlertService $service): JsonResponse
    {
        $this->authorizeAct($request);

        $updated = $service->snooze(CollectionAlert::query()->findOrFail($alert), (string) $request->input('until'));

        return response()->json(['data' => ['id' => $updated->id, 'status' => $updated->status, 'snoozed_until' => $updated->snoozed_until?->toDateString()]]);
    }

    public function resolve(Request $request, int $alert, CollectionAlertService $service): JsonResponse
    {
        $this->authorizeAct($request);

        $updated = $service->resolve(CollectionAlert::query()->findOrFail($alert));

        return response()->json(['data' => ['id' => $updated->id, 'status' => $updated->status]]);
    }

    private function authorizeView(Request $request): void
    {
        abort_unless(
            WorkspaceFeaturePermissions::allows($request->user(), 'operations.collections.view')
            && FinanceAuthorization::allows($request->user(), 'finance.sales.view'),
            403,
        );
    }

    private function authorizeAct(Request $request): void
    {
        $this->authorizeView($request);

        abort_unless(WorkspaceFeaturePermissions::allows($request->user(), 'operations.promises.manage'), 403);
    }

    /**
     * @return array<string, mixed>
     */
    private function rulePayload(object $rule): array
    {
        return [
            'kind' => $rule->kind,
            'enabled' => $rule->enabled,
            'threshold_days' => $rule->threshold_days,
            'min_amount' => $rule->min_amount,
            'repeat_after_days' => $rule->repeat_after_days,
            'approved_channels' => $rule->approved_channels,
        ];
    }
}
