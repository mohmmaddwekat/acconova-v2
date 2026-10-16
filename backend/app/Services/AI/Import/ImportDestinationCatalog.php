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

    /**
     * Import permissions deliberately NOT served by this catalog, with why.
     * Every `*.import.*` permission must be either an entity's
     * requiredPermission() or listed here (enforced by ImportCoverageTest).
     *
     * @var array<string, string>
     */
    public const EXCEPTIONS = [
        'products.import.preview' => 'Covered: preview step of products.import.commit.',
        'parties.import.preview' => 'Covered: preview step of parties.import.commit.',
        'finance.import.template' => 'Template download only; writes nothing.',
        'finance.import.preview' => 'Financial documents: preview runs in the finance import flow, not the chat.',
        'finance.import.commit' => 'Financial documents: need finance approval and a void/correct path, so they are not chat-importable.',
        'finance.reconciliation.import' => 'Bank statements: matched by the reconciliation workflow, not bulk-created by the chat.',
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
