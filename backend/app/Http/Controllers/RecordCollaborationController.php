<?php

namespace App\Http\Controllers;

use App\Models\FinancialDocument;
use App\Models\Membership;
use App\Models\Party;
use App\Models\Product;
use App\Models\StaffMember;
use App\Models\Task;
use App\Services\FinanceAuthorization;
use App\Support\TaskAccess;
use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class RecordCollaborationController extends Controller
{
    /** @var array<string, class-string<Model>> */
    private const TYPES = [
        'party' => Party::class,
        'product' => Product::class,
        'document' => FinancialDocument::class,
        'task' => Task::class,
        'staff' => StaffMember::class,
    ];

    public function index(
        Request $request,
        string $type,
        string $record,
    ): JsonResponse {
        $model = $this->resolveRecord(
            $request,
            $type,
            (int) $record,
            false,
        );

        $organizationId = app(TenantContext::class)->id();

        $tags = DB::table('record_taggables as rt')
            ->join('record_tags as t', 't.id', '=', 'rt.record_tag_id')
            ->where('rt.organization_id', $organizationId)
            ->where('rt.record_type', $type)
            ->where('rt.record_id', $model->getKey())
            ->orderBy('t.name')
            ->get([
                't.id',
                't.name',
                't.slug',
                't.color',
            ]);

        $comments = DB::table('record_comments as c')
            ->join('users as u', 'u.id', '=', 'c.user_id')
            ->where('c.organization_id', $organizationId)
            ->where('c.record_type', $type)
            ->where('c.record_id', $model->getKey())
            ->latest('c.id')
            ->limit(100)
            ->get([
                'c.id',
                'c.body',
                'c.user_id',
                'u.name as user_name',
                'c.edited_at',
                'c.created_at',
            ]);

        $attachments = DB::table('record_attachments as a')
            ->join('users as u', 'u.id', '=', 'a.uploaded_by')
            ->where('a.organization_id', $organizationId)
            ->where('a.record_type', $type)
            ->where('a.record_id', $model->getKey())
            ->latest('a.id')
            ->get([
                'a.id',
                'a.original_name',
                'a.mime_type',
                'a.size_bytes',
                'a.uploaded_by',
                'u.name as uploaded_by_name',
                'a.created_at',
            ])
            ->map(function ($attachment) use ($type, $model): object {
                $attachment->preview_url = route(
                    'record-collaboration.attachment.preview',
                    [
                        'type' => $type,
                        'record' => $model->getKey(),
                        'attachment' => $attachment->id,
                    ],
                );

                return $attachment;
            });

        $reminders = DB::table('record_reminders')
            ->where('organization_id', $organizationId)
            ->where('record_type', $type)
            ->where('record_id', $model->getKey())
            ->where('user_id', $request->user()->id)
            ->whereNull('completed_at')
            ->orderBy('due_at')
            ->get([
                'id',
                'note',
                'due_at',
                'notified_at',
                'completed_at',
            ]);

        $people = Membership::query()
            ->with('user:id,name,email')
            ->get()
            ->pluck('user')
            ->filter()
            ->unique('id')
            ->values()
            ->map(fn ($user) => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
            ]);

        return response()->json([
            'data' => [
                'tags' => $tags,
                'comments' => $comments,
                'attachments' => $attachments,
                'reminders' => $reminders,
                'mentionables' => $people,
                'relationships' => $type === 'party'
                    ? $this->partyRelationships((int) $model->getKey())
                    : [],
            ],
        ]);
    }

    public function addTag(
        Request $request,
        string $type,
        string $record,
    ): JsonResponse {
        $model = $this->resolveRecord(
            $request,
            $type,
            (int) $record,
            true,
        );

        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
            'color' => ['nullable', 'string', 'max:20'],
        ]);

        $organizationId = app(TenantContext::class)->id();
        $name = trim($data['name']);
        $slug = Str::slug($name);

        if ($slug === '') {
            $slug = Str::lower(
                preg_replace('/\s+/u', '-', $name) ?: $name,
            );
        }

        $tagId = DB::table('record_tags')
            ->where('organization_id', $organizationId)
            ->where('slug', $slug)
            ->value('id');

        if (! $tagId) {
            $tagId = DB::table('record_tags')->insertGetId([
                'organization_id' => $organizationId,
                'name' => $name,
                'slug' => $slug,
                'color' => $data['color'] ?? null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        DB::table('record_taggables')->insertOrIgnore([
            'organization_id' => $organizationId,
            'record_tag_id' => $tagId,
            'record_type' => $type,
            'record_id' => $model->getKey(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['ok' => true], 201);
    }

    public function removeTag(
        Request $request,
        string $type,
        string $record,
        string $tag,
    ): JsonResponse {
        $model = $this->resolveRecord(
            $request,
            $type,
            (int) $record,
            true,
        );

        DB::table('record_taggables')
            ->where('organization_id', app(TenantContext::class)->id())
            ->where('record_type', $type)
            ->where('record_id', $model->getKey())
            ->where('record_tag_id', (int) $tag)
            ->delete();

        return response()->json(['ok' => true]);
    }

    public function comment(
        Request $request,
        string $type,
        string $record,
    ): JsonResponse {
        $model = $this->resolveRecord(
            $request,
            $type,
            (int) $record,
            false,
        );

        $data = $request->validate([
            'body' => ['required', 'string', 'max:5000'],
        ]);

        $body = trim($data['body']);
        $organizationId = app(TenantContext::class)->id();

        $id = DB::table('record_comments')->insertGetId([
            'organization_id' => $organizationId,
            'record_type' => $type,
            'record_id' => $model->getKey(),
            'user_id' => $request->user()->id,
            'body' => $body,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->notifyMentions(
            $request,
            $type,
            (int) $model->getKey(),
            $body,
            'comment:'.$id,
        );

        return response()->json(['id' => $id], 201);
    }

    public function upload(
        Request $request,
        string $type,
        string $record,
    ): JsonResponse {
        $model = $this->resolveRecord(
            $request,
            $type,
            (int) $record,
            false,
        );

        $request->validate([
            'file' => [
                'required',
                'file',
                'max:10240',
                'mimes:pdf,png,jpg,jpeg,webp,doc,docx,xls,xlsx,csv,txt',
            ],
        ]);

        $file = $request->file('file');
        abort_unless($file, 422);

        $organizationId = app(TenantContext::class)->id();
        $path = $file->store(
            'collaboration/'
            .$organizationId
            .'/'.$type
            .'/'.$model->getKey(),
            'local',
        );

        $id = DB::table('record_attachments')->insertGetId([
            'organization_id' => $organizationId,
            'record_type' => $type,
            'record_id' => $model->getKey(),
            'uploaded_by' => $request->user()->id,
            'disk' => 'local',
            'path' => $path,
            'original_name' => $file->getClientOriginalName(),
            'mime_type' => $file->getMimeType(),
            'size_bytes' => $file->getSize(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['id' => $id], 201);
    }

    public function preview(
        Request $request,
        string $type,
        string $record,
        string $attachment,
    ): BinaryFileResponse {
        $model = $this->resolveRecord(
            $request,
            $type,
            (int) $record,
            false,
        );

        $row = DB::table('record_attachments')
            ->where('organization_id', app(TenantContext::class)->id())
            ->where('record_type', $type)
            ->where('record_id', $model->getKey())
            ->where('id', (int) $attachment)
            ->first();

        abort_unless($row, 404);
        abort_unless(Storage::disk($row->disk)->exists($row->path), 404);

        return response()->file(
            Storage::disk($row->disk)->path($row->path),
            [
                'Content-Type' => $row->mime_type ?: 'application/octet-stream',
                'Content-Disposition' => 'inline; filename="'
                    .str_replace('"', '', $row->original_name)
                    .'"',
                'X-Content-Type-Options' => 'nosniff',
            ],
        );
    }

    public function deleteAttachment(
        Request $request,
        string $type,
        string $record,
        string $attachment,
    ): JsonResponse {
        $model = $this->resolveRecord(
            $request,
            $type,
            (int) $record,
            true,
        );

        $row = DB::table('record_attachments')
            ->where('organization_id', app(TenantContext::class)->id())
            ->where('record_type', $type)
            ->where('record_id', $model->getKey())
            ->where('id', (int) $attachment)
            ->first();

        abort_unless($row, 404);

        Storage::disk($row->disk)->delete($row->path);

        DB::table('record_attachments')
            ->where('id', $row->id)
            ->delete();

        return response()->json(['ok' => true]);
    }

    public function reminder(
        Request $request,
        string $type,
        string $record,
    ): JsonResponse {
        $model = $this->resolveRecord(
            $request,
            $type,
            (int) $record,
            false,
        );

        $data = $request->validate([
            'due_at' => ['required', 'date', 'after:now'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $id = DB::table('record_reminders')->insertGetId([
            'organization_id' => app(TenantContext::class)->id(),
            'record_type' => $type,
            'record_id' => $model->getKey(),
            'user_id' => $request->user()->id,
            'note' => isset($data['note'])
                ? trim((string) $data['note'])
                : null,
            'due_at' => $data['due_at'],
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['id' => $id], 201);
    }

    public function completeReminder(
        Request $request,
        string $type,
        string $record,
        string $reminder,
    ): JsonResponse {
        $model = $this->resolveRecord(
            $request,
            $type,
            (int) $record,
            false,
        );

        DB::table('record_reminders')
            ->where('organization_id', app(TenantContext::class)->id())
            ->where('record_type', $type)
            ->where('record_id', $model->getKey())
            ->where('id', (int) $reminder)
            ->where('user_id', $request->user()->id)
            ->update([
                'completed_at' => now(),
                'updated_at' => now(),
            ]);

        return response()->json(['ok' => true]);
    }

    public function relationshipOptions(
        Request $request,
        string $record,
    ): JsonResponse {
        $party = $this->resolveRecord(
            $request,
            'party',
            (int) $record,
            false,
        );

        abort_unless($party instanceof Party, 404);

        $search = trim((string) $request->query('search', ''));

        $oppositeType = $party->type->value === 'company'
            ? 'person'
            : 'company';

        $query = Party::query()
            ->where('type', $oppositeType)
            ->orderByRaw(
                "COALESCE(NULLIF(company_name, ''), NULLIF(name, ''), '')",
            );

        if ($search !== '') {
            $query->where(function ($inner) use ($search): void {
                $inner
                    ->where('name', 'like', '%'.$search.'%')
                    ->orWhere('company_name', 'like', '%'.$search.'%')
                    ->orWhere('email', 'like', '%'.$search.'%');
            });
        }

        return response()->json([
            'data' => $query
                ->limit(25)
                ->get([
                    'id',
                    'type',
                    'name',
                    'company_name',
                    'email',
                ])
                ->map(fn (Party $candidate) => [
                    'id' => $candidate->id,
                    'type' => $candidate->type->value,
                    'name' => $candidate->company_name
                        ?: $candidate->name
                        ?: '#'.$candidate->id,
                    'email' => $candidate->email,
                ]),
        ]);
    }

    public function addRelationship(
        Request $request,
        string $record,
    ): JsonResponse {
        $party = $this->resolveRecord(
            $request,
            'party',
            (int) $record,
            true,
        );

        abort_unless($party instanceof Party, 404);

        $data = $request->validate([
            'other_party_id' => ['required', 'integer'],
            'title' => ['nullable', 'string', 'max:120'],
            'department' => ['nullable', 'string', 'max:120'],
            'is_primary' => ['sometimes', 'boolean'],
        ]);

        $other = Party::query()->findOrFail((int) $data['other_party_id']);

        abort_if($other->id === $party->id, 422);

        $person = $party->type->value === 'company'
            ? $other
            : $party;

        $company = $party->type->value === 'company'
            ? $party
            : $other;

        abort_unless(
            $person->type->value === 'person'
            && $company->type->value === 'company',
            422,
            'Relationship links must connect a person to a company.',
        );

        $organizationId = app(TenantContext::class)->id();

        if (($data['is_primary'] ?? false) === true) {
            DB::table('party_relationship_links')
                ->where('organization_id', $organizationId)
                ->where('person_party_id', $person->id)
                ->update([
                    'is_primary' => false,
                    'updated_at' => now(),
                ]);
        }

        DB::table('party_relationship_links')->updateOrInsert(
            [
                'organization_id' => $organizationId,
                'person_party_id' => $person->id,
                'company_party_id' => $company->id,
            ],
            [
                'title' => isset($data['title'])
                    ? trim((string) $data['title'])
                    : null,
                'department' => isset($data['department'])
                    ? trim((string) $data['department'])
                    : null,
                'is_primary' => (bool) ($data['is_primary'] ?? false),
                'updated_at' => now(),
                'created_at' => now(),
            ],
        );

        return response()->json(['ok' => true], 201);
    }

    public function deleteRelationship(
        Request $request,
        string $record,
        string $relationship,
    ): JsonResponse {
        $party = $this->resolveRecord(
            $request,
            'party',
            (int) $record,
            true,
        );

        abort_unless($party instanceof Party, 404);

        DB::table('party_relationship_links')
            ->where('organization_id', app(TenantContext::class)->id())
            ->where('id', (int) $relationship)
            ->where(function ($query) use ($party): void {
                $query
                    ->where('person_party_id', $party->id)
                    ->orWhere('company_party_id', $party->id);
            })
            ->delete();

        return response()->json(['ok' => true]);
    }

    /**
     * Publish notifications for exact full-name or first-name @mentions.
     */
    public function notifyMentions(
        Request $request,
        string $type,
        int $recordId,
        string $text,
        string $eventKey,
    ): void {
        $organizationId = app(TenantContext::class)->id();

        $members = Membership::query()
            ->with('user:id,name,email')
            ->get();

        foreach ($members as $membership) {
            $user = $membership->user;

            if (! $user || $user->id === $request->user()->id) {
                continue;
            }

            $firstName = trim(Str::before($user->name, ' '));

            $mentioned =
                Str::contains(
                    Str::lower($text),
                    Str::lower('@'.$user->name),
                )
                || (
                    $firstName !== ''
                    && Str::contains(
                        Str::lower($text),
                        Str::lower('@'.$firstName),
                    )
                );

            if (! $mentioned) {
                continue;
            }

            DB::table('workspace_notifications')->insertOrIgnore([
                'organization_id' => $organizationId,
                'user_id' => $user->id,
                'event_key' => 'mention:'.$eventKey.':'.$user->id,
                'kind' => 'mention',
                'category' => 'messages',
                'data' => json_encode([
                    'name' => $request->user()->name,
                    'detail' => Str::limit($text, 160),
                ], JSON_THROW_ON_ERROR),
                'url' => $this->recordUrl($type, $recordId),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function resolveRecord(
        Request $request,
        string $type,
        int $recordId,
        bool $write,
    ): Model {
        abort_unless(isset(self::TYPES[$type]), 404);

        if ($type === 'party') {
            $record = Party::withTrashed()->findOrFail($recordId);
            Gate::authorize($write ? 'update' : 'view', $record);

            return $record;
        }

        if ($type === 'product') {
            $record = Product::withTrashed()->findOrFail($recordId);
            Gate::authorize($write ? 'update' : 'view', $record);

            return $record;
        }

        if ($type === 'document') {
            $record = FinancialDocument::query()->findOrFail($recordId);
            FinanceAuthorization::authorize(
                $request->user(),
                $record->isSale()
                    ? ($write ? 'finance.sales.manage' : 'finance.sales.view')
                    : ($write ? 'finance.purchases.manage' : 'finance.purchases.view'),
            );

            return $record;
        }

        if ($type === 'task') {
            $record = TaskAccess::applyVisible(
                Task::query(),
                $request->user(),
            )->findOrFail($recordId);

            if ($write) {
                abort_unless(
                    TaskAccess::canUpdate($record, $request->user()),
                    403,
                );
            }

            return $record;
        }

        $record = StaffMember::query()->findOrFail($recordId);

        abort_unless(
            StaffController::canView($record),
            403,
        );

        if ($write) {
            abort_unless(
                StaffController::canManage($record),
                403,
            );
        }

        return $record;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function partyRelationships(
        int $partyId,
    ): array {
        $organizationId = app(TenantContext::class)->id();

        return DB::table('party_relationship_links as l')
            ->join('parties as person', 'person.id', '=', 'l.person_party_id')
            ->join('parties as company', 'company.id', '=', 'l.company_party_id')
            ->where('l.organization_id', $organizationId)
            ->where(function ($query) use ($partyId): void {
                $query
                    ->where('l.person_party_id', $partyId)
                    ->orWhere('l.company_party_id', $partyId);
            })
            ->orderByDesc('l.is_primary')
            ->orderBy('l.id')
            ->get([
                'l.id',
                'l.person_party_id',
                'l.company_party_id',
                'l.title',
                'l.department',
                'l.is_primary',
                'person.name as person_name',
                'person.email as person_email',
                'company.company_name as company_name',
            ])
            ->map(fn ($row) => [
                'id' => $row->id,
                'person_party_id' => $row->person_party_id,
                'company_party_id' => $row->company_party_id,
                'person_name' => $row->person_name,
                'person_email' => $row->person_email,
                'company_name' => $row->company_name,
                'title' => $row->title,
                'department' => $row->department,
                'is_primary' => (bool) $row->is_primary,
            ])
            ->all();
    }

    private function recordUrl(
        string $type,
        int $recordId,
    ): string {
        return match ($type) {
            'party' => '/app/parties?focus='.$recordId,
            'product' => '/app/products?focus='.$recordId,
            'task' => '/app/task-management/'.$recordId,
            'staff' => '/app/staff/directory?staff='.$recordId,
            'document' => $this->documentUrl($recordId),
            default => '/app',
        };
    }

    private function documentUrl(
        int $recordId,
    ): string {
        $document = FinancialDocument::query()->find($recordId);

        if (! $document) {
            return '/app/invoices';
        }

        return $document->isSale()
            ? '/app/invoices/sales/'.$document->id
            : '/app/invoices/purchases/'.$document->id;
    }
}
