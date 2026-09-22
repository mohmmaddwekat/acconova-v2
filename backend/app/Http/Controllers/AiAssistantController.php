<?php

namespace App\Http\Controllers;

use App\Models\AiConversation;
use App\Models\AiMessage;
use App\Services\AI\AiConversationMemory;
use App\Services\AI\AiGateway;
use App\Services\WorkspaceFeaturePermissions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class AiAssistantController extends Controller
{
    public function status(
        Request $request,
        AiGateway $gateway,
    ): JsonResponse {
        WorkspaceFeaturePermissions::authorize(
            $request->user(),
            'ai.assistant.use',
        );

        return response()->json([
            'data' => [
                ...$gateway->status(),
                'memory' => [
                    'recent_messages' => (int) config('ai.memory.recent_messages', 20),
                    'summarize_after_messages' => (int) config('ai.memory.summarize_after_messages', 40),
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
    ): JsonResponse {
        WorkspaceFeaturePermissions::authorize(
            $request->user(),
            'ai.assistant.use',
        );

        $conversationRecord = AiConversation::query()->findOrFail($conversation);
        $this->assertOwner($request, $conversationRecord);

        $validated = $request->validate([
            'message' => ['required', 'string', 'max:12000'],
            'provider' => ['nullable', 'string', 'max:50'],
        ]);

        $preferredProvider = isset($validated['provider'])
            ? trim((string) $validated['provider'])
            : null;

        if (
            $preferredProvider !== null
            && $preferredProvider !== ''
            && ! $gateway->providerAvailable($preferredProvider)
        ) {
            return response()->json([
                'message' => 'The selected AI provider is not available.',
                'code' => 'AI_PROVIDER_NOT_AVAILABLE',
            ], 422);
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
            $result = $gateway->chat(
                $memory->context($conversationRecord),
                preferredProvider: $preferredProvider ?: null,
            );
        } catch (RuntimeException $exception) {
            report($exception);

            return response()->json([
                'message' => $gateway->configured()
                    ? 'The AI service is temporarily unavailable.'
                    : 'The AI gateway is ready but no provider is configured yet.',
                'code' => $gateway->configured()
                    ? 'AI_PROVIDER_UNAVAILABLE'
                    : 'AI_NOT_CONFIGURED',
                'user_message_id' => $userMessage->id,
            ], $gateway->configured() ? 502 : 503);
        }

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
                    'provider' => $result['provider'],
                    'model' => $result['model'],
                    'input_tokens' => $result['input_tokens'],
                    'output_tokens' => $result['output_tokens'],
                    'total_tokens' => $result['total_tokens'],
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
