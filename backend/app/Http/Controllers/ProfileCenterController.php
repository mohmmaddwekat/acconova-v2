<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ProfileCenterController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $settings = DB::table('profile_preferences')->where('user_id', $request->user()->id)->value('settings');

        return response()->json([
            'settings' => $settings ? json_decode($settings, true) : null,
            'files' => DB::table('profile_files')->where('user_id', $request->user()->id)
                ->orderByDesc('created_at')->get()->map(fn (object $file): array => $this->fileData($file)),
        ]);
    }

    public function preferenceSettings(Request $request): JsonResponse
    {
        $settings = DB::table('profile_preferences')
            ->where('user_id', $request->user()->id)
            ->value('settings');

        return response()->json([
            'settings' => $settings
                ? json_decode($settings, true)
                : null,
        ]);
    }

    public function preferences(Request $request): JsonResponse
    {
        $settings = $request->validate([
            'locale' => ['required', Rule::in(['ar', 'en'])],
            'timezone' => ['required', 'timezone'],
            'date_format' => ['required', Rule::in(['numeric', 'long'])],
            'hour_cycle' => ['required', Rule::in(['h12', 'h23'])],
            'week_start' => ['required', Rule::in(['sunday', 'monday', 'saturday'])],
            'density' => ['required', Rule::in(['comfortable', 'compact'])],
            'theme' => ['required', Rule::in(['light', 'dark', 'system'])],
            'reduced_motion' => ['required', 'boolean'],
            'page_size' => ['required', Rule::in([10, 25, 50])],
        ]);
        DB::table('profile_preferences')->updateOrInsert(
            ['user_id' => $request->user()->id],
            ['settings' => json_encode($settings), 'created_at' => now(), 'updated_at' => now()],
        );

        return response()->json(['settings' => $settings]);
    }

    public function upload(Request $request): JsonResponse
    {
        $data = $request->validate([
            'file' => ['required', 'file', 'mimes:pdf,doc,docx,xls,xlsx,ppt,pptx,jpg,jpeg,png,webp,zip,txt,csv', 'max:51200'],
            'category' => ['required', Rule::in(['personal', 'work', 'policies', 'certificates', 'financial', 'other'])],
        ]);
        $file = $request->file('file');
        $path = $file->store('profile-files/'.$request->user()->id, 'local');
        try {
            $id = DB::table('profile_files')->insertGetId([
                'user_id' => $request->user()->id,
                'name' => mb_substr(basename(str_replace('\\', '/', $file->getClientOriginalName())), 0, 255),
                'path' => $path, 'category' => $data['category'],
                'extension' => strtolower($file->extension()), 'size' => $file->getSize(),
                'created_at' => now(), 'updated_at' => now(),
            ]);
        } catch (\Throwable $exception) {
            Storage::disk('local')->delete($path);
            throw $exception;
        }

        return response()->json($this->fileData(DB::table('profile_files')->find($id)), 201);
    }

    public function updateFile(Request $request, int $file): JsonResponse
    {
        $record = $this->ownedFile($request, $file);
        $data = $request->validate([
            'favorite' => ['sometimes', 'boolean'], 'pinned' => ['sometimes', 'boolean'],
            'category' => ['sometimes', Rule::in(['personal', 'work', 'policies', 'certificates', 'financial', 'other'])],
        ]);
        DB::table('profile_files')->where('id', $record->id)->update([...$data, 'updated_at' => now()]);

        return response()->json($this->fileData($this->ownedFile($request, $file)));
    }

    public function download(Request $request, int $file): StreamedResponse
    {
        $record = $this->ownedFile($request, $file);
        abort_unless(Storage::disk('local')->exists($record->path), 404);

        return Storage::disk('local')->download($record->path, $record->name, [
            'Content-Type' => 'application/octet-stream', 'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, no-store',
        ]);
    }

    private function ownedFile(Request $request, int $file): object
    {
        $record = DB::table('profile_files')->where('user_id', $request->user()->id)->where('id', $file)->first();
        abort_unless($record, 404);

        return $record;
    }

    /** @return array{id: int, name: string, category: string, extension: string, size: int, favorite: bool, pinned: bool, created_at: string, updated_at: string, download_url: string} */
    private function fileData(object $file): array
    {
        return [
            'id' => $file->id, 'name' => $file->name, 'category' => $file->category,
            'extension' => $file->extension, 'size' => $file->size,
            'favorite' => (bool) $file->favorite, 'pinned' => (bool) $file->pinned,
            'created_at' => $file->created_at, 'updated_at' => $file->updated_at,
            'download_url' => route('profile.files.download', ['file' => $file->id]),
        ];
    }
}
