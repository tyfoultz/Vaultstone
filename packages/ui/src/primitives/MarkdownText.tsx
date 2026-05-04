// Lightweight markdown renderer for long-form description text. Built up
// over time as imported content surfaced more shapes than raw passthrough
// could handle.
//
// What we handle:
//   * Pipe tables — | header1 | header2 | / |---|---| / row rows
//   * Plain prose around tables — splits the input into prose / table
//     segments and emits the right component for each.
//   * Inline bold / italic — `**foo**` and `*foo*` become weight-bold and
//     italic spans inside paragraphs. The import flow's `entriesToText`
//     produces `**Name.**` prefixes for every named sub-entry, so this is
//     load-bearing for readability.
//   * Heading markers (`### foo`) — the `#` prefix is dropped and the
//     line renders as a bold paragraph. Doesn't escalate to display
//     typography; just stops the markers leaking through as raw text.
//   * Blockquote markers (`> foo`) — the `> ` prefix is dropped. Carryover
//     from older imports that emitted `> [... not yet supported]`
//     placeholder lines for unhandled block types; those lines now drop
//     entirely so the leftover prose looks clean even on legacy data.
//
// What we don't handle (intentionally):
//   * Inline code / links — passthrough. Rare in the imported content.
//   * Nested tables, multi-row headers, alignment markers (:---:). The SRD
//     content we've seen sticks to the simple pipe-table shape.
//
// Cross-platform: we render the table as a flex-based grid (row of header
// cells, then row of cells per data row). Native and web share the same
// rendering path; no <table> element is used.

import { View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { colors, radius, spacing } from '../tokens';

// `variant` and `family` mirror Text's props so callers can carry their
// existing typographic treatment through to the prose segments without
// re-specifying.
type TextVariant = React.ComponentProps<typeof Text>['variant'];
type TextFamily = React.ComponentProps<typeof Text>['family'];

type Props = {
  children: string;
  /** Applied to prose <Text> segments. */
  variant?: TextVariant;
  family?: TextFamily;
  /** Style for prose paragraphs. */
  style?: StyleProp<TextStyle>;
  /** Wrapper around tables (margin/padding adjustments per surface). */
  tableStyle?: StyleProp<ViewStyle>;
};

type Segment =
  | { kind: 'text'; content: string }
  | { kind: 'table'; headers: string[]; rows: string[][] };

export function MarkdownText({
  children,
  variant = 'body-sm',
  family = 'body',
  style,
  tableStyle,
}: Props) {
  const segments = parseSegments(children);

  return (
    <>
      {segments.map((seg, i) =>
        seg.kind === 'text' ? (
          <ProseParagraph
            key={i}
            content={seg.content}
            variant={variant}
            family={family}
            style={style}
          />
        ) : (
          <MarkdownTable
            key={i}
            headers={seg.headers}
            rows={seg.rows}
            style={tableStyle}
          />
        ),
      )}
    </>
  );
}

// ── Prose with inline markdown ────────────────────────────────────────────

/**
 * Render one prose segment, decoded into:
 *   - inline `**bold**` and `*italic*` runs
 *   - leading `### ` / `#### ` heading markers stripped (the line still
 *     renders as a bold paragraph so the visual hierarchy survives)
 *   - leading `> ` blockquote markers stripped (legacy imports embedded
 *     `> [block not yet supported]` placeholders that live in old DB
 *     rows; new imports drop them silently)
 *
 * Renders as one Text per *line* so leading-marker-style transforms
 * (heading, blockquote) can be applied cleanly without bleeding across
 * paragraphs. Native React Native nests Text-in-Text for inline runs.
 */
function ProseParagraph({
  content, variant, family, style,
}: {
  content: string;
  variant: TextVariant;
  family: TextFamily;
  style?: StyleProp<TextStyle>;
}) {
  const lines = content.split('\n').map(decorateLine).filter((l) => l !== null) as DecoratedLine[];
  return (
    <>
      {lines.map((line, i) => {
        // Add a bit of top margin to sub-label lines so they read as
        // section breaks within a feature description. Skip the first
        // line — the parent already controls leading spacing.
        const subLabelStyle = line.subLabel && i > 0 ? { marginTop: spacing.xs } : null;
        return (
          <Text key={i} variant={variant} family={family} style={[style, subLabelStyle]}>
            {line.spans.map((span, j) => renderSpan(span, j, line.heading))}
          </Text>
        );
      })}
    </>
  );
}

type Span =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string };

type DecoratedLine = {
  /** Inline runs that compose the line. */
  spans: Span[];
  /** Whole line was originally a heading (`### foo`, `## foo`, etc.). */
  heading: boolean;
  /** Line opens with a `**Sub-Label.** …` prefix — the named sub-entry
   *  shape that `entriesToText` emits for nested 5e.tools blocks. We
   *  give these a bit of top margin so dense imported descriptions
   *  (Artificer Spellcasting, etc.) don't read as a wall of text. */
  subLabel: boolean;
};

/**
 * Strip leading line-level markers and decode inline `**bold**` /
 * `*italic*` runs. Returns null for lines that should be dropped
 * entirely (legacy `> [... not yet supported]` placeholders).
 */
function decorateLine(rawLine: string): DecoratedLine | null {
  let line = rawLine;
  // Drop the legacy "block not yet supported" / "item not yet supported"
  // placeholder lines that older imports embedded for unhandled
  // 5e.tools block types. Matches both standalone (`> [block not yet
  // supported]`) and bullet-wrapped (`- > [item not yet supported]`)
  // forms — the wrapped form lives inside list items emitted by older
  // entriesToText runs and falls through here as one rendered line.
  if (/^(?:-\s+)?>\s*\[[^\]]*not yet supported[^\]]*\]\s*$/.test(line.trim())) return null;
  // Strip a leading `> ` blockquote marker (carryover from older
  // imports). We don't render blockquote chrome — the prose stands on
  // its own.
  line = line.replace(/^\s*>\s?/, '');
  // Heading prefixes: `# `, `## `, `### `, etc. Strip and flag the line
  // so the renderer can emphasize it.
  let heading = false;
  const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
  if (headingMatch) {
    heading = true;
    line = headingMatch[2];
  }
  // A leading `**Label.** ` (or `**Label** `) marks a named sub-entry
  // that originated in a nested 5e.tools entries block. We flag it so
  // the renderer can space it out from the preceding paragraph.
  const subLabel = !heading && /^\*\*[^*\n]+?\*\*\s/.test(line);
  return { spans: parseInlineSpans(line), heading, subLabel };
}

/**
 * Walk the line looking for `**bold**` / `*italic*` runs. The grammar
 * is intentionally simple: we don't support escaping or nested
 * emphasis. Multiple runs per line are fine.
 */
function parseInlineSpans(line: string): Span[] {
  const spans: Span[] = [];
  // Match `**...**` (bold) before single-`*...*` (italic). Both must
  // capture non-greedily so adjacent runs don't merge. The trailing
  // marker is required to avoid swallowing stray asterisks.
  const pattern = /\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line)) !== null) {
    if (match.index > lastIndex) {
      spans.push({ kind: 'text', text: line.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) {
      spans.push({ kind: 'bold', text: match[1] });
    } else if (match[2] !== undefined) {
      spans.push({ kind: 'italic', text: match[2] });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < line.length) {
    spans.push({ kind: 'text', text: line.slice(lastIndex) });
  }
  if (spans.length === 0) {
    spans.push({ kind: 'text', text: line });
  }
  return spans;
}

function renderSpan(span: Span, key: number, heading: boolean): React.ReactNode {
  // Heading lines render as bold prose. Inline `**bold**` runs inside a
  // heading line stay bold (the merge is a no-op visually).
  if (span.kind === 'bold' || heading) {
    return (
      <Text key={key} weight="bold">
        {span.text}
      </Text>
    );
  }
  if (span.kind === 'italic') {
    return (
      <Text key={key} style={{ fontStyle: 'italic' }}>
        {span.text}
      </Text>
    );
  }
  return span.text;
}

// ── Parsing ───────────────────────────────────────────────────────────────

/**
 * Split the input into ordered prose / table segments. A line counts as
 * the start of a table when:
 *   1. It looks like a row (`| ... | ... |`)
 *   2. The next line is a separator (`|---|---|`) — colons allowed for
 *      future alignment hints, ignored here
 * Everything between consecutive table boundaries is prose; trailing
 * empty paragraphs are trimmed so we don't render a stray blank line.
 */
function parseSegments(src: string): Segment[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: Segment[] = [];
  let prose: string[] = [];

  function flushProse() {
    if (prose.length === 0) return;
    const joined = prose.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (joined.length > 0) out.push({ kind: 'text', content: joined });
    prose = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTableHeader = isPipeRow(line) && i + 1 < lines.length && isSeparator(lines[i + 1]);
    if (!isTableHeader) {
      prose.push(line);
      continue;
    }

    // Found a table — flush any prose, then consume header + separator +
    // body rows until we hit a non-row line or end of input.
    flushProse();
    const headers = parsePipeRow(line);
    const rows: string[][] = [];
    let j = i + 2;
    while (j < lines.length && isPipeRow(lines[j])) {
      rows.push(parsePipeRow(lines[j]));
      j++;
    }
    out.push({ kind: 'table', headers, rows });
    i = j - 1;
  }

  flushProse();
  return out;
}

/** Anything that starts with `|` and ends with `|` after trimming. */
function isPipeRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2;
}

/** Header separator row — cells are runs of dashes, with optional colons. */
function isSeparator(line: string): boolean {
  if (!isPipeRow(line)) return false;
  const cells = parsePipeRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c.trim()));
}

/** Split `| a | b | c |` into ['a', 'b', 'c']. */
function parsePipeRow(line: string): string[] {
  const trimmed = line.trim();
  // Strip the leading and trailing pipes so we don't get phantom empty
  // cells on either end.
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map((cell) => cell.trim());
}

// ── Table component ───────────────────────────────────────────────────────

function MarkdownTable({
  headers,
  rows,
  style,
}: {
  headers: string[];
  rows: string[][];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          marginVertical: spacing.sm,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.outlineVariant,
          overflow: 'hidden',
          backgroundColor: colors.surfaceContainerLow,
        },
        style,
      ]}
    >
      {/* Header row */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: colors.surfaceContainerHigh,
          borderBottomWidth: 1,
          borderBottomColor: colors.outlineVariant,
        }}
      >
        {headers.map((h, i) => (
          <Cell
            key={i}
            isLast={i === headers.length - 1}
            isHeader
          >
            {h}
          </Cell>
        ))}
      </View>

      {/* Body rows */}
      {rows.map((row, ri) => (
        <View
          key={ri}
          style={{
            flexDirection: 'row',
            borderBottomWidth: ri === rows.length - 1 ? 0 : 1,
            borderBottomColor: colors.outlineVariant + '55',
          }}
        >
          {/* Pad short rows so cells align; never trim cells off long rows. */}
          {Array.from({ length: Math.max(headers.length, row.length) }, (_, ci) => (
            <Cell key={ci} isLast={ci === Math.max(headers.length, row.length) - 1}>
              {row[ci] ?? ''}
            </Cell>
          ))}
        </View>
      ))}
    </View>
  );
}

function Cell({
  children,
  isLast,
  isHeader,
}: {
  children: string;
  isLast: boolean;
  isHeader?: boolean;
}) {
  return (
    <View
      style={{
        flex: 1,
        paddingHorizontal: spacing.sm + 2,
        paddingVertical: spacing.xs + 2,
        borderRightWidth: isLast ? 0 : 1,
        borderRightColor: colors.outlineVariant + '55',
      }}
    >
      <Text
        variant="body-sm"
        family="body"
        weight={isHeader ? 'bold' : 'regular'}
        style={{ color: isHeader ? colors.onSurface : colors.onSurfaceVariant }}
      >
        {children}
      </Text>
    </View>
  );
}
