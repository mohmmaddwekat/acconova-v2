<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('billing_growth_addons', function (Blueprint $table): void {
            $table->string('provider_subscription_item_id')->nullable()->after('status')->index();
            $table->string('price_id')->nullable()->after('provider_subscription_item_id');
            $table->string('billing_interval', 12)->nullable()->after('price_id');
        });
    }

    public function down(): void
    {
        Schema::table('billing_growth_addons', function (Blueprint $table): void {
            $table->dropIndex(['provider_subscription_item_id']);
            $table->dropColumn([
                'provider_subscription_item_id',
                'price_id',
                'billing_interval',
            ]);
        });
    }
};
