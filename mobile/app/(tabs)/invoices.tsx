import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { SkeletonList } from '../../components/ui/Skeleton';
import { Colors, Layout, Radius, Shadow, StatusText } from '../../constants/theme';
import { api } from '../../lib/api';
import { DocumentKind, DocumentRow, DocumentSummary, partyLabel, statusBadge, yesterdayISO } from '../../lib/documents';
import { formatMoney } from '../../lib/format';
import { useStyles } from '../../lib/theme';
import { Text } from '../../components/ui/Text';
import { TextInput } from '../../components/ui/TextInput';

type Filter = 'all' | 'open' | 'paid' | 'overdue';

const KINDS: { key: DocumentKind; label: string }[] = [
  { key: 'sale_invoice', label: 'المبيعات' },
  { key: 'purchase_invoice', label: 'المشتريات' },
];

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'open', label: 'مفتوحة' },
  { key: 'paid', label: 'مدفوعة' },
  { key: 'overdue', label: 'متأخرة' },
];

function filterParams(filter: Filter): Record<string, unknown> {
  if (filter === 'open') return { open_only: 1 };
  if (filter === 'paid') return { status: 'paid' };
  if (filter === 'overdue') return { open_only: 1, due_before: yesterdayISO() };
  return {};
}

export default function InvoicesScreen() {
  const styles = useStyles(createStyles);
  const router = useRouter();
  const [kind, setKind] = useState<DocumentKind>('sale_invoice');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [summary, setSummary] = useState<DocumentSummary | null>(null);
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
      const res = await api.get('/finance/documents', {
        params: { kind, per_page: 50, ...(search ? { search } : {}), ...filterParams(filter) },
      });
      setRows(Array.isArray(res.data?.data) ? res.data.data : []);
      setSummary(res.data?.summary ?? null);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [kind, filter, search]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const noun = kind === 'sale_invoice' ? 'مبيعات' : 'مشتريات';

  return (
    <View style={styles.safe}>
      <ScreenHeader
        title="الفواتير"
        showBack={false}
        actionIcon="plus"
        actionLabel="فاتورة جديدة"
        onAction={() =>
          router.push({ pathname: '/new-invoice', params: { kind: kind === 'sale_invoice' ? 'sale' : 'purchase' } })
        }
      />

      <View style={styles.kindToggle}>
        {KINDS.map((k) => (
          <Pressable
            key={k.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: kind === k.key }}
            onPress={() => setKind(k.key)}
            style={[styles.kindBtn, kind === k.key && styles.kindBtnOn]}
          >
            <Text style={[styles.kindText, kind === k.key && { color: Colors.accentStrong }]}>{k.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.searchWrap}>
        <Icon name="search" size={18} color={Colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="بحث برقم الفاتورة أو الطرف..."
          placeholderTextColor={Colors.textFaint}
          style={styles.search}
          accessibilityLabel="بحث في الفواتير"
        />
      </View>

      {summary && !failed && (
        <View style={styles.summary}>
          <View style={styles.sumItem}><Text style={[styles.sumNum, { color: StatusText.warning }]}>{formatMoney(summary.outstanding, false)}</Text><Text style={styles.sumLabel}>المتبقي</Text></View>
          <View style={[styles.sumItem, styles.sumMid]}><Text style={[styles.sumNum, { color: StatusText.success }]}>{formatMoney(summary.paid, false)}</Text><Text style={styles.sumLabel}>المدفوع</Text></View>
          <View style={styles.sumItem}><Text style={[styles.sumNum, { color: StatusText.danger }]}>{formatMoney(summary.overdue_amount, false)}</Text><Text style={styles.sumLabel}>متأخر</Text></View>
        </View>
      )}

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === f.key }}
            onPress={() => setFilter(f.key)}
            style={[styles.filter, filter === f.key && styles.filterOn]}
          >
            <Text style={[styles.filterText, filter === f.key && { color: Colors.accent }]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <SkeletonList rows={5} />
      ) : failed ? (
        <EmptyState
          icon="wifiOff"
          title="تعذّر تحميل الفواتير"
          message="تحقق من الاتصال ثم حاول مرة أخرى."
          actionLabel="إعادة المحاولة"
          onAction={() => { setLoading(true); load(); }}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
          ListEmptyComponent={
            <EmptyState
              icon="file"
              title={search || filter !== 'all' ? 'لا توجد فواتير مطابقة' : `لا توجد فواتير ${noun} بعد`}
              message={search || filter !== 'all' ? 'جرّب بحثاً أو تصنيفاً آخر.' : 'أنشئ أول فاتورة لك الآن.'}
              actionLabel="إنشاء فاتورة"
              onAction={() =>
                router.push({ pathname: '/new-invoice', params: { kind: kind === 'sale_invoice' ? 'sale' : 'purchase' } })
              }
            />
          }
          renderItem={({ item }) => {
            const s = statusBadge(item);
            return (
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [styles.card, pressed && { backgroundColor: Colors.bgSoft }]}
                onPress={() => router.push(`/invoice/${item.id}` as any)}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.invoiceNum}>{item.number}</Text>
                  <View style={[styles.badge, { backgroundColor: s.bg }]}>
                    <Text style={[styles.badgeText, { color: s.fg }]}>{s.label}</Text>
                  </View>
                </View>
                <Text style={styles.partyName}>{partyLabel(item.party)}</Text>
                <View style={styles.cardBottom}>
                  <Text style={styles.date}>{item.issue_date}</Text>
                  <View style={styles.amounts}>
                    <Text style={styles.total}>{formatMoney(item.total)}</Text>
                    {Number(item.balance_due) > 0 && (
                      <Text style={styles.due}>متبقي: {formatMoney(item.balance_due)}</Text>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  kindToggle: {
    flexDirection: 'row', margin: 16, marginBottom: 0, padding: 3, gap: 3, borderRadius: 12, backgroundColor: Colors.bgSoft,
  },
  kindBtn: { flex: 1, minHeight: Layout.minTouch, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  kindBtnOn: { backgroundColor: Colors.surface },
  kindText: { fontSize: 14, fontWeight: '800', color: Colors.textMuted },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, paddingHorizontal: 16,
    minHeight: 48, borderRadius: Radius.sm, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.line,
  },
  search: { flex: 1, fontSize: 15, color: Colors.text, textAlign: 'auto', minHeight: 44 },
  summary: { flexDirection: 'row', backgroundColor: Colors.surface, marginHorizontal: 16, marginTop: 16, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, ...Shadow.soft },
  sumItem: { flex: 1, paddingVertical: 16, alignItems: 'center', gap: 4 },
  sumMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.line },
  sumNum: { fontSize: 16, fontWeight: '800' },
  sumLabel: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  filter: { flex: 1, minHeight: Layout.minTouch, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line },
  filterOn: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  filterText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  list: { padding: 16, paddingTop: 0, gap: 12, flexGrow: 1 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 16, gap: 8, borderWidth: 1, borderColor: Colors.line, ...Shadow.soft },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  invoiceNum: { fontSize: 15, fontWeight: '800', color: Colors.text },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  partyName: { fontSize: 14, color: Colors.textSoft, textAlign: 'auto' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  date: { fontSize: 12, color: Colors.textMuted },
  amounts: { alignItems: 'flex-start', gap: 2 },
  total: { fontSize: 18, fontWeight: '800', color: Colors.text },
  due: { fontSize: 12, color: StatusText.warning },
});
