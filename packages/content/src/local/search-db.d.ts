// Type-only shim. Metro resolves `./search-db` to `search-db.native.ts` or
// `search-db.web.ts` at bundle time; tsc uses this declaration file so imports
// type-check. Both platform implementations expose the same surface.
export * from './search-db.native';
