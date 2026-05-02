# Requirements Document

## Introduction

This feature adds optional password protection to all management routes (`/management/**`) in the board game library convention app. By default, no password is set and all management pages are freely accessible. Once a convention organizer sets a password via the configuration page, all management routes require authentication. The session is cookie-based with a 30-minute expiry. A password reset script is provided for recovery if the password is lost.

## Glossary

- **Management_Routes**: All SvelteKit routes under `/management` and the `/api/backup/export` endpoint, including games, transactions, config, and backup pages
- **Password_Hash**: A bcrypt hash of the management password, stored as a nullable column in the `convention_config` table (null means no password is set)
- **Auth_Session**: A signed cookie containing an HMAC signature and expiry timestamp, valid for 30 minutes from the time of successful authentication
- **Auth_Gate**: An inline password prompt displayed on management pages when a password is set and the user does not have a valid Auth_Session
- **Config_Page**: The convention configuration page at `/management/config`
- **Rate_Limiter**: A server-side mechanism that introduces a short delay after failed password attempts to slow brute-force attacks on the LAN
- **Password_Reset_Script**: A Node.js script located in `/scripts` that clears the Password_Hash from the database, restoring the no-password state

## Requirements

### Requirement 1: Password Storage

**User Story:** As a convention organizer, I want the management password stored securely, so that it cannot be read in plaintext from the database.

#### Acceptance Criteria

1. THE Password_Hash column in the `convention_config` table SHALL store the password as a bcrypt hash
2. WHEN no password has been set, THE Password_Hash column SHALL be null
3. WHEN a password is set, THE Config_Service SHALL hash the password using bcrypt before storing it

### Requirement 2: Default Open Access

**User Story:** As a convention organizer, I want management pages to be freely accessible by default, so that password protection is opt-in and does not block setup.

#### Acceptance Criteria

1. WHILE the Password_Hash is null, THE Management_Routes SHALL be accessible without any authentication prompt
2. WHILE the Password_Hash is null, THE Config_Page SHALL display a "Set Password" form with a single password input and a confirmation input

### Requirement 3: Setting an Initial Password

**User Story:** As a convention organizer, I want to set a management password from the config page, so that I can protect management routes when needed.

#### Acceptance Criteria

1. WHEN the organizer submits the "Set Password" form with matching password and confirmation inputs, THE Config_Service SHALL hash the password and store it in the Password_Hash column
2. WHEN the organizer submits the "Set Password" form with non-matching password and confirmation inputs, THE Config_Page SHALL display a validation error and not store the password
3. WHEN the organizer submits the "Set Password" form with an empty password, THE Config_Page SHALL display a validation error and not store the password
4. WHEN a password is successfully set, THE Config_Service SHALL create a valid Auth_Session for the organizer so they are not immediately locked out

### Requirement 4: Authentication Gate for Management Routes

**User Story:** As a convention organizer, I want management pages to require a password when one is set, so that unauthorized users on the LAN cannot access management functions.

#### Acceptance Criteria

1. WHILE a Password_Hash is set AND the request does not contain a valid Auth_Session, THE Auth_Gate SHALL prompt the user for a password before displaying management page content
2. WHEN the user submits the correct password to the Auth_Gate, THE Auth_Gate SHALL create an Auth_Session and grant access to the requested management page
3. WHEN the user submits an incorrect password to the Auth_Gate, THE Auth_Gate SHALL display an error message and not create an Auth_Session
4. WHILE a Password_Hash is set AND the request contains a valid Auth_Session, THE Management_Routes SHALL be accessible without prompting for a password
5. WHEN a request targets the `/api/backup/export` endpoint AND a Password_Hash is set AND the request does not contain a valid Auth_Session, THE server SHALL return a 401 response

### Requirement 5: Session Management

**User Story:** As a convention organizer, I want my login session to last 30 minutes, so that I do not have to re-enter the password too frequently during active management.

#### Acceptance Criteria

1. WHEN an Auth_Session is created, THE server SHALL set a signed cookie with an expiry timestamp 30 minutes in the future
2. WHEN the Auth_Session cookie expiry timestamp is in the past, THE server SHALL treat the session as invalid and require re-authentication
3. THE Auth_Session cookie SHALL be signed using HMAC to prevent tampering
4. WHEN the Auth_Session cookie signature does not match the expected HMAC value, THE server SHALL treat the session as invalid

### Requirement 6: Password Change

**User Story:** As a convention organizer, I want to change the management password, so that I can rotate credentials or fix a compromised password.

#### Acceptance Criteria

1. WHILE a Password_Hash is set, THE Config_Page SHALL display a password change form with fields for the current password, new password, and new password confirmation
2. WHEN the organizer submits the password change form with a correct current password and matching new password fields, THE Config_Service SHALL update the Password_Hash with the new bcrypt hash
3. WHEN the organizer submits the password change form with an incorrect current password, THE Config_Page SHALL display a validation error and not update the password
4. WHEN the organizer submits the password change form with non-matching new password and confirmation fields, THE Config_Page SHALL display a validation error and not update the password
5. WHEN the organizer submits the password change form with an empty new password, THE Config_Page SHALL display a validation error and not update the password

### Requirement 7: Password Confirmation for Sensitive Actions

**User Story:** As a convention organizer, I want sensitive actions to require password re-entry, so that an unattended browser session cannot be used to make destructive changes.

#### Acceptance Criteria

1. WHEN the organizer attempts to change the password AND a Password_Hash is set, THE Config_Page SHALL require the current password as part of the change form submission
2. WHEN the organizer attempts to restore a backup AND a Password_Hash is set, THE Backup_Page SHALL require the current password before executing the restore operation
3. WHEN the organizer attempts to import games via CSV AND a Password_Hash is set, THE Games_Management_Page SHALL require the current password before executing the CSV import
4. WHEN the password confirmation for a sensitive action is incorrect, THE server SHALL reject the action and display an error message

### Requirement 8: Rate Limiting for Failed Attempts

**User Story:** As a convention organizer, I want failed password attempts to be slowed down, so that brute-force attacks on the LAN are impractical.

#### Acceptance Criteria

1. WHEN a password verification attempt fails, THE Rate_Limiter SHALL introduce a delay before responding
2. THE Rate_Limiter SHALL increase the delay with consecutive failed attempts up to a reasonable maximum
3. WHEN a password verification attempt succeeds, THE Rate_Limiter SHALL reset the delay counter for that client

### Requirement 9: Password Reset Script

**User Story:** As a convention organizer, I want a way to reset the password from the server command line, so that I can regain access if the password is lost.

#### Acceptance Criteria

1. WHEN the Password_Reset_Script is executed, THE script SHALL set the Password_Hash column to null in the `convention_config` table
2. WHEN the Password_Reset_Script completes successfully, THE script SHALL print a confirmation message to stdout
3. THE Password_Reset_Script SHALL read the database connection string from the `DATABASE_URL` environment variable
4. IF the database connection fails, THEN THE Password_Reset_Script SHALL print an error message to stderr and exit with a non-zero exit code

### Requirement 10: Removing the Password

**User Story:** As a convention organizer, I want to remove the management password from the config page, so that I can return to open access without using the command-line script.

#### Acceptance Criteria

1. WHILE a Password_Hash is set, THE Config_Page SHALL display an option to remove the password
2. WHEN the organizer submits the remove password action with the correct current password, THE Config_Service SHALL set the Password_Hash to null
3. WHEN the organizer submits the remove password action with an incorrect current password, THE Config_Page SHALL display a validation error and not remove the password
4. WHEN the password is removed, THE Management_Routes SHALL become accessible without authentication

### Requirement 11: Backup Restore Password Warning

**User Story:** As a convention organizer, I want to be warned that restoring a backup may change the management password, so that I understand the risk before proceeding.

#### Acceptance Criteria

1. WHEN the organizer initiates a backup restore, THE Backup_Page SHALL display a warning that the password hash will be replaced by whatever is in the backup file
2. THE warning SHALL note that the Password_Reset_Script can be used to clear the password if access is lost after a restore

### Requirement 12: Testing

**User Story:** As a developer, I want property-based and integration tests for the password protection feature, so that correctness is verified and regressions are caught.

#### Acceptance Criteria

1. THE project SHALL include property-based tests (fast-check) that validate password validation logic, session cookie signing/verification, and rate limiting behavior
2. THE project SHALL include Playwright E2E integration tests that verify the full authentication flow: setting a password, being prompted at management routes, logging in, session expiry, password change, password removal, and sensitive action confirmation
3. THE property-based tests SHALL cover both acceptance paths (valid inputs produce correct results) and rejection paths (invalid inputs are rejected)
4. THE E2E tests SHALL verify that management routes are accessible without a password when none is set
5. THE E2E tests SHALL verify that the backup restore password confirmation and CSV import password confirmation work correctly
