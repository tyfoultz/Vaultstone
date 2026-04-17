# World Builder — Section Templates

Versioned, immutable JSON descriptors that drive the structured-fields form
above every page's body. Each file name is `<key>.v<N>.json`.

## Rules

1. **Published files are immutable.** Once a file is checked into `master` and
   any production page has been created against it, that file must not change
   in any way that alters its SHA-256 hash. The CI hash check
   (`scripts/check-template-hashes.ts`, chained into `npm run typecheck`)
   enforces this.
2. **Additive field changes require a new version.** To add, remove, or retype
   a field, create a new file `<key>.v<N+1>.json`. Existing pages keep their
   pinned version forever; new pages pick up the latest.
3. **Field keys are `snake_case` identifiers.** They become JSON keys in
   `world_pages.structured_fields`, so treat them like column names.
4. **`accentToken` drives the visual accent** on the `PageHead`. Allowed:
   `primary`, `player`, `gm`, `cosmic`, `danger`.

## API

```ts
import { getTemplate, getLatestVersion, listTemplates } from '@vaultstone/content';

getTemplate('locations');            // latest version
getTemplate('locations', 1);         // specific version
getLatestVersion('locations');       // -> 1
listTemplates();                     // [{ key, label, latestVersion, ... }]
```

## Adding a new version

1. Copy `<key>.vN.json` → `<key>.vN+1.json`, modify fields.
2. Register the new file in `index.ts`.
3. Run `npm run typecheck` — the hash check will accept the new file and
   append its hash to `template-hashes.json`. Commit the updated JSON.

## Hash drift

If a hash for a previously-published `key@version` ever changes, the CI
script exits non-zero. That means someone edited a published template file
in place — revert the edit and bump the version instead.
