# Working on auto-resume

This is a static, browser-local résumé editor. There is no server-side résumé database.

- Edit JavaScript in `src/`, HTML and CSS in `public/`, and build logic in `scripts/`.
- `dist/` is generated and ignored. Never edit it as the source of truth.
- Install with `npm ci`, run `npm test`, then `npm run build` for relevant changes.
- For rendering changes, also open the built app and verify an A4 preview, long-body pagination, and PDF export. Unit tests alone do not verify browser layout or native printing.
- Keep runtime assets local. Do not add telemetry, external fonts, or a résumé upload service without an explicit product decision.
- Preserve `.resume.json` compatibility or add an explicit migration with a schema version change.
- Use fictional fixtures. Do not commit real résumés, photos, downloaded PDFs, local deployment metadata, credentials, or absolute machine paths.
- Keep dependency notices in the build output and state whether a PDF export is image-based or text-based.
