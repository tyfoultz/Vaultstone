// Type-only shim. Metro resolves `./pdf-parser` to `pdf-parser.native.ts`
// or `pdf-parser.web.ts` at bundle time; tsc uses this file. Both
// platform implementations expose the same surface — the web one actually
// works today, the native one throws until Phase 5c ships.
export * from './pdf-parser.web';
