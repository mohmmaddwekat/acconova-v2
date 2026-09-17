import {
    apiRequest,
} from '@/lib/http';

import type {
    ConversationActionResponse,
    ConversationIndexResponse,
    CreateConversationPayload,
    CreateConversationResponse,
    PeopleResponse,
    ThreadResponse,
} from './types';

/**
 * Load visible or archived conversations for the authenticated member.
 */
export function fetchConversations(
    search = '',
    limit = 50,
    archived = false,
): Promise<ConversationIndexResponse> {
    const params =
        new URLSearchParams();

    params.set(
        'search',
        search,
    );

    params.set(
        'limit',
        String(
            limit,
        ),
    );

    params.set(
        'archived',
        archived
            ? '1'
            : '0',
    );

    return apiRequest<ConversationIndexResponse>(
        `/api/team-space?${params.toString()}`,
    );
}

/**
 * Load Organization members and their recent online-presence state.
 */
export function fetchTeamPeople(
    search = '',
): Promise<PeopleResponse> {
    return apiRequest<PeopleResponse>(
        `/api/team-space/people?search=${encodeURIComponent(
            search,
        )}`,
    );
}

/**
 * Create or reuse a direct conversation, or create a managed group.
 */
export function createConversation(
    payload: CreateConversationPayload,
): Promise<CreateConversationResponse> {
    return apiRequest<CreateConversationResponse>(
        '/api/team-space',
        {
            method:
                'POST',

            body:
                JSON.stringify(
                    payload,
                ),
        },
    );
}

/**
 * Archive or restore a conversation only for the authenticated member.
 */
export function setConversationArchived(
    conversationId: number,
    archived: boolean,
): Promise<ConversationActionResponse> {
    return apiRequest<ConversationActionResponse>(
        '/api/team-space',
        {
            method:
                'POST',

            body:
                JSON.stringify({
                    action:
                        archived
                            ? 'archive'
                            : 'restore',

                    conversation_id:
                        conversationId,
                }),
        },
    );
}

/**
 * Load one authorized conversation and mark its newest messages as read.
 */
export function fetchConversationThread(
    conversationId: number,
): Promise<ThreadResponse> {
    return apiRequest<ThreadResponse>(
        `/api/team-space/${conversationId}/messages?mark_read=${document.visibilityState === 'visible' && document.hasFocus() ? '1' : '0'}`,
    );
}

/**
 * Send text and optional private media attachments.
 */
export function sendConversationMessage(
    conversationId: number,
    body: string,
    files: File[],
): Promise<{
    id: number;
}> {
    const payload =
        new FormData();

    payload.append(
        'request_id',
        crypto.randomUUID(),
    );

    if (
        body.trim()
    ) {
        payload.append(
            'body',
            body.trim(),
        );
    }

    files.forEach(
        (
            file,
        ) => {
            payload.append(
                'attachments[]',
                file,
            );
        },
    );

    return apiRequest<{
        id: number;
    }>(
        `/api/team-space/${conversationId}/messages`,
        {
            method:
                'POST',

            body:
                payload,
        },
    );
}

/**
 * Replace one owned text message.
 */
export function updateConversationMessage(
    conversationId: number,
    messageId: number,
    body: string,
): Promise<{
    saved: boolean;
}> {
    return apiRequest<{
        saved: boolean;
    }>(
        `/api/team-space/${conversationId}/messages/${messageId}`,
        {
            method:
                'PATCH',

            body:
                JSON.stringify({
                    body,
                }),
        },
    );
}

/**
 * Toggle one Messenger-style reaction for the current user.
 */
export function reactToConversationMessage(
    conversationId: number,
    messageId: number,
    reaction: string,
): Promise<{
    saved: boolean;
}> {
    return apiRequest<{
        saved: boolean;
    }>(
        `/api/team-space/${conversationId}/messages/${messageId}`,
        {
            method:
                'PATCH',

            body:
                JSON.stringify({
                    reaction,
                }),
        },
    );
}

/**
 * Hide a message only for this user or unsend an owned message for everyone.
 */
export function deleteConversationMessage(
    conversationId: number,
    messageId: number,
    mode:
        | 'for_me'
        | 'everyone' = 'for_me',
): Promise<{
    saved: boolean;
}> {
    return apiRequest<{
        saved: boolean;
    }>(
        `/api/team-space/${conversationId}/messages/${messageId}`,
        {
            method:
                'DELETE',

            body:
                JSON.stringify({
                    mode,
                }),
        },
    );
}

/**
 * Replace the explicit member list for one managed group.
 */
export function updateConversationMembers(
    conversationId: number,
    members: number[],
): Promise<{
    saved: boolean;
}> {
    return apiRequest<{
        saved: boolean;
    }>(
        `/api/team-space/${conversationId}/members`,
        {
            method:
                'PATCH',

            body:
                JSON.stringify({
                    members,
                }),
        },
    );
}
