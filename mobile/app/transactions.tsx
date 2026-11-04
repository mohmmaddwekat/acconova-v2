import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { MovementRow } from '../components/MovementRow';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { SkeletonList } from '../components/ui/Skeleton';
import { Text } from '../components/ui/Text';
import { TextInput } from '../components/ui/TextInput';
import { Colors, Layout, Radius, Shadow, StatusText } from '../constants/theme';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useBottomInset } from '../lib/insets';
import { Movement } from '../lib/movements';
import { useStyles } from '../lib/theme';

type Direction = 'all' | 'incoming' | 'outgoing';

const FILTERS: { key: Direction; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'incoming', label: 'المقبوضات' },
  { key: 'outgoing', label: 'المدفوعات' },
];

interface Summary {
  posted_incoming: string;
  posted_outgoing: string;
  count: number;
}

export default function TransactionsScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const [direction, setDirection] = useState<Direction>('all');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Movement[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    try {
      setFailed(false);
      const { data } = await api.get('/finance/cash-movements', {
        params: {
          per_page: 50,
          status: 'posted',
          sort: 'date',
          sort_direction: 'desc',
          ...(direction !== 'all' ? { direction } : {}),
          ...(search ? { search } : {}),
        },
      });
      setRows(Array.isArray(data?.data) ? data.data : []);
      setSummary(data?.summary ?? null);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [direction, search]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  return (
    <View style={styles.flex}>
      {summary && !failed && (
        <View style={styles.summary}>
          <View style={styles.sumItem}>
            <Text style={[styles.sumNum, { color: StatusText.success }]}>{formatMoney(summary.posted_incoming)}</Text>
            <Text style={styles.sumLabel}>المقبوضات</Text>
          </View>
          <View style={styles.sumDivider} />
          <View style={styles.sumItem}>
            <Text style={[styles.sumNum, { color: StatusText.danger }]}>{formatMoney(summary.posted_outgoing)}</Text>
            <Text style={styles.sumLabel}>المدفوعات</Text>
          </View>
        </View>
      )}

      <View style={styles.searchWrap}>
        <Icon name="search" size={18} color={Colors.textMuted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="بحث بالاسم أو المرجع..." style={styles.search} accessibilityLabel="بحث في المعاملات" />
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: direction === f.key }}
            onPress={() => setDirection(f.key)}
            style={[styles.filter, direction === f.key && styles.filterOn]}
          >
            <Text style={[styles.filterText, direction === f.key && { color: Colors.accent }]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <SkeletonList rows={6} />
      ) : failed ? (
        <EmptyState icon="wifiOff" title="تعذّر تحميل المعاملات" message="تحقق من الاتصال أو من صلاحياتك ثم حاول مرة أخرى." actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); void load(); }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={Colors.accent} />}
          ListEmptyComponent={<EmptyState icon="banknote" title="لا توجد معاملات" message="ستظهر هنا سندات القبض والدفع المرحّلة." compact />}
          renderItem={({ item, index }) => (
            <Pressable accessibilityRole="button" onPress={() => setOpen(open === item.id ? null : item.id)}>
              <MovementRow movement={item} expanded={open === item.id} last={index === rows.length - 1} />
            </Pressable>
          )}
          ItemSeparatorComponent={undefined}
        />
      )}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  summary: { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.line, paddingVertical: 12 },
  sumItem: { flex: 1, alignItems: 'center', gap: 2 },
  sumNum: { fontSize: 17, fontWeight: '800' },
  sumLabel: { fontSize: 12, color: Colors.textMuted },
  sumDivider: { width: 1, backgroundColor: Colors.line },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, margin: 14, marginBottom: 8, paddingHorizontal: 14, minHeight: 48,
    borderRadius: Radius.sm, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.line,
  },
  search: { flex: 1, fontSize: 15, minHeight: 44 },
  filters: { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.line, paddingHorizontal: 8 },
  filter: { flex: 1, minHeight: Layout.minTouch, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  filterOn: { borderBottomColor: Colors.accent },
  filterText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  list: { margin: 14, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, overflow: 'hidden', flexGrow: 0, ...Shadow.soft },
});
