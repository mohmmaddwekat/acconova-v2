<?php

namespace App\Http\Controllers\Live;

use App\Http\Controllers\Controller;
use App\Support\LiveDataVersion;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;

class LiveVersionController extends Controller
{
    public function __invoke(TenantContext $tenant): JsonResponse
    {
        return response()->json([
            'version' => LiveDataVersion::current($tenant->id()),
        ]);
    }
}
