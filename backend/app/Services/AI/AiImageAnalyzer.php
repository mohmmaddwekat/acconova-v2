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
     *     total_tokens:int,
     *     image_hash:string
     * }
     */
    public function analyze(array $image, string $userQuestion): array
    {
        if (! (bool) config('ai-image.enabled', true)) {
            throw new RuntimeException('AI image analysis is disabled.');
        }

        $dataUrl = trim((string) ($image['data_url'] ?? ''));
        $metadata = $this->validateAndDescribe($dataUrl);

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

        $result = $provider->chat([
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

        $result['image_hash'] = $metadata['hash'];

        return $result;
    }

    /**
     * Return a stable fingerprint after the same validation used for analysis.
     * This lets a conversation reuse an earlier text observation if the exact
     * compressed image is uploaded again, avoiding another vision charge.
     *
     * @param  array{data_url:string,name?:string,mime?:string}  $image
     */
    public function fingerprint(array $image): string
    {
        return $this->validateAndDescribe(
            trim((string) ($image['data_url'] ?? '')),
        )['hash'];
    }

    /**
     * @return array{hash:string,width:int,height:int,mime:string}
     */
    private function validateAndDescribe(string $dataUrl): array
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

        return [
            'hash' => hash('sha256', $binary),
            'width' => $width,
            'height' => $height,
            'mime' => $detectedMime,
        ];
    }
}
