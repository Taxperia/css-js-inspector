# Changelog

## 1.1.0 — 2026-11-12

- Replaced required access to all websites with user-initiated inspection and optional per-host grants.
- Added opt-in, per-site document-start JavaScript listener recording and controls to clear data/revoke grants.
- Restricted source fetching to authorized top-frame extension messages and HTTP/HTTPS text resources, without credentials, referrers or redirects; added size/time limits.
- Moved selection control into the isolated world and removed page-controlled selection messages.
- Added active-tab message filtering, bounded text caches and best-effort listener normalization.
- Added in-product/public privacy policies, MIT licensing, publishing instructions, listing copy and a public demo.
- Added automated background tests, manifest/icon validation and deterministic store packaging.

## 1.0.0

- Initial local version.
