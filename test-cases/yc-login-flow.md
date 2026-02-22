# Test Cases: YC Account Login Flow

**URL:** https://account.ycombinator.com/
**Generated:** 2026-02-21
**Journey:** User navigates to the YC account login page, enters credentials (username or email and password), and logs in. Includes forgot username/password recovery flows, sign-up navigation, and error handling for invalid inputs.

## Summary

- Total test cases: 48
- Critical: 8 | High: 16 | Medium: 16 | Low: 8

---

## Happy Path

### TC-LOGIN-001: Successful login with valid username and password

**Priority:** Critical
**Category:** Happy Path
**Preconditions:**

- User has a valid YC account with known username and password
- User is not currently logged in

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Verify the login page loads with heading "Log in", the YC logo, "Username or email" field, "Password" field, and the "Log In" button
3. Click the "Username or email" input field
4. Type a valid username
5. Click the "Password" input field
6. Type the correct password
7. Click the "Log In" button

**Expected Result:**

- The page redirects to the authenticated account page at https://account.ycombinator.com/
- The login form is no longer visible
- A "SIGN OUT" link is present on the authenticated page

**Notes:**

- The username field has `autocomplete="username"` and the password field has `autocomplete="current-password"`, so browser autofill may pre-populate values

---

### TC-LOGIN-002: Successful login with valid email and password

**Priority:** Critical
**Category:** Happy Path
**Preconditions:**

- User has a valid YC account with known email address and password
- User is not currently logged in

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Click the "Username or email" input field
3. Type the email address associated with the account
4. Click the "Password" input field
5. Type the correct password
6. Click the "Log In" button

**Expected Result:**

- The page redirects to the authenticated account page
- The user is successfully logged in

**Notes:**

- The "Username or email" field accepts both username and email formats

---

### TC-LOGIN-003: Successful login by pressing Enter key in password field

**Priority:** High
**Category:** Happy Path
**Preconditions:**

- User has valid credentials

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Enter a valid username in the "Username or email" field
3. Press Tab to move focus to the "Password" field
4. Type the correct password
5. Press Enter

**Expected Result:**

- The form is submitted
- The user is logged in and redirected to the account page

**Notes:**

- Verified that pressing Enter in the password field submits the form. The same error handling behaviors apply as when clicking the "Log In" button.

---

### TC-LOGIN-004: Login page displays all expected elements

**Priority:** High
**Category:** Happy Path
**Preconditions:**

- User is not authenticated

**Steps:**

1. Navigate to https://account.ycombinator.com/

**Expected Result:**

- The page title is "Account | Y Combinator"
- The YC logo (orange "Y" icon) is displayed at the top
- Heading text "Log in" is displayed
- "Username or email" text input field is present and focusable
- "Password" input field is present (type=password, masked input)
- "Forgot your username or password ?" text with "username" and "password" as clickable links/buttons
- Orange "Log In" button is present and enabled
- "Don't have an account? Create an account." text with "Create an account." as a clickable link/button

**Notes:**

- The form uses Material UI components (MuiInputBase-input, MuiButtonBase-root)
- Field labels float above the inputs when focused or filled (Material UI design pattern)

---

### TC-LOGIN-005: Navigate to Sign Up page from login

**Priority:** High
**Category:** Happy Path
**Preconditions:**

- User is on the login page

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Click the "Create an account." button/link below the "Log In" button

**Expected Result:**

- The page transitions to the "Sign up" view
- The sign up form displays: First Name, Last Name, Email, Username, Password, and "Your LinkedIn Profile URL" fields
- A "Sign Up" button is present
- "Already have an account? Log in." text is displayed with "Log in." as a clickable link
- If the login form had values, the Username and Password fields may carry over to the sign-up form

**Notes:**

- The transition appears to be a client-side view switch (URL remains the same: https://account.ycombinator.com/)
- The sign-up LinkedIn URL field has placeholder text "https://www.linkedin.com/in/username/"

---

### TC-LOGIN-006: Navigate back to Login from Sign Up page

**Priority:** Medium
**Category:** Happy Path
**Preconditions:**

- User is on the Sign Up view

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Click "Create an account." to go to the Sign Up view
3. Click "Log in." link at the bottom of the Sign Up form

**Expected Result:**

- The view transitions back to the "Log in" form
- All login form elements are displayed as expected

**Notes:**

- This is a client-side view toggle; no page reload occurs

---

### TC-LOGIN-007: Successful sign out redirects to login page

**Priority:** High
**Category:** Happy Path
**Preconditions:**

- User is logged in

**Steps:**

1. While logged in, click the "SIGN OUT" link
2. Observe the resulting page

**Expected Result:**

- The user is signed out
- The login form is displayed

**Notes:**

- The sign out URL is https://account.ycombinator.com/sign_out

---

## Validation & Error Handling

### TC-LOGIN-008: Login with non-existent username

**Priority:** Critical
**Category:** Validation
**Preconditions:**

- User is on the login page

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Type a non-existent username (e.g., "nonexistentuser99999") in the "Username or email" field
3. Type any password in the "Password" field
4. Click the "Log In" button

**Expected Result:**

- The "Username or email" label turns red
- The "Username or email" field underline turns red
- Error message "We couldn't find a user with that username." appears below the username field in red text
- An inline "Forgot username?" button/link appears adjacent to the error message
- The password field retains its masked value
- The user remains on the login page

**Notes:**

- This error message reveals that the username does not exist, which is a username enumeration concern (see TC-LOGIN-035)

---

### TC-LOGIN-009: Login with valid username but incorrect password

**Priority:** Critical
**Category:** Validation
**Preconditions:**

- User is on the login page
- "testuser" is a known valid username on the system

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Type a valid, existing username (e.g., "testuser") in the "Username or email" field
3. Type an incorrect password in the "Password" field
4. Click the "Log In" button

**Expected Result:**

- The "Password" label turns red
- The "Password" field underline turns red
- Error message "Password doesn't match." appears below the password field in red text
- An inline "Forgot password?" button/link appears adjacent to the error message
- The username field does NOT show an error state
- The user remains on the login page

**Notes:**

- The different error for wrong password vs. non-existent username enables username enumeration (see TC-LOGIN-035)

---

### TC-LOGIN-010: Login with non-existent email address

**Priority:** High
**Category:** Validation
**Preconditions:**

- User is on the login page

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Type a non-existent email (e.g., "nonexistent@example.com") in the "Username or email" field
3. Type any password in the "Password" field
4. Click the "Log In" button

**Expected Result:**

- The "Username or email" label turns red
- Error message "No account found. Please enter your username (instead of an email address)." appears below the username field in red text
- An inline "Forgot username?" button/link appears adjacent to the error message
- The user remains on the login page

**Notes:**

- This is a third distinct error message variant, specific to email-format input that doesn't match any account. The system detects the "@" in the input and provides email-specific guidance.

---

### TC-LOGIN-011: Login with empty/whitespace username field

**Priority:** High
**Category:** Validation
**Preconditions:**

- User is on the login page

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Leave the "Username or email" field empty (or enter only whitespace)
3. Enter any password in the "Password" field
4. Click the "Log In" button

**Expected Result:**

- The "Username or email" label turns red
- Error message "We couldn't find a user with that username." appears below the username field in red text
- An inline "Forgot username?" button/link appears in the error
- The form is submitted to the server (no client-side empty field prevention on the username field)

**Notes:**

- Unlike the "Forgot username" dialog which disables its submit button when empty, the main login form's "Log In" button remains enabled regardless of field contents

---

### TC-LOGIN-012: Forgot Password - submit with empty field

**Priority:** High
**Category:** Validation
**Preconditions:**

- User is on the login page

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Click the "password" link in "Forgot your username or password ?"
3. The "Forgot password?" dialog appears with a "Username or email address" field
4. Clear the field if it has any pre-filled value
5. Click the "Send Link" button

**Expected Result:**

- Error message "Please enter a username or email address." appears below the field in red text
- The "Username or email address" label turns red
- The dialog remains open
- The "Send Link" button remains enabled

**Notes:**

- The "Send Link" button does NOT disable when the field is empty (unlike the Forgot Username "Email" button). Validation occurs on submission.

---

### TC-LOGIN-013: Forgot Password - submit with non-existent username

**Priority:** High
**Category:** Validation
**Preconditions:**

- User is on the login page

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Click the "password" link in "Forgot your username or password ?"
3. Type a non-existent username (e.g., "nonexistentuser12345") in the field
4. Click the "Send Link" button

**Expected Result:**

- Error message "No account was found with the given username." appears below the field in red text
- The "Username or email address" label turns red
- Both "Cancel" and "Send Link" buttons are temporarily disabled during the server request, then re-enable
- The dialog remains open

**Notes:**

- This reveals whether a username exists, enabling username enumeration via the password reset flow

---

### TC-LOGIN-014: Forgot Username - Email button disabled when field is empty

**Priority:** Medium
**Category:** Validation
**Preconditions:**

- User is on the login page

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Click the "username" link in "Forgot your username or password ?"
3. The "Forgot username?" dialog appears with an "Email" field and "Email" button
4. Observe the state of the "Email" button with the field empty

**Expected Result:**

- The "Email" button is disabled (grayed out, not clickable) when the email field is empty
- The "Cancel" button is enabled

**Notes:**

- Client-side validation prevents submission without an email. The button enables only when a valid email format is entered.

---

### TC-LOGIN-015: Forgot Username - Email button disabled for invalid email format

**Priority:** Medium
**Category:** Validation
**Preconditions:**

- User has opened the "Forgot username?" dialog

**Steps:**

1. Open the "Forgot username?" dialog
2. Type "test" (no @ symbol) in the Email field
3. Observe the "Email" button state
4. Clear the field and type "test@" (incomplete email)
5. Observe the "Email" button state
6. Clear the field and type "a@b" (no TLD)
7. Observe the "Email" button state

**Expected Result:**

- "Email" button remains disabled for "test" (no @ symbol)
- "Email" button remains disabled for "test@" (incomplete)
- "Email" button remains disabled for "a@b" (no TLD)
- The button only enables when a valid email pattern like "a@b.com" is entered

**Notes:**

- The email field uses type="email" and the button enable logic requires a valid email format with at minimum the pattern x@y.z (domain with TLD)

---

### TC-LOGIN-016: Forgot Username - Email button enables with valid email format

**Priority:** Medium
**Category:** Validation
**Preconditions:**

- User has opened the "Forgot username?" dialog

**Steps:**

1. Open the "Forgot username?" dialog
2. Type "a@b.com" in the Email field
3. Observe the "Email" button state

**Expected Result:**

- The "Email" button becomes enabled (orange, clickable)

**Notes:**

- The minimum valid email format that enables the button is x@y.z (e.g., "a@b.com")

---

### TC-LOGIN-017: Forgot Username - successful submission with any email

**Priority:** High
**Category:** Validation
**Preconditions:**

- User has opened the "Forgot username?" dialog

**Steps:**

1. Open the "Forgot username?" dialog
2. Type any valid-format email (e.g., "test@example.com") in the Email field
3. Click the "Email" button

**Expected Result:**

- The dialog closes
- A success notification "Username emailed to test@example.com." is briefly displayed
- The login form is shown again
- The same success message appears regardless of whether the email is registered or not

**Notes:**

- Good security practice: the response does not reveal whether the email exists in the system. The same "emailed" message shows for both registered and unregistered emails.

---

### TC-LOGIN-018: Forgot Password - pre-fills username from login form

**Priority:** Medium
**Category:** Validation
**Preconditions:**

- User has entered a value in the login form's "Username or email" field

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Type "myusername" in the "Username or email" field
3. Click the "password" link in "Forgot your username or password ?"

**Expected Result:**

- The "Forgot password?" dialog opens
- The "Username or email address" field is pre-populated with "myusername"
- The "Send Link" button is enabled

**Notes:**

- The dialog inherits the username value from the login form, saving the user from re-typing

---

### TC-LOGIN-019: Inline error link - "Forgot username?" from login error

**Priority:** Medium
**Category:** Validation
**Preconditions:**

- User has triggered a "We couldn't find a user with that username" error on the login form

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Enter a non-existent username and any password
3. Click "Log In" to trigger the error
4. Click the "Forgot username?" link that appears inline with the error message

**Expected Result:**

- The "Forgot username?" dialog opens
- The dialog has an Email field and Cancel/Email buttons
- The Email field is empty and focused

**Notes:**

- This provides a convenient recovery path directly from the error state

---

### TC-LOGIN-020: Inline error link - "Forgot password?" from login error

**Priority:** Medium
**Category:** Validation
**Preconditions:**

- User has triggered a "Password doesn't match" error on the login form

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Enter a valid, existing username and a wrong password
3. Click "Log In" to trigger the error
4. Click the "Forgot password?" link that appears inline with the error message

**Expected Result:**

- The "Forgot password?" dialog opens
- The "Username or email address" field is pre-populated with the username from the login form
- The "Send Link" button is enabled

**Notes:**

- This provides a direct recovery path from the wrong-password error state

---

## Edge Cases

### TC-LOGIN-021: Login with username containing special characters

**Priority:** Medium
**Category:** Edge Case
**Preconditions:**

- User is on the login page

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Type a username with special characters (e.g., "user!@#$%^&\*()") in the "Username or email" field
3. Type any password
4. Click "Log In"

**Expected Result:**

- The form submits without client-side errors
- An appropriate error message is displayed (e.g., "We couldn't find a user with that username.")
- No application crash or unhandled error occurs

**Notes:**

- The username field is type="text" with no client-side character restrictions

---

### TC-LOGIN-022: Login with XSS payload in username field

**Priority:** High
**Category:** Edge Case
**Preconditions:**

- User is on the login page

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Type `<script>alert('xss')</script>` in the "Username or email" field
3. Type any password
4. Click "Log In"

**Expected Result:**

- No JavaScript alert dialog appears
- The script tags are rendered as plain text in the input field
- The standard error message "We couldn't find a user with that username." is displayed
- The input is properly HTML-escaped in the response

**Notes:**

- Verified: XSS input is properly escaped and treated as plain text. No script execution occurs.

---

### TC-LOGIN-023: Login with SQL injection payload in username field

**Priority:** High
**Category:** Edge Case
**Preconditions:**

- User is on the login page

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Type `' OR 1=1 --` in the "Username or email" field
3. Type any password
4. Click "Log In"

**Expected Result:**

- The form submits
- Error message "An error occurred (403). Please try again in a few minutes." is displayed in red text below the "Log In" button
- No unauthorized access is granted
- The user remains on the login page

**Notes:**

- Verified: SQL injection patterns trigger a 403 Forbidden response, likely from a Web Application Firewall (WAF). This is a good security measure that blocks malicious input at the network/application layer.

---

### TC-LOGIN-024: Login form retains username after failed attempt

**Priority:** Medium
**Category:** Edge Case
**Preconditions:**

- User is on the login page

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Type "mytestuser" in the "Username or email" field
3. Type "wrongpassword" in the "Password" field
4. Click "Log In"
5. Observe the field values after the error appears

**Expected Result:**

- The "Username or email" field retains the value "mytestuser"
- The "Password" field retains its masked value (dots)
- The error message is displayed
- The user can correct the password and retry without re-entering the username

**Notes:**

- Both fields retain values after a failed login attempt, which is standard UX behavior

---

### TC-LOGIN-025: Rapidly clicking the Log In button multiple times

**Priority:** Medium
**Category:** Edge Case
**Preconditions:**

- User has filled in the login form

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Enter a username and password
3. Rapidly click the "Log In" button multiple times in quick succession

**Expected Result:**

- The form is submitted once (or subsequent submissions are idempotent)
- No duplicate requests cause errors or unexpected behavior
- An appropriate error or success response is shown

**Notes:**

- The "Log In" button does not appear to have a visible disabled/loading state during form submission. This should be verified for potential double-submission issues.

---

### TC-LOGIN-026: Login with very long username input

**Priority:** Low
**Category:** Edge Case
**Preconditions:**

- User is on the login page

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Type a very long string (e.g., 500+ characters) in the "Username or email" field
3. Type any password
4. Click "Log In"

**Expected Result:**

- The form submits without client-side errors
- An appropriate error message is displayed
- No truncation-related errors or crashes occur
- The long value is displayed (possibly overflowing) in the input field

**Notes:**

- The username field has no visible maxlength attribute

---

### TC-LOGIN-027: Login with very long password input

**Priority:** Low
**Category:** Edge Case
**Preconditions:**

- User is on the login page

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Enter a valid username
3. Type a very long string (e.g., 1000+ characters) in the "Password" field
4. Click "Log In"

**Expected Result:**

- The form submits without client-side errors
- An appropriate error message is displayed (password doesn't match or generic error)
- No server errors or crashes occur

**Notes:**

- The password field has no visible maxlength attribute

---

### TC-LOGIN-028: Login with Unicode/emoji characters in username

**Priority:** Low
**Category:** Edge Case
**Preconditions:**

- User is on the login page

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Type Unicode characters (e.g., "user\u00e9\u00e0\u00fc" or "\u4f60\u597d") in the "Username or email" field
3. Type any password
4. Click "Log In"

**Expected Result:**

- The form submits without client-side errors
- An appropriate error message is displayed
- Unicode characters are handled gracefully without encoding errors

**Notes:**

- The input field is a standard text input with no character restrictions

---

### TC-LOGIN-029: Browser autofill populates login fields

**Priority:** Medium
**Category:** Edge Case
**Preconditions:**

- Browser has saved credentials for account.ycombinator.com

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Observe if the browser autofills the username and password fields
3. Click "Log In" without manually modifying the fields

**Expected Result:**

- The browser autofill populates the "Username or email" field and "Password" field
- Clicking "Log In" with autofilled values submits the form correctly
- The autofill works because the fields have `autocomplete="username"` and `autocomplete="current-password"` attributes

**Notes:**

- Verified: The fields have proper autocomplete attributes. Browser autofill was observed to pre-populate the username ("nadeem1") and password fields upon page load.

---

### TC-LOGIN-030: Switch between Login and Sign Up preserves entered data

**Priority:** Medium
**Category:** Edge Case
**Preconditions:**

- User is on the login page

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Type "myuser" in the "Username or email" field
3. Type "mypassword" in the "Password" field
4. Click "Create an account." to switch to the Sign Up view
5. Observe the Sign Up form fields
6. Click "Log in." to switch back to the Login view
7. Observe the Login form fields

**Expected Result:**

- When switching to Sign Up, the Username field is pre-populated with "myuser" and the Password field retains the masked password
- When switching back to Login, the "Username or email" field retains "myuser" and the Password field retains its value

**Notes:**

- Verified: Field values carry over between Login and Sign Up views since they share underlying state

---

## Boundary Conditions

### TC-LOGIN-031: Login with single character username

**Priority:** Low
**Category:** Boundary
**Preconditions:**

- User is on the login page

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Type a single character (e.g., "a") in the "Username or email" field
3. Type any password
4. Click "Log In"

**Expected Result:**

- The form submits
- An appropriate error message is displayed (e.g., "We couldn't find a user with that username." or "Password doesn't match." if "a" is a valid username)

**Notes:**

- No minimum length validation is enforced on the client side for the username field

---

### TC-LOGIN-032: Login with single character password

**Priority:** Low
**Category:** Boundary
**Preconditions:**

- User is on the login page

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Enter a valid username
3. Type a single character (e.g., "x") in the "Password" field
4. Click "Log In"

**Expected Result:**

- The form submits
- An appropriate error message is displayed (e.g., "Password doesn't match.")

**Notes:**

- No minimum length validation is enforced on the client side for the password field

---

### TC-LOGIN-033: Forgot Username - minimum valid email format

**Priority:** Low
**Category:** Boundary
**Preconditions:**

- User has opened the "Forgot username?" dialog

**Steps:**

1. Open the "Forgot username?" dialog
2. Type "a@b.c" in the Email field
3. Observe the "Email" button state
4. Clear and type "a@b.co" in the Email field
5. Observe the "Email" button state

**Expected Result:**

- For "a@b.c": The "Email" button may or may not enable depending on exact validation (single-char TLD)
- For "a@b.co": The "Email" button enables
- The minimum threshold is approximately x@y.z format with TLD

**Notes:**

- Verified: "a@b" does not enable the button. "a@b.com" does enable it. The validation uses the browser's built-in email type validation.

---

### TC-LOGIN-034: Error message clears when user modifies input

**Priority:** Medium
**Category:** Boundary
**Preconditions:**

- User has triggered an error on the login form

**Steps:**

1. Enter a non-existent username and click "Log In" to trigger the error
2. Observe the error message "We couldn't find a user with that username."
3. Click the "Username or email" field and modify the text (e.g., add a character)
4. Observe the error message state

**Expected Result:**

- The error message should clear or update when the user begins modifying the input field
- The field label should return to its normal (non-red) state

**Notes:**

- This tests whether error states are properly cleared on user interaction to avoid confusion

---

## Security & Access

### TC-LOGIN-035: Username enumeration via different error messages

**Priority:** Critical
**Category:** Security
**Preconditions:**

- User is on the login page
- "testuser" is a known valid username

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Enter "nonexistentuser99999" as the username and any password, then click "Log In"
3. Note the error message
4. Clear the fields
5. Enter "testuser" (a known valid username) and an incorrect password, then click "Log In"
6. Note the error message

**Expected Result (current behavior):**

- Step 3: Error message is "We couldn't find a user with that username." (displayed on the username field)
- Step 6: Error message is "Password doesn't match." (displayed on the password field)

**Security Concern:**

- The different error messages allow an attacker to enumerate valid usernames by observing which error appears
- An email-format input that doesn't exist produces a third variant: "No account found. Please enter your username (instead of an email address)."
- Industry best practice is to use a single generic message like "Invalid username or password" for all failed login attempts

**Notes:**

- Three distinct error messages were observed during testing:
  1. "We couldn't find a user with that username." + "Forgot username?" link
  2. "Password doesn't match." + "Forgot password?" link
  3. "No account found. Please enter your username (instead of an email address)." + "Forgot username?" link

---

### TC-LOGIN-036: Username enumeration via Forgot Password flow

**Priority:** Critical
**Category:** Security
**Preconditions:**

- User is on the login page

**Steps:**

1. Click "password" link to open "Forgot password?" dialog
2. Enter a non-existent username (e.g., "nonexistentuser12345")
3. Click "Send Link"
4. Note the error message

**Expected Result (current behavior):**

- Error message "No account was found with the given username." appears

**Security Concern:**

- This reveals that the username does not exist in the system
- An attacker can use the forgot password flow to enumerate valid usernames
- Best practice: show a generic success message like "If an account exists with that username, a password reset link has been sent" regardless of whether the account exists

**Notes:**

- Contrast with the "Forgot Username" flow which shows "Username emailed to [email]" regardless of whether the email exists (good practice)

---

### TC-LOGIN-037: SQL injection attempt blocked by WAF

**Priority:** High
**Category:** Security
**Preconditions:**

- User is on the login page

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Type `' OR 1=1 --` in the "Username or email" field
3. Type any value in the "Password" field
4. Click "Log In"

**Expected Result:**

- Error message "An error occurred (403). Please try again in a few minutes." is displayed
- The request is blocked with a 403 status
- No unauthorized data access occurs

**Notes:**

- Verified: A WAF or input sanitization layer detects SQL injection patterns and returns a 403 Forbidden response. The error message includes the HTTP status code "(403)".

---

### TC-LOGIN-038: XSS prevention in login form

**Priority:** High
**Category:** Security
**Preconditions:**

- User is on the login page

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Type `<script>alert('xss')</script>` in the "Username or email" field
3. Click "Log In"
4. Observe the page for any script execution

**Expected Result:**

- No JavaScript alert dialog appears
- The HTML tags are displayed as plain text in the input field and error message
- The application properly escapes/sanitizes the input

**Notes:**

- Verified: XSS payloads are rendered as plain text. The standard "We couldn't find a user with that username." error is shown with the script tags visible as text.

---

### TC-LOGIN-039: HTTPS enforcement

**Priority:** Critical
**Category:** Security
**Preconditions:**

- None

**Steps:**

1. Navigate to http://account.ycombinator.com/ (HTTP, not HTTPS)

**Expected Result:**

- The browser is redirected to https://account.ycombinator.com/ (HTTPS)
- The login page loads securely
- Credentials are never transmitted over unencrypted HTTP

**Notes:**

- Verified: HTTP requests are automatically redirected to HTTPS

---

### TC-LOGIN-040: Accessing sign_out URL when not authenticated

**Priority:** Medium
**Category:** Security
**Preconditions:**

- User is not logged in

**Steps:**

1. Navigate directly to https://account.ycombinator.com/sign_out

**Expected Result:**

- The user is redirected to the login page at https://account.ycombinator.com/
- No error message is displayed
- The login form is shown normally

**Notes:**

- Verified: The sign_out endpoint gracefully handles unauthenticated requests by redirecting to login

---

### TC-LOGIN-041: Accessing invalid URL paths returns 404

**Priority:** Medium
**Category:** Security
**Preconditions:**

- None

**Steps:**

1. Navigate to https://account.ycombinator.com/settings
2. Observe the response

**Expected Result:**

- A "404 File Not Found" page is displayed
- The page shows "Back to the homepage" link (pointing to /)
- The page shows "For support please contact software@ycombinator.com" at the bottom
- No sensitive information is leaked in the 404 page (no stack traces, server versions, etc.)

**Notes:**

- Verified: The 404 page is clean with minimal information disclosure

---

### TC-LOGIN-042: Rate limiting on failed login attempts

**Priority:** High
**Category:** Security
**Preconditions:**

- User is on the login page

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Enter an invalid username and password
3. Click "Log In" repeatedly (10+ times in quick succession)
4. Observe whether the response changes or the account/IP gets locked

**Expected Result:**

- After multiple failed attempts, the system should implement rate limiting (e.g., temporary lockout, CAPTCHA, or increasing delays)
- If rate limiting exists, an appropriate message should be shown

**Notes:**

- The 403 response observed with SQL injection payloads suggests a WAF is present, which may also enforce rate limiting. This test case requires careful execution to avoid triggering permanent IP blocks.

---

### TC-LOGIN-043: Session fixation prevention

**Priority:** High
**Category:** Security
**Preconditions:**

- User has access to browser developer tools

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Note any session cookies set before login
3. Enter valid credentials and log in
4. Note the session cookies after login
5. Compare the pre-login and post-login session identifiers

**Expected Result:**

- The session identifier should change upon successful login
- Pre-login session cookies should be invalidated or replaced
- New session cookies should have Secure and HttpOnly flags

**Notes:**

- This test requires browser developer tools to inspect cookies and cannot be fully automated via UI testing alone

---

## Accessibility & UX

### TC-LOGIN-044: Keyboard Tab order through login form

**Priority:** High
**Category:** Accessibility
**Preconditions:**

- User is on the login page

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Click the "Username or email" field to set initial focus
3. Press Tab once -- note which element receives focus
4. Press Tab again -- note which element receives focus
5. Press Tab again -- note which element receives focus
6. Press Tab again -- note which element receives focus

**Expected Result:**

- Tab 1: Focus moves from "Username or email" to "Password" field
- Tab 2: Focus moves from "Password" to the "Log In" button
- Tab 3: Focus moves from "Log In" to the "Create an account." button
- Tab 4: Focus moves outside the form area

**Accessibility Concern:**

- The "Forgot your username or password ?" links (both "username" and "password") are NOT reachable via keyboard Tab navigation
- These interactive elements should be included in the tab order for keyboard-only users
- This may violate WCAG 2.1 Success Criterion 2.1.1 (Keyboard)

**Notes:**

- Verified: The "Forgot your username" and "Forgot your password" buttons are skipped in the tab order. Keyboard-only users cannot access the password recovery flows without using screen reader shortcuts or other assistive technology.

---

### TC-LOGIN-045: Escape key dismisses dialog overlays

**Priority:** Medium
**Category:** Accessibility
**Preconditions:**

- A dialog (Forgot username or Forgot password) is open

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Click the "username" link to open the "Forgot username?" dialog
3. Press the Escape key

**Expected Result:**

- The dialog closes
- Focus returns to the login form (specifically to the element that triggered the dialog)
- The login form is fully interactive again

**Notes:**

- Verified: Escape key dismisses the dialog overlay. Focus returns to the triggering "username" button element.

---

### TC-LOGIN-046: Form submit via Enter key from username field

**Priority:** Medium
**Category:** Accessibility
**Preconditions:**

- User is on the login page

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Type a username in the "Username or email" field
3. Press Enter (without tabbing to the password field)

**Expected Result:**

- The form should either submit (triggering validation/login attempt) or move focus to the password field
- The behavior should be predictable and consistent

**Notes:**

- This tests whether Enter in the first field submits the form or requires password input first

---

### TC-LOGIN-047: Password field masks input characters

**Priority:** High
**Category:** UX
**Preconditions:**

- User is on the login page

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Click the "Password" field
3. Type any text (e.g., "testpassword")
4. Observe the field display

**Expected Result:**

- All typed characters are displayed as bullet/dot characters (masked)
- The actual password text is not visible on screen
- There is no "show password" toggle button

**Notes:**

- Verified: The password field uses type="password" and displays masked characters. No show/hide password toggle was observed on the form.

---

### TC-LOGIN-048: Forgot Username dialog displays Hacker News tip

**Priority:** Low
**Category:** UX
**Preconditions:**

- User is on the login page

**Steps:**

1. Navigate to https://account.ycombinator.com/
2. Click the "username" link to open the "Forgot username?" dialog
3. Read the dialog contents

**Expected Result:**

- The dialog heading is "Forgot username?"
- The description text reads "Enter your email, and we'll send your username via email."
- An Email input field is displayed
- A tip is displayed: "Tip: If you have a Hacker News account, you can use your credentials to log in."
- "Cancel" and "Email" buttons are present

**Notes:**

- Verified: The Hacker News tip informs users that YC accounts share credentials with Hacker News, which is useful context for HN users who may not remember their YC-specific username
