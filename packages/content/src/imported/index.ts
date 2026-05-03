// Imported-content transforms.
//
// The on-device storage / resolver tier this module used to host was
// retired when imports were unified with homebrew packs. Imported entries
// now write to Supabase via the imported_content table (see
// packages/api/src/imported-content.ts) and surface through the homebrew
// resolver under their parent pack. The transforms remain — they take a
// raw third-party JSON payload (e.g. 5e.tools class.json) and produce
// our `*Result` shapes ready for upsert.

export { transformSubclasses } from './transform/subclasses';
export type { RawClassFile, TransformOptions } from './transform/subclasses';
export { stripMarkup } from './transform/markup';
