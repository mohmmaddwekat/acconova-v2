export type ProfileUser = {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    job_title: string | null;
    bio: string | null;
    pending_email: string | null;
    email_verified_at: string | null;
    created_at: string;
};

export type ProfileSession = {
    id: string;
    ip: string | null;
    agent: string | null;
    last_activity: number;
    current: boolean;
};

export type ProfileResponse = {
    user: ProfileUser;
    avatar_url: string | null;
    sessions: ProfileSession[];
};

export type UpdateProfilePayload = {
    name: string;
    phone: string | null;
    job_title: string | null;
    bio: string | null;
};

export type EmailChangePayload = {
    email: string;
    current_password: string;
};
