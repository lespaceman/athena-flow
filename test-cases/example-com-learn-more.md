# Test Cases: Example.com -- "Learn More" Behavior

## Overview

Example.com is a minimal, single-page informational site maintained by IANA (Internet Assigned Numbers Authority) as a reserved domain for use in documentation and examples (per RFC 2606 and RFC 6761). The page contains exactly three visible elements: an `<h1>` heading ("Example Domain"), a descriptive paragraph, and a single "Learn more" hyperlink. The "Learn more" link navigates the user to the IANA "Example Domains" help page at `https://www.iana.org/help/example-domains`.

### Key Observations from Live Browser Testing

- **Source page URL:** `https://example.com/`
- **Page title:** "Example Domain"
- **Interactive elements on source page:** 1 (the "Learn more" link)
- **Link href attribute:** `https://iana.org/domains/example`
- **Actual destination after redirects:** `https://www.iana.org/help/example-domains`
- **Redirect chain observed:** `iana.org` redirects to `www.iana.org`, and `/domains/example` redirects to `/help/example-domains`
- **Navigation type:** Full page navigation (same tab, no `target="_blank"`)
- **HTTP to HTTPS:** `http://example.com` automatically redirects to `https://example.com`
- **Back button:** Works correctly, returns to `https://example.com/`
- **Forward button:** Works correctly after using back, returns to IANA page
- **Keyboard navigation:** Tab focuses the link (visible focus indicator), Enter activates it
- **Focus indicator:** Solid/dotted outline visible around "Learn more" when focused
- **No JavaScript detected:** Page appears to be pure static HTML/CSS
- **No content below the fold:** Full-page screenshot matches viewport screenshot
- **Destination page elements:** Header nav (Domains, Protocols, Numbers, About), main content with RFC links, footer with 20+ links

## Page Under Test

- **URL:** https://example.com/
- **Destination URL:** https://www.iana.org/help/example-domains
- **Date Generated:** 2026-02-03
- **Elements Cataloged:** 5 on source page (1 heading, 2 paragraph/text nodes, 1 link); 62 on destination page

---

## Test Cases

### 1. Happy Path

#### TC-HP-001: "Learn more" link navigates to IANA example domains page

- **Description:** Verify that clicking the "Learn more" link navigates the user to the IANA help page about example domains.
- **Preconditions:** User is on `https://example.com/`
- **Steps:**
  1. Locate the "Learn more" link below the descriptive paragraph
  2. Click the "Learn more" link
- **Expected Result:** The browser navigates to `https://www.iana.org/help/example-domains`. The page title is "Example Domains". The page contains information about RFC 2606 and RFC 6761, and a "Further Reading" section with a link to "IANA-managed Reserved Domains".
- **Priority:** High

#### TC-HP-002: Page displays correct heading and description

- **Description:** Verify that the page renders its core informational content correctly.
- **Preconditions:** None
- **Steps:**
  1. Navigate to `https://example.com/`
  2. Read the page content
- **Expected Result:** The page displays an `<h1>` heading with text "Example Domain" and a paragraph with text "This domain is for use in documentation examples without needing permission. Avoid use in operations."
- **Priority:** High

#### TC-HP-003: Page title is correct

- **Description:** Verify the browser tab/document title.
- **Preconditions:** None
- **Steps:**
  1. Navigate to `https://example.com/`
  2. Observe the browser tab title
- **Expected Result:** The document title is "Example Domain".
- **Priority:** Medium

---

### 2. Navigation & Routing

#### TC-NR-001: Back button returns to example.com after clicking "Learn more"

- **Description:** Verify that the browser back button correctly returns the user to the source page after navigating via "Learn more".
- **Preconditions:** User is on `https://example.com/`
- **Steps:**
  1. Click "Learn more" link
  2. Verify navigation to `https://www.iana.org/help/example-domains`
  3. Click the browser back button
- **Expected Result:** The browser returns to `https://example.com/`. The page renders identically to the initial visit -- heading, paragraph, and "Learn more" link are all present.
- **Priority:** High

#### TC-NR-002: Forward button returns to IANA page after using back

- **Description:** Verify that the browser forward button works after navigating back.
- **Preconditions:** User has navigated to example.com, clicked "Learn more", and then pressed back
- **Steps:**
  1. From `https://example.com/` (after pressing back), click the browser forward button
- **Expected Result:** The browser navigates forward to `https://www.iana.org/help/example-domains`.
- **Priority:** Medium

#### TC-NR-003: Link href redirects correctly through the chain

- **Description:** Verify the redirect chain from the link's `href` value to the final destination.
- **Preconditions:** None
- **Steps:**
  1. Navigate directly to `https://iana.org/domains/example` (the raw href value)
- **Expected Result:** The URL is redirected through: `iana.org` -> `www.iana.org` (host redirect) and `/domains/example` -> `/help/example-domains` (path redirect). The final URL is `https://www.iana.org/help/example-domains`.
- **Priority:** Medium

#### TC-NR-004: HTTP to HTTPS redirect on example.com

- **Description:** Verify that HTTP requests to example.com are upgraded to HTTPS.
- **Preconditions:** None
- **Steps:**
  1. Navigate to `http://example.com/` (HTTP, not HTTPS)
- **Expected Result:** The browser is redirected to `https://example.com/`. The page content is identical to loading via HTTPS directly.
- **Priority:** High

#### TC-NR-005: "Learn more" opens in the same tab (no target="\_blank")

- **Description:** Verify the link does not open in a new tab or window.
- **Preconditions:** User is on `https://example.com/`
- **Steps:**
  1. Click the "Learn more" link
  2. Check if a new tab was opened
- **Expected Result:** The IANA page loads in the same tab. No new tab or window is opened. The link does not have a `target="_blank"` attribute.
- **Priority:** Medium

#### TC-NR-006: Direct URL access to example.com

- **Description:** Verify the page loads correctly when accessed via direct URL entry.
- **Preconditions:** None
- **Steps:**
  1. Enter `https://example.com/` in the browser address bar and press Enter
- **Expected Result:** The page loads with the heading "Example Domain", the descriptive paragraph, and the "Learn more" link. No errors or blank page.
- **Priority:** High

---

### 3. Edge Cases

#### TC-EC-001: Rapid double-click on "Learn more" link

- **Description:** Verify behavior when the user rapidly double-clicks the link.
- **Preconditions:** User is on `https://example.com/`
- **Steps:**
  1. Rapidly double-click the "Learn more" link
- **Expected Result:** The browser navigates to the IANA page once. There should be no duplicate navigation, error, or unexpected behavior. The page should not display a blank screen or error page.
- **Priority:** Low

#### TC-EC-002: Page with trailing slash vs without

- **Description:** Verify that both `https://example.com/` and `https://example.com` resolve to the same page.
- **Preconditions:** None
- **Steps:**
  1. Navigate to `https://example.com` (without trailing slash)
  2. Observe the page
  3. Navigate to `https://example.com/` (with trailing slash)
  4. Compare
- **Expected Result:** Both URLs load the identical page content.
- **Priority:** Low

#### TC-EC-003: Page reload preserves content

- **Description:** Verify that refreshing the page does not alter its content.
- **Preconditions:** User is on `https://example.com/`
- **Steps:**
  1. Press F5 or Ctrl+R to reload the page
  2. Observe the page content
- **Expected Result:** The page reloads and displays the same heading, paragraph, and "Learn more" link. No content changes or errors.
- **Priority:** Low

---

### 4. Boundary Conditions

#### TC-BC-001: No scrollable content exists

- **Description:** Verify that the page content fits within a single viewport and no scrolling reveals hidden content.
- **Preconditions:** User is on `https://example.com/` with a standard viewport (e.g., 1536x752)
- **Steps:**
  1. Observe the full-page content
  2. Attempt to scroll down
- **Expected Result:** All content is visible above the fold. Scrolling reveals no additional content. The full-page screenshot matches the viewport screenshot.
- **Priority:** Low

#### TC-BC-002: Only one interactive element exists on the page

- **Description:** Verify that "Learn more" is the sole interactive element.
- **Preconditions:** User is on `https://example.com/`
- **Steps:**
  1. Search for all buttons, links, form inputs, and other interactive elements on the page
- **Expected Result:** Exactly one interactive element is found: the "Learn more" link. There are no buttons, text inputs, dropdowns, checkboxes, radio buttons, or other interactive controls.
- **Priority:** Medium

---

### 5. Accessibility

#### TC-A11Y-001: "Learn more" link is keyboard-accessible via Tab

- **Description:** Verify that keyboard-only users can reach and activate the "Learn more" link.
- **Preconditions:** User is on `https://example.com/`, no element has focus
- **Steps:**
  1. Press the Tab key once
  2. Observe focus state
- **Expected Result:** The "Learn more" link receives keyboard focus. A visible focus indicator (outline/border) appears around the link text.
- **Priority:** High

#### TC-A11Y-002: "Learn more" link is activatable via Enter key

- **Description:** Verify that pressing Enter while the link is focused navigates to the destination.
- **Preconditions:** The "Learn more" link has keyboard focus (via Tab)
- **Steps:**
  1. With the "Learn more" link focused, press Enter
- **Expected Result:** The browser navigates to `https://www.iana.org/help/example-domains`, identical to clicking the link with a mouse.
- **Priority:** High

#### TC-A11Y-003: Focus indicator is visually distinguishable

- **Description:** Verify that the focus outline on the "Learn more" link is clearly visible and meets contrast requirements.
- **Preconditions:** User is on `https://example.com/`
- **Steps:**
  1. Press Tab to focus the "Learn more" link
  2. Observe the focus indicator visual appearance
- **Expected Result:** A clearly visible outline or border appears around the "Learn more" link. The indicator should have sufficient contrast against the background (light gray, approximately #f0f0f0) to be distinguishable.
- **Priority:** Medium

#### TC-A11Y-004: Heading hierarchy is correct

- **Description:** Verify proper heading structure for screen readers and assistive technology.
- **Preconditions:** User is on `https://example.com/`
- **Steps:**
  1. Inspect the heading elements on the page
- **Expected Result:** There is exactly one `<h1>` element with text "Example Domain". There are no skipped heading levels. The heading is the first semantic content element on the page.
- **Priority:** Medium

#### TC-A11Y-005: Link text is descriptive

- **Description:** Evaluate whether the "Learn more" link text provides sufficient context for screen reader users.
- **Preconditions:** User is on `https://example.com/`
- **Steps:**
  1. Inspect the link text and surrounding context
- **Expected Result:** The link text is "Learn more". Note: While this is a common pattern, accessibility best practices recommend more descriptive link text such as "Learn more about example domains" to provide context without requiring the user to read surrounding text. This is an area for improvement, but is not a blocking issue for this simple informational page.
- **Priority:** Low

---

### 6. Security

#### TC-SEC-001: HTTPS is enforced

- **Description:** Verify that the site is served over HTTPS and HTTP is redirected.
- **Preconditions:** None
- **Steps:**
  1. Navigate to `http://example.com/`
- **Expected Result:** The request is redirected to `https://example.com/`. The page loads with a valid SSL certificate. The browser shows a secure connection indicator (lock icon).
- **Priority:** High

#### TC-SEC-002: External link does not expose referrer inappropriately

- **Description:** Verify the behavior of referrer information when navigating to the external IANA site.
- **Preconditions:** User is on `https://example.com/`
- **Steps:**
  1. Click the "Learn more" link
  2. Inspect the `Referer` header sent to `iana.org` (via browser dev tools or network monitor)
- **Expected Result:** The request to `iana.org` should include an appropriate referrer policy. Since both sites use HTTPS, the referrer should be sent (this is expected behavior for same-protocol navigation). Ideally, a `Referrer-Policy` header or meta tag should be present. The link does not have `rel="noopener noreferrer"` -- this is acceptable since the link does not use `target="_blank"`.
- **Priority:** Low

#### TC-SEC-003: No inline JavaScript or external scripts loaded

- **Description:** Verify the page does not load or execute any JavaScript.
- **Preconditions:** None
- **Steps:**
  1. Navigate to `https://example.com/`
  2. Open browser dev tools and check the Sources/Network tab for JS files
  3. Inspect the page source for `<script>` tags
- **Expected Result:** No `<script>` tags are present in the HTML. No JavaScript files are loaded. The page is entirely static HTML and CSS.
- **Priority:** Medium

---

### 7. Performance & Loading

#### TC-PL-001: Page loads within acceptable time

- **Description:** Verify that the page loads quickly given its minimal content.
- **Preconditions:** Stable network connection
- **Steps:**
  1. Open browser dev tools Network tab
  2. Navigate to `https://example.com/`
  3. Observe the total load time and resource count
- **Expected Result:** The page should load in under 1 second on a broadband connection. The total transfer size should be minimal (under 2KB for the HTML). There should be only 1 network request (the HTML document itself) -- no external CSS, JS, images, or fonts.
- **Priority:** Medium

#### TC-PL-002: Page is cacheable

- **Description:** Verify that browser caching headers are set appropriately.
- **Preconditions:** None
- **Steps:**
  1. Navigate to `https://example.com/`
  2. Inspect the response headers in browser dev tools
- **Expected Result:** The response includes appropriate cache control headers (e.g., `Cache-Control`, `ETag`, or `Last-Modified`) to enable browser caching of this static content.
- **Priority:** Low

#### TC-PL-003: Page renders without JavaScript enabled

- **Description:** Verify the page is fully functional with JavaScript disabled.
- **Preconditions:** JavaScript is disabled in the browser
- **Steps:**
  1. Disable JavaScript in browser settings
  2. Navigate to `https://example.com/`
  3. Verify all content is visible
  4. Click the "Learn more" link
- **Expected Result:** The page renders identically with JavaScript disabled. The heading, paragraph, and link are all present and functional. The "Learn more" link navigates correctly since it is a standard `<a>` element, not a JavaScript-driven action.
- **Priority:** Medium

---

### 8. Cross-Browser / Responsive

#### TC-CR-001: Page renders correctly at mobile viewport width (375px)

- **Description:** Verify the page content is readable and the link is tappable on a mobile-width viewport.
- **Preconditions:** None
- **Steps:**
  1. Resize the browser window or use dev tools device emulation to set viewport width to 375px (iPhone SE/equivalent)
  2. Navigate to `https://example.com/`
  3. Observe the layout
- **Expected Result:** The heading, paragraph, and "Learn more" link are all visible without horizontal scrolling. Text wraps appropriately. The "Learn more" link has a sufficiently large tap target (at least 44x44 CSS pixels per WCAG guidelines, or is at minimum usable).
- **Priority:** Medium

#### TC-CR-002: Page renders correctly at tablet viewport width (768px)

- **Description:** Verify the page content adapts appropriately at tablet width.
- **Preconditions:** None
- **Steps:**
  1. Set viewport width to 768px
  2. Navigate to `https://example.com/`
- **Expected Result:** All content is visible. Text may have different margins/padding compared to desktop but is fully readable. The "Learn more" link is clickable.
- **Priority:** Low

#### TC-CR-003: Page renders correctly on wide desktop viewport (1920px+)

- **Description:** Verify the page does not break or stretch awkwardly on wide screens.
- **Preconditions:** None
- **Steps:**
  1. Set viewport width to 1920px or wider
  2. Navigate to `https://example.com/`
- **Expected Result:** Content is centered or constrained within a readable width. Text does not stretch to the full viewport width. The layout remains visually balanced.
- **Priority:** Low

#### TC-CR-004: Cross-browser consistency (Chrome, Firefox, Safari, Edge)

- **Description:** Verify the page renders consistently across major browsers.
- **Preconditions:** Access to Chrome, Firefox, Safari, and Edge
- **Steps:**
  1. Open `https://example.com/` in each browser
  2. Compare the visual appearance and "Learn more" link behavior
- **Expected Result:** The page renders consistently across all major browsers. The heading, paragraph, and link text are identical. The "Learn more" link navigates to the same destination in all browsers. Minor rendering differences (font rendering, link color shade) are acceptable.
- **Priority:** Medium

---

### 9. SEO & Metadata

#### TC-SEO-001: Page has correct document title for search engines

- **Description:** Verify the `<title>` tag is present and meaningful.
- **Preconditions:** None
- **Steps:**
  1. View the page source of `https://example.com/`
  2. Locate the `<title>` tag
- **Expected Result:** The `<title>` element contains "Example Domain".
- **Priority:** Low

#### TC-SEO-002: Page uses proper semantic HTML

- **Description:** Verify the page uses semantic HTML elements appropriately.
- **Preconditions:** None
- **Steps:**
  1. Inspect the page source
- **Expected Result:** The page uses an `<h1>` for the main heading, `<p>` for the paragraph, and `<a>` for the link. The document has a proper `<!DOCTYPE html>` declaration and `<meta charset>` tag.
- **Priority:** Low

---

## Summary

| Category                 | Count  | High Priority | Medium Priority | Low Priority |
| ------------------------ | ------ | ------------- | --------------- | ------------ |
| Happy Path               | 3      | 2             | 1               | 0            |
| Navigation & Routing     | 6      | 3             | 3               | 0            |
| Edge Cases               | 3      | 0             | 0               | 3            |
| Boundary Conditions      | 2      | 0             | 1               | 1            |
| Accessibility            | 5      | 2             | 2               | 1            |
| Security                 | 3      | 1             | 1               | 1            |
| Performance & Loading    | 3      | 0             | 2               | 1            |
| Cross-Browser/Responsive | 4      | 0             | 2               | 2            |
| SEO & Metadata           | 2      | 0             | 0               | 2            |
| **Total**                | **31** | **8**         | **12**          | **11**       |

## Notes

- All test cases were derived from live browser interaction with `https://example.com/` on 2026-02-03.
- The page is intentionally minimal by design (it is a reserved example domain), so many typical web application test categories (forms, validation, authentication, dynamic content) do not apply.
- The "Learn more" link's href (`https://iana.org/domains/example`) differs from the final destination URL (`https://www.iana.org/help/example-domains`) due to server-side redirects. Tests should account for this redirect chain.
- No JavaScript was detected on the page, making it fully functional with JS disabled.
- The page background color is approximately #f0f0f0 (light gray) with dark text, providing good contrast.
