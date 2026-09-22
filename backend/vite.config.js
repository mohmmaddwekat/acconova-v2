import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import { bunny } from 'laravel-vite-plugin/fonts';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    /*
     * Keep the Windows/Wamp development server deterministic.
     *
     * Binding explicitly to IPv4 avoids the localhost IPv4/IPv6 resolution
     * mismatch that can make the browser wait before reaching Vite. The warmup
     * list pre-transforms the shared application shell while the dev server is
     * starting, so the first refresh on acconova.test has less work to do.
     */
    server: {
        host: '127.0.0.1',
        port: 5173,
        strictPort: true,
        allowedHosts: [
            'acconova.test',
            'localhost',
        ],
        cors: {
            origin: [
                'http://acconova.test',
                'https://acconova.test',
                'http://127.0.0.1:8000',
                'http://localhost:8000',
            ],
        },
        warmup: {
            clientFiles: [
                './resources/js/app.tsx',
                './resources/css/app.css',
                './resources/js/layouts/AppShell.tsx',
                './resources/js/components/navigation/*.tsx',
            ],
        },
    },

    optimizeDeps: {
        include: [
            'react',
            'react-dom/client',
            '@inertiajs/react',
            'lucide-react',
        ],
    },

    plugins: [
        laravel({
            input: ['resources/js/app.tsx'],
            refresh: true,
            fonts: [
                bunny('Instrument Sans', {
                    weights: [400, 500, 600],
                }),
            ],
        }),

        /*
         * Enable React and TSX compilation.
         */
        react(),

        tailwindcss(),
    ],
});