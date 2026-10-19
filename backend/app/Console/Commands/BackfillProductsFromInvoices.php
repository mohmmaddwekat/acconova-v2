<?php

namespace App\Console\Commands;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Services\Products\InvoiceProductBackfill;
use App\Tenancy\TenantContext;
use Illuminate\Console\Command;

class BackfillProductsFromInvoices extends Command
{
    protected $signature = 'products:backfill-from-invoices
        {--organization= : Organization id (defaults to the only organization)}
        {--apply : Create products and link invoice lines (default is a dry run)}
        {--csv=product-backfill.csv : CSV file name written under storage/app}';

    protected $description = 'Create products from free-text invoice line descriptions and link the lines to them';

    public function handle(InvoiceProductBackfill $backfill, TenantContext $tenant): int
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

        $plan = $backfill->plan();
        $path = storage_path('app/'.$this->option('csv'));
        $handle = fopen($path, 'w');
        fwrite($handle, "\xEF\xBB\xBF");
        fputcsv($handle, ['name', 'type', 'unit', 'lines', 'sale_lines', 'purchase_lines', 'sale_price', 'cost_price', 'merged_variants']);

        foreach ($plan as $item) {
            fputcsv($handle, [
                $item['name'], $item['type']->value, $item['unit'], $item['lines'],
                $item['sale_lines'], $item['purchase_lines'], $item['sale_price'],
                $item['cost_price'], implode(' | ', $item['variants']),
            ]);
        }

        fclose($handle);
        $this->info(count($plan).' products proposed. Review: '.$path);

        if (! $this->option('apply')) {
            $this->comment('Dry run: nothing written. Re-run with --apply to create and link.');

            return self::SUCCESS;
        }

        $result = $backfill->apply();
        $this->info("Created {$result['created']} products, linked {$result['linked']} lines.");

        return self::SUCCESS;
    }
}
