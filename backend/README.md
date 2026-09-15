# AccoNova backend

AccoNova's Laravel 13 / MySQL 8.4 application includes a React 19 and TypeScript frontend, served through Inertia 3 and built with Vite and Tailwind CSS 4. See [the project README](../README.md) for the database setup, tenant isolation, and organization roles. The frontend and authentication additions below supersede its original backend-only description.

## Browser application

- `/login` and `/register`: session-based authentication.
- `/forgot-password` and `/reset-password/{token}`: email-based password recovery.
- `/verify-email`: verification notice with an option to resend the email.
- `/onboarding/workspace`: create an organization after email verification.
- `/app`: dashboard and application navigation with workspace switching.
- `/app/parties`: manage organization contacts with customer and supplier roles.

Application pages and organization, membership, and party APIs require a verified email address. Registration sends a verification notification. A valid signed verification link sends users without an organization to workspace onboarding and existing members to the dashboard.

## Local frontend setup

After following the root README's PHP and database setup, run from `backend/`:

```sh
npm ci
npm run dev
```

Keep Vite running while using the application through Wamp or `php artisan serve`. For compiled assets, run `npm run build`. The root `/` URL remains a JSON status response; open `/login` or `/register` to enter the browser application.

Configure `APP_URL` to match the URL used in your browser so signed verification links work. Configure Laravel mail settings for verification and password-reset delivery. With the `log` mailer, retrieve development email links from `storage/logs/laravel.log`.

## Authentication API additions

These endpoints use the existing session cookie and CSRF-token flow:

| Endpoint | Input / behavior |
| --- | --- |
| `POST /api/forgot-password` | `email`; requests a password-reset link, returns 422 for an unknown account and 429 when reset delivery is throttled. |
| `POST /api/reset-password` | `token`, `email`, `password`, `password_confirmation`; resets the password after token validation. |
| `POST /api/email/verification-notification` | Requires authentication; resends verification mail, limited to six requests per minute. |
| `GET /verify-email/{id}/{hash}` | Authenticated, signed verification link; verifies the email and redirects to onboarding or the dashboard. |

Party update requests and JSON resources use `address_line_1` and `address_line_2` for address fields.

## Verification

```sh
php artisan test --compact
php artisan test --compact --configuration=phpunit.sqlite.xml
npx tsc --noEmit
npm run build
vendor/bin/pint --dirty --format agent
```

The default suite uses the isolated `acconova_test` database on MySQL port 33069; the SQLite configuration uses an in-memory database. Authentication feature tests cover the new-account lifecycle, email verification, and password recovery.
