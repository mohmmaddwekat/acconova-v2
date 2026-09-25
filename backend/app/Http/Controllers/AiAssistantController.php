<?php

namespace App\Http\Controllers;

use App\Models\AiConversation;
use App\Models\AiMessage;
use App\Services\AI\AiAssistantOrchestrator;
use App\Services\AI\AiBusinessToolRegistry;
use App\Services\AI\AiConversationMemory;
use App\Services\AI\AiGateway;
use App\Services\Billing\AiCreditService;
use App\Services\WorkspaceFeaturePermissions;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class AiAssistantController extends Controller
{
    public function status(
        Request $request,
        AiGateway $gateway,
        AiBusinessToolRegistry $tools,
    ): JsonResponse {
        WorkspaceFeaturePermissions::authorize(
            $request->user(),
            'ai.assistant.use',
        );

        return response()->json([
            'data' => [
                /*
                 * Tenant users only need to know whether AccoNova AI is
                 * available. Provider names, models and authentication modes
                 * are platform-operator details and stay server-side.
                 */
                'configured' => $gateway->configured(),
                'memory' => [
                    'recent_messages' => (int) config('ai.memory.recent_messages', 20),
                    'summarize_after_messages' => (int) config('ai.memory.summarize_after_messages', 40),
                ],
                'tools' => [
                    'enabled' => (bool) config('ai.tools.enabled', true),
                    'available' => array_map(
                        fn (array $tool): string => $tool['name'],
                        $tools->definitionsFor($request->user()),
                    ),
                ],
            ],
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        WorkspaceFeaturePermissions::authorize(
            $request->user(),
            'ai.assistant.use',
        );

        $conversations = AiConversation::query()
            ->where('user_id', $request->user()->id)
            ->latest('last_message_at')
            ->latest('id')
            ->paginate(30);

        return response()->json($conversations);
    }

    public function store(Request $request): JsonResponse
    {
        WorkspaceFeaturePermissions::authorize(
            $request->user(),
            'ai.assistant.use',
        );

        $validated = $request->validate([
            'title' => ['nullable', 'string', 'max:120'],
        ]);

        $conversation = AiConversation::create([
            'user_id' => $request->user()->id,
            'title' => $validated['title'] ?? null,
            'last_message_at' => now(),
        ]);

        return response()->json([
            'data' => $conversation,
        ], 201);
    }

    public function show(
        Request $request,
        int $conversation,
    ): JsonResponse {
        WorkspaceFeaturePermissions::authorize(
            $request->user(),
            'ai.assistant.use',
        );

        $conversationRecord = AiConversation::query()->findOrFail($conversation);
        $this->assertOwner($request, $conversationRecord);

        return response()->json([
            'data' => [
                'conversation' => $conversationRecord,
                'messages' => $conversationRecord
                    ->messages()
                    ->orderBy('id')
                    ->limit(200)
                    ->get(),
            ],
        ]);
    }

    public function message(
        Request $request,
        int $conversation,
        AiGateway $gateway,
        AiConversationMemory $memory,
        AiAssistantOrchestrator $orchestrator,
        AiCreditService $credits,
    ): JsonResponse {
        WorkspaceFeaturePermissions::authorize(
            $request->user(),
            'ai.assistant.use',
        );

        $conversationRecord = AiConversation::query()->findOrFail($conversation);
        $this->assertOwner($request, $conversationRecord);

        $validated = $request->validate([
            'message' => ['required', 'string', 'max:12000'],
        ]);

        $organization = app(TenantContext::class)->organization();

        if (! $credits->ensureAvailable($organization)) {
            return response()->json([
                'message' => 'Your included AccoNova AI allowance is exhausted. Add AI credits to continue.',
                'code' => 'AI_CREDITS_REQUIRED',
                'billing_url' => '/app/billing',
            ], 402);
        }

        $userMessage = AiMessage::create([
            'ai_conversation_id' => $conversationRecord->id,
            'user_id' => $request->user()->id,
            'role' => 'user',
            'content' => trim($validated['message']),
        ]);

        $conversationRecord->forceFill([
            'title' => $conversationRecord->title
                ?: mb_substr(trim($validated['message']), 0, 80),
            'last_message_at' => now(),
        ])->save();

        try {
            $result = $orchestrator->chat(
                $conversationRecord,
                $request->user(),
                $memory->context($conversationRecord),
                null,
            );
        } catch (RuntimeException $exception) {
            report($exception);

            return response()->json([
                'message' => 'The AI service is temporarily unavailable.',
                'code' => 'AI_UNAVAILABLE',
                'user_message_id' => $userMessage->id,
            ], $gateway->configured() ? 502 : 503);
        }

        /*
         * Included monthly tokens are consumed first. Only the portion above
         * the plan allowance is debited from the purchased wallet.
         */
        rescue(
            fn () => $credits->consumeOverage(
                $organization,
                (int) $result['total_tokens'],
            ),
            report: true,
        );

        $assistantMessage = AiMessage::create([
            'ai_conversation_id' => $conversationRecord->id,
            'user_id' => null,
            'role' => 'assistant',
            'content' => $result['content'],
            'provider' => $result['provider'],
            'model' => $result['model'],
            'input_tokens' => $result['input_tokens'],
            'output_tokens' => $result['output_tokens'],
            'total_tokens' => $result['total_tokens'],
        ]);

        $conversationRecord->forceFill([
            'last_message_at' => now(),
        ])->save();

        /*
         * Compaction is an optimization. A summary failure must never turn a
         * successful assistant response into a failed user request.
         */
        rescue(
            fn () => $memory->compactIfNeeded($conversationRecord->fresh(), $gateway),
            report: true,
        );

        return response()->json([
            'data' => [
                'message' => $assistantMessage,
                'usage' => [
                    'input_tokens' => $result['input_tokens'],
                    'output_tokens' => $result['output_tokens'],
                    'total_tokens' => $result['total_tokens'],
                    'tool_calls' => $result['tool_calls'] ?? [],
                ],
            ],
        ]);
    }

    public function destroy(
        Request $request,
        int $conversation,
    ): JsonResponse {
        WorkspaceFeaturePermissions::authorize(
            $request->user(),
            'ai.conversations.manage',
        );

        $conversationRecord = AiConversation::query()->findOrFail($conversation);
        $this->assertOwner($request, $conversationRecord);

        $conversationRecord->delete();

        return response()->json([], 204);
    }

    private function assertOwner(
        Request $request,
        AiConversation $conversation,
    ): void {
        abort_unless(
            (int) $conversation->user_id === (int) $request->user()->id,
            404,
        );
    }
}
