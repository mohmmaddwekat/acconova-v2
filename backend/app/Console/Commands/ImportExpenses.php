<?php

namespace App\Console\Commands;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Services\Finance\ExpenseImporter;
use App\Tenancy\TenantContext;
use Illuminate\Console\Command;

class ImportExpenses extends Command
{
    protected $signature = 'finance:import-expenses
        {--bills= : Bills SQL file (electricity, transport, rent, tax...)}
        {--petty= : Petty cash SQL file}
        {--workbook= : Workbook with the shipping, electricity and daily purchases sheets}
        {--organization= : Organization id (defaults to the only organization)}
        {--apply : Create the cash movements (default is a dry run)}';

    protected $description = 'Import expenses as cash payments, skipping any the system already has (same date, amount and category)';

    public function handle(ExpenseImporter $importer, TenantContext $tenant): int
    {
        $organizationId = $this->option('organization');
        $organization = $organizationId
            ? Organization::query()->find($organizationId)
            : (Organization::query()->count() === 1 ? Organization::query()->first() : null);

        if (! $organization) {
            $this->error('Pass --organization=<id>.');

            return self::FAILURE;
        }

        $tenant->set($organization, OrganizationRole::Owner);

        $entries = [];

        if ($this->option('bills')) {
            $bills = $importer->parseBills((string) $this->option('bills'));
            $entries = [...$entries, ...$bills['entries']];
            $this->line('Bills: '.count($bills['entries']).' expense rows; not expenses (skipped): '.json_encode($bills['skipped'], JSON_UNESCAPED_UNICODE));
        }

        if ($this->option('petty')) {
            $petty = $importer->parsePetty((string) $this->option('petty'));
            $entries = [...$entries, ...$petty];
            $this->line('Petty cash: '.count($petty).' rows.');
        }

        if ($this->option('workbook')) {
            $sheets = $importer->parseWorkbook((string) $this->option('workbook'));
            $entries = [...$entries, ...$sheets];
            $this->line('Workbook sheets: '.count($sheets).' rows.');
        }

        $plan = $importer->plan($entries);
        $byKind = [];

        foreach ($plan['new'] as $entry) {
            $byKind[$entry['kind'].' / '.$entry['category']]['n'] = ($byKind[$entry['kind'].' / '.$entry['category']]['n'] ?? 0) + 1;
            $byKind[$entry['kind'].' / '.$entry['category']]['total'] = ($byKind[$entry['kind'].' / '.$entry['category']]['total'] ?? 0) + $entry['amount'];
        }

        ksort($byKind);

        foreach ($byKind as $label => $row) {
            $this->line(sprintf('  %-40s %4d movements  %12s', $label, $row['n'], number_format($row['total'], 2)));
        }

        $this->info(count($entries).' rows read, '.$plan['duplicates'].' already in the system, '.count($plan['new']).' movements to create, total '.number_format($plan['total'], 2));

        if (! $this->option('apply')) {
            $this->comment('Dry run: nothing written. Re-run with --apply.');

            return self::SUCCESS;
        }

        $actorId = (int) $organization->users()->wherePivot('role', OrganizationRole::Owner->value)->value('users.id');
        $result = $importer->apply($plan, $actorId);
        $this->info("Created {$result['created']} cash movements, skipped {$result['skipped']}.");

        return self::SUCCESS;
    }
}
