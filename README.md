# AccoNova

Phase 0 backend: Laravel 13, MySQL 8.4, session authentication, organizations, tenant isolation, and organization roles.

## Structure and initial audit

The initial workspace contained only an empty `.dist/` directory: no application, Git repository, product specification, or existing tests. The backend lives in `backend/`; `compose.yaml` provisions local MySQL, and `.github/workflows/tests.yml` runs SQLite and MySQL tests.

Use PHP 8.4 with this lockfile (including development dependencies), Composer 2, and Docker Desktop. On the audited Windows machine, PHP 8.4 is at `C:\wamp64\bin\php\php8.4.3\php.exe`; the default PATH PHP is 8.2 and cannot run this project. The PHP 8.4 installation already includes `pdo_mysql`.

## Run locally

From the repository root:

```sh
docker compose up -d --wait
cd backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate
php artisan serve
```

The MySQL port is 33069, bound only to localhost. The Compose password is for local development. Configure a separate restricted database account and secrets in production. No default application user is seeded.

## Authentication and API

This is a same-origin session-based JSON backend. Keep the session cookie from `GET /api/csrf-token`, then send its returned `csrf_token` as `X-CSRF-TOKEN` on state-changing requests. Send `Accept: application/json`. Refresh the CSRF token after login, registration, or logout because sessions/tokens rotate.

- `POST /api/register`: name, email, password, password_confirmation (minimum 12 characters).
- `POST /api/login`: email, password. Authentication endpoints are rate-limited.
- `GET /api/user`, `POST /api/logout`: authenticated session.
- `GET /api/organizations`, `POST /api/organizations` (name): list memberships or create an organization with the creator as owner.
- `GET /api/organizations/{organization}`, `PATCH /api/organizations/{organization}` (name).
- `GET|POST /api/organizations/{organization}/memberships`: list or add an existing user by user_id and role.
- `PATCH|DELETE /api/organizations/{organization}/memberships/{membership}`: change role or remove membership.

All lists are paginated. Unrelated organization and membership identifiers return 404. Invalid inputs return 422, unauthenticated requests 401, and denied role permissions 403.

| Capability | Owner | Admin | Member |
| --- | --- | --- | --- |
| Read organization | Yes | Yes | Yes |
| Update organization | Yes | Yes | No |
| List memberships | Yes | Yes | No |
| Add/remove members | Yes | Yes | No |
| Assign/manage admins | Yes | No | No |
| Remove/change owner | No | No | No |

Roles are scoped per organization; there is no global superadmin. Adding users requires an existing account. Invitations, password recovery, email verification, ownership transfer, organization deletion, UI, and business-domain modules are later phases.

## Tenant isolation contract

`ResolveOrganization` verifies the authenticated user's membership before creating request-scoped `TenantContext`, and clears context even when a request fails. Route identifiers cannot select an unrelated tenant. Membership queries use a global organization scope; queries and model writes without context throw. Creation assigns the current organization. Saving/deleting a model loaded under a different tenant throws.

Future organization-owned Eloquent models must use `BelongsToOrganization`, a non-null organization foreign key, and tenant-scoped uniqueness constraints. Jobs and CLI tasks must explicitly set context and clear it in a `finally` block. Never derive it from an unverified request body.

Tenant isolation is enforced by the application and its foreign keys. Raw SQL, `withoutGlobalScopes`, relation pivot writes, and bulk inserts bypass model hooks; use those only in audited infrastructure such as organization creation. Do not bulk-update organization_id. Tenant-scoped routes must authorize actions and validate inputs before persistence. Global users and the organization membership bootstrap are intentionally outside the tenant model scope.

Database constraints enforce organization/user foreign keys, unique memberships, valid roles, and at most one owner. The API creates the owner atomically and forbids removing or demoting it.

## Verification

```sh
cd backend
php artisan test
php artisan test --configuration=phpunit.sqlite.xml
vendor/bin/pint --test
```

The default suite uses MySQL as the primary verification database; `phpunit.sqlite.xml` provides an additional in-memory portability check. The MySQL configuration exclusively targets `acconova_test` on port 33069; tests migrate/reset that database. Never point tests at application data. Docker initializes the test database on first volume creation. If the volume predates this setup, create `acconova_test` explicitly.

CI runs both suites against PHP 8.4 and MySQL 8.4. Coverage includes authentication, CSRF, throttling, role boundaries, cross-tenant reads/writes, context cleanup, stale model writes, and database constraints.

### Windows commands on the audited machine

From `backend/`, the following commands use the installed PHP version without changing system configuration:

```powershell
& 'C:\wamp64\bin\php\php8.4.3\php.exe' artisan migrate
& 'C:\wamp64\bin\php\php8.4.3\php.exe' vendor/phpunit/phpunit/phpunit --configuration=phpunit.sqlite.xml
& 'C:\wamp64\bin\php\php8.4.3\php.exe' artisan test
```


The MySQL conversion retains the authentication and tenant-isolation suite and adds coverage for owner uniqueness, multiple non-owner memberships, and foreign-key deletion behavior.
## Database portability and future modules

MySQL 8.4 is the primary database. Use Laravel Schema Builder, InnoDB foreign keys, utf8mb4, and strict SQL mode. The unique membership key begins with organization_id; the reverse user/organization index supports membership resolution. The owner constraint uses a Schema Builder generated column containing a standard SQL CASE expression and a composite unique index, verified on both MySQL and SQLite. No partial indexes, engine-specific raw migration SQL, JSONB, or database row-security dependency is used. The generated column is internal and excluded from API serialization.

The foundation migration was updated for a fresh MySQL installation. Existing databases on another engine are not migrated or deleted automatically; moving existing business data requires a separate export/import plan.

Party/Contact and invoice snapshots remain requirements for later business modules; they are not implemented in Phase 0. These modules must retain organization ownership and authorization, use tenant-scoped relationships and constraints, and preserve historical invoice snapshots independently of changes to live party/contact data. Their detailed fields and workflows still need to be defined.
Validation: 31 tests and 86 assertions pass on MySQL 8.4 and SQLite. The MySQL development database migrations have been applied. GitHub's pre-existing application is a separate 2023 codebase at repository root; the current rebuild runs from backend/.
