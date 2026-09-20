<?php

namespace App\Services;

use App\Models\FinanceAuditEvent;
use Illuminate\Database\Eloquent\Model;

class FinanceAuditService
{
    public function record(
        Model $model,
        string $action,
        ?int $actorId,
        ?string $reason = null,
        ?array $before = null,
        ?array $after = null,
    ): FinanceAuditEvent {
        return FinanceAuditEvent::create([
            'auditable_type' => class_basename($model),
            'auditable_id' => $model->getKey(),
            'action' => $action,
            'reason' => $reason,
            'before_payload' => $before,
            'after_payload' => $after,
            'created_by' => $actorId,
            'created_at' => now(),
        ]);
    }
}
