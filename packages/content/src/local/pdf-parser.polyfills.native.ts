// Polyfills for pdfjs-dist/legacy under Hermes (React Native).
//
// Import this for its side effects BEFORE importing pdfjs:
//   import './pdf-parser.polyfills.native';
//
// Hermes is missing several browser-only globals that pdfjs touches. With
// `disableWorker: true`, text extraction does NOT exercise the rendering or
// worker-transfer code paths, so most of these are no-op stubs that exist
// only to prevent ReferenceErrors during pdfjs's own feature detection.
//
// Polyfills installed:
//   - btoa / atob       — real implementations via the `base-64` package
//   - structuredClone   — JSON-roundtrip fallback (only hit on worker path,
//                          which we disable; kept as insurance)
//   - DOMMatrix, Path2D, OffscreenCanvas, ImageData — no-op classes (rendering
//                          code paths only — text extraction never instantiates)
//   - URL.createObjectURL / revokeObjectURL — no-op (silences pdfjs warnings)
//
// NOT installed:
//   - Promise.withResolvers — pdfjs-dist@4.x legacy build self-polyfills
//   - Worker                — intentionally absent; pdfjs falls back to fake
//                              worker (main-thread) when GlobalWorkerOptions
//                              has no workerSrc and `disableWorker: true`
//   - TextDecoder / TextEncoder — Hermes on RN 0.79 ships these natively

import { decode as atobImpl, encode as btoaImpl } from 'base-64';

const g = globalThis as unknown as Record<string, unknown>;

if (typeof g.btoa !== 'function') {
  g.btoa = btoaImpl;
}
if (typeof g.atob !== 'function') {
  g.atob = atobImpl;
}

if (typeof g.structuredClone !== 'function') {
  g.structuredClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
}

class NoopClass {
  constructor(..._args: unknown[]) {}
}

if (typeof g.DOMMatrix === 'undefined') g.DOMMatrix = NoopClass;
if (typeof g.Path2D === 'undefined') g.Path2D = NoopClass;
if (typeof g.OffscreenCanvas === 'undefined') g.OffscreenCanvas = NoopClass;
if (typeof g.ImageData === 'undefined') g.ImageData = NoopClass;

const urlObj = g.URL as { createObjectURL?: unknown; revokeObjectURL?: unknown } | undefined;
if (urlObj) {
  if (typeof urlObj.createObjectURL !== 'function') {
    urlObj.createObjectURL = () => '';
  }
  if (typeof urlObj.revokeObjectURL !== 'function') {
    urlObj.revokeObjectURL = () => {};
  }
}
