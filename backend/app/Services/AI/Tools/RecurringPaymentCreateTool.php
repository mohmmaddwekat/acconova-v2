<?php

namespace App\Services\AI\Tools;

use App\Services\AI\Records\AiRecordEntity;
use App\Services\AI\Records\RecurringPaymentRecords;

final class RecurringPaymentCreateTool extends RecordWriteTool
{
    public function __construct(private readonly RecurringPaymentRecords $records) {}

    protected function entity(): AiRecordEntity
    {
        return $this->records;
    }

    protected function operation(): string
    {
        return 'create';
    }

    public function description(): string
    {
        return 'Add one recurring payment (rent, subscription, periodic obligation). Required from the user: title, direction '.
            '(outgoing = we pay, incoming = we receive), amount, frequency (once, daily, weekly, monthly, yearly) and first due date. '.
            'Ask for whatever is missing in the chat, one short question at a time, then call once with all values. '.
            'interval_count defaults to 1 and reminder_days to 3. The currency is the workspace currency.';
    }
}
