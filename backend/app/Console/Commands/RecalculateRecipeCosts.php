<?php

namespace App\Console\Commands;

use App\Enums\OrganizationRole;
use App\Enums\ProductType;
use App\Models\Organization;
use App\Models\Product;
use App\Services\Production\RecipeCostCalculator;
use App\Tenancy\TenantContext;
use Illuminate\Console\Command;

class RecalculateRecipeCosts extends Command
{
    protected $signature = 'production:recalculate-costs
        {--organization= : Organization id (defaults to the only organization)}
        {--apply : Write costs (default is a dry run)}';

    protected $description = 'Set each recipe product cost from its raw materials and fill missing cost snapshots on sale lines';

    public function handle(RecipeCostCalculator $calculator, TenantContext $tenant): int
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

        $costs = $calculator->costs();
        $this->info(count($costs).' products have a recipe cost.');

        if (! $this->option('apply')) {
            $this->comment('Dry run: nothing written. Re-run with --apply.');

            return self::SUCCESS;
        }

        $result = $calculator->apply();
        $this->info("Updated {$result['products']} product costs and {$result['lines']} sale lines.");

        $stillZero = Product::query()->where('type', ProductType::Product)->where('cost_price', 0)->pluck('name')->all();
        $this->line('Products with no cost (no recipe and no purchases): '.implode(' | ', $stillZero));

        return self::SUCCESS;
    }
}
