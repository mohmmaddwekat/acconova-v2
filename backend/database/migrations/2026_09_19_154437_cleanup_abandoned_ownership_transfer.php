<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Remove the abandoned ownership-transfer experiment and restore strict
     * protection around the one immutable organization Owner membership.
     */
    public function up(): void
    {
        /*
         * Never silently destroy historical ownership-transfer data.
         *
         * The feature was abandoned before launch, so this table should be
         * empty. If it contains records we stop and inspect them manually.
         */
        if (
            Schema::hasTable(
                'organization_ownership_transfers',
            )
            && DB::table(
                'organization_ownership_transfers',
            )->exists()
        ) {
            throw new RuntimeException(
                'The abandoned ownership transfer table contains data. Cleanup stopped to avoid deleting ownership history.',
            );
        }

        Schema::dropIfExists(
            'organization_ownership_transfers',
        );

        /*
         * A failed MySQL migration can leave DDL changes behind because those
         * changes are not guaranteed to roll back with the migration record.
         *
         * Rebuild both ownership triggers explicitly so an Owner can never be
         * changed, downgraded, moved, or deleted through a normal membership
         * operation.
         */
        DB::unprepared(
            'DROP TRIGGER IF EXISTS memberships_protect_owner_update',
        );

        DB::unprepared(
            'DROP TRIGGER IF EXISTS memberships_protect_owner_delete',
        );

        if (
            DB::getDriverName()
            === 'sqlite'
        ) {
            DB::unprepared(<<<'SQL'
                CREATE TRIGGER memberships_protect_owner_update
                BEFORE UPDATE ON memberships
                WHEN OLD.role = 'owner'
                  AND (
                    NEW.role <> 'owner'
                    OR NEW.user_id <> OLD.user_id
                    OR NEW.organization_id <> OLD.organization_id
                  )
                BEGIN
                    SELECT RAISE(
                        ABORT,
                        'Organization ownership cannot be changed.'
                    );
                END
                SQL);

            DB::unprepared(<<<'SQL'
                CREATE TRIGGER memberships_protect_owner_delete
                BEFORE DELETE ON memberships
                WHEN OLD.role = 'owner'
                  AND EXISTS (
                    SELECT 1
                    FROM organizations
                    WHERE id = OLD.organization_id
                  )
                BEGIN
                    SELECT RAISE(
                        ABORT,
                        'The organization owner cannot be removed.'
                    );
                END
                SQL);

            return;
        }

        DB::unprepared(<<<'SQL'
            CREATE TRIGGER memberships_protect_owner_update
            BEFORE UPDATE ON memberships
            FOR EACH ROW
            BEGIN
                IF OLD.role = 'owner'
                   AND (
                        NEW.role <> 'owner'
                        OR NEW.user_id <> OLD.user_id
                        OR NEW.organization_id <> OLD.organization_id
                   )
                THEN
                    SIGNAL SQLSTATE '45000'
                        SET MESSAGE_TEXT = 'Organization ownership cannot be changed.';
                END IF;
            END
            SQL);

        DB::unprepared(<<<'SQL'
            CREATE TRIGGER memberships_protect_owner_delete
            BEFORE DELETE ON memberships
            FOR EACH ROW
            BEGIN
                IF OLD.role = 'owner'
                THEN
                    SIGNAL SQLSTATE '45000'
                        SET MESSAGE_TEXT = 'The organization owner cannot be removed.';
                END IF;
            END
            SQL);
    }

    /**
     * Keep strict Owner protection when rolling this cleanup migration back.
     *
     * The abandoned ownership-transfer feature must not be recreated by a
     * rollback.
     */
    public function down(): void
    {
        DB::unprepared(
            'DROP TRIGGER IF EXISTS memberships_protect_owner_update',
        );

        DB::unprepared(
            'DROP TRIGGER IF EXISTS memberships_protect_owner_delete',
        );

        if (
            DB::getDriverName()
            === 'sqlite'
        ) {
            DB::unprepared(<<<'SQL'
                CREATE TRIGGER memberships_protect_owner_update
                BEFORE UPDATE ON memberships
                WHEN OLD.role = 'owner'
                  AND (
                    NEW.role <> 'owner'
                    OR NEW.user_id <> OLD.user_id
                    OR NEW.organization_id <> OLD.organization_id
                  )
                BEGIN
                    SELECT RAISE(
                        ABORT,
                        'Organization ownership cannot be changed.'
                    );
                END
                SQL);

            DB::unprepared(<<<'SQL'
                CREATE TRIGGER memberships_protect_owner_delete
                BEFORE DELETE ON memberships
                WHEN OLD.role = 'owner'
                  AND EXISTS (
                    SELECT 1
                    FROM organizations
                    WHERE id = OLD.organization_id
                  )
                BEGIN
                    SELECT RAISE(
                        ABORT,
                        'The organization owner cannot be removed.'
                    );
                END
                SQL);

            return;
        }

        DB::unprepared(<<<'SQL'
            CREATE TRIGGER memberships_protect_owner_update
            BEFORE UPDATE ON memberships
            FOR EACH ROW
            BEGIN
                IF OLD.role = 'owner'
                   AND (
                        NEW.role <> 'owner'
                        OR NEW.user_id <> OLD.user_id
                        OR NEW.organization_id <> OLD.organization_id
                   )
                THEN
                    SIGNAL SQLSTATE '45000'
                        SET MESSAGE_TEXT = 'Organization ownership cannot be changed.';
                END IF;
            END
            SQL);

        DB::unprepared(<<<'SQL'
            CREATE TRIGGER memberships_protect_owner_delete
            BEFORE DELETE ON memberships
            FOR EACH ROW
            BEGIN
                IF OLD.role = 'owner'
                THEN
                    SIGNAL SQLSTATE '45000'
                        SET MESSAGE_TEXT = 'The organization owner cannot be removed.';
                END IF;
            END
            SQL);
    }
};
