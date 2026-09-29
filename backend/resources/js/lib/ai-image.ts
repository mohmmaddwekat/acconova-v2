export type AiPreparedImage = {
    dataUrl: string;
    name: string;
    mime: 'image/jpeg';
    bytes: number;
    width: number;
    height: number;
};

const imageContextPattern = /\n?\n?\[\[ACCONOVA_IMAGE_ANALYSIS_V1\]\][\s\S]*?\[\[\/ACCONOVA_IMAGE_ANALYSIS_V1\]\]/g;

export function visibleAiMessageContent(content: string): string {
    return content.replace(imageContextPattern, '').trim();
}

export function aiMessageHasImage(content: string): boolean {
    return content.includes('[[ACCONOVA_IMAGE_ANALYSIS_V1]]');
}

const allowedTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
]);

const maxSourceBytes = 12 * 1024 * 1024;
const maxEncodedBytes = 900_000;

export async function prepareAiImage(file: File): Promise<AiPreparedImage> {
    if (! allowedTypes.has(file.type)) {
        throw new Error('unsupported_type');
    }

    if (file.size > maxSourceBytes) {
        throw new Error('source_too_large');
    }

    const source = await loadImage(file);
    const variants = [
        { maxDimension: 1024, quality: 0.72 },
        { maxDimension: 896, quality: 0.66 },
        { maxDimension: 768, quality: 0.60 },
        { maxDimension: 640, quality: 0.55 },
    ];

    try {
        for (const variant of variants) {
            const encoded = await encodeImage(
                source,
                variant.maxDimension,
                variant.quality,
            );

            if (encoded.blob.size <= maxEncodedBytes) {
                return {
                    dataUrl: await blobToDataUrl(encoded.blob),
                    name: file.name.slice(0, 120) || 'image.jpg',
                    mime: 'image/jpeg',
                    bytes: encoded.blob.size,
                    width: encoded.width,
                    height: encoded.height,
                };
            }
        }
    } finally {
        URL.revokeObjectURL(source.src);
    }

    throw new Error('compressed_too_large');
}

function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        const objectUrl = URL.createObjectURL(file);

        image.onload = () => resolve(image);
        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('decode_failed'));
        };
        image.src = objectUrl;
    });
}

function encodeImage(
    image: HTMLImageElement,
    maxDimension: number,
    quality: number,
): Promise<{ blob: Blob; width: number; height: number }> {
    const scale = Math.min(
        1,
        maxDimension / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');

    if (! context) {
        throw new Error('canvas_unavailable');
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            blob => {
                if (! blob) {
                    reject(new Error('encode_failed'));
                    return;
                }

                resolve({ blob, width, height });
            },
            'image/jpeg',
            quality,
        );
    });
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(new Error('read_failed'));
        reader.readAsDataURL(blob);
    });
}

export function aiImageErrorMessage(error: unknown, ar: boolean): string {
    const code = error instanceof Error ? error.message : '';

    if (code === 'unsupported_type') {
        return ar
            ? 'ارفع صورة JPG أو PNG أو WebP فقط.'
            : 'Upload a JPG, PNG, or WebP image only.';
    }

    if (code === 'source_too_large') {
        return ar
            ? 'الصورة الأصلية كبيرة جدًا. الحد الأقصى قبل الضغط 12 MB.'
            : 'The source image is too large. The pre-compression limit is 12 MB.';
    }

    if (code === 'compressed_too_large') {
        return ar
            ? 'تعذر ضغط الصورة للحجم الآمن. جرّب قص الصورة أو رفع نسخة أصغر.'
            : 'The image could not be compressed enough. Crop it or upload a smaller version.';
    }

    return ar
        ? 'تعذر تجهيز الصورة للتحليل.'
        : 'The image could not be prepared for analysis.';
}
