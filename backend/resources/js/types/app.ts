export type OrganizationRole =
    | 'owner'
    | 'admin'
    | 'manager'
    | 'accountant'
    | 'employee';

export type AuthUser = {
    id: number;
    name: string;
    email: string;
    emailVerified: boolean;
};

export type WorkspaceOrganization = {
    task_permissions?: string[];
    currency?: string;
    permissions?: string[] | null;
    id: number;
    name: string;
    role: OrganizationRole;
};

export type AppPageProps = Record<string, unknown> & {
    auth: {
        user: AuthUser | null;
    };

    workspace: {
        organizations: WorkspaceOrganization[];
        activeOrganization: WorkspaceOrganization | null;
    };
};
