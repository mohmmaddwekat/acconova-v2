<?php

namespace App\Services\AI\Tools;

use App\Services\AI\Records\AiRecordEntity;
use App\Services\AI\Records\ProductRecords;

final class ProductArchiveTool extends RecordWriteTool
{
    public function __construct(private readonly ProductRecords $records) {}

    protected function entity(): AiRecordEntity
    {
        return $this->records;
    }

    protected function operation(): string
    {
        return 'archive';
    }
}
