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
            $categories = [];
            foreach (['inventory.view' => 'stock', 'payments.view' => 'payments', 'products.view' => 'activity'] as $permission => $category) {
                if (in_array($permission, $custom->permissions, true)) {
                    $categories[] = $category;
                }
            } $query->whereIn('category', $categories);
        } elseif (app(TenantContext::class)->role() === OrganizationRole::Employee) {
            $query->where('category', 'stock');
        }

        return $query;
    }

    public function index(Request $request, NotificationCenter $center): AnonymousResourceCollection
    {
        $data = $request->validate(['page' => ['sometimes', 'integer', 'min:1'], 'unread' => ['sometimes', 'boolean'],
            'category' => ['nullable', Rule::in(['stock', 'payments', 'activity'])]]);
        $center->syncDue(app(TenantContext::class)->id());

        return WorkspaceNotificationResource::collection($this->query($request)
            ->when($data['unread'] ?? false, fn (Builder $query): Builder => $query->whereNull('read_at'))
            ->when($data['category'] ?? null, fn (Builder $query, string $category): Builder => $query->where('category', $category))
            ->latest('id')->paginate(20));
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
