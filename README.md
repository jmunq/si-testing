# si-testing

Skeleton replica of the Banorte Seguros Digitales gadget insurance flow (`segurosdigitales.segurosbanorte.com`) for reproducing bugs with Qualtrics Session Replay.

## How it works — multi-page, not SPA

The real site uses **separate HTML documents** for each "process", even though it looks like an SPA. Navigating between processes causes a **full page load** that re-requests SIE and all assets.

This test site replicates that behavior:

| File | Serves for | Steps |
|------|-----------|-------|
| `gadget-quote.html` | `CreateGadgetQuotePublicProcess` | 1 (Device) → 2 (Coverage) |
| `secure-things.html` | `CreateSecureThingsProcess` | 3 (Personal data) → 4 (Payment) → 5 (Confirmation) |

- **Within** a process page: sub-steps use `history.pushState` (no reload, SIE stays loaded)
- **Between** process pages: uses `window.location.href` (full page navigation, SIE re-loads)
- Form data passes between pages via `sessionStorage`

This means when you go from step 2 → step 3, the browser loads a brand new HTML document, and you'll see SIE re-requested in the Network tab — exactly like the real site.

## Quick start

1. **Generate SSL certs** (if you don't have them):
   ```bash
   openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"
   ```

2. **Start the server**:
   ```bash
   npm start
   ```

3. **Open**: https://localhost:8443 (redirects to the first process page)

## Server routing

- `/page/.../CreateGadgetQuotePublicProcess` → `gadget-quote.html`
- `/page/.../CreateSecureThingsProcess` → `secure-things.html`
- `/sr-proxy/...` → proxied to `sr.st3.qualtrics.com` (CORS fix)
- `/` → redirects to the first process
