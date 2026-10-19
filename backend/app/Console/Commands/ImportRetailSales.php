<?php

namespace App\Console\Commands;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Services\Finance\RetailSalesImporter;
use App\Tenancy\TenantContext;
use Illuminate\Console\Command;

class ImportRetailSales extends Command
{
    protected $signature = 'finance:import-retail-sales
        {file : Legacy SQL dump of retail sales (sale id, date, item, quantity, unit price)}
        {--organization= : Organization id (defaults to the only organization)}
        {--apply : Create invoices and cash receipts (default is a dry run)}';

    protected $description = 'Import walk-in retail sales as paid invoices for the "متفرقات" customer';

    public function handle(RetailSalesImporter $importer, TenantContext $tenant): int
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

        $sales = $importer->parse((string) $this->argument('file'));
        $plan = $importer->plan($sales);

        $this->info(count($sales)." sales in the file: {$plan['new']} new, {$plan['existing']} already imported. Expected total of the new ones: {$plan['total']}");

        if ($plan['unmatched'] !== []) {
            $this->error('No product matches: '.implode(' | ', $plan['unmatched']));

            return self::FAILURE;
        }

        if (! $this->option('apply')) {
            $this->comment('Dry run: nothing written. Re-run with --apply.');

            return self::SUCCESS;
        }

        $actorId = (int) $organization->users()->wherePivot('role', OrganizationRole::Owner->value)->value('users.id');
        $result = $importer->apply($sales, $actorId);
        $this->info("Created {$result['created']} invoices with receipts, skipped {$result['skipped']}.");

        return self::SUCCESS;
    }
}
