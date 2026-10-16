<?php

namespace App\Services\AI\Tools;

use App\Services\AI\Records\AiRecordEntity;
use App\Services\AI\Records\PartyRecords;

final class PartyCreateTool extends RecordWriteTool
{
    public function __construct(private readonly PartyRecords $records) {}

    protected function entity(): AiRecordEntity
    {
        return $this->records;
    }

    protected function operation(): string
    {
        return 'create';
    }
}
