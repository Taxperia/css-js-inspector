# Release verification — 1.1.0

Date: 2026-11-12.

## Automated checks

`node --test tests/background.test.cjs`: 9 passing tests, using mocked Chrome APIs and network responses. These cover credential/referrer/redirect options, missing host grants, invalid protocols and embedded credentials, sender/frame restrictions, MIME rejection, declared and streamed size caps, network/HTTP failures, and per-site early registration/disable behavior.

`python scripts/package.py`: checks Manifest V3, description length (114/132), expected permissions, absence of required all-site access/default content scripts, icon dimensions, identical bundled/public privacy policies, all JavaScript syntax, and exact ZIP entries and bytes. The 13-file runtime package excludes documents, tests, browser profiles, backups and Git metadata.

## Browser verification

The production manifest and extension were loaded in a fresh Chrome for Testing 151.0.7922.34 profile, with no user account or existing browsing data. A local loopback fixture served only the public demo files.

- Default installation had no host grants and did not inject automatic content scripts.
- Toolbar invocation granted temporary tab access and opened the real side panel. An initial panel/activeTab integration issue was fixed by opening the panel directly from the action click; the minimum Chrome version is now 116.
- Selecting the demo button displayed its actual HTML, five matched CSS selectors, computed values and the ::after content.
- The demo button's own click counter stayed unchanged during selection.

For the already-granted optional-permission path, a second disposable test copy added **only** a required loopback host permission. The released manifest was not changed to include it.

- The real early-recording control registered exactly one MAIN-world document_start script for the test host.
- After reload, the real JS tab showed showClickCount, its source text and demo.js line 5.
- The Files tab listed demo.css/demo.js and retrieved the CSS text through the real service worker.
- Clearing inspection data removed the current HTML and selection; a forged old-style page “picked” message did not restore them.
- Disabling early recording removed the dynamic script registration.
- Three actual-runtime screenshots were saved; their composition and fixture details are documented in store/screenshots/README.md.

The optional native permission confirmation was not approved through automation. The mocked tests cover denied/granted results; the browser's already-granted path uses the loopback-only fixture described above. Final manual Chrome checks, including optional grant/revoke prompts and clipboard behavior, are listed in STORE_GUIDE_TR.md. Edge and older Chrome releases were not exercised.
