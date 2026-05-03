// Type-only shim. Metro resolves `./db` to db.native.ts on iOS/Android and
// db.web.ts in Expo web; tsc uses this declaration so imports type-check.
// Both platform implementations expose the same surface.
export * from './db.native';
