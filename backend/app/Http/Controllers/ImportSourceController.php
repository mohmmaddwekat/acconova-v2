<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

class ImportSourceController extends Controller
{
    private const MAX_BYTES = 20 * 1024 * 1024;

    /**
     * Resolve a public Google Sheets / Drive share link into a normal import file.
     */
    public function __invoke(Request $request): Response
    {
        $data = $request->validate([
            'source_url' => ['required', 'url', 'max:2048'],
        ]);

        [$downloadUrl, $fallbackName] = $this->googleDownloadUrl(
            trim((string) $data['source_url']),
        );

        try {
            $remote = Http::connectTimeout(8)
                ->timeout(30)
                ->withOptions([
                    'allow_redirects' => [
                        'max' => 5,
                        'strict' => true,
                    ],
                ])
                ->withHeaders([
                    'User-Agent' => 'AccoNova-Import/1.0',
                ])
                ->get($downloadUrl);
        } catch (\Throwable) {
            throw ValidationException::withMessages([
                'source_url' => ['Could not download the Google file. Check the link and try again.'],
            ]);
        }

        if (! $remote->successful()) {
            throw ValidationException::withMessages([
                'source_url' => ['Google did not allow this file to be downloaded. Make it available to anyone with the link and try again.'],
            ]);
        }

        $content = $remote->body();
        $contentType = strtolower(trim(explode(';', (string) $remote->header('Content-Type'))[0] ?? ''));

        if ($content === '') {
            throw ValidationException::withMessages([
                'source_url' => ['The Google file is empty or could not be read.'],
            ]);
        }

        if (strlen($content) > self::MAX_BYTES) {
            throw ValidationException::withMessages([
                'source_url' => ['The Google file is larger than the 20 MB import limit.'],
            ]);
        }

        if (str_contains($contentType, 'text/html')) {
            throw ValidationException::withMessages([
                'source_url' => ['Google returned a sign-in/share page instead of the file. Set access to “Anyone with the link” and try again.'],
            ]);
        }

        $filename = $this->filename(
            (string) $remote->header('Content-Disposition'),
            $contentType,
            $fallbackName,
        );

        return response($content, 200, [
            'Content-Type' => $contentType !== ''
                ? $contentType
                : 'application/octet-stream',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
            'X-AccoNova-Filename' => $filename,
            'Cache-Control' => 'no-store, private',
        ]);
    }

    /**
     * @return array{0:string,1:string}
     */
    private function googleDownloadUrl(string $sourceUrl): array
    {
        $parts = parse_url($sourceUrl);
        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = strtolower((string) ($parts['host'] ?? ''));
        $path = (string) ($parts['path'] ?? '');

        if ($scheme !== 'https') {
            throw ValidationException::withMessages([
                'source_url' => ['Only HTTPS Google share links are supported.'],
            ]);
        }

        if ($host === 'docs.google.com') {
            if (
                preg_match(
                    '~^/spreadsheets/(?:u/\d+/)?d/([A-Za-z0-9_-]+)~',
                    $path,
                    $matches,
                ) !== 1
            ) {
                throw ValidationException::withMessages([
                    'source_url' => ['Use a Google Sheets link for tabular imports. Google Docs text documents are not import files.'],
                ]);
            }

            $id = $matches[1];
            $gid = $this->googleSheetGid($parts);

            /*
             * A normal Google Sheets share URL points at a specific tab through
             * ?gid=... or #gid=.... Respect that tab instead of exporting the
             * whole workbook and silently previewing the first worksheet.
             *
             * This matters especially for migration workbooks that keep
             * Employees, Attendance and Payroll in separate tabs.
             */
            if ($gid !== null) {
                return [
                    'https://docs.google.com/spreadsheets/d/'
                    .rawurlencode($id)
                    .'/export?format=csv&gid='
                    .rawurlencode($gid),
                    'google-sheet-'.$id.'-gid-'.$gid.'.csv',
                ];
            }

            return [
                'https://docs.google.com/spreadsheets/d/'.rawurlencode($id).'/export?format=xlsx',
                'google-sheet-'.$id.'.xlsx',
            ];
        }

        if ($host === 'drive.google.com') {
            $id = null;

            if (preg_match('~^/file/d/([A-Za-z0-9_-]+)~', $path, $matches) === 1) {
                $id = $matches[1];
            } else {
                parse_str((string) ($parts['query'] ?? ''), $query);
                $candidate = $query['id'] ?? null;

                if (is_string($candidate) && preg_match('/^[A-Za-z0-9_-]+$/', $candidate) === 1) {
                    $id = $candidate;
                }
            }

            if (! $id) {
                throw ValidationException::withMessages([
                    'source_url' => ['This Google Drive link format is not supported. Use the normal Share → Copy link URL.'],
                ]);
            }

            return [
                'https://drive.usercontent.google.com/download?id='.rawurlencode($id).'&export=download&confirm=t',
                'google-drive-'.$id,
            ];
        }

        throw ValidationException::withMessages([
            'source_url' => ['Only Google Sheets and Google Drive links are accepted here.'],
        ]);
    }

    /**
     * Read the selected Google Sheets tab id from either query or fragment.
     *
     * @param  array<string, mixed>  $parts
     */
    private function googleSheetGid(array $parts): ?string
    {
        $candidates = [];

        parse_str((string) ($parts['query'] ?? ''), $query);
        if (isset($query['gid'])) {
            $candidates[] = $query['gid'];
        }

        parse_str((string) ($parts['fragment'] ?? ''), $fragment);
        if (isset($fragment['gid'])) {
            $candidates[] = $fragment['gid'];
        }

        foreach ($candidates as $candidate) {
            $gid = trim((string) $candidate);

            if ($gid !== '' && preg_match('/^\d+$/', $gid) === 1) {
                return $gid;
            }
        }

        return null;
    }

    private function filename(
        string $contentDisposition,
        string $contentType,
        string $fallbackName,
    ): string {
        $name = null;

        if (preg_match("/filename\\*=UTF-8''([^;]+)/i", $contentDisposition, $matches) === 1) {
            $name = rawurldecode(trim($matches[1], " \\t\\n\\r\\0\\x0B\\\"'"));
        } elseif (preg_match('/filename="?([^";]+)"?/i', $contentDisposition, $matches) === 1) {
            $name = trim($matches[1]);
        }

        $name = $name ?: $fallbackName;
        $name = basename(str_replace('\\', '/', $name));
        $name = preg_replace('/[^A-Za-z0-9._-]+/', '-', $name) ?: 'google-import';
        $extension = strtolower((string) pathinfo($name, PATHINFO_EXTENSION));

        if ($extension === '') {
            $mapped = match ($contentType) {
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
                'application/vnd.ms-excel' => 'xls',
                'text/csv', 'application/csv' => 'csv',
                'application/json', 'text/json' => 'json',
                'text/plain' => 'txt',
                default => null,
            };

            if ($mapped !== null) {
                $name .= '.'.$mapped;
                $extension = $mapped;
            }
        }

        if (! in_array($extension, ['csv', 'txt', 'xls', 'xlsx', 'json'], true)) {
            throw ValidationException::withMessages([
                'source_url' => ['The Google file must be CSV, TXT, XLS, XLSX, or JSON.'],
            ]);
        }

        return $name;
    }
}
