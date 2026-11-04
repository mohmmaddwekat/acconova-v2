import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { SkeletonList } from '../../components/ui/Skeleton';
import { Colors, Layout, Radius, Shadow, StatusText, Tint } from '../../constants/theme';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';

interface Invoice {
  id: number;
  number: string;
  party_name: string;
  date: string;
  total: number;
  balance_due: number;
  status: string;
  type: string;
}

type Filter = 'all' | 'open' | 'paid' | 'overdue';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'open', label: 'مفتوحة' },
  { key: 'paid', label: 'مدفوعة' },
  { key: 'overdue', label: 'متأخرة' },
];

const STATUS: Record<string, { label: string; fg: string; bg: string }> = {
  paid: { label: 'مدفوعة', fg: StatusText.success, bg: Tint.successBg },
  partial: { label: 'جزئي', fg: StatusText.warning, bg: Tint.warningBg },
  overdue: { label: 'متأخرة', fg: StatusText.danger, bg: Tint.dangerBg },
  draft: { label: 'مسودة', fg: Colors.textMuted, bg: Colors.bgSoft },
  pending: { label: 'مفتوحة', fg: StatusText.warning, bg: Tint.warningBg },
};

function matchesFilter(inv: Invoice, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'paid') return inv.status === 'paid';
  if (filter === 'overdue') return inv.status === 'overdue';
  return inv.status !== 'paid' && inv.status !== 'overdue';
}

export default function InvoicesScreen() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const fetchInvoices = useCallback(async () => {
    try {
      setFailed(false);
      const res = await api.get('/finance/documents', { params: { type: 'invoice', per_page: 50 } });
      const data = res.data?.data ?? res.data ?? [];
      setInvoices(Array.isArray(data) ? data : []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter(
      (i) => matchesFilter(i, filter) && (!q || `${i.number} ${i.party_name}`.toLowerCase().includes(q)),
    );
  }, [invoices, filter, query]);

  const totals = useMemo(
    () => ({
      open: invoices.filter((i) => matchesFilter(i, 'open')).reduce((s, i) => s + Number(i.balance_due || 0), 0),
      paid: invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.total || 0), 0),
      overdue: invoices.filter((i) => i.status === 'overdue').reduce((s, i) => s + Number(i.balance_due || 0), 0),
    }),
    [invoices],
  );

  return (
    <View style={styles.safe}>
      <ScreenHeader
        title="الفواتير"
        showBack={false}
        actionIcon="plus"
        actionLabel="فاتورة جديدة"
        onAction={() => router.push('/(tabs)/new-invoice')}
      />

      <View style={styles.searchWrap}>
        <Icon name="search" size={18} color={Colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="بحث عن فاتورة أو عميل..."
          placeholderTextColor={Colors.textFaint}
          style={styles.search}
          accessibilityLabel="بحث في الفواتير"
        />
      </View>

      {!loading && !failed && (
        <View style={styles.summary}>
          <View style={styles.sumItem}><Text style={[styles.sumNum, { color: StatusText.warning }]}>{formatMoney(totals.open, false)}</Text><Text style={styles.sumLabel}>مفتوحة</Text></View>
          <View style={[styles.sumItem, styles.sumMid]}><Text style={[styles.sumNum, { color: StatusText.success }]}>{formatMoney(totals.paid, false)}</Text><Text style={styles.sumLabel}>مدفوعة</Text></View>
          <View style={styles.sumItem}><Text style={[styles.sumNum, { color: StatusText.danger }]}>{formatMoney(totals.overdue, false)}</Text><Text style={styles.sumLabel}>متأخرة</Text></View>
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
          onAction={() => { setLoading(true); fetchInvoices(); }}
        />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchInvoices(); }} tintColor={Colors.accent} />}
          ListEmptyComponent={
            <EmptyState
              icon="file"
              title={query || filter !== 'all' ? 'لا توجد فواتير مطابقة' : 'لا توجد فواتير بعد'}
              message={query || filter !== 'all' ? 'جرّب بحثاً أو تصنيفاً آخر.' : 'أنشئ أول فاتورة لك الآن.'}
              actionLabel="إنشاء فاتورة"
              onAction={() => router.push('/(tabs)/new-invoice')}
            />
          }
          renderItem={({ item }) => {
            const s = STATUS[item.status] ?? { label: item.status, fg: Colors.textMuted, bg: Colors.bgSoft };
            return (
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [styles.card, pressed && { backgroundColor: Colors.bgSoft }]}
                onPress={() => router.push(`/(tabs)/invoice/${item.id}` as any)}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.invoiceNum}>{item.number}</Text>
                  <View style={[styles.badge, { backgroundColor: s.bg }]}>
                    <Text style={[styles.badgeText, { color: s.fg }]}>{s.label}</Text>
                  </View>
                </View>
                <Text style={styles.partyName}>{item.party_name}</Text>
                <View style={styles.cardBottom}>
                  <Text style={styles.date}>{item.date}</Text>
                  <View style={styles.amounts}>
                    <Text style={styles.total}>{formatMoney(item.total)}</Text>
                    {item.balance_due > 0 && <Text style={styles.due}>متبقي: {formatMoney(item.balance_due)}</Text>}
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginTop: 12, paddingHorizontal: 14,
    minHeight: 48, borderRadius: Radius.sm, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.line,
  },
  search: { flex: 1, fontSize: 15, color: Colors.text, textAlign: 'right', minHeight: 44 },
  summary: { flexDirection: 'row', backgroundColor: Colors.surface, marginTop: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.line },
  sumItem: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  sumMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.line },
  sumNum: { fontSize: 16, fontWeight: '800' },
  sumLabel: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  filters: { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.line, paddingHorizontal: 8 },
  filter: { flex: 1, minHeight: Layout.minTouch, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  filterOn: { borderBottomColor: Colors.accent },
  filterText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  list: { padding: 14, gap: 10, flexGrow: 1 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 14, gap: 8, borderWidth: 1, borderColor: Colors.line, ...Shadow.soft },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  invoiceNum: { fontSize: 15, fontWeight: '800', color: Colors.text },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  partyName: { fontSize: 14, color: Colors.textSoft, textAlign: 'right' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  date: { fontSize: 12, color: Colors.textMuted },
  amounts: { alignItems: 'flex-start', gap: 2 },
  total: { fontSize: 15, fontWeight: '800', color: Colors.text },
  due: { fontSize: 12, color: StatusText.warning },
});
