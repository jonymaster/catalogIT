# Email templates

CatalogIT sends **renewal reminder emails** (and **Gmail test emails** from Integrations) using HTML you provide. In the web app, you **upload** an HTML file (and optional images). **Settings → Notifications** is where you do that.

**Gmail account connection** (OAuth) is separate: **Settings → Integrations → Gmail**.

---

## 1. What you need

| Goal | Where |
|------|--------|
| Upload email HTML (and optional images) | **Settings → Notifications** |
| Use the built-in default (no upload) | Do nothing; the API ships a default layout |
| Connect Google to send mail | **Settings → Integrations → Gmail** |

Object storage (MinIO or S3) must be configured for uploads. Local Docker Compose includes MinIO.

---

## 2. Canned template (starting point)

The repo includes a layout you can copy and edit:

| File | Purpose |
|------|---------|
| [`email-templates/catalogit-renewal.html`](../email-templates/catalogit-renewal.html) | Copy, customize, then upload in the app. |

The running API also bundles the same design as the default when **no** custom template is stored.

---

## 3. In the web app (upload only)

1. Sign in as an **admin**.
2. Open **Settings → Notifications**.
3. Under **Email template**, choose your **HTML file** and optional **images**, then **Upload HTML + images**.
4. Use **Preview HTML in new tab** to open a sample-rendered message in a new browser tab (your OS/browser handles display).
5. Use **Reset to default template** to clear your upload (and any legacy inline template data) and go back to the built-in HTML.

**Schedule and recipients** on the same page use **Save** as before (offsets, timezone, extra users).

**Images and `cid:` (inline):**

- Name files so the **base name** becomes the CID. Example: `logo.png` → in HTML use `src="cid:logo"`.
- Or use `{{logo_block}}` in your HTML and upload a `logo` image (e.g. `logo.png`).

---

## 4. Advanced (API only)

The REST API still allows setting subject, inline HTML, and plain text via `PATCH /api/settings/notifications` for automation or migration. The **browser UI** does not expose those fields; use upload or the built-in default.

---

## 5. Placeholders (Mustache)

Use double braces in your HTML. Unknown names become empty.

| Placeholder | Meaning |
|-------------|---------|
| `{{service_name}}` | Service name |
| `{{renewal_date}}` | Renewal date |
| `{{days_before}}` | Days until renewal |
| `{{owner_name}}` | Recipient display name |
| `{{title}}` | Title (e.g. test emails / `<title>`) |
| `{{recipient_name}}` | Same family as owner when sent |

Everything else is **static text inside your HTML file**.

---

## 6. Sending real renewal emails

1. Configure **Gmail** under **Settings → Integrations**.
2. Configure offsets and timezone under **Settings → Notifications**.
3. Schedule a daily job: `POST /api/internal/notifications/renewal-dispatch` with the `X-Cron-Secret` header (see main [README](../README.md) **Operations**).

---

## 7. Quick checklist

- [ ] Gmail connected (**Integrations**).
- [ ] Template uploaded, or you rely on the built-in default (**Notifications**).
- [ ] Preview in new tab looks right.
- [ ] **Send test email** from Integrations if you want to verify delivery.
- [ ] Cron job for renewal dispatch (production).
