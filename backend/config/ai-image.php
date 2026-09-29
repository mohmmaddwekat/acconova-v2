<?php

return [
    /*
     * Vision is intentionally conservative. The browser compresses images
     * before upload and the provider always receives low-detail vision input.
     * This keeps image usage predictable for customer-facing AI plans.
     */
    'enabled' => (bool) env('AI_IMAGE_ENABLED', true),
    'model' => env('OPENAI_VISION_MODEL', env('OPENAI_MODEL', 'gpt-5.6-luna')),
    'detail' => 'low',
    'max_output_tokens' => (int) env('AI_IMAGE_MAX_OUTPUT_TOKENS', 320),
    'max_decoded_bytes' => (int) env('AI_IMAGE_MAX_BYTES', 1000000),
    'max_dimension' => (int) env('AI_IMAGE_MAX_DIMENSION', 4096),
];
