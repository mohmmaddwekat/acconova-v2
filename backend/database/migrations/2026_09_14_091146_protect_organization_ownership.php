<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $invalidOwnership = DB::table('organizations')
            ->whereRaw("(SELECT COUNT(*) FROM memberships WHERE memberships.organization_id = organizations.id AND memberships.role = 'owner') <> 1")
            ->exists();

        if ($invalidOwnership) {
            throw new RuntimeException('Every existing organization must have exactly one owner before enabling ownership protection.');
        }

        if (DB::getDriverName() === 'sqlite') {
            DB::unprepared(<<<'SQL'
                CREATE TRIGGER memberships_protect_owner_update
                BEFORE UPDATE ON memberships
                WHEN OLD.role = 'owner' AND (NEW.role <> 'owner' OR NEW.user_id <> OLD.user_id OR NEW.organization_id <> OLD.organization_id)
                BEGIN
                    SELECT RAISE(ABORT, 'Organization ownership cannot be changed.');
                END
                SQL);
            DB::unprepared(<<<'SQL'
                CREATE TRIGGER memberships_protect_owner_delete
                BEFORE DELETE ON memberships
                WHEN OLD.role = 'owner' AND EXISTS (SELECT 1 FROM organizations WHERE id = OLD.organization_id)
                BEGIN
                    SELECT RAISE(ABORT, 'The organization owner cannot be removed.');
                END
                SQL);

            return;
        }

        DB::unprepared(<<<'SQL'
            CREATE TRIGGER memberships_protect_owner_update
            BEFORE UPDATE ON memberships FOR EACH ROW
            BEGIN
                IF OLD.role = 'owner' AND (NEW.role <> 'owner' OR NEW.user_id <> OLD.user_id OR NEW.organization_id <> OLD.organization_id) THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Organization ownership cannot be changed.';
                END IF;
            END
            SQL);
        DB::unprepared(<<<'SQL'
            CREATE TRIGGER memberships_protect_owner_delete
            BEFORE DELETE ON memberships FOR EACH ROW
            BEGIN
                IF OLD.role = 'owner' THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The organization owner cannot be removed.';
                END IF;
            END
            SQL);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS memberships_protect_owner_update');
        DB::unprepared('DROP TRIGGER IF EXISTS memberships_protect_owner_delete');
    }
};
