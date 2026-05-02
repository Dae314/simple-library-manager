# Implementation Plan: Management Password Protection

## Overview

Add optional password protection to all management routes (`/management/**`) and the `/api/backup/export` endpoint. Implementation follows a bottom-up dependency order: schema → services → layout auth gate → page-level UI changes → endpoint protection → scripts → tests.

## Tasks

- [x] 1. Database schema and migration
  - [x] 1.1 Add `passwordHash` column to `conventionConfig` in `src/lib/server/db/schema.ts`
    - Add `passwordHash: text('password_hash')` as a nullable column (no `.notNull()`, no default)
    - _Requirements: 1.1, 1.2_
  - [x] 1.2 Generate the Drizzle migration
    - Run `npm run db:generate` to produce the migration SQL file in `drizzle/migrations/`
    - Verify the generated SQL is `ALTER TABLE convention_config ADD COLUMN password_hash TEXT;`
    - _Requirements: 1.1_

- [x] 2. Install bcryptjs dependency
  - Run `npm install bcryptjs` and `npm install -D @types/bcryptjs`
  - _Requirements: 1.3_

- [x] 3. Auth service and password validation
  - [x] 3.1 Create `src/lib/server/services/auth.ts`
    - Implement `hashPassword(plaintext: string): Promise<string>` using bcryptjs with cost factor 10
    - Implement `verifyPassword(plaintext: string, hash: string): Promise<boolean>`
    - Implement `createSessionCookie(): string` — format `{expiryMs}.{hmacHex}`, expiry = now + 30 minutes
    - Implement `verifySessionCookie(cookieValue: string): boolean` — parse expiry, verify HMAC, check not expired
    - Read `AUTH_SECRET` from env; if not set, generate random secret with `crypto.randomBytes(32)` and log a warning
    - Implement `getRateLimitDelay(clientIp: string): number` — `min(attempts * 1000, 5000)` ms, entries expire after 15 min
    - Implement `recordFailedAttempt(clientIp: string): void`
    - Implement `resetRateLimit(clientIp: string): void`
    - _Requirements: 1.3, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4, 8.1, 8.2, 8.3_

  - [x] 3.2 Add password validation functions to `src/lib/server/validation.ts`
    - Add `validatePasswordInput({ password, confirmation })` — rejects empty/whitespace, rejects mismatch
    - Add `validatePasswordChangeInput({ currentPassword, newPassword, newPasswordConfirmation })` — same rules for new password fields
    - Both return `ValidationResult<T>` following existing patterns
    - _Requirements: 3.2, 3.3, 6.4, 6.5_

  - [x] 3.3 Write property tests for password hashing round-trip (Property 1)
    - **Property 1: Password hashing round-trip**
    - **Validates: Requirements 1.1, 1.3, 3.1**

  - [x] 3.4 Write property tests for wrong password rejection (Property 2)
    - **Property 2: Wrong password rejection**
    - **Validates: Requirements 6.3, 7.4, 10.3**

  - [x] 3.5 Write property tests for password confirmation mismatch (Property 3)
    - **Property 3: Password confirmation mismatch rejection**
    - **Validates: Requirements 3.2, 6.4**

  - [x] 3.6 Write property tests for empty/whitespace password rejection (Property 4)
    - **Property 4: Empty/whitespace password rejection**
    - **Validates: Requirements 3.3, 6.5**

  - [x] 3.7 Write property tests for valid password input acceptance (Property 10)
    - **Property 10: Valid password input acceptance**
    - **Validates: Requirements 3.1, 6.2**

  - [x] 3.8 Write property tests for session cookie expiry timing (Property 5)
    - **Property 5: Session cookie creation sets expiry 30 minutes from now**
    - **Validates: Requirements 5.1**

  - [x] 3.9 Write property tests for expired session rejection (Property 6)
    - **Property 6: Expired sessions are rejected**
    - **Validates: Requirements 5.2**

  - [x] 3.10 Write property tests for HMAC tamper detection (Property 7)
    - **Property 7: HMAC tamper detection**
    - **Validates: Requirements 5.3, 5.4**

  - [x] 3.11 Write property tests for rate limiter delay monotonicity (Property 8)
    - **Property 8: Rate limiter delay monotonicity**
    - **Validates: Requirements 8.1, 8.2**

  - [x] 3.12 Write property tests for rate limiter reset on success (Property 9)
    - **Property 9: Rate limiter reset on success**
    - **Validates: Requirements 8.3**

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Config service changes
  - [x] 5.1 Update `configService.get()` in `src/lib/server/services/config.ts` to exclude `passwordHash`
    - Use a Drizzle column projection or strip the field before returning
    - The `ConventionConfig` interface must NOT include `passwordHash`
    - _Requirements: 1.2_

  - [x] 5.2 Add `getPasswordHash()` method to `configService`
    - Query only the `password_hash` column from `convention_config` where `id = 1`
    - Return `string | null`
    - _Requirements: 1.1, 1.2, 4.1_

  - [x] 5.3 Add `setPassword(hash: string)` method to `configService`
    - Update `password_hash` column where `id = 1`; do NOT increment `version`
    - _Requirements: 3.1_

  - [x] 5.4 Add `changePassword(newHash: string)` method to `configService`
    - Update `password_hash` column where `id = 1`; do NOT increment `version`
    - _Requirements: 6.2_

  - [x] 5.5 Add `removePassword()` method to `configService`
    - Set `password_hash` to `null` where `id = 1`; do NOT increment `version`
    - _Requirements: 10.2_

- [ ] 6. Management layout auth gate
  - [ ] 6.1 Create `src/routes/management/+layout.server.ts`
    - Load function: read `passwordHash` via `configService.getPasswordHash()`, check session cookie via `authService.verifySessionCookie()`, return `{ isPasswordSet, isAuthenticated }`
    - Add `login` action: parse password from form, apply rate limit delay, verify password against hash, on success create session cookie and reset rate limit, on failure record failed attempt and return error
    - _Requirements: 2.1, 4.1, 4.2, 4.3, 4.4, 8.1, 8.2, 8.3_

  - [ ] 6.2 Create `src/routes/management/+layout.svelte`
    - Accept `data` with `isAuthenticated` and `isPasswordSet` from layout server
    - If `isAuthenticated`, render `{@render children()}`
    - If not authenticated, render an inline password form that POSTs to `?/login`
    - Display error message from form action on failed login
    - _Requirements: 4.1, 4.2, 4.3_

- [ ] 7. Config page password management forms
  - [ ] 7.1 Add `setPassword`, `changePassword`, `removePassword` actions to `src/routes/management/config/+page.server.ts`
    - `setPassword`: validate input, hash password, store via `configService.setPassword()`, create session cookie
    - `changePassword`: verify current password, validate new password input, hash and store via `configService.changePassword()`
    - `removePassword`: verify current password, call `configService.removePassword()`
    - All actions use `authService` for hashing/verification and return appropriate `fail()` responses on error
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 6.1, 6.2, 6.3, 6.4, 6.5, 10.1, 10.2, 10.3_

  - [ ] 7.2 Update `src/routes/management/config/+page.svelte` with password management section
    - Access `isPasswordSet` from `$page.data` (propagated from management layout)
    - When no password set: render "Set Password" form with password + confirmation fields
    - When password set: render "Change Password" form (current + new + confirmation) and "Remove Password" form (current password)
    - Display field-level validation errors and toast messages following existing patterns
    - _Requirements: 2.2, 6.1, 10.1_

- [ ] 8. Backup page changes
  - [ ] 8.1 Update `src/routes/management/backup/+page.server.ts`
    - Add password confirmation check to the `import` action: when password is set, require and verify `confirmPassword` field
    - Return `fail(400, { error: 'Incorrect password' })` if confirmation fails
    - _Requirements: 7.2, 7.4_

  - [ ] 8.2 Update `src/routes/management/backup/+page.svelte`
    - Add a warning message in the import section about password hash replacement during restore
    - Add a note that the password reset script can be used if access is lost after restore
    - Add a password confirmation field to the restore confirmation dialog (only visible when `isPasswordSet` is true via `$page.data`)
    - _Requirements: 7.2, 11.1, 11.2_

- [ ] 9. Games page changes
  - [ ] 9.1 Update `src/routes/management/games/+page.server.ts`
    - Add password confirmation check to the `csvImport` action: when password is set, require and verify `confirmPassword` field
    - Return `fail(400, { csvError: 'Incorrect password' })` if confirmation fails
    - _Requirements: 7.3, 7.4_

  - [ ] 9.2 Update `src/routes/management/games/+page.svelte`
    - Add a password confirmation field to the CSV import confirmation dialog (only visible when `isPasswordSet` is true via `$page.data`)
    - Include the password field value in the hidden CSV import form submission
    - _Requirements: 7.3_

- [ ] 10. Backup export endpoint auth check
  - Update `src/routes/api/backup/export/+server.ts`
  - Read password hash via `configService.getPasswordHash()`
  - If password is set, verify session cookie from request; return 401 JSON response if not authenticated
  - _Requirements: 4.5_

- [ ] 11. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Password reset script and env config
  - [ ] 12.1 Create `scripts/reset-password.js`
    - Standalone Node.js ESM script using `pg` client
    - Read `DATABASE_URL` from environment
    - Connect to PostgreSQL, run `UPDATE convention_config SET password_hash = NULL WHERE id = 1`
    - Print confirmation message on success
    - Print error to stderr and exit with code 1 on failure
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ] 12.2 Update `.env.example` with `AUTH_SECRET`
    - Add `AUTH_SECRET=` with a comment explaining it's optional and used for session persistence across restarts
    - _Requirements: 5.1_

- [ ] 13. E2E integration tests
  - [ ] 13.1 Write Playwright E2E tests in `tests/integration/password-protection.test.ts`
    - Test no-password access: management pages accessible without auth prompt
    - Test set password flow: set password from config page, verify session created
    - Test auth gate: clear cookies, visit management page, verify auth gate appears
    - Test login: submit correct password, verify access granted
    - Test wrong password: submit wrong password, verify error message
    - Test session persistence: after login, navigate between management pages without re-prompting
    - Test password change: change password, verify new password works
    - Test password removal: remove password, verify open access restored
    - Test backup restore confirmation: with password set, verify restore requires password
    - Test CSV import confirmation: with password set, verify CSV import requires password
    - Test backup export protection: with password set, verify unauthenticated export returns 401
    - Test backup restore warning: verify warning about password hash replacement is displayed
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [ ] 14. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The implementation order ensures dependencies are built first: schema → services → layout → pages → endpoints → scripts → tests
- The design uses TypeScript throughout, so all implementation tasks use TypeScript/Svelte
