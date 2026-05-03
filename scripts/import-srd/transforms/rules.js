// Transform a snapshot of Open5e v2's /rules endpoint into the
// RuleResult[] shape consumed by packages/content/src/srd/data/rules.json.
//
// Open5e ships rules-of-play prose as flat leaf entries — each entry is
// a single section (e.g. "Advantage and Disadvantage", "Cover", "Initiative")
// with a `ruleset` slug naming its parent chapter and an `index` for
// display order within the chapter. There is no separate /rule-sections/
// endpoint — /rules/ already returns leaves.
//
// Edition note: 2014 and 2024 use entirely different chapter taxonomies
// (the 2024 SRD reorganized everything), and entry names rarely line up
// 1:1 across editions. We emit one RuleResult per (entry, edition) pair
// and let the version filter pick the right slice. This mirrors how
// conditions.js handles per-edition divergence.

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', '..', '..', 'vendor', 'srd', 'open5e', 'rules.json');
const OUT = path.join(__dirname, '..', '..', '..', 'packages', 'content', 'src', 'srd', 'data', 'rules.json');

const DOC_TO_VERSION = {
  'srd-2014': 'SRD_5.1',
  'srd-2024': 'SRD_2.0',
};

const VERSION_TO_SLUG = {
  'SRD_5.1': '5-1',
  'SRD_2.0': '2-0',
};

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Convert Open5e's chapter slug ("srd_combat-sequence", "srd-2024_the-six-abilities")
 * into a display label ("Combat Sequence", "The Six Abilities"). The
 * `srd_` / `srd-2024_` prefix is the document tag and gets stripped.
 */
function chapterLabel(rulesetSlug) {
  if (!rulesetSlug) return 'General';
  const stripped = rulesetSlug
    .replace(/^srd-2024_/, '')
    .replace(/^srd_/, '');
  return stripped
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

function normalizeDescription(s) {
  if (!s) return '';
  return String(s).replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Snapshot missing: ${SRC}`);
    console.error(`Run \`node scripts/import-srd/fetch-open5e.js rules\` first.`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const out = [];

  for (const r of raw) {
    const srdVersion = DOC_TO_VERSION[r.document];
    if (!srdVersion) continue;
    if (!r.name || !r.desc) continue;

    const editionSuffix = VERSION_TO_SLUG[srdVersion];
    const chapterSlug = r.ruleset
      ? r.ruleset.replace(/^srd-2024_/, '').replace(/^srd_/, '')
      : 'general';
    const nameSlug = slugify(r.name);

    out.push({
      key: `${chapterSlug}-${nameSlug}-srd-${editionSuffix}`,
      name: r.name,
      type: 'rule',
      tier: 'srd',
      system: 'dnd5e',
      description: normalizeDescription(r.desc),
      chapter: chapterLabel(r.ruleset),
      // Open5e's `index` is per-chapter ordering; preserve it so the UI
      // can render sections in document order rather than alphabetical.
      order: typeof r.index === 'number' ? r.index : 0,
      srdVersions: [srdVersion],
      data: {
        // Header level from the upstream document — useful if we ever
        // want to render visual hierarchy (h2 vs h3 vs h4 sections).
        headerLevel: typeof r.initialHeaderLevel === 'number' ? r.initialHeaderLevel : 2,
        rulesetSlug: r.ruleset ?? null,
      },
    });
  }

  // Sort by chapter, then by order within chapter, then by edition.
  // Catalog browsing without filters reads this top-to-bottom by chapter.
  out.sort((a, b) =>
    a.chapter.localeCompare(b.chapter) ||
    a.order - b.order ||
    a.srdVersions[0].localeCompare(b.srdVersions[0]),
  );

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${out.length} rules → ${path.relative(process.cwd(), OUT)}`);

  const byVersion = out.reduce((acc, r) => {
    const k = r.srdVersions[0];
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  console.log('  By edition:', byVersion);

  const chapters = {};
  for (const r of out) {
    const v = r.srdVersions[0];
    if (!chapters[v]) chapters[v] = new Set();
    chapters[v].add(r.chapter);
  }
  for (const v of Object.keys(chapters)) {
    console.log(`  Chapters (${v}): ${chapters[v].size}`);
  }
}

main();
