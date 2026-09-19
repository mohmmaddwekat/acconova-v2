import {
    apiRequest,
} from '@/lib/http';

import type {
    EmailChangePayload,
    ProfileResponse,
    UpdateProfilePayload,
} from './types';

/**
 * Load the authenticated user's profile and active-session information.
 */
export function fetchProfile(): Promise<ProfileResponse> {
    return apiRequest<ProfileResponse>(
        '/api/profile',
    );
}

/**
 * Persist editable personal profile fields.
 */
export function updateProfile(
    payload: UpdateProfilePayload,
): Promise<ProfileResponse> {
    return apiRequest<ProfileResponse>(
        '/api/profile',
        {
            method:
                'PATCH',

            body:
                JSON.stringify(
                    payload,
                ),
        },
    );
}

/**
 * Upload a private authenticated profile avatar.
 */
export function uploadProfileAvatar(
    file: File,
): Promise<ProfileResponse> {
    const body =
        new FormData();

    body.append(
        'avatar',
        file,
    );

    return apiRequest<ProfileResponse>(
        '/api/profile/avatar',
        {
            method:
                'POST',

            body,
        },
    );
}

/**
 * Request a verified email-address change.
 */
export function requestProfileEmailChange(
    payload: EmailChangePayload,
): Promise<{
    saved: boolean;
}> {
    return apiRequest<{
        saved: boolean;
    }>(
        '/api/profile/email',
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
