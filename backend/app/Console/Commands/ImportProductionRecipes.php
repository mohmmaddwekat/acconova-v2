<?php

namespace App\Console\Commands;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Services\Production\RecipeYieldImporter;
use App\Tenancy\TenantContext;
use Illuminate\Console\Command;

class ImportProductionRecipes extends Command
{
    protected $signature = 'production:import-recipes
        {file : Legacy SQL dump of (raw material, units per unit, product) rows}
        {--organization= : Organization id (defaults to the only organization)}
        {--apply : Create raw materials and recipes (default is a dry run)}
        {--note= : Note stored on the created recipes}';

    protected $description = 'Build production recipes from the raw material productivity (yield) file';

    public function handle(RecipeYieldImporter $importer, TenantContext $tenant): int
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

        $plan = $importer->plan($importer->parse((string) $this->argument('file')));

        $this->info(count($plan['recipes']).' recipes, '.count($plan['newMaterials']).' new raw materials.');
        $this->line('Products not found (skipped): '.implode(' | ', $plan['missingProducts']));
        $this->line('New raw materials: '.implode(' | ', $plan['newMaterials']));
        $this->line('Repeated rows with different yields (last one used): '.implode(' || ', $plan['conflicts']));

        if (! $this->option('apply')) {
            $this->comment('Dry run: nothing written. Re-run with --apply.');

            return self::SUCCESS;
        }

        $actorId = (int) $organization->users()->wherePivot('role', OrganizationRole::Owner->value)->value('users.id');
        $result = $importer->apply($plan, $actorId, (string) ($this->option('note') ?: 'Imported from raw material productivity file'));
        $this->info("Created {$result['recipes']} recipes and {$result['materials_created']} raw materials.");

        return self::SUCCESS;
    }
}
