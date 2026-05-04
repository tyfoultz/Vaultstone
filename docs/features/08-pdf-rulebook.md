# Feature 8: PDF Rulebook — superseded

> The original spec for this feature treated PDFs as a content-extension
> mechanism: extract text on-device, FTS5-index it, surface page hits
> through the ContentResolver. That direction was dropped.
>
> The replacement is the **imported content tier** — users supply
> structured JSON (e.g. 5e.tools content packs), Vaultstone parses
> on-device and merges entries into the system content as a first-class
> tier with the same dedupe/search story as SRD/homebrew. PDFs still
> exist as an in-app *reading* affordance, but contribute nothing to
> the content resolver.
>
> See [docs/architecture.md](../architecture.md) — "Content Tiers" and
> "Imported Content Pipeline" sections — and the
> "Imported content tier" / "PDF reader" notes in
> [CLAUDE.md](../../CLAUDE.md) for the current architecture.
>
> The build-status entry for this work lives at
> [docs/build-status.md § 8](../build-status.md#8-imported-content--pdf-reader--shipped).

---

## Why the change

- **Extraction quality.** PDF text extraction is variable; even with
  dedicated per-book parsers the output needs cleanup before it's usable
  as structured game content.
- **Engineering burden.** Maintaining FTS5 + IndexedDB + Hermes
  polyfills + a PDF parser was a real ongoing weight, including a
  deferred native verification we'd never collected.
- **Legal posture.** Imported JSON inherits the same on-device-only
  constraint as PDFs, so the legal model didn't get worse, but the
  *user-facing message* gets clearer ("you're providing the data" vs
  "Vaultstone is extracting copyrighted material from your PDF").

The historical sketch of this feature is preserved in git history
(`feature/imported-content` cleanup commit) for archaeological purposes.
