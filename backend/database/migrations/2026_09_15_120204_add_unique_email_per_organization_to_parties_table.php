<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Prevent duplicate non-null Party emails inside the same organization.
     *
     * The same external customer may legitimately exist in different tenant
     * organizations, so uniqueness is intentionally tenant-scoped rather than
     * global across the entire SaaS database.
     */
    public function up(): void
    {
        Schema::table('parties', function (Blueprint $table): void {
            $table->unique(
                [
                    'organization_id',
                    'email',
                ],
                'parties_organization_email_unique',
            );
        });
    }

    /**
     * Remove the tenant-scoped Party email uniqueness constraint.
     */
    public function down(): void
    {
        Schema::table('parties', function (Blueprint $table): void {
            $table->dropUnique(
                'parties_organization_email_unique',
            );
        });
    }
};
