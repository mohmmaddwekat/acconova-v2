<?php

namespace App\Console\Commands;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Services\Inventory\HistoricalStockBackfill;
use App\Tenancy\TenantContext;
use Illuminate\Console\Command;

class BackfillHistoricalStock extends Command
{
    protected $signature = 'inventory:backfill-history
        {production : CSV with columns date,source_name,canonical_name,qty}
        {--organization= : Organization id (defaults to the only organization)}
        {--apply : Write production runs and stock movements (default is a dry run)}
        {--fresh : Remove a previous backfill first and rebuild it from the current invoices}
        {--csv=stock-backfill.csv : Per-product result written under storage/app}';

    protected $description = 'Import historical production runs and post stock movements from invoices (negative balances allowed)';

    public function handle(HistoricalStockBackfill $backfill, TenantContext $tenant): int
    {
        $organizationId = $this->option('organization');
        $organization = $organizationId
            ? Organization::query()->find($organizationId)
            : (Organization::query()->count() === 1 ? Organization::query()->first() : null);

        if (! $organization) {
            $this->error('Pass --organization=<id>.');

            return self::FAILURE;
        }

        $path = (string) $this->argument('production');

        if (! is_file($path)) {
            $this->error("File not found: {$path}");

            return self::FAILURE;
        }

        $tenant->set($organization, OrganizationRole::Owner);

        $production = [];
        $handle = fopen($path, 'r');
        fgetcsv($handle, 0, ',', '"', '');

        while (($row = fgetcsv($handle, 0, ',', '"', '')) !== false) {
            $production[] = ['date' => $row[0], 'name' => $row[2], 'quantity' => $row[3]];
        }

        fclose($handle);

        $plan = $backfill->plan($production);
        $negative = count(array_filter($plan['balances'], fn (string $balance): bool => (float) $balance < 0));

        $out = fopen(storage_path('app/'.$this->option('csv')), 'w');
        fwrite($out, "\xEF\xBB\xBF");
        fputcsv($out, ['product_key', 'final_balance'], ',', '"', '');

        foreach ($plan['balances'] as $key => $balance) {
            fputcsv($out, [$key, $balance], ',', '"', '');
        }

        fclose($out);

        $this->info(count($plan['entries']).' movements, '.count($plan['balances'])." products, {$negative} negative, ".count($plan['missingProducts']).' new products needed.');

        if (! $this->option('apply')) {
            $this->comment('Dry run: nothing written. Re-run with --apply.');

            return self::SUCCESS;
        }

        if ($this->option('fresh')) {
            $backfill->reset();
            $plan = $backfill->plan($production);
        }

        $result = $backfill->apply($plan);
        $this->info("Created {$result['runs']} production runs, {$result['movements']} movements, {$result['products_created']} products.");

        return self::SUCCESS;
    }
}
