# Frontend Security Reference

> **Version:** 1.0.0
> **Last Updated:** 2026-03-06
> **Applicability:** Web applications (React, Next.js, Vue, Svelte, vanilla JS)
> **Dependencies:** None (framework-agnostic patterns)

---

## Content Security Policy (CSP)

### HTTP Header Configuration

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{random}';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  font-src 'self';
  connect-src 'self' https://api.example.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  upgrade-insecure-requests;
```

### Key Directives

| Directive | Purpose | Recommended Value |
|---|---|---|
| `default-src` | Fallback for all resource types | `'self'` |
| `script-src` | JavaScript sources | `'self' 'nonce-{random}'` (never `'unsafe-eval'`) |
| `style-src` | Stylesheet sources | `'self'` (avoid `'unsafe-inline'` when possible) |
| `frame-ancestors` | Who can embed this page | `'none'` or `'self'` |
| `connect-src` | XHR/fetch/WebSocket targets | Explicit allowlist of API origins |
| `object-src` | Plugin content | `'none'` |

### Nonce-Based Script Allowlisting

Generate a cryptographically random nonce per request (server-side):

```javascript
// Server: generate nonce
const nonce = crypto.randomBytes(16).toString('base64');
// Attach to CSP header and pass to template

// HTML
<script nonce="{{nonce}}">/* inline script */</script>
```

### Report-Only Mode for Rollout

```
Content-Security-Policy-Report-Only: <policy>; report-uri /csp-report;
```

Use report-only first to detect violations before enforcing.

---

## XSS Prevention

### Input Sanitization

**Rule:** Sanitize on input only when storing markup. Default to rejecting HTML.

```javascript
// DOMPurify — the standard for HTML sanitization
import DOMPurify from 'dompurify';

const clean = DOMPurify.sanitize(userInput, {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
  ALLOWED_ATTR: ['href', 'title'],
  ALLOW_DATA_ATTR: false,
});
```

**Never use:**
- `innerHTML` with unsanitized data
- Dynamic code execution functions (Function constructor, setTimeout with strings)
- `document.write()`

### Output Encoding

| Context | Encoding Required | Method |
|---|---|---|
| HTML body | HTML entity encoding | Framework auto-escaping (React JSX, Vue templates) |
| HTML attributes | Attribute encoding | Framework handles; avoid unquoted attributes |
| JavaScript context | JavaScript encoding | `JSON.stringify()` for data injection |
| URL parameters | URL encoding | `encodeURIComponent()` |
| CSS values | CSS encoding | Avoid dynamic CSS from user input entirely |

### Framework-Specific Notes

- **React:** JSX auto-escapes by default. The `dangerouslySetInnerHTML` prop bypasses this protection — if you must use it, always sanitize with DOMPurify first.
- **Next.js:** Same as React. Server Components do not change XSS surface.
- **Vue:** `v-html` is unsafe — sanitize input. `{{ }}` auto-escapes.

### DOM-Based XSS Checklist

- Never pass user input to `element.innerHTML`, `element.outerHTML`
- Never use `location.href`, `location.hash`, `document.referrer` in sink functions without validation
- Audit `postMessage` handlers — validate `event.origin`

```javascript
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://trusted-origin.com') return;
  // process event.data
});
```

---

## CSRF Protection

### Token Pattern (Synchronizer Token)

```javascript
// Server generates token, embeds in page/meta tag
<meta name="csrf-token" content="{{csrfToken}}">

// Client includes in requests
fetch('/api/action', {
  method: 'POST',
  headers: {
    'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content,
  },
  body: JSON.stringify(data),
});
```

### Double-Submit Cookie Pattern

```javascript
// Server sets CSRF cookie (NOT HttpOnly so JS can read it)
Set-Cookie: csrf_token=<random>; SameSite=Strict; Secure; Path=/

// Client reads cookie, sends as header
headers: { 'X-CSRF-Token': getCookie('csrf_token') }

// Server compares cookie value to header value
```

### SameSite Cookie Defense

```
Set-Cookie: session=abc; SameSite=Lax; Secure; HttpOnly
```

- `SameSite=Lax` blocks cross-site POST (sufficient for most apps)
- `SameSite=Strict` blocks all cross-site requests (may break OAuth redirects)
- Always combine with token-based CSRF for defense in depth

---

## Secure Cookie Configuration

### Recommended Attributes

```
Set-Cookie: session_id=<value>;
  HttpOnly;
  Secure;
  SameSite=Lax;
  Path=/;
  Max-Age=3600;
  Domain=example.com;
```

| Attribute | Purpose | Default Setting |
|---|---|---|
| `HttpOnly` | Prevent JavaScript access | Always set for session cookies |
| `Secure` | HTTPS only | Always set in production |
| `SameSite` | Cross-site request control | `Lax` minimum |
| `Path` | Scope cookie to path | `/` or narrowest applicable path |
| `Max-Age` | Expiration in seconds | Session-appropriate (e.g., 3600 for 1hr) |
| `Domain` | Scope to domain | Omit to restrict to exact origin |

### Cookie Prefixes

```
Set-Cookie: __Host-session=abc; Secure; Path=/; HttpOnly
Set-Cookie: __Secure-token=xyz; Secure; HttpOnly
```

- `__Host-` requires `Secure`, `Path=/`, no `Domain` — strongest binding
- `__Secure-` requires `Secure` flag

---

## Client-Side Storage Security

### localStorage / sessionStorage

**Never store in localStorage:**
- JWTs (access or refresh tokens)
- Session identifiers
- PII or sensitive user data
- API keys

**Acceptable uses:** UI preferences, non-sensitive cached data, feature flags.

**If you must store tokens client-side:** Use `sessionStorage` (cleared on tab close) over `localStorage`, but prefer `HttpOnly` cookies.

### Security Considerations

```javascript
// Always validate data read from storage (treat as untrusted)
const prefs = JSON.parse(localStorage.getItem('prefs') || '{}');
if (typeof prefs.theme !== 'string' || !['light', 'dark'].includes(prefs.theme)) {
  prefs.theme = 'light';
}
```

- Any XSS vulnerability exposes all localStorage/sessionStorage data
- Never use dynamic code execution or `innerHTML` with storage contents
- Clear sensitive storage on logout: `sessionStorage.clear()`

---

## Clickjacking Prevention

### X-Frame-Options Header

```
X-Frame-Options: DENY
```

| Value | Behavior |
|---|---|
| `DENY` | Cannot be framed at all |
| `SAMEORIGIN` | Only same-origin framing |

### CSP frame-ancestors (Preferred)

```
Content-Security-Policy: frame-ancestors 'none';
```

Supersedes `X-Frame-Options`. Set both for backward compatibility.

### JavaScript Frame-Busting (Fallback)

```javascript
if (window.self !== window.top) {
  window.top.location = window.self.location;
}
```

Not reliable alone — use headers.

---

## Subresource Integrity (SRI)

### Usage for CDN-Loaded Resources

```html
<script
  src="https://cdn.example.com/lib.js"
  integrity="sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8w"
  crossorigin="anonymous"
></script>

<link
  rel="stylesheet"
  href="https://cdn.example.com/style.css"
  integrity="sha384-..."
  crossorigin="anonymous"
/>
```

### Generating Hashes

```bash
# Generate SRI hash
openssl dgst -sha384 -binary file.js | openssl base64 -A
# Or use: shasum -b -a 384 file.js | awk '{print $1}' | xxd -r -p | base64

# Or via npm
npx ssri file.js
```

**Always set `crossorigin="anonymous"` when using SRI with CDN resources.**

Self-hosted assets do not need SRI (same-origin trust).

---

## Secure Form Handling

### Validation Strategy

```
Client-side validation  -->  UX feedback (not security)
Server-side validation  -->  Actual security boundary
```

- Client validation is for user experience only; never trust it for security
- Always re-validate on server

### Input Constraints

```html
<!-- Constrain input types -->
<input type="email" name="email" maxlength="254" required>
<input type="text" name="phone" pattern="[0-9+\-\s]+" maxlength="20">
<input type="file" accept=".pdf,.docx" />

<!-- Disable autocomplete for sensitive fields -->
<input type="text" name="ssn" autocomplete="off">
```

### Form Submission Security

```html
<!-- Always use POST for state-changing operations -->
<form method="POST" action="/api/submit" autocomplete="off">
  <input type="hidden" name="_csrf" value="{{csrfToken}}">
  <!-- fields -->
</form>
```

### File Upload (Client-Side Checks)

```javascript
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

function validateFile(file) {
  if (file.size > MAX_SIZE) throw new Error('File too large');
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error('Invalid file type');
  // Server MUST re-validate — MIME type can be spoofed
}
```

---

## Quick Checklist

- [ ] CSP header configured and enforced (not report-only in production)
- [ ] No use of `innerHTML` or `document.write()` with user data
- [ ] No dynamic code execution with untrusted input
- [ ] CSRF tokens on all state-changing requests
- [ ] Session cookies: `HttpOnly`, `Secure`, `SameSite=Lax` minimum
- [ ] No secrets or tokens in localStorage
- [ ] `X-Frame-Options: DENY` and `frame-ancestors 'none'`
- [ ] SRI on all CDN-loaded scripts and styles
- [ ] All forms use POST, include CSRF token, validate server-side
- [ ] `postMessage` handlers validate `event.origin`
- [ ] `Referrer-Policy: strict-origin-when-cross-origin` header set
- [ ] `X-Content-Type-Options: nosniff` header set
- [ ] `Permissions-Policy` header restricts unnecessary browser APIs
