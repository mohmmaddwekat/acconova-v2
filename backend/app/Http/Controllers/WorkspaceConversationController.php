<?php

namespace App\Http\Controllers;

use App\Services\MessageRestrictions;
use App\Services\NotificationCenter;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class WorkspaceConversationController extends Controller
{
    /**
     * Return conversations visible to the authenticated Organization member.
     *
     * Normal inbox requests exclude conversations archived by this user only.
     * Archived requests return only that user's archived conversations.
     */
    public function index(
        Request $request,
    ): JsonResponse {
        $this->touchPresence(
            $request,
        );

        $data =
            $request->validate([
                'search' => [
                    'nullable',
                    'string',
                    'max:100',
                ],

                'limit' => [
                    'nullable',
                    'integer',
                    'min:1',
                    'max:50',
                ],

                'archived' => [
                    'nullable',
                    'boolean',
                ],
            ]);

        $userId =
            (int) $request
                ->user()
                ->id;

        $organizationId =
            $this->organizationId();

        $limit =
            (int) (
                $data[
                    'limit'
                ]
                ?? 50
            );

        $archived =
            (bool) (
                $data[
                    'archived'
                ]
                ?? false
            );

        $query =
            DB::table(
                'workspace_conversations as c',
            )
                ->join(
                    'workspace_conversation_members as me',
                    function (
                        $join,
                    ) use (
                        $userId,
                    ): void {
                        $join
                            ->on(
                                'me.conversation_id',
                                '=',
                                'c.id',
                            )
                            ->where(
                                'me.user_id',
                                $userId,
                            );
                    },
                )
                ->where(
                    'c.organization_id',
                    $organizationId,
                )
                ->when(
                    $archived,
                    fn (
                        $builder,
                    ) => $builder->whereNotNull(
                        'me.archived_at',
                    ),
                    fn (
                        $builder,
                    ) => $builder->whereNull(
                        'me.archived_at',
                    ),
                )
                ->select([
                    'c.*',
                    'me.last_read_id',
                    'me.archived_at',
                ]);

        if (
            ! empty(
                $data[
                    'search'
                ]
            )
        ) {
            $search =
                '%'
                .$data[
                    'search'
                ]
                .'%';

            $query->where(
                function (
                    $builder,
                ) use (
                    $search,
                    $userId,
                ): void {
                    $builder
                        ->where(
                            'c.name',
                            'like',
                            $search,
                        )
                        ->orWhereExists(
                            function (
                                $memberQuery,
                            ) use (
                                $search,
                                $userId,
                            ): void {
                                $memberQuery
                                    ->selectRaw(
                                        '1',
                                    )
                                    ->from(
                                        'workspace_conversation_members as scm',
                                    )
                                    ->join(
                                        'users as su',
                                        'su.id',
                                        '=',
                                        'scm.user_id',
                                    )
                                    ->whereColumn(
                                        'scm.conversation_id',
                                        'c.id',
                                    )
                                    ->where(
                                        'scm.user_id',
                                        '!=',
                                        $userId,
                                    )
                                    ->where(
                                        'su.name',
                                        'like',
                                        $search,
                                    );
                            },
                        );
                },
            );
        }

        $paginator =
            $query
                ->orderByDesc(
                    'c.updated_at',
                )
                ->paginate(
                    $limit,
                );

        $paginator->setCollection(
            $paginator
                ->getCollection()
                ->map(
                    function (
                        object $conversation,
                    ) use (
                        $userId,
                        $organizationId,
                    ): array {
                        $latest =
                            DB::table(
                                'workspace_messages as m',
                            )
                                ->join(
                                    'users as u',
                                    'u.id',
                                    '=',
                                    'm.user_id',
                                )
                                ->where(
                                    'm.conversation_id',
                                    $conversation
                                        ->id,
                                )
                                ->whereNotExists(
                                    function (
                                        $hidden,
                                    ) use (
                                        $userId,
                                    ): void {
                                        $hidden
                                            ->selectRaw(
                                                '1',
                                            )
                                            ->from(
                                                'workspace_message_user_hides as h',
                                            )
                                            ->whereColumn(
                                                'h.message_id',
                                                'm.id',
                                            )
                                            ->where(
                                                'h.user_id',
                                                $userId,
                                            );
                                    },
                                )
                                ->orderByDesc(
                                    'm.id',
                                )
                                ->first([
                                    'm.id',
                                    'm.user_id',
                                    'm.body',
                                    'm.created_at',
                                    'm.deleted_at',
                                    'u.name as sender_name',
                                ]);

                        $unreadCount =
                            DB::table(
                                'workspace_messages as m',
                            )
                                ->where(
                                    'm.conversation_id',
                                    $conversation
                                        ->id,
                                )
                                ->where(
                                    'm.id',
                                    '>',
                                    (int) $conversation
                                        ->last_read_id,
                                )
                                ->where(
                                    'm.user_id',
                                    '!=',
                                    $userId,
                                )
                                ->whereNull(
                                    'm.deleted_at',
                                )
                                ->whereNotExists(
                                    function (
                                        $hidden,
                                    ) use (
                                        $userId,
                                    ): void {
                                        $hidden
                                            ->selectRaw(
                                                '1',
                                            )
                                            ->from(
                                                'workspace_message_user_hides as h',
                                            )
                                            ->whereColumn(
                                                'h.message_id',
                                                'm.id',
                                            )
                                            ->where(
                                                'h.user_id',
                                                $userId,
                                            );
                                    },
                                )
                                ->count();

                        $latestHasAttachments =
                            $latest
                            && $latest
                                ->deleted_at === null
                            && DB::table(
                                'workspace_message_attachments',
                            )
                                ->where(
                                    'message_id',
                                    $latest
                                        ->id,
                                )
                                ->exists();

                        $participant =
                            $this->directParticipant(
                                $conversation,
                                $userId,
                            );

                        return [
                            'id' => (int) $conversation
                                ->id,

                            'organization_id' => (int) $conversation
                                ->organization_id,

                            'created_by' => (int) $conversation
                                ->created_by,

                            'kind' => $conversation
                                ->kind,

                            'name' => $conversation
                                ->name,

                            'display_name' => $participant
                                ?->name
                                ?? (string) $conversation
                                    ->name,

                            'description' => $conversation
                                ->description,

                            'is_private' => true,

                            'created_at' => $conversation
                                ->created_at,

                            'updated_at' => $conversation
                                ->updated_at,

                            'archived_at' => $conversation
                                ->archived_at,

                            'is_archived' => $conversation
                                ->archived_at !==
                                null,

                            'unread_count' => $unreadCount,

                            'latest_message_id' => $latest
                                ?->id,

                            'latest_preview' => $latest
                                    ? (
                                        $latest
                                            ->deleted_at
                                            ? ''
                                            : Str::limit(
                                                $latest
                                                    ->body,
                                                120,
                                                '…',
                                            )
                                    )
                                    : null,

                            'latest_sender_name' => $latest
                                ?->sender_name,

                            'latest_at' => $latest
                                ?->created_at,

                            'latest_has_attachments' => (bool) $latestHasAttachments,

                            'participant_user_id' => $participant
                                ?->id,

                            'is_online' => $participant
                                    ? $this->isUserOnline(
                                        $organizationId,
                                        (int) $participant
                                            ->id,
                                    )
                                    : false,
                        ];
                    },
                ),
        );

        $unreadTotal =
            DB::table(
                'workspace_conversation_members as me',
            )
                ->join(
                    'workspace_conversations as c',
                    'c.id',
                    '=',
                    'me.conversation_id',
                )
                ->join(
                    'workspace_messages as m',
                    'm.conversation_id',
                    '=',
                    'c.id',
                )
                ->where(
                    'c.organization_id',
                    $organizationId,
                )
                ->where(
                    'me.user_id',
                    $userId,
                )
                ->whereNull(
                    'me.archived_at',
                )
                ->whereColumn(
                    'm.id',
                    '>',
                    'me.last_read_id',
                )
                ->where(
                    'm.user_id',
                    '!=',
                    $userId,
                )
                ->whereNull(
                    'm.deleted_at',
                )
                ->whereNotExists(
                    function (
                        $hidden,
                    ) use (
                        $userId,
                    ): void {
                        $hidden
                            ->selectRaw(
                                '1',
                            )
                            ->from(
                                'workspace_message_user_hides as h',
                            )
                            ->whereColumn(
                                'h.message_id',
                                'm.id',
                            )
                            ->where(
                                'h.user_id',
                                $userId,
                            );
                    },
                )
                ->count();

        return response()->json([
            'data' => $paginator,

            'unread_total' => $unreadTotal,

            'can_create_group' => $this->canManageGroups(),
        ]);
    }

    /**
     * Return Organization members available for direct messages or groups,
     * enriched with recent online-presence information.
     */
    public function people(
        Request $request,
    ): JsonResponse {
        $this->touchPresence(
            $request,
        );

        $data =
            $request->validate([
                'search' => [
                    'nullable',
                    'string',
                    'max:100',
                ],
            ]);

        $query =
            DB::table(
                'memberships',
            )
                ->join(
                    'users',
                    'users.id',
                    '=',
                    'memberships.user_id',
                )
                ->where(
                    'memberships.organization_id',
                    $this->organizationId(),
                )
                ->where(
                    'users.id',
                    '!=',
                    $request
                        ->user()
                        ->id,
                );

        if (
            ! empty(
                $data[
                    'search'
                ]
            )
        ) {
            $query->where(
                'users.name',
                'like',
                '%'
                .$data[
                    'search'
                ]
                .'%',
            );
        }

        $rows =
            $query
                ->orderBy(
                    'users.name',
                )
                ->limit(
                    100,
                )
                ->get([
                    'users.id',
                    'users.name',
                    'users.email',
                ]);

        $presence =
            $this->presenceMap(
                $rows
                    ->pluck(
                        'id',
                    )
                    ->map(
                        fn (
                            mixed $id,
                        ): int => (int) $id,
                    )
                    ->all(),
            );

        return response()->json([
            'data' => $rows
                ->map(
                    function (
                        object $person,
                    ) use (
                        $presence,
                    ): array {
                        $state =
                            $presence[
                                (int) $person
                                    ->id
                            ]
                            ?? null;

                        return [
                            'id' => (int) $person
                                ->id,

                            'name' => $person
                                ->name,

                            'email' => $person
                                ->email,

                            'is_online' => (bool) (
                                $state[
                                    'is_online'
                                ]
                                ?? false
                            ),

                            'last_seen_at' => $state[
                                    'last_seen_at'
                                ]
                                ?? null,
                        ];
                    },
                )
                ->values(),
        ]);
    }

    /**
     * Create/reuse a conversation or apply a per-user archive/restore action.
     */
    public function store(
        Request $request,
    ): JsonResponse {
        $this->touchPresence(
            $request,
        );

        /*
         * Archive/restore deliberately reuses the existing Team Space POST
         * endpoint so no extra route registration is necessary.
         */
        if (
            $request->filled(
                'action',
            )
        ) {
            return $this->handleConversationAction(
                $request,
            );
        }

        $data =
            $request->validate([
                'kind' => [
                    'required',

                    Rule::in([
                        'direct',
                        'group',
                    ]),
                ],

                'name' => [
                    'nullable',
                    'string',
                    'max:100',
                ],

                'description' => [
                    'nullable',
                    'string',
                    'max:500',
                ],

                'members' => [
                    'required',
                    'array',
                    'min:1',
                    'max:100',
                ],

                'members.*' => [
                    'integer',
                    'distinct',

                    Rule::exists(
                        'memberships',
                        'user_id',
                    )->where(
                        'organization_id',
                        $this->organizationId(),
                    ),
                ],
            ]);

        $userId =
            (int) $request
                ->user()
                ->id;

        $members =
            array_values(
                array_unique(
                    array_map(
                        'intval',
                        $data[
                            'members'
                        ],
                    ),
                ),
            );

        if (
            $data[
                'kind'
            ] ===
            'direct'
        ) {
            if (
                count(
                    $members,
                ) !== 1
                || $members[
                    0
                ] === $userId
            ) {
                throw ValidationException::withMessages([
                    'members' => [
                        'Choose exactly one other employee.',
                    ],
                ]);
            }
        } else {
            abort_unless(
                $this->canManageGroups(),
                403,
            );

            if (
                trim(
                    (string) (
                        $data[
                            'name'
                        ]
                        ?? ''
                    ),
                ) === ''
            ) {
                throw ValidationException::withMessages([
                    'name' => [
                        'Group name is required.',
                    ],
                ]);
            }
        }

        $id =
            DB::transaction(
                function () use (
                    $data,
                    $members,
                    $userId,
                ): int {
                    $organizationId =
                        $this->organizationId();

                    if (
                        $data[
                            'kind'
                        ] ===
                        'direct'
                    ) {
                        $pair = [
                            $userId,
                            $members[
                                0
                            ],
                        ];

                        sort(
                            $pair,
                        );

                        $directKey =
                            implode(
                                ':',
                                $pair,
                            );

                        $existing =
                            DB::table(
                                'workspace_conversations',
                            )
                                ->where(
                                    'organization_id',
                                    $organizationId,
                                )
                                ->where(
                                    'direct_key',
                                    $directKey,
                                )
                                ->lockForUpdate()
                                ->first();

                        if ($existing) {
                            DB::table(
                                'workspace_conversation_members',
                            )
                                ->where(
                                    'conversation_id',
                                    $existing
                                        ->id,
                                )
                                ->where(
                                    'user_id',
                                    $userId,
                                )
                                ->update([
                                    'archived_at' => null,
                                ]);

                            return (int) $existing
                                ->id;
                        }

                        $conversationId =
                            DB::table(
                                'workspace_conversations',
                            )
                                ->insertGetId([
                                    'organization_id' => $organizationId,

                                    'created_by' => $userId,

                                    'kind' => 'direct',

                                    'direct_key' => $directKey,

                                    'name' => 'Direct message',

                                    'description' => null,

                                    'is_private' => true,

                                    'created_at' => now(),

                                    'updated_at' => now(),
                                ]);
                    } else {
                        $conversationId =
                            DB::table(
                                'workspace_conversations',
                            )
                                ->insertGetId([
                                    'organization_id' => $organizationId,

                                    'created_by' => $userId,

                                    'kind' => 'group',

                                    'direct_key' => null,

                                    'name' => trim(
                                        $data[
                                            'name'
                                        ],
                                    ),

                                    'description' => $data[
                                            'description'
                                        ]
                                        ?? null,

                                    'is_private' => true,

                                    'created_at' => now(),

                                    'updated_at' => now(),
                                ]);
                    }

                    foreach (
                        array_unique([
                            ...$members,
                            $userId,
                        ]) as $memberId
                    ) {
                        DB::table(
                            'workspace_conversation_members',
                        )->insertOrIgnore([
                            'conversation_id' => $conversationId,

                            'user_id' => $memberId,

                            'last_read_id' => 0,

                            'archived_at' => null,
                        ]);
                    }

                    return (int) $conversationId;
                },
                3,
            );

        return response()->json([
            'id' => $id,
        ], 201);
    }

    /**
     * Return messages, members, reactions, and attachment metadata.
     *
     * Opening the newest page marks the conversation as read for this user.
     */
    public function messages(
        Request $request,
        string $conversation,
    ): JsonResponse|BinaryFileResponse|StreamedResponse {
        $this->touchPresence(
            $request,
        );

        $row =
            $this->conversation(
                $request,
                $conversation,
            );

        if (
            $request->filled(
                'attachment',
            )
        ) {
            $validated =
                $request->validate([
                    'attachment' => [
                        'required',
                        'integer',
                        'min:1',
                    ],
                ]);

            return $this->attachmentResponse(
                $row,
                (int) $validated[
                    'attachment'
                ],
            );
        }

        $data =
            $request->validate([
                'mark_read' => ['sometimes', 'boolean'],
                'before' => [
                    'nullable',
                    'integer',
                    'min:1',
                ],
            ]);

        $userId =
            (int) $request
                ->user()
                ->id;

        $query =
            DB::table(
                'workspace_messages as m',
            )
                ->join(
                    'users',
                    'users.id',
                    '=',
                    'm.user_id',
                )
                ->where(
                    'm.conversation_id',
                    $row
                        ->id,
                )
                ->whereNotExists(
                    function (
                        $hidden,
                    ) use (
                        $userId,
                    ): void {
                        $hidden
                            ->selectRaw(
                                '1',
                            )
                            ->from(
                                'workspace_message_user_hides as h',
                            )
                            ->whereColumn(
                                'h.message_id',
                                'm.id',
                            )
                            ->where(
                                'h.user_id',
                                $userId,
                            );
                    },
                );

        if (
            ! empty(
                $data[
                    'before'
                ]
            )
        ) {
            $query->where(
                'm.id',
                '<',
                $data[
                    'before'
                ],
            );
        }

        $messages =
            $query
                ->orderByDesc(
                    'm.id',
                )
                ->limit(
                    50,
                )
                ->get([
                    'm.*',
                    'users.name',
                ])
                ->reverse()
                ->values();

        $messageIds =
            $messages
                ->pluck(
                    'id',
                )
                ->map(
                    fn (
                        mixed $id,
                    ): int => (int) $id,
                )
                ->all();

        $attachments =
            empty(
                $messageIds
            )
                ? collect()
                : DB::table(
                    'workspace_message_attachments',
                )
                    ->whereIn(
                        'message_id',
                        $messageIds,
                    )
                    ->orderBy(
                        'id',
                    )
                    ->get()
                    ->groupBy(
                        'message_id',
                    );

        $reactions =
            empty(
                $messageIds
            )
                ? collect()
                : DB::table(
                    'workspace_message_reactions as r',
                )
                    ->join(
                        'users as u',
                        'u.id',
                        '=',
                        'r.user_id',
                    )
                    ->whereIn(
                        'r.message_id',
                        $messageIds,
                    )
                    ->orderBy(
                        'r.id',
                    )
                    ->get([
                        'r.message_id',
                        'r.user_id',
                        'r.reaction',
                        'u.name',
                    ])
                    ->groupBy(
                        'message_id',
                    );

        $serialized =
            $messages
                ->map(
                    function (
                        object $message,
                    ) use (
                        $attachments,
                        $reactions,
                        $row,
                        $userId,
                    ): array {
                        $deleted =
                            $message
                                ->deleted_at !==
                            null;

                        $messageReactions =
                            collect(
                                $reactions->get(
                                    $message
                                        ->id,
                                    collect(),
                                ),
                            );

                        $reactionGroups =
                            $deleted
                                ? []
                                : $messageReactions
                                    ->groupBy(
                                        'reaction',
                                    )
                                    ->map(
                                        function (
                                            $items,
                                            string $reaction,
                                        ) use (
                                            $userId,
                                        ): array {
                                            return [
                                                'reaction' => $reaction,

                                                'count' => $items
                                                    ->count(),

                                                'reacted_by_me' => $items->contains(
                                                    fn (
                                                        object $item,
                                                    ): bool => (int) $item
                                                        ->user_id ===
                                                        $userId,
                                                ),

                                                'users' => $items->map(fn (object $item): array => ['id' => (int) $item->user_id, 'name' => $item->name])->values()->all(),
                                                'people' => $items
                                                    ->pluck(
                                                        'name',
                                                    )
                                                    ->values()
                                                    ->all(),
                                            ];
                                        },
                                    )
                                    ->values()
                                    ->all();

                        return [
                            'id' => (int) $message
                                ->id,

                            'conversation_id' => (int) $message
                                ->conversation_id,

                            'user_id' => (int) $message
                                ->user_id,

                            'request_id' => $message
                                ->request_id,

                            'body' => $deleted
                                    ? ''
                                    : $message
                                        ->body,

                            'name' => $message
                                ->name,

                            'created_at' => $message
                                ->created_at,

                            'updated_at' => $message
                                ->updated_at,

                            'deleted_at' => $message
                                ->deleted_at,

                            'reactions' => $reactionGroups,

                            'attachments' => $deleted
                                    ? []
                                    : collect(
                                        $attachments->get(
                                            $message
                                                ->id,
                                            collect(),
                                        ),
                                    )
                                        ->map(
                                            fn (
                                                object $attachment,
                                            ): array => [
                                                'id' => (int) $attachment
                                                    ->id,

                                                'name' => $attachment
                                                    ->original_name,

                                                'mime' => $attachment
                                                    ->mime_type,

                                                'size' => (int) $attachment
                                                    ->size,

                                                'kind' => $attachment
                                                    ->kind,

                                                'url' => '/api/team-space/'
                                                    .$row
                                                        ->id
                                                    .'/messages?attachment='
                                                    .$attachment
                                                        ->id,
                                            ],
                                        )
                                        ->values()
                                        ->all(),
                        ];
                    },
                );

        if (empty($data['before']) && ($data['mark_read'] ?? true)) {
            $latestMessageId =
                (int) (
                    DB::table(
                        'workspace_messages',
                    )
                        ->where(
                            'conversation_id',
                            $row
                                ->id,
                        )
                        ->max(
                            'id',
                        )
                    ?? 0
                );

            DB::table(
                'workspace_conversation_members',
            )
                ->where(
                    'conversation_id',
                    $row
                        ->id,
                )
                ->where(
                    'user_id',
                    $userId,
                )
                ->update([
                    'last_read_id' => $latestMessageId,
                ]);
            DB::table('workspace_notifications')->where('organization_id', $row->organization_id)->where('user_id', $userId)
                ->where('event_key', 'like', 'message:'.$row->id.':%')->whereNull('read_at')->update(['read_at' => now(), 'updated_at' => now()]);

        }

        $participant =
            $this->directParticipant(
                $row,
                $userId,
            );

        return response()->json([
            'conversation' => [
                'id' => (int) $row
                    ->id,

                'organization_id' => (int) $row
                    ->organization_id,

                'created_by' => (int) $row
                    ->created_by,

                'kind' => $row
                    ->kind,

                'name' => $row
                    ->name,

                'display_name' => $participant
                    ?->name
                    ?? $row
                        ->name,

                'description' => $row
                    ->description,

                'is_private' => true,

                'created_at' => $row
                    ->created_at,

                'updated_at' => $row
                    ->updated_at,

                'archived_at' => $row
                    ->member_archived_at
                    ?? null,

                'is_archived' => (
                    $row
                        ->member_archived_at
                    ?? null
                ) !== null,

                'unread_count' => 0,

                'latest_message_id' => null,

                'latest_preview' => null,

                'latest_sender_name' => null,

                'latest_at' => null,

                'latest_has_attachments' => false,

                'participant_user_id' => $participant
                    ?->id,

                'is_online' => $participant
                        ? $this->isUserOnline(
                            $this->organizationId(),
                            (int) $participant
                                ->id,
                        )
                        : false,
            ],

            'messages' => $serialized,
            'restriction' => app(MessageRestrictions::class)->forSender($row, $userId),

            'members' => $this->serializeMembers(
                (int) $row
                    ->id,
            ),

            'can_manage' => $row
                ->kind ===
                'group'
                && $this->canManageGroups(),
        ]);
    }

    /**
     * Send one text/media message.
     *
     * New activity restores the conversation for members who had only archived
     * it from their own inbox.
     */
    public function send(
        Request $request,
        string $conversation,
    ): JsonResponse {
        $this->touchPresence(
            $request,
        );

        $maxFiles =
            (int) config(
                'team-space.max_files_per_message',
                5,
            );

        $maxFileKb =
            (int) config(
                'team-space.max_file_kb',
                51200,
            );

        $data =
            $request->validate([
                'body' => [
                    'nullable',
                    'string',
                    'max:10000',
                    'required_without:attachments',
                ],

                'request_id' => [
                    'required',
                    'uuid',
                ],

                'attachments' => [
                    'sometimes',
                    'array',
                    'max:'
                    .$maxFiles,
                ],

                'attachments.*' => [
                    'file',
                    'max:'
                    .$maxFileKb,

                    'mimetypes:'
                    .'image/jpeg,'
                    .'image/png,'
                    .'image/webp,'
                    .'image/gif,'
                    .'video/mp4,'
                    .'video/webm,'
                    .'video/quicktime,'
                    .'audio/mpeg,'
                    .'audio/mp4,'
                    .'audio/webm,'
                    .'audio/ogg,'
                    .'audio/wav,'
                    .'audio/x-wav',
                ],
            ]);

        $row =
            $this->conversation(
                $request,
                $conversation,
                true,
            );

        abort_if(app(MessageRestrictions::class)->forSender($row, (int) $request->user()->id) !== null, 403, 'Messaging is restricted for this conversation.');

        $existing =
            DB::table(
                'workspace_messages',
            )
                ->where(
                    'conversation_id',
                    $row
                        ->id,
                )
                ->where(
                    'user_id',
                    $request
                        ->user()
                        ->id,
                )
                ->where(
                    'request_id',
                    $data[
                        'request_id'
                    ],
                )
                ->first();

        if ($existing) {
            return response()->json([
                'id' => (int) $existing
                    ->id,
            ]);
        }

        $disk =
            (string) config(
                'team-space.disk',
                'local',
            );

        $storedFiles = [];

        try {
            foreach (
                $request->file(
                    'attachments',
                    [],
                ) as $file
            ) {
                $path =
                    $file->store(
                        'team-space/'
                        .$this->organizationId()
                        .'/'
                        .$row
                            ->id,
                        $disk,
                    );

                if (! $path) {
                    throw new \RuntimeException(
                        'Could not store Team Space attachment.',
                    );
                }

                $mime =
                    (string) (
                        $file->getMimeType()
                        ?: 'application/octet-stream'
                    );

                $kind =
                    str_starts_with(
                        $mime,
                        'image/',
                    )
                        ? 'image'
                        : (
                            str_starts_with(
                                $mime,
                                'video/',
                            )
                                ? 'video'
                                : 'audio'
                        );

                $storedFiles[] = [
                    'disk' => $disk,

                    'path' => $path,

                    'original_name' => Str::limit(
                        $file
                            ->getClientOriginalName(),
                        255,
                        '',
                    ),

                    'mime_type' => $mime,

                    'size' => (int) $file
                        ->getSize(),

                    'kind' => $kind,
                ];
            }

            $messageId =
                DB::transaction(
                    function () use (
                        $request,
                        $row,
                        $data,
                        $storedFiles,
                    ): int {
                        $messageId =
                            DB::table(
                                'workspace_messages',
                            )
                                ->insertGetId([
                                    'conversation_id' => $row
                                        ->id,

                                    'user_id' => $request
                                        ->user()
                                        ->id,

                                    'request_id' => $data[
                                            'request_id'
                                        ],

                                    'body' => trim(
                                        (string) (
                                            $data[
                                                'body'
                                            ]
                                            ?? ''
                                        ),
                                    ),

                                    'created_at' => now(),

                                    'updated_at' => now(),
                                ]);

                        foreach (
                            $storedFiles as $file
                        ) {
                            DB::table(
                                'workspace_message_attachments',
                            )->insert([
                                'organization_id' => $this->organizationId(),

                                'conversation_id' => $row
                                    ->id,

                                'message_id' => $messageId,

                                ...$file,

                                'created_at' => now(),

                                'updated_at' => now(),
                            ]);
                        }

                        DB::table(
                            'workspace_conversations',
                        )
                            ->where(
                                'id',
                                $row
                                    ->id,
                            )
                            ->update([
                                'updated_at' => now(),
                            ]);

                        /*
                         * Messenger-like behavior: if new activity arrives
                         * after a user archived/deleted the thread from their
                         * own list, the active conversation returns.
                         */
                        DB::table(
                            'workspace_conversation_members',
                        )
                            ->where(
                                'conversation_id',
                                $row
                                    ->id,
                            )
                            ->update([
                                'archived_at' => null,
                            ]);

                        app(NotificationCenter::class)->message($row, (int) $messageId, (int) $request->user()->id, $request->user()->name);

                        return (int) $messageId;
                    },
                    3,
                );
        } catch (
            Throwable $exception
        ) {
            foreach (
                $storedFiles as $file
            ) {
                Storage::disk(
                    $file[
                        'disk'
                    ],
                )->delete(
                    $file[
                        'path'
                    ],
                );
            }

            throw $exception;
        }

        return response()->json([
            'id' => $messageId,
        ], 201);
    }

    /**
     * Replace the member list for a managed group.
     */
    public function members(
        Request $request,
        string $conversation,
    ): JsonResponse {
        $this->touchPresence(
            $request,
        );

        $data =
            $request->validate([
                'members' => [
                    'present',
                    'array',
                    'min:1',
                    'max:100',
                ],

                'members.*' => [
                    'integer',
                    'distinct',

                    Rule::exists(
                        'memberships',
                        'user_id',
                    )->where(
                        'organization_id',
                        $this->organizationId(),
                    ),
                ],
            ]);

        DB::transaction(
            function () use (
                $request,
                $conversation,
                $data,
            ): void {
                $row =
                    $this->conversation(
                        $request,
                        $conversation,
                        true,
                    );

                abort_unless(
                    $row
                        ->kind ===
                        'group'
                    && $this->canManageGroups(),
                    403,
                );

                $ids =
                    array_values(
                        array_unique([
                            ...array_map(
                                'intval',
                                $data[
                                    'members'
                                ],
                            ),

                            (int) $row
                                ->created_by,
                        ]),
                    );

                DB::table(
                    'workspace_conversation_members',
                )
                    ->where(
                        'conversation_id',
                        $row
                            ->id,
                    )
                    ->whereNotIn(
                        'user_id',
                        $ids,
                    )
                    ->delete();

                foreach (
                    $ids as $id
                ) {
                    DB::table(
                        'workspace_conversation_members',
                    )->insertOrIgnore([
                        'conversation_id' => $row
                            ->id,

                        'user_id' => $id,

                        'last_read_id' => 0,

                        'archived_at' => null,
                    ]);
                }
            },
            3,
        );

        return response()->json([
            'saved' => true,
        ]);
    }

    /**
     * Edit, react to, hide-for-me, or unsend a message using the existing
     * message route.
     */
    public function updateMessage(
        Request $request,
        string $conversation,
        string $message,
    ): JsonResponse {
        $this->touchPresence(
            $request,
        );

        $row =
            $this->conversation(
                $request,
                $conversation,
                true,
            );

        $entry =
            DB::table(
                'workspace_messages',
            )
                ->where(
                    'conversation_id',
                    $row
                        ->id,
                )
                ->where(
                    'id',
                    $message,
                )
                ->first();

        abort_unless(
            $entry,
            404,
        );

        /*
         * DELETE supports:
         * - for_me: any visible message disappears only for this user.
         * - everyone: only the original sender may unsend globally.
         */
        if (
            $request->isMethod(
                'DELETE',
            )
        ) {
            $data =
                $request->validate([
                    'mode' => [
                        'nullable',

                        Rule::in([
                            'for_me',
                            'everyone',
                        ]),
                    ],
                ]);

            $mode =
                $data[
                    'mode'
                ]
                ?? 'for_me';

            if (
                $mode ===
                'everyone'
            ) {
                abort_unless(
                    (int) $entry
                        ->user_id ===
                    (int) $request
                        ->user()
                        ->id,
                    403,
                );

                DB::table(
                    'workspace_messages',
                )
                    ->where(
                        'id',
                        $entry
                            ->id,
                    )
                    ->whereNull(
                        'deleted_at',
                    )
                    ->update([
                        'deleted_at' => now(),

                        'updated_at' => now(),
                    ]);

                DB::table(
                    'workspace_message_reactions',
                )
                    ->where(
                        'message_id',
                        $entry
                            ->id,
                    )
                    ->delete();
            } else {
                DB::table(
                    'workspace_message_user_hides',
                )
                    ->updateOrInsert(
                        [
                            'message_id' => $entry
                                ->id,

                            'user_id' => $request
                                ->user()
                                ->id,
                        ],
                        [
                            'organization_id' => $this->organizationId(),

                            'conversation_id' => $row
                                ->id,

                            'hidden_at' => now(),

                            'updated_at' => now(),

                            'created_at' => now(),
                        ],
                    );
            }

            return response()->json([
                'saved' => true,
            ]);
        }

        /*
         * PATCH with reaction toggles/replaces this user's reaction.
         */
        if (
            $request->has(
                'reaction',
            )
        ) {
            $data =
                $request->validate([
                    'reaction' => [
                        'required',
                        'string',
                        'max:16',

                        Rule::in([
                            '👍',
                            '❤️',
                            '😂',
                            '🎉',
                            '😮',
                            '😢',
                        ]),
                    ],
                ]);

            abort_if(
                $entry
                    ->deleted_at !==
                null,
                422,
            );

            $existingReaction =
                DB::table(
                    'workspace_message_reactions',
                )
                    ->where(
                        'message_id',
                        $entry
                            ->id,
                    )
                    ->where(
                        'user_id',
                        $request
                            ->user()
                            ->id,
                    )
                    ->first();

            if (
                $existingReaction
                && $existingReaction
                    ->reaction ===
                    $data[
                        'reaction'
                    ]
            ) {
                DB::table(
                    'workspace_message_reactions',
                )
                    ->where(
                        'id',
                        $existingReaction
                            ->id,
                    )
                    ->delete();
            } else {
                DB::table(
                    'workspace_message_reactions',
                )
                    ->updateOrInsert(
                        [
                            'message_id' => $entry
                                ->id,

                            'user_id' => $request
                                ->user()
                                ->id,
                        ],
                        [
                            'organization_id' => $this->organizationId(),

                            'conversation_id' => $row
                                ->id,

                            'reaction' => $data[
                                    'reaction'
                                ],

                            'updated_at' => now(),

                            'created_at' => now(),
                        ],
                    );
            }

            return response()->json([
                'saved' => true,
            ]);
        }

        /*
         * Normal PATCH edits only a message owned by the current user.
         */
        abort_if(app(MessageRestrictions::class)->forSender($row, (int) $request->user()->id) !== null, 403, 'Messaging is restricted for this conversation.');

        $data =
            $request->validate([
                'body' => [
                    'required',
                    'string',
                    'max:10000',
                ],
            ]);

        abort_unless(
            (int) $entry
                ->user_id ===
            (int) $request
                ->user()
                ->id,
            403,
        );

        abort_if(
            $entry
                ->deleted_at !==
            null,
            422,
        );

        DB::table(
            'workspace_messages',
        )
            ->where(
                'id',
                $entry
                    ->id,
            )
            ->update([
                'body' => trim(
                    $data[
                        'body'
                    ],
                ),

                'updated_at' => now(),
            ]);

        return response()->json([
            'saved' => true,
        ]);
    }

    /**
     * Resolve a conversation inside the active tenant and require membership.
     */
    private function conversation(
        Request $request,
        string $conversation,
        bool $lock = false,
    ): object {
        $query =
            DB::table(
                'workspace_conversations as c',
            )
                ->join(
                    'workspace_conversation_members as me',
                    function (
                        $join,
                    ) use (
                        $request,
                    ): void {
                        $join
                            ->on(
                                'me.conversation_id',
                                '=',
                                'c.id',
                            )
                            ->where(
                                'me.user_id',
                                $request
                                    ->user()
                                    ->id,
                            );
                    },
                )
                ->where(
                    'c.organization_id',
                    $this->organizationId(),
                )
                ->where(
                    'c.id',
                    $conversation,
                )
                ->select([
                    'c.*',
                    'me.archived_at as member_archived_at',
                ]);

        if ($lock) {
            $query->lockForUpdate();
        }

        $row =
            $query->first();

        /*
         * A 404 intentionally avoids leaking the existence of private groups.
         */
        abort_unless(
            $row,
            404,
        );

        return $row;
    }

    /**
     * Return the other participant for a direct conversation.
     */
    private function directParticipant(
        object $conversation,
        int $userId,
    ): ?object {
        if (
            $conversation
                ->kind !==
            'direct'
        ) {
            return null;
        }

        return DB::table(
            'workspace_conversation_members as cm',
        )
            ->join(
                'users',
                'users.id',
                '=',
                'cm.user_id',
            )
            ->where(
                'cm.conversation_id',
                $conversation
                    ->id,
            )
            ->where(
                'cm.user_id',
                '!=',
                $userId,
            )
            ->first([
                'users.id',
                'users.name',
            ]);
    }

    /**
     * Serialize members with current presence information.
     */
    private function serializeMembers(
        int $conversationId,
    ): array {
        $members =
            DB::table(
                'workspace_conversation_members as cm',
            )
                ->join(
                    'users',
                    'users.id',
                    '=',
                    'cm.user_id',
                )
                ->join(
                    'memberships as membership',
                    function (
                        $join,
                    ): void {
                        $join
                            ->on(
                                'membership.user_id',
                                '=',
                                'cm.user_id',
                            )
                            ->where(
                                'membership.organization_id',
                                $this->organizationId(),
                            );
                    },
                )
                ->where(
                    'cm.conversation_id',
                    $conversationId,
                )
                ->orderBy(
                    'users.name',
                )
                ->get([
                    'users.id',
                    'users.name',
                ]);

        $presence =
            $this->presenceMap(
                $members
                    ->pluck(
                        'id',
                    )
                    ->map(
                        fn (
                            mixed $id,
                        ): int => (int) $id,
                    )
                    ->all(),
            );

        return $members
            ->map(
                function (
                    object $member,
                ) use (
                    $presence,
                ): array {
                    $state =
                        $presence[
                            (int) $member
                                ->id
                        ]
                        ?? null;

                    return [
                        'id' => (int) $member
                            ->id,

                        'name' => $member
                            ->name,

                        'is_online' => (bool) (
                            $state[
                                'is_online'
                            ]
                            ?? false
                        ),

                        'last_seen_at' => $state[
                                'last_seen_at'
                            ]
                            ?? null,
                    ];
                },
            )
            ->values()
            ->all();
    }

    /**
     * Serve one attachment only after conversation membership authorization.
     */
    private function attachmentResponse(
        object $conversation,
        int $attachmentId,
    ): BinaryFileResponse|StreamedResponse {
        $attachment =
            DB::table(
                'workspace_message_attachments as a',
            )
                ->join(
                    'workspace_messages as m',
                    'm.id',
                    '=',
                    'a.message_id',
                )
                ->where(
                    'a.organization_id',
                    $this->organizationId(),
                )
                ->where(
                    'a.conversation_id',
                    $conversation
                        ->id,
                )
                ->where(
                    'a.id',
                    $attachmentId,
                )
                ->whereNull(
                    'm.deleted_at',
                )
                ->first([
                    'a.*',
                ]);

        abort_unless(
            $attachment,
            404,
        );

        $storage =
            Storage::disk(
                $attachment
                    ->disk,
            );

        abort_unless(
            $storage->exists(
                $attachment
                    ->path,
            ),
            404,
        );

        $headers = [
            'Content-Type' => $attachment
                ->mime_type,

            'Content-Disposition' => 'inline; filename*=UTF-8\'\''
                .rawurlencode(
                    $attachment
                        ->original_name,
                ),

            'Cache-Control' => 'private, max-age=3600',
        ];

        try {
            $absolutePath =
                $storage->path(
                    $attachment
                        ->path,
                );

            if (
                is_file(
                    $absolutePath,
                )
            ) {
                return response()->file(
                    $absolutePath,
                    $headers,
                );
            }
        } catch (
            Throwable
        ) {
            /*
             * Remote object storage does not necessarily expose a local path.
             */
        }

        $stream =
            $storage->readStream(
                $attachment
                    ->path,
            );

        abort_unless(
            is_resource(
                $stream,
            ),
            404,
        );

        $headers[
            'Content-Length'
        ] =
            (string) $attachment
                ->size;

        return response()->stream(
            static function () use (
                $stream,
            ): void {
                fpassthru(
                    $stream,
                );

                fclose(
                    $stream,
                );
            },
            200,
            $headers,
        );
    }

    /**
     * Archive or restore only the authenticated member's conversation row.
     */
    private function handleConversationAction(
        Request $request,
    ): JsonResponse {
        $data =
            $request->validate([
                'action' => [
                    'required',

                    Rule::in([
                        'archive',
                        'restore',
                    ]),
                ],

                'conversation_id' => [
                    'required',
                    'integer',
                    'min:1',
                ],
            ]);

        $row =
            $this->conversation(
                $request,
                (string) $data[
                    'conversation_id'
                ],
                true,
            );

        DB::table(
            'workspace_conversation_members',
        )
            ->where(
                'conversation_id',
                $row
                    ->id,
            )
            ->where(
                'user_id',
                $request
                    ->user()
                    ->id,
            )
            ->update([
                'archived_at' => $data[
                        'action'
                    ] ===
                    'archive'
                        ? now()
                        : null,
            ]);

        return response()->json([
            'saved' => true,

            'archived' => $data[
                    'action'
                ] ===
                'archive',
        ]);
    }

    /**
     * Record a lightweight last-seen heartbeat for this Organization.
     */
    private function touchPresence(
        Request $request,
    ): void {
        DB::table(
            'workspace_user_presence',
        )->upsert([
            [
                'organization_id' => $this->organizationId(),

                'user_id' => (int) $request
                    ->user()
                    ->id,

                'last_seen_at' => now(),

                'created_at' => now(),

                'updated_at' => now(),
            ],
        ], [
            'organization_id',
            'user_id',
        ], [
            'last_seen_at',
            'updated_at',
        ]);
    }

    /**
     * Return last-seen state for a set of Organization users.
     */
    private function presenceMap(
        array $userIds,
    ): array {
        if (
            $userIds ===
            []
        ) {
            return [];
        }

        $onlineSince =
            now()->subSeconds(
                45,
            );

        return DB::table(
            'workspace_user_presence',
        )
            ->where(
                'organization_id',
                $this->organizationId(),
            )
            ->whereIn(
                'user_id',
                $userIds,
            )
            ->get([
                'user_id',
                'last_seen_at',
            ])
            ->mapWithKeys(
                function (
                    object $presence,
                ) use (
                    $onlineSince,
                ): array {
                    return [
                        (int) $presence
                            ->user_id => [
                                'last_seen_at' => $presence
                                    ->last_seen_at,

                                'is_online' => $presence
                                    ->last_seen_at >=
                                    $onlineSince->format(
                                        'Y-m-d H:i:s',
                                    ),
                            ],
                    ];
                },
            )
            ->all();
    }

    /**
     * Return whether one Organization user has a recent heartbeat.
     */
    private function isUserOnline(
        int $organizationId,
        int $userId,
    ): bool {
        return DB::table(
            'workspace_user_presence',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'user_id',
                $userId,
            )
            ->where(
                'last_seen_at',
                '>=',
                now()->subSeconds(
                    45,
                ),
            )
            ->exists();
    }

    /**
     * Return whether the current built-in role may create/manage groups.
     */
    private function canManageGroups(): bool
    {
        return in_array(
            app(
                TenantContext::class,
            )
                ->role()
                ->value,
            [
                'owner',
                'admin',
                'manager',
            ],
            true,
        );
    }

    /**
     * Return the active Organization ID.
     */
    private function organizationId(): int
    {
        return app(
            TenantContext::class,
        )->id();
    }
}
