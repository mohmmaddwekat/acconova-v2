<?php

namespace App\Http\Controllers;

use App\Enums\OrganizationRole;
use App\Http\Resources\WorkspaceNotificationResource;
use App\Models\WorkspaceNotification;
use App\Services\NotificationCenter;
use App\Services\WorkspacePermissions;
use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class WorkspaceNotificationController extends Controller
{
    private function query(Request $request): Builder
    {
        $query = WorkspaceNotification::query()->where('user_id', $request->user()->id);
        $custom = WorkspacePermissions::custom($request->user()->id, app(TenantContext::class)->id());
        if ($custom) {
            $categories = ['messages'];
            $permissions = $custom->permissions;

            if (in_array('inventory.view', $permissions, true)) {
                $categories[] = 'stock';
            }

            if (
                in_array('payments.view', $permissions, true)
                || in_array('finance.cash.view', $permissions, true)
                || in_array('finance.sales.view', $permissions, true)
                || in_array('finance.purchases.view', $permissions, true)
            ) {
                $categories[] = 'payments';
                $categories[] = 'activity';
            }

            if (
                in_array('products.view', $permissions, true)
                || in_array('parties.view', $permissions, true)
            ) {
                $categories[] = 'activity';
            }

            $query->whereIn(
                'category',
                array_values(array_unique($categories)),
            );
        } elseif (app(TenantContext::class)->role() === OrganizationRole::Employee) {
            $query->whereIn('category', ['stock', 'messages']);
        }

        return $query;
    }

    public function index(Request $request, NotificationCenter $center): AnonymousResourceCollection
    {
        $data = $request->validate(['page' => ['sometimes', 'integer', 'min:1'], 'unread' => ['sometimes', 'boolean'],
            'category' => ['nullable', Rule::in(['stock', 'payments', 'activity', 'messages'])]]);
        $center->syncDue(app(TenantContext::class)->id());

        return WorkspaceNotificationResource::collection($this->query($request)
            ->when($data['unread'] ?? false, fn (Builder $query): Builder => $query->whereNull('read_at'))
            ->when($data['category'] ?? null, fn (Builder $query, string $category): Builder => $query->where('category', $category))
            ->latest('id')->paginate(20));
    }

    public function digest(
        Request $request,
        NotificationCenter $center,
    ): JsonResponse {
        $center->syncDue(
            app(TenantContext::class)->id(),
        );

        $items = $this->query($request)
            ->whereNull('read_at')
            ->where(
                'created_at',
                '>=',
                now()->subDays(7),
            )
            ->latest('id')
            ->limit(200)
            ->get();

        $groups = $items
            ->groupBy('category')
            ->map(
                function (
                    $rows,
                    $category,
                ): array {
                    $kinds = $rows
                        ->groupBy('kind')
                        ->map(
                            fn ($kindRows, $kind): array => [
                                'kind' => $kind,
                                'count' => $kindRows->count(),
                            ],
                        )
                        ->sortByDesc('count')
                        ->values();

                    $latest = $rows
                        ->take(3)
                        ->map(
                            fn (WorkspaceNotification $notice): array => [
                                'id' => $notice->id,
                                'kind' => $notice->kind,
                                'data' => $notice->data,
                                'url' => $notice->url,
                                'created_at' =>
                                    $notice->created_at
                                        ->toIso8601String(),
                            ],
                        )
                        ->values();

                    return [
                        'category' => $category,
                        'count' => $rows->count(),
                        'kinds' => $kinds,
                        'latest' => $latest,
                    ];
                },
            )
            ->sortByDesc('count')
            ->values();

        return response()->json([
            'data' => [
                'total_unread' => $items->count(),
                'groups' => $groups,
                'generated_at' =>
                    now()->toIso8601String(),
            ],
        ]);
    }

    public function count(Request $request, NotificationCenter $center): JsonResponse
    {
        $center->syncDue(app(TenantContext::class)->id());

        $query = $this->query($request)->whereNull('read_at');

        return response()->json(['count' => (clone $query)->count(), 'latest_id' => $query->max('id')]);
    }

    public function read(Request $request, string $notification): JsonResponse
    {
        $item = $this->query($request)->findOrFail($notification);
        if ($item->read_at === null) {
            $item->update(['read_at' => now()]);
        }

        return response()->json(['ok' => true]);
    }

    public function readAll(Request $request): JsonResponse
    {
        $this->query($request)->whereNull('read_at')->update(['read_at' => now()]);

        return response()->json(['ok' => true]);
    }
}
