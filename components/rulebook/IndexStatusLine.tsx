import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '@vaultstone/ui';
import type { IndexMeta } from '@vaultstone/content';

type Props = {
  status: IndexMeta | undefined;
  onRetry: () => void;
};

// Per-PDF index status row. Lifted from app/campaign/[id]/rulebook.tsx so the
// new Game-Systems-side rulebook surface can reuse it verbatim.
export function IndexStatusLine({ status, onRetry }: Props) {
  if (!status || status.status === 'not_indexed') {
    return (
      <TouchableOpacity onPress={onRetry}>
        <Text style={s.indexAction}>Not indexed — Index now</Text>
      </TouchableOpacity>
    );
  }
  if (status.status === 'indexing') {
    const done = status.pages_indexed;
    const total = status.total_pages;
    return (
      <View style={s.indexRow}>
        <ActivityIndicator size="small" color={colors.brand} />
        <Text style={s.indexMuted}>
          Indexing… {total ? `${done}/${total}` : `${done}`}
        </Text>
      </View>
    );
  }
  if (status.status === 'failed') {
    return (
      <View>
        <TouchableOpacity onPress={onRetry}>
          <Text style={s.indexError}>Indexing failed — Retry</Text>
        </TouchableOpacity>
        {status.error ? (
          <Text style={s.indexMuted} numberOfLines={3}>
            {status.error}
          </Text>
        ) : null}
      </View>
    );
  }
  return (
    <Text style={s.indexMuted}>
      ✓ Indexed{status.total_pages ? ` · ${status.total_pages} pages` : ''}
    </Text>
  );
}

const s = StyleSheet.create({
  indexRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  indexMuted: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  indexAction: { fontSize: 11, color: colors.brand, fontWeight: '600', marginTop: 2 },
  indexError: { fontSize: 11, color: colors.hpDanger, fontWeight: '600', marginTop: 2 },
});
