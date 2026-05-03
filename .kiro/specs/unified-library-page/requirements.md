# Requirements Document

## Introduction

The Unified Library Page consolidates the existing Checkout (`/checkout`), Check-in (`/checkin`), and Catalog (`/catalog`) pages into a single `/library` page. Convention volunteers will be able to browse all games, check out available games, and check in returned games from one view. The page uses a status filter to toggle between views. Clicking a game's action button opens a popover dialog containing the appropriate checkout or check-in form. As part of this consolidation, the old `/checkout`, `/checkin`, and `/catalog` route files are removed from the application.

## Glossary

- **Library_Page**: The unified page at `/library` that combines catalog browsing, checkout, and check-in functionality.
- **Game_Table**: The sortable, paginated table displaying games on the Library_Page with consistent columns: title, game type, status, BGG ID, attendee name, checkout duration, and checkout weight.
- **Status_Filter**: A filter control that allows the volunteer to view all games, only available games, or only checked-out games.
- **Main_Navigation**: The top navigation bar providing links to the Landing_Page, the Library_Page, and a Management_Icon for administrative functions.
- **Management_Icon**: A gear/cog icon with a "Manage" text label in the Main_Navigation that links directly to the `/management` landing page.
- **Landing_Page**: The home page of the application, accessible via the convention name link in the Main_Navigation.
- **Checkout_Popover**: A modal dialog implemented as a native `<dialog>` element opened via `showModal()` when the Volunteer clicks the "Checkout" button on an available game row, containing the Checkout_Form. The Volunteer can close it via the Cancel button, the Escape key, or clicking outside the dialog.
- **Checkin_Popover**: A modal dialog implemented as a native `<dialog>` element opened via `showModal()` when the Volunteer clicks the "Check In" button on a checked-out game row, containing the Checkin_Form. The Volunteer can close it via the Cancel button, the Escape key, or clicking outside the dialog.
- **Checkout_Form**: The form within the Checkout_Popover used to check out an available game, collecting attendee name, ID type, weight, and optional note.
- **Checkin_Form**: The form within the Checkin_Popover used to check in a checked-out game, collecting check-in weight and optional note.
- **Weight_Warning**: A visual indicator displayed in the Checkin_Form when the check-in weight deviates from the checkout weight beyond defined thresholds.
- **Status_Change_Warning**: A warning message displayed inside an open Checkout_Popover or Checkin_Popover when a WebSocket event indicates the game's status has changed while the popover is open.
- **Volunteer**: A convention staff member operating the library desk who performs checkouts and check-ins.
- **Game_Record**: A single game entry in the system with properties including title, BGG ID, copy number, status, game type, attendee name, checkout duration, and checkout weight.
- **Attendee**: A convention attendee who borrows a game from the library.
- **Game_Title_Search**: A text search input in the Library_Page filter bar that filters Game_Records by matching against game titles.
- **Attendee_Name_Search**: A text search input in the Library_Page filter bar that filters Game_Records by matching against attendee first name and last name.
- **Hero_Image**: A wide banner image displayed at the top of the Landing_Page as a visual hero section. The application ships with a placeholder image that convention runners can replace with their own branding by swapping the image file at the documented path.
- **Library_CTA**: The prominent, centrally-placed link/button on the Landing_Page that navigates to the Library_Page. This is the primary call-to-action on the Landing_Page.
- **Convention_Name_Display**: The prominent heading on the Landing_Page showing the convention name as configured in the convention settings.

## Requirements

### Requirement 1: Unified Game Table Display

**User Story:** As a Volunteer, I want to see all non-retired games in a single table with consistent columns, so that I can browse the full library without switching between pages.

#### Acceptance Criteria

1. THE Library_Page SHALL display all non-retired Game_Records in the Game_Table with columns for title, game type, status, BGG ID, attendee name, checkout duration, and checkout weight.
2. WHEN a Game_Record has status "available", THE Game_Table SHALL display a dash placeholder ("—") in the attendee name, checkout duration, and checkout weight columns for that row.
3. WHEN the Library_Page loads, THE Game_Table SHALL default to showing all non-retired games sorted by title in ascending order.
4. THE Game_Table SHALL support sorting by title, game type, status, and BGG ID columns.
5. THE Game_Table SHALL support pagination with configurable page sizes.
6. THE Library_Page SHALL display a Game_Title_Search input in the filter bar that filters Game_Records by matching against game titles.
7. THE Library_Page SHALL display an Attendee_Name_Search input in the filter bar that filters Game_Records by matching against attendee first name and last name.

### Requirement 2: Status Filtering

**User Story:** As a Volunteer, I want to filter games by status, so that I can quickly focus on available games for checkout or checked-out games for check-in.

#### Acceptance Criteria

1. THE Library_Page SHALL provide a Status_Filter with options for "All", "Available", and "Checked Out".
2. WHEN the Volunteer selects "Available" in the Status_Filter, THE Game_Table SHALL display only Game_Records with status "available".
3. WHEN the Volunteer selects "Checked Out" in the Status_Filter, THE Game_Table SHALL display only Game_Records with status "checked_out".
4. WHEN the Volunteer selects "All" in the Status_Filter, THE Game_Table SHALL display all non-retired Game_Records.
5. THE Library_Page SHALL provide a game type filter with options for "Standard", "Play & Win", and "Play & Take".
6. THE Library_Page SHALL persist filter selections, sort selections, Game_Title_Search value, and Attendee_Name_Search value in URL query parameters so that page refreshes preserve the current view.

### Requirement 3: Contextual Action Buttons

**User Story:** As a Volunteer, I want the action button on each game row to reflect what I can do with that game, so that I can perform the right operation without confusion.

#### Acceptance Criteria

1. WHEN a Game_Record has status "available", THE Game_Table SHALL display a "Checkout" action button on that row.
2. WHEN a Game_Record has status "checked_out", THE Game_Table SHALL display a "Check In" action button on that row.

### Requirement 4: Checkout Popover

**User Story:** As a Volunteer, I want to click "Checkout" on an available game and fill out a checkout form in a popover dialog, so that I can lend the game to an attendee without leaving the game table.

#### Acceptance Criteria

1. WHEN the Volunteer clicks the "Checkout" button on an available Game_Record, THE Library_Page SHALL open the Checkout_Popover containing the Checkout_Form.
2. THE Checkout_Form SHALL collect attendee first name, attendee last name, ID type, checkout weight, and an optional note.
3. THE Checkout_Form SHALL prefill the checkout weight field with the game's last recorded weight when one exists.
4. THE Checkout_Popover SHALL display the selected game's title in the dialog header.
5. WHEN the Volunteer submits a valid Checkout_Form, THE Library_Page SHALL process the checkout, display a success notification, and close the Checkout_Popover.
6. IF the game was checked out by another station before submission, THEN THE Library_Page SHALL display a conflict error notification and close the Checkout_Popover.
7. IF the Checkout_Form contains validation errors, THEN THE Library_Page SHALL display field-level error messages and preserve the entered values.

### Requirement 5: Check-in Popover

**User Story:** As a Volunteer, I want to click "Check In" on a checked-out game and fill out a check-in form in a popover dialog, so that I can return the game to the library without leaving the game table.

#### Acceptance Criteria

1. WHEN the Volunteer clicks the "Check In" button on a checked-out Game_Record, THE Library_Page SHALL open the Checkin_Popover containing the Checkin_Form.
2. THE Checkin_Form SHALL collect check-in weight and an optional note.
3. THE Checkin_Form SHALL display the checkout weight as a reference value above the weight input field.
4. THE Checkin_Popover SHALL display the selected game's title in the dialog header.
5. WHEN the Volunteer submits a valid Checkin_Form, THE Library_Page SHALL process the check-in, display a success notification, and close the Checkin_Popover.
6. IF the game is no longer checked out at submission time, THEN THE Library_Page SHALL display a conflict error notification and close the Checkin_Popover.
7. IF the Checkin_Form contains validation errors, THEN THE Library_Page SHALL display field-level error messages and preserve the entered values.

### Requirement 6: Check-in Weight Warning

**User Story:** As a Volunteer, I want to see a warning when the check-in weight differs significantly from the checkout weight, so that I can investigate potential missing components.

#### Acceptance Criteria

1. WHILE the Volunteer is entering a check-in weight in the Checkin_Form, THE Weight_Warning SHALL update in real time as the value changes.
2. WHEN the weight difference exceeds the configured tolerance, THE Weight_Warning SHALL display a red-level alert showing checkout weight, entered weight, difference, and tolerance.
3. WHEN the weight difference is between 2% of checkout weight and the configured tolerance, THE Weight_Warning SHALL display a yellow-level alert showing checkout weight, entered weight, difference, and tolerance.
4. WHEN the weight difference is within 2% of checkout weight, THE Library_Page SHALL display no Weight_Warning.

### Requirement 7: Check-in Reminders and Special Handling

**User Story:** As a Volunteer, I want to see reminders for ID return and special game type handling during check-in, so that I do not forget important steps.

#### Acceptance Criteria

1. WHEN the Checkin_Popover opens for a checked-out game, THE Checkin_Popover SHALL display a reminder to return the attendee's ID, including the attendee name and ID type.
2. WHEN the Checkin_Popover opens for a "Play & Win" game, THE Checkin_Popover SHALL display a reminder to collect raffle entries from the attendee.
3. WHEN the Volunteer submits the Checkin_Form for a "Play & Take" game, THE Library_Page SHALL display a confirmation dialog asking whether the attendee takes the game home.
4. WHEN the Volunteer confirms the attendee takes the game in the Play & Take dialog, THE Library_Page SHALL submit the check-in with the attendee-takes-game flag set to true.
5. WHEN the Volunteer declines in the Play & Take dialog, THE Library_Page SHALL submit the check-in with the attendee-takes-game flag set to false.

### Requirement 8: Popover Dialog Behavior

**User Story:** As a Volunteer, I want the popover dialogs to have consistent open and close behavior with proper keyboard accessibility, so that I can work efficiently without accidental data loss.

#### Acceptance Criteria

1. WHEN the Volunteer clicks the "Cancel" button inside a Checkout_Popover or Checkin_Popover, THE Library_Page SHALL close the popover.
2. WHEN the Volunteer presses the Escape key while a Checkout_Popover or Checkin_Popover is open, THE Library_Page SHALL close the popover.
3. WHEN the Volunteer clicks outside the popover dialog while a Checkout_Popover or Checkin_Popover is open, THE Library_Page SHALL close the popover.
4. WHILE a Checkout_Popover or Checkin_Popover is open, THE Library_Page SHALL prevent interaction with the Game_Table behind the popover by displaying a backdrop overlay.
5. WHEN a popover is closed, THE Game_Table SHALL remain in its current state with all filters, sort, and pagination preserved.
6. WHILE a Checkout_Popover or Checkin_Popover is open, THE Library_Page SHALL trap keyboard focus inside the popover dialog so that Tab and Shift+Tab cycle only through focusable elements within the popover.
7. WHEN a Checkout_Popover or Checkin_Popover is closed, THE Library_Page SHALL return keyboard focus to the action button that triggered the popover.

### Requirement 9: Live Updates

**User Story:** As a Volunteer, I want the game list to update in real time when another station checks out or checks in a game, so that I always see the current library state.

#### Acceptance Criteria

1. THE Library_Page SHALL maintain a WebSocket connection for receiving live game update events.
2. WHEN a game update event is received via WebSocket, THE Library_Page SHALL refresh the Game_Table data to reflect the current state.
3. THE Library_Page SHALL display a ConnectionIndicator showing whether the live update connection is active.
4. WHEN a game update event is received via WebSocket while a Checkout_Popover or Checkin_Popover is open for that game, THE Library_Page SHALL display a Status_Change_Warning inside the popover indicating the game's status has changed.
5. WHEN a Status_Change_Warning is displayed inside a Checkout_Popover or Checkin_Popover, THE Library_Page SHALL disable the submit button of the form within that popover.
6. WHEN a Status_Change_Warning is displayed inside a Checkout_Popover or Checkin_Popover, THE Library_Page SHALL allow only the close or cancel action to dismiss the popover.

### Requirement 10: URL-Driven State and Navigation

**User Story:** As a Volunteer, I want the page state to be reflected in the URL, so that I can bookmark a filtered view or share it with another station.

#### Acceptance Criteria

1. THE Library_Page SHALL store the active status filter, game type filter, game title search query, attendee name search query, sort field, sort direction, current page, and page size as URL query parameters.
2. WHEN the Library_Page loads with query parameters present, THE Library_Page SHALL restore the filters, sort, and pagination from those parameters.
3. WHEN the Volunteer changes a filter or sort option, THE Library_Page SHALL update the URL query parameters without a full page reload and SHALL reset pagination to page 1.

### Requirement 11: Simplified Navigation

**User Story:** As a Volunteer, I want a simplified navigation bar with only the essential links, so that I can quickly switch between the landing page and the library without visual clutter.

#### Acceptance Criteria

1. THE Main_Navigation SHALL display the convention name as a link to the Landing_Page.
2. THE Main_Navigation SHALL display a "Library" link that navigates to the Library_Page at the `/library` route.
3. THE Main_Navigation SHALL display a Management_Icon as a gear/cog icon with a "Manage" text label next to it.
4. WHEN the Volunteer clicks the Management_Icon, THE Main_Navigation SHALL navigate directly to the `/management` landing page.
5. THE Main_Navigation SHALL contain only the convention name, the "Library" link, and the Management_Icon as top-level navigation elements.

### Requirement 12: Remove Legacy Route Files

**User Story:** As a developer, I want the old `/checkout`, `/checkin`, and `/catalog` route files removed from the application, so that dead routes are cleaned up and volunteers cannot accidentally access deprecated pages.

#### Acceptance Criteria

1. THE application SHALL remove the `/checkout` route directory and all its associated files (`+page.svelte`, `+page.server.ts`).
2. THE application SHALL remove the `/checkin` route directory and all its associated files (`+page.svelte`, `+page.server.ts`).
3. THE application SHALL remove the `/catalog` route directory and all its associated files (`+page.svelte`, `+page.server.ts`).
4. WHEN a user navigates to `/checkout`, `/checkin`, or `/catalog`, THE application SHALL return a 404 response.

### Requirement 13: Updated Landing Page

**User Story:** As a convention attendee or volunteer, I want the homepage to display the convention name, a hero image, and a prominent link to the game library, so that I can immediately identify the convention and navigate to the library.

#### Acceptance Criteria

1. THE Landing_Page SHALL display the Convention_Name_Display as a prominent heading, using the convention name from the convention configuration.
2. THE Landing_Page SHALL display a Library_CTA as a prominent, centrally-placed link/button that navigates to the Library_Page at `/library`.
3. THE Library_CTA SHALL be the primary call-to-action on the Landing_Page.
4. THE Landing_Page SHALL display a Hero_Image as a wide banner above or behind the main content area.
5. THE Hero_Image SHALL use a wide banner aspect ratio of approximately 3:1 or 4:1 to function as a hero section.
6. THE application SHALL include a placeholder Hero_Image file (a generic board game illustration or simple gradient) so that the Landing_Page appears polished without additional configuration.
7. THE application SHALL document the Hero_Image file path so that convention runners know where to find and replace the placeholder image.
8. WHEN a convention runner replaces the placeholder Hero_Image file at the documented path, THE Landing_Page SHALL display the replacement image without requiring code changes.
