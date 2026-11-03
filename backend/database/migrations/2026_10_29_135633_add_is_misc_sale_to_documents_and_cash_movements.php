<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const PARTY_NAME = 'متفرقات';

    public function up(): void
    {
        Schema::table('financial_documents', function (Blueprint $table): void {
            $table->boolean('is_misc_sale')->default(false)->after('kind')->index();
        });

        Schema::table('cash_movements', function (Blueprint $table): void {
            $table->boolean('is_misc_sale')->default(false)->after('category')->index();
        });

        $partyIds = DB::table('parties')
            ->where(fn ($query) => $query->where('name', self::PARTY_NAME)->orWhere('company_name', self::PARTY_NAME))
            ->pluck('id');

        if ($partyIds->isEmpty()) {
            return;
        }

        DB::table('financial_documents')
            ->where('kind', 'sale_invoice')
            ->whereIn('party_id', $partyIds)
            ->update(['is_misc_sale' => true]);

        DB::table('cash_movements')
            ->where('direction', 'incoming')
            ->where('category', 'customer_receipt')
            ->whereIn('party_id', $partyIds)
            ->update(['is_misc_sale' => true]);
    }

    public function down(): void
    {
        Schema::table('financial_documents', function (Blueprint $table): void {
            $table->dropColumn('is_misc_sale');
        });

        Schema::table('cash_movements', function (Blueprint $table): void {
            $table->dropColumn('is_misc_sale');
        });
    }
};
