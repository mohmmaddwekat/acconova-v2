<?php

namespace App\Services\AI\Tools;

use App\Services\AI\Records\AiRecordEntity;
use App\Services\AI\Records\RecurringPaymentRecords;

final class RecurringPaymentArchiveTool extends RecordWriteTool
{
    public function __construct(private readonly RecurringPaymentRecords $records) {}

    protected function entity(): AiRecordEntity
    {
        return $this->records;
    }

    protected function operation(): string
    {
        return 'archive';
    }

    public function description(): string
    {
        return 'Pause one recurring payment (it stays and can be resumed with recurring_payment_restore; nothing is deleted). '.
            'Call only when the user asks to stop or pause it. Never guess the record: if several match, ask which one. '.
            'The first call only returns a plan (confirmation_required): show it and wait for the user\'s explicit yes in their next message, '.
            'then call again with the same arguments plus confirm_token.';
    }
}
