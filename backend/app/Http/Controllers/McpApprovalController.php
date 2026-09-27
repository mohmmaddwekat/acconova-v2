<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\Mcp\McpExecutor;
use App\Services\WorkspaceFeaturePermissions;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class McpApprovalController extends Controller
{
    public function approve(
        Request $request,
        int $approval,
        TenantContext $context,
        McpExecutor $executor,
    ): JsonResponse {
        WorkspaceFeaturePermissions::authorize($request->user(), 'ai.admin.configure');

        $row = DB::table('mcp_approvals')
            ->where('organization_id', $context->id())
            ->where('id', $approval)
            ->where('status', 'pending')
            ->first();

        abort_unless($row, 404);

        if ($row->expires_at && now()->isAfter($row->expires_at)) {
            DB::table('mcp_approvals')
                ->where('id', $row->id)
                ->update([
                    'status' => 'expired',
                    'updated_at' => now(),
                ]);

            throw ValidationException::withMessages([
                'approval' => ['This approval has expired.'],
            ]);
        }

        $token = null;
        $executionUser = $request->user();

        if ($row->mcp_access_token_id) {
            $token = DB::table('mcp_access_tokens')
                ->where('organization_id', $context->id())
                ->where('id', $row->mcp_access_token_id)
                ->whereNull('revoked_at')
                ->first();

            if (! $token || ($token->expires_at && now()->isAfter($token->expires_at))) {
                throw ValidationException::withMessages([
                    'approval' => ['The originating MCP key is no longer active.'],
                ]);
            }

            $executionUser = User::query()->find($token->user_id);

            $stillMember = $executionUser && DB::table('memberships')
                ->where('organization_id', $context->id())
                ->where('user_id', $executionUser->id)
                ->exists();

            if (! $stillMember) {
                throw ValidationException::withMessages([
                    'approval' => ['The MCP key owner no longer has access to this workspace.'],
                ]);
            }
        }

        $input = json_decode((string) $row->input, true) ?: [];

        $result = $executor->execute(
            $row->capability,
            $input,
            $executionUser,
            $token,
            false,
            true,
        );

        DB::table('mcp_approvals')
            ->where('organization_id', $context->id())
            ->where('id', $row->id)
            ->where('status', 'pending')
            ->update([
                'status' => 'approved',
                'reviewed_by' => $request->user()->id,
                'review_note' => $request->input('note'),
                'reviewed_at' => now(),
                'updated_at' => now(),
            ]);

        return response()->json([
            'ok' => true,
            'result' => $result,
        ]);
    }

    public function reject(Request $request, int $approval, TenantContext $context): JsonResponse
    {
        WorkspaceFeaturePermissions::authorize($request->user(), 'ai.admin.configure');

        $data = $request->validate([
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $updated = DB::table('mcp_approvals')
            ->where('organization_id', $context->id())
            ->where('id', $approval)
            ->where('status', 'pending')
            ->update([
                'status' => 'rejected',
                'reviewed_by' => $request->user()->id,
                'review_note' => $data['note'] ?? null,
                'reviewed_at' => now(),
                'updated_at' => now(),
            ]);

        abort_unless($updated, 404);

        return response()->json(['ok' => true]);
    }
}
