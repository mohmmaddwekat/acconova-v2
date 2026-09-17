export type ConversationKind =
    | 'direct'
    | 'group';

export type ConversationFilter =
    | 'all'
    | 'direct'
    | 'group'
    | 'unread'
    | 'archived';

export type Conversation = {
    id: number;
    organization_id: number;
    created_by: number;
    kind: ConversationKind;
    name: string;
    display_name: string;
    description: string | null;
    is_private: boolean;
    created_at: string;
    updated_at: string;
    archived_at: string | null;
    is_archived: boolean;
    unread_count: number;
    latest_message_id: number | null;
    latest_preview: string | null;
    latest_sender_name: string | null;
    latest_at: string | null;
    latest_has_attachments: boolean;
    participant_user_id: number | null;
    is_online: boolean;
};

export type TeamPerson = {
    id: number;
    name: string;
    email?: string;
    is_online: boolean;
    last_seen_at: string | null;
};

export type MessageAttachmentKind =
    | 'image'
    | 'video'
    | 'audio';

export type MessageAttachment = {
    id: number;
    name: string;
    mime: string;
    size: number;
    kind: MessageAttachmentKind;
    url: string;
};

export type MessageReaction = {
    reaction: string;
    count: number;
    reacted_by_me: boolean;
    people: string[];
    users: { id: number; name: string }[];
};

export type TeamMessage = {
    id: number;
    conversation_id: number;
    user_id: number;
    request_id: string;
    body: string;
    name: string;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    attachments: MessageAttachment[];
    reactions: MessageReaction[];
};

export type ConversationIndexResponse = {
    data: {
        data: Conversation[];
        current_page?: number;
        last_page?: number;
    };
    unread_total: number;
    can_create_group: boolean;
};

export type PeopleResponse = {
    data: TeamPerson[];
};

export type ThreadResponse = {
    restriction: { scope: 'group' | 'direct'; by: string; expires_at: string | null } | null;
    conversation: Conversation;
    messages: TeamMessage[];
    members: TeamPerson[];
    can_manage: boolean;
};

export type CreateConversationPayload = {
    kind: ConversationKind;
    name?: string | null;
    description?: string | null;
    members: number[];
};

export type CreateConversationResponse = {
    id: number;
};

export type ConversationActionResponse = {
    saved: boolean;
    archived: boolean;
};
