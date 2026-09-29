<?php

namespace App\Services\AI;

use App\Services\AI\Providers\OpenAiCompatibleProvider;
use RuntimeException;

final class AiImageAnalyzer
{
    public function __construct(
        private readonly AiAccessTokenProvider $tokens,
    ) {}

    /**
     * @param  array{data_url:string,name?:string,mime?:string}  $image
     * @return array{
     *     content:string,
     *     provider:string,
     *     model:string,
     *     input_tokens:int,
     *     output_tokens:int,
     *     total_tokens:int
     * }
     */
    public function analyze(array $image, string $userQuestion): array
    {
        if (! (bool) config('ai-image.enabled', true)) {
            throw new RuntimeException('AI image analysis is disabled.');
        }

        $dataUrl = trim((string) ($image['data_url'] ?? ''));
        $this->assertSafeImage($dataUrl);

        $providerConfig = config('ai.providers.openai', []);

        if (! is_array($providerConfig)) {
            throw new RuntimeException('OpenAI provider configuration is unavailable.');
        }

        $providerConfig['model'] = (string) config(
            'ai-image.model',
            $providerConfig['model'] ?? '',
        );
        $providerConfig['max_output_tokens'] = (int) config(
            'ai-image.max_output_tokens',
            320,
        );

        $provider = new OpenAiCompatibleProvider(
            'openai',
            $providerConfig,
            $this->tokens,
        );

        if (! $provider->configured()) {
            throw new RuntimeException('OpenAI vision provider is not configured.');
        }

        $question = trim($userQuestion);

        if ($question === '') {
            $question = 'Analyze this image for the user.';
        }

        return $provider->chat([
            [
                'role' => 'system',
                'content' => 'You are the image-reading layer for AccoNova AI. Extract only clearly visible, factual information that is useful for the user question. For invoices, receipts, statements, screenshots, dashboards, or documents, capture readable labels, dates, names, totals, amounts, statuses, errors, and important line items. Never invent unreadable text or hidden facts. Keep the result concise because it will be reused as text context so the image does not need to be sent again.',
            ],
            [
                'role' => 'user',
                'content' => [
                    [
                        'type' => 'text',
                        'text' => "User question: {$question}\n\nDescribe the image facts needed to answer it. If small text is unreadable at low detail, explicitly say which parts are unreadable instead of guessing.",
                    ],
                    [
                        'type' => 'image_url',
                        'image_url' => [
                            'url' => $dataUrl,
                            'detail' => (string) config('ai-image.detail', 'low'),
                        ],
                    ],
                ],
            ],
        ], (int) config('ai-image.max_output_tokens', 320));
    }

    private function assertSafeImage(string $dataUrl): void
    {
        if (! preg_match(
            '/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+\/=\r\n]+)$/',
            $dataUrl,
            $matches,
        )) {
            throw new RuntimeException('Unsupported image payload.');
        }

        $binary = base64_decode($matches[2], true);

        if ($binary === false || $binary === '') {
            throw new RuntimeException('Invalid image payload.');
        }

        if (strlen($binary) > (int) config('ai-image.max_decoded_bytes', 1000000)) {
            throw new RuntimeException('Image payload is too large.');
        }

        $info = @getimagesizefromstring($binary);

        if (! is_array($info)) {
            throw new RuntimeException('Uploaded image could not be decoded.');
        }

        $allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
        $detectedMime = (string) ($info['mime'] ?? '');

        if (! in_array($detectedMime, $allowedMimeTypes, true)) {
            throw new RuntimeException('Unsupported image format.');
        }

        $maxDimension = (int) config('ai-image.max_dimension', 4096);
        $width = (int) ($info[0] ?? 0);
        $height = (int) ($info[1] ?? 0);

        if (
            $width <= 0
            || $height <= 0
            || $width > $maxDimension
            || $height > $maxDimension
        ) {
            throw new RuntimeException('Image dimensions are outside the allowed range.');
        }
    }
}
