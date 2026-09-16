<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class WorkspaceNotificationResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'kind' => $this->kind, 'category' => $this->category, 'data' => $this->data,
            'url' => $this->url, 'read_at' => $this->read_at?->toIso8601String(), 'created_at' => $this->created_at->toIso8601String()];
    }
}
