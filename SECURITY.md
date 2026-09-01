# Security policy

## Supported version

Security fixes target the latest release on the default branch.

## Reporting a vulnerability

Do not publish active security vulnerabilities in a public issue. Send the maintainer a private report containing the affected route or component, reproduction steps, impact, and a minimal proof of concept.

## Deployment requirements

- Replace `APP_SECRET` with at least 32 random characters.
- Put production deployments behind HTTPS. Production cookies are `Secure`.
- Set `ALLOWED_ORIGINS_PRODUCTION` to the exact HTTPS browser origin or origins. Do not use `*` for authenticated traffic.
- Keep the SQLite database and export directory outside public static paths.
- Back up the SQLite database and test restoration.
- Update Bun and project dependencies regularly.
- Do not disable Helmet, CSRF checks, origin checks, ownership checks, or authentication rate limits to work around deployment errors.

## Data model security

Passwords are stored only as Argon2id hashes. Browser session tokens are random opaque values; only a SHA-256 digest is stored in SQLite. Caption sessions, segments, settings, and exports are always queried with the authenticated user ID.
