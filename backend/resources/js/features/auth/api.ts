import { apiRequest } from '@/lib/http';

export type LoginPayload = {
    email: string;
    password: string;
};

export type LoginResponse = {
    user: {
        id: number;
        name: string;
        email: string;
        platform_role: string | null;
        is_platform_admin: boolean;
    };
};

export type RegisterPayload = {
    name: string;
    email: string;
    password: string;
    password_confirmation: string;
};

export type ResetPasswordPayload = {
    email: string;
    token: string;
    password: string;
    password_confirmation: string;
};

/**
 * Authenticate an existing user through Laravel's session guard.
 */
export async function login(
    payload: LoginPayload,
): Promise<LoginResponse> {
    return apiRequest<LoginResponse>('/api/login', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

/**
 * Create and immediately authenticate a new AccoNova user.
 */
export async function register(
    payload: RegisterPayload,
): Promise<void> {
    await apiRequest('/api/register', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

/**
 * Ask Laravel to send a password-recovery link.
 *
 * The backend intentionally returns the same success response regardless of
 * whether the email belongs to an account.
 */
export async function requestPasswordReset(
    email: string,
): Promise<void> {
    await apiRequest(
        '/api/forgot-password',
        {
            method: 'POST',
            body: JSON.stringify({
                email,
            }),
        },
    );
}

/**
 * Replace a forgotten password using a Laravel password-broker token.
 */
export async function resetPassword(
    payload: ResetPasswordPayload,
): Promise<void> {
    await apiRequest(
        '/api/reset-password',
        {
            method: 'POST',
            body: JSON.stringify(payload),
        },
    );
}

/**
 * Request another signed email-verification link.
 */
export async function resendVerification(): Promise<void> {
    await apiRequest(
        '/api/email/verification-notification',
        {
            method: 'POST',
        },
    );
}

/**
 * End the authenticated Laravel session securely.
 */
export async function logout(): Promise<void> {
    await apiRequest('/api/logout', {
        method: 'POST',
    });
}
