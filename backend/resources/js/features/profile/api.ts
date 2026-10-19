import {
    apiRequest,
} from '@/lib/http';

import type {
    EmailChangePayload,
    ProfileResponse,
    PublicProfile,
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

/**
 * Choose whether workspace colleagues can see the e-mail and phone.
 */
export function updateProfilePrivacy(
    payload: { show_email?: boolean; show_phone?: boolean },
): Promise<ProfileResponse> {
    return apiRequest<ProfileResponse>(
        '/api/profile/privacy',
        {
            method: 'PATCH',
            body: JSON.stringify(payload),
        },
    );
}

/**
 * Load a colleague's read-only profile from the active workspace.
 */
export function fetchPublicProfile(userId: number): Promise<PublicProfile> {
    return apiRequest<PublicProfile>(`/api/profile/people/${userId}`);
}
