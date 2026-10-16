<?php

namespace App\Services\AI\Tools;

use App\Services\AI\Records\AiRecordEntity;
use App\Services\AI\Records\RecurringPaymentRecords;

final class RecurringPaymentRestoreTool extends RecordWriteTool
{
    public function __construct(private readonly RecurringPaymentRecords $records) {}

    protected function entity(): AiRecordEntity
    {
        return $this->records;
    }

    protected function operation(): string
    {
        return 'restore';
    }

    public function description(): string
    {
        return 'Resume one paused recurring payment. Identify it with record_id or an exact lookup.';
    }
}
