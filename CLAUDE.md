# CLAUDE.md

Chrome MV3 extension that scrapes Amazon.com product listings into the COMPRAFACIL CSV template. There is no build step and no dependencies: plain ES modules loaded "unpacked". Documentation for humans lives in `docs/` (Spanish).

## Working with the user
- The user (Aldair, COMPRAFACIL) writes in Spanish and is new to Git/GitHub. Reply in Spanish, explain Git steps plainly, and offer to run commands.
- Pattern: the user asks for a change, you implement and verify it, bump the version, then wait for "súbelo"/"publícalo" before pushing or tagging. Pushing to `main` is visible to every installed extension, because config.json and categories.json are served raw from it.

## Architecture (see docs/DESARROLLO.md)
- `popup.js` injects `scraper.js` and calls `globalThis.__amazonScraper(config, options)`. All page-specific selectors live in `config.layouts` (JSON), not in code.
- MV3 forbids remote code. Only data is fetched: `config.json` (selectors, CSV columns, version notice) and `categories.json`, both from raw.githubusercontent.com on `main`.
- `categories.js`: GitHub, then cache, then the bundled `categories.json`. The `categorias.yml` workflow logs in to the COMPRAFACIL API with the repo secrets `CF_EMAIL`/`CF_PASSWORD` (JWT, no "Bearer") and commits `categories.json` when the data changes. As of 2026-09-30 those secrets are NOT created yet (see docs/PENDIENTES.md).
- `history.js`: per-user history in `chrome.storage.sync`, one key per page (`h_<fnv-hash>`), capped at 150 entries.
- Never build DOM from remote data with innerHTML; use textContent.

## Release checklist
1. Bump `manifest.json` version, then in both `config.json` and `config.default.json` set `latestVersion` and increment `revision`.
2. Commit and push to `main`, then `git tag vX.Y.Z && git push origin vX.Y.Z`. `release.yml` checks that the tag matches the manifest and publishes the zip.
3. Selector or CSV-only fixes need no release: edit `config.json`, bump `revision`, push.

## Rules
- The repo is PUBLIC: never commit tokens, passwords, VPS IPs or SSH details. Credentials go in GitHub Secrets.
- UI text and code comments are in Spanish. Keep modules small and dependency-free.
- CSS: `[hidden]{display:none !important}` exists because component `display` rules override the attribute. Keep it.
- Verify before claiming done: `node --input-type=module --check < file.js`, jsdom simulations with a fake `chrome` for popup flows, and headless Chrome screenshots for UI changes. Tell the user what was NOT tested in real Chrome.
