<?php

namespace App\Services\AI\Import;

use App\Models\User;
use App\Services\AI\Import\Contracts\ImportableEntity;
use App\Services\AI\Import\Entities\PartyImportable;
use App\Services\AI\Import\Entities\ProductImportable;
use App\Services\AI\Import\Entities\StaffMemberImportable;
use App\Services\Workspace\WorkspaceFeaturePermissions;
use LogicException;

class ImportDestinationCatalog
{
    /**
     * Entities the smart import engine can target.
     *
     * @var list<class-string<ImportableEntity>>
     */
    public const ENTITIES = [
        PartyImportable::class,
        ProductImportable::class,
        StaffMemberImportable::class,
    ];

    /** @return list<ImportableEntity> */
    public function all(): array
    {
        return array_map(
            static fn (string $entity): ImportableEntity => app($entity),
            self::ENTITIES,
        );
    }

    public function find(string $key): ?ImportableEntity
    {
        foreach ($this->all() as $entity) {
            if ($entity->key() === $key) {
                return $entity;
            }
        }

        return null;
    }

    /**
     * Describe every destination the given user is allowed to import into.
     *
     * @return list<array{key:string,label:string,fields:array<string,mixed>}>
     */
    public function definitionsFor(User $user): array
    {
        $allowed = array_filter(
            $this->all(),
            fn (ImportableEntity $entity): bool => $this->userMayImportTo($entity, $user),
        );

        return array_values(array_map(
            static fn (ImportableEntity $entity): array => [
                'key' => $entity->key(),
                'label' => $entity->label(),
                'fields' => $entity->fieldSchema(),
            ],
            $allowed,
        ));
    }

    /**
     * Resolve the user's access safely even when no tenant context is
     * currently active, matching the existing Policy classes' convention.
     */
    private function userMayImportTo(ImportableEntity $entity, User $user): bool
    {
        try {
            return WorkspaceFeaturePermissions::allows(
                $user,
                $entity->requiredPermission(),
            );
        } catch (LogicException) {
            return false;
        }
    }
}
