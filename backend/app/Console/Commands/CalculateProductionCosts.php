<?php

namespace App\Console\Commands;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Services\Production\ProductionCostingService;
use App\Tenancy\TenantContext;
use Illuminate\Console\Command;

class CalculateProductionCosts extends Command
{
    protected $signature = 'production:calculate-costs
        {--organization= : Organization id (defaults to the only organization)}
        {--apply : Store the costs and re-cost sale lines (default is a dry run)}
        {--csv=production-costs.csv : Result file written under storage/app}';

    protected $description = 'Compute monthly unit production cost (materials + wages + running expenses)';

    public function handle(ProductionCostingService $costing, TenantContext $tenant): int
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

        $rows = $costing->compute();
        $out = fopen(storage_path('app/'.$this->option('csv')), 'w');
        fwrite($out, "\xEF\xBB\xBF");
        fputcsv($out, ['period', 'product_id', 'quantity', 'material_unit', 'overhead_unit', 'unit_cost', 'wages_pool', 'expenses_pool'], ',', '"', '');

        foreach ($rows as $row) {
            fputcsv($out, [$row['period'], $row['product_id'], $row['quantity_produced'], round($row['material_unit_cost'], 4), round($row['overhead_unit_cost'], 4), round($row['unit_cost'], 4), round($row['wages_pool'], 2), round($row['expenses_pool'], 2)], ',', '"', '');
        }

        fclose($out);
        $this->info(count($rows).' month/product costs computed.');

        if (! $this->option('apply')) {
            $this->comment('Dry run: nothing written. Re-run with --apply.');

            return self::SUCCESS;
        }

        $result = $costing->apply($rows);
        $this->info("Stored {$result['periods']} costs, updated {$result['products']} products and {$result['lines']} sale lines.");

        return self::SUCCESS;
    }
}
