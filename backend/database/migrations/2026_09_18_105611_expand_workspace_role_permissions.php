<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Preserve the previous Staff behavior while attendance becomes its own
     * explicit permission separate from payroll.
     */
    public function up(): void
    {
        DB::table('workspace_roles')
            ->orderBy('id')
            ->get([
                'id',
                'permissions',
            ])
            ->each(function (object $role): void {
                $permissions = json_decode(
                    (string) $role->permissions,
                    true,
                );

                if (! is_array($permissions)) {
                    $permissions = [];
                }

                /*
                 * Before this migration staff.pay/staff.team_pay implicitly
                 * granted attendance operations. Existing roles keep that
                 * ability, while newly-created roles can separate the two.
                 */
                if (
                    in_array(
                        'staff.pay',
                        $permissions,
                        true,
                    )
                    && ! in_array(
                        'staff.attendance',
                        $permissions,
                        true,
                    )
                ) {
                    $permissions[] = 'staff.attendance';
                }

                if (
                    in_array(
                        'staff.team_pay',
                        $permissions,
                        true,
                    )
                    && ! in_array(
                        'staff.team_attendance',
                        $permissions,
                        true,
                    )
                ) {
                    $permissions[] = 'staff.team_attendance';
                }

                DB::table('workspace_roles')
                    ->where(
                        'id',
                        $role->id,
                    )
                    ->update([
                        'permissions' => json_encode(
                            array_values(
                                array_unique(
                                    $permissions,
                                ),
                            ),
                            JSON_THROW_ON_ERROR,
                        ),

                        'updated_at' => now(),
                    ]);
            });
    }

    /**
     * Keep newly-created permission selections intact on rollback.
     */
    public function down(): void
    {
        //
    }
};
