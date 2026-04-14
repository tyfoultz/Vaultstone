// Type-only shim. Metro resolves `./db` to `db.native.ts` or `db.web.ts` at
// bundle time; tsc uses this declaration file so imports type-check. Both
// platform implementations expose the same surface.
export * from './db.native';
