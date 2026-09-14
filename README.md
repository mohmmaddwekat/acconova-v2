# AccoNova

Phase 0 only: Laravel 13, MySQL 8.4, session authentication, organizations, organization roles, and tenant isolation. No frontend or business modules are implemented.

## Local development

The Laravel application lives in `backend/`. WampServer can serve `backend/public` through the `acconova.test` virtual host. Use PHP 8.4.1 or newer with the committed dependencies; this machine has `C:\wamp64\bin\php\php8.4.3\php.exe`. Ensure both Apache and CLI use a compatible PHP version.

MySQL **8.4** remains the primary database. The repository's Docker Compose service supplies MySQL 8.4 at `127.0.0.1:33069`; Wamp's installed MySQL version is independent of the PHP/Apache server. Do not substitute another MySQL major version when verifying this application.

From the repository root:

```sh
docker compose up -d --wait
cd backend
composer install
cp .env.example .env
php artisan key:generate --no-interaction
php artisan migrate --no-interaction
```

Serve through Wamp or run `php artisan serve`. The root URL returns `{"name":"AccoNova","phase":0}`; it is a backend status response.

Compose credentials are local development examples. Keep real credentials in the ignored `.env`. There are no seeded application users.

## Authentication and API

Keep the session cookie from `GET /api/csrf-token`, then send its `csrf_token` as `X-CSRF-TOKEN` on state-changing requests. Send `Accept: application/json`. Refresh the CSRF token after login, registration, or logout.

- `POST /api/register`: name, email, password, password_confirmation; minimum password length 12.
- `POST /api/login`: email, password. Authentication endpoints are rate-limited.
- `GET /api/user`, `POST /api/logout`: authenticated session.
- `GET /api/organizations`: paginated organizations the user belongs to.
- `POST /api/organizations`: name; atomically creates the organization and its sole owner, then selects it.
- `PUT /api/current-organization`: organization_id; switches to a verified membership and returns the organization and current role.
- `GET /api/current-organization`: returns the selected organization and freshly verified role; 404 if none is selected or membership has been revoked.
- `GET|PATCH /api/organizations/{organization}`: read or update the organization (name).
- `GET|POST /api/organizations/{organization}/memberships`: list memberships or add an existing user (user_id, role).
- `PATCH|DELETE /api/organizations/{organization}/memberships/{membership}`: change role or remove membership.

Unrelated organization and membership IDs return 404. Invalid input returns 422, unauthenticated requests 401, and denied permissions 403.

## Phase 0 roles

| Capability | Owner | Admin | Manager | Accountant | Employee |
| --- | --- | --- | --- | --- | --- |
| Access/switch to own organization | Yes | Yes | Yes | Yes | Yes |
| Update organization | Yes | No | No | No | No |
| List memberships | Yes | Yes | No | No | No |
| Add/change/remove Manager, Accountant, Employee | Yes | Yes | No | No | No |
| Assign/change/remove Admin | Yes | No | No | No | No |
| Assign Owner through membership endpoints | No | No | No | No | No |
| Remove, replace, or demote Owner | No | No | No | No | No |

An Admin cannot modify another Admin or their own membership. Only the Owner can assign Admin. Roles belong to individual organizations; there is no global administrator and no permissions for future modules.

Each organization created through the application has exactly one owner. A transaction rolls back organization creation if owner insertion fails. A generated-column unique index rejects a second owner. Database triggers reject owner deletion, role changes, user replacement, and movement to another organization, including bulk SQL writes. Ownership transfer is outside Phase 0.

## Current organization and isolation

Only `active_organization_id` is saved in the server-side session, never a cached role or a serialized TenantContext. Switching verifies membership before setting context or saving selection. A rejected switch preserves the previous selection. Every current-organization request rechecks membership; revoked/deleted membership clears the invalid selection and fails closed. Role changes take effect on the next request.

Existing explicit `/organizations/{organization}` routes retain their behavior: they independently verify membership and scope all data to that URL's organization. They do not silently switch the saved current organization. An organization ID in the body cannot override the tenant scope.

`ResolveOrganization` verifies membership before populating the existing scoped `TenantContext`. Mutating organization requests lock the organization row in a transaction before reading the actor's membership, serializing membership/role changes for that organization. Global `ClearTenantContext` and middleware `finally` blocks clear context after success, denied access, and exceptions, including non-tenant requests.

Session requests use Laravel session blocking so switching and logout cannot overwrite one another with stale session state. The configured cache store must support atomic locks (the default database cache does). Login and registration discard previous selection. Logout invalidates the session, regenerates CSRF state, and clears context.

The existing `Membership` model and `BelongsToOrganization` scope remain in place. Tenant queries and writes without context fail closed. A stale model cannot be saved/deleted under another tenant. Foreign membership IDs cannot escape the current query scope.

Raw SQL, pivot writes, and `withoutGlobalScopes` remain trusted infrastructure APIs and bypass Eloquent tenant scoping. Never use them with unverified request IDs. Database ownership protections supplement, rather than replace, application authorization. Organization creation must use the atomic application flow: inserting directly into the organizations table alone cannot establish the required owner membership. There is no organization deletion API in this phase.

## Party / Contact domain

Party is AccoNova's unified contact entity. A Party represents either a person or a company and must be stored only once, even if it serves as both a customer and a supplier.

A Party can be:

- **person**: an individual (stored with a name, no company_name).
- **company**: a legal entity (stored with a company_name, no name).

A Party can hold one or more business roles. Supported roles are:

- **customer**: a buyer or consuming organization.
- **supplier**: a vendor or providing organization.

A Party may be customer-only, supplier-only, or customer and supplier simultaneously. Contact information (email, phone, address, tax number) is stored once on the Party record and is never duplicated across separate customer or supplier records. Party roles are stored separately in a normalized `party_roles` table, preventing duplicate role assignments.

Example:

```
Party: Smart Tech Inc.
Type: company
Email: contact@smarttech.com
Phone: +1-555-0100
Tax Number: 12-3456789

Roles:
- customer
- supplier
```

Smart Tech's contact data exists in a single Party record. Two separate rows in `party_roles` indicate that Smart Tech can be selected as either a buyer or a vendor.

All Party data is organization scoped. Creating a Party without an active `TenantContext` fails closed. Party queries include a global scope that filters by the current organization. Updating or deleting a Party belonging to another organization raises a LogicException. Soft deletes preserve historical Party identity so future quotes, invoices, and payments can reference it.

## Migrations

Run `php artisan migrate --no-interaction` against the intended development database before manually testing the changes.

The historical foundation migration is retained for existing databases. New forward migrations expand roles, convert existing `member` memberships to `employee`, remove the legacy role, and install owner-protection triggers. IDs, organization membership, and timestamps are preserved. No database reset is required. The ownership migration refuses existing organizations without exactly one owner; repair such legacy data deliberately before retrying.

Role rollback maps Manager, Accountant, and Employee back to Member, so it intentionally loses the distinctions between those three roles. Owner and Admin are preserved. Trigger rollback precedes role rollback. Migration tests exercise upgrade and rollback with existing rows on both database engines.

Schema Builder manages the enum transition and generated unique index. The owner immutability triggers use separate MySQL and SQLite syntax; migration credentials need permission to create triggers. With MySQL binary logging enabled, the server must also permit trusted trigger creation or migrations must run under an appropriately privileged migration account. Local Compose and the isolated CI service explicitly enable log_bin_trust_function_creators; no SUPER grant is added to the application account. MySQL 8.4 is authoritative; SQLite remains an additional portability check. Direct administrative schema changes can bypass application invariants and are not an ownership-management interface.

## Verification

From `backend/`, using PHP 8.4.1 or newer:

```sh
php artisan test --compact
php artisan test --compact --configuration=phpunit.sqlite.xml
vendor/bin/pint --dirty --format agent
```

On this Windows machine, prefix PHP entry points with:

```powershell
& 'C:\wamp64\bin\php\php8.4.3\php.exe' artisan test --compact
& 'C:\wamp64\bin\php\php8.4.3\php.exe' artisan test --compact --configuration=phpunit.sqlite.xml
& 'C:\wamp64\bin\php\php8.4.3\php.exe' vendor/bin/pint --dirty --format agent
```

The default test configuration targets only `acconova_test` on MySQL port 33069 and resets that test database. SQLite tests use `:memory:`. Do not point tests at application data. CI runs both engines.

Coverage includes all five roles, immutable ownership, escalation denial, existing-data migration/rollback, authentication, CSRF, throttling, active organization selection/revalidation, cross-tenant reads/writes, request cleanup, and database constraints.

GitHub commits and pushes wait for the user's manual testing and explicit confirmation that the changes are working.