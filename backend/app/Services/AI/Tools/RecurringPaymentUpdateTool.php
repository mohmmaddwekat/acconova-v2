<?php

namespace App\Services\AI\Tools;

use App\Services\AI\Records\AiRecordEntity;
use App\Services\AI\Records\RecurringPaymentRecords;

final class RecurringPaymentUpdateTool extends RecordWriteTool
{
    public function __construct(private readonly RecurringPaymentRecords $records) {}

    protected function entity(): AiRecordEntity
    {
        return $this->records;
    }

    protected function operation(): string
    {
        return 'update';
    }
}
