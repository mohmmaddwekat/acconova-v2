import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { EmptyState } from '../../components/ui/EmptyState';
import { Gradient } from '../../components/ui/Gradient';
import { SkeletonList } from '../../components/ui/Skeleton';
import { Text } from '../../components/ui/Text';
import { Colors, Layout, Radius, Shadow, StatusText, Tint } from '../../constants/theme';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { t } from '../../lib/i18n';
import { useBottomInset } from '../../lib/insets';
import { useStyles } from '../../lib/theme';

type Obj = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);

const SEGMENT: Record<string, { label: string; fg: string; bg: string }> = {
  vip: { label: 'VIP', fg: StatusText.success, bg: Tint.successBg },
  active: { label: 'نشط', fg: Colors.accentStrong, bg: Tint.infoBg },
  at_risk: { label: 'معرّض للخطر', fg: StatusText.warning, bg: Tint.warningBg },
  inactive: { label: 'خامل', fg: Colors.textMuted, bg: Colors.bgSoft },
  high_profitability: { label: 'ربحية عالية', fg: StatusText.success, bg: Tint.successBg },
};

const CUSTOMER_FILTERS = [
  { key: 'all', label: 'الكل' }, { key: 'vip', label: 'VIP' }, { key: 'at_risk', label: 'معرّضون للخطر' },
  { key: 'inactive', label: 'خاملون' }, { key: 'high_profitability', label: 'الأعلى ربحية' },
];
const STOCK_TABS = [{ key: 'reorder', label: 'إعادة الطلب' }, { key: 'dead', label: 'مخزون راكد' }];

export default function IntelligenceScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const { kind } = useLocalSearchParams<{ kind: string }>();
  const customers = kind === 'customers';
  const [data, setData] = useState<Obj | null>(null);
  const [filter, setFilter] = useState('all');
  const [tab, setTab] = useState('reorder');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setFailed(null);
      const res = await api.get(customers ? '/customer-intelligence' : '/inventory/intelligence');
      setData((res.data?.data ?? res.data) as Obj);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setFailed(status === 403 ? 'ليست لديك صلاحية لعرض هذه الصفحة.' : 'تعذّر التحميل. تحقق من الاتصال.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [customers]);

  useEffect(() => { load(); }, [load]);

  const summary = (data?.summary ?? {}) as Obj;
  const rows: Obj[] = useMemo(() => {
    if (!data) return [];
    if (customers) {
      const all = (Array.isArray(data.customers) ? data.customers : []) as Obj[];
      return filter === 'all' ? all : all.filter((c) => ((c.segments as string[]) ?? []).includes(filter));
    }
    return (Array.isArray(tab === 'reorder' ? data.reorder_suggestions : data.dead_stock) ? (tab === 'reorder' ? data.reorder_suggestions : data.dead_stock) : []) as Obj[];
  }, [data, customers, filter, tab]);

  const title = customers ? 'ذكاء العملاء' : 'ذكاء المخزون';

  const header = data ? (
    <View style={{ gap: 16 }}>
      {customers ? (
        <>
          <Gradient colors={[Colors.accent, Colors.accentStrong]} style={styles.hero}>
            <View style={styles.glow} />
            <Text style={styles.heroLabel}>عملاؤك</Text>
            <Text style={styles.heroValue}>{num(summary.total_customers)}</Text>
            <Text style={styles.heroSub}>VIP {num(summary.vip)} • نشط {num(summary.active)} • خامل {num(summary.inactive)}</Text>
          </Gradient>
          <View style={styles.statRow}>
            <View style={styles.stat}><Text style={[styles.statValue, { color: StatusText.warning }]}>{num(summary.at_risk)}</Text><Text style={styles.statLabel}>معرّضون للخطر</Text></View>
            <View style={styles.stat}><Text style={[styles.statValue, { color: StatusText.success }]}>{num(summary.high_profitability)}</Text><Text style={styles.statLabel}>ربحية عالية</Text></View>
          </View>
        </>
      ) : (
        <>
          <Gradient colors={[Colors.accent, Colors.accentStrong]} style={styles.hero}>
            <View style={styles.glow} />
            <Text style={styles.heroLabel}>رأس مال محتجز في مخزون راكد</Text>
            <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney((summary.dead_stock_capital ?? summary.frozen_capital) as string | number | undefined)}</Text>
            <Text style={styles.heroSub}>{num(summary.dead_stock_products)} صنف راكد • {num(summary.reorder_products)} صنف يحتاج إعادة طلب</Text>
          </Gradient>
        </>
      )}

      <FlatList
        horizontal
        data={customers ? CUSTOMER_FILTERS : STOCK_TABS}
        keyExtractor={(f) => f.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
        renderItem={({ item }) => {
          const on = (customers ? filter : tab) === item.key;
          return (
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => (customers ? setFilter(item.key) : setTab(item.key))} style={[styles.pill, on && styles.pillOn]}>
              <Text style={[styles.pillText, on && { color: Colors.accent }]}>{item.label}</Text>
            </Pressable>
          );
        }}
      />
      {customers && data.methodology ? <Text style={styles.note}>{String(data.methodology)}</Text> : null}
    </View>
  ) : null;

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: true, title: t(title), headerTitleAlign: 'center', headerShadowVisible: false }} />
      {loading ? (
        <SkeletonList rows={5} />
      ) : failed ? (
        <EmptyState icon="barChart" title={title} message={failed} actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => String(r.party_id ?? r.product_id ?? i)}
          ListHeaderComponent={header ?? undefined}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + bottomInset }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
          ListEmptyComponent={<EmptyState icon="barChart" title="لا توجد بيانات كافية" message="تظهر التحليلات بعد تسجيل مبيعات وحركات مخزون." compact />}
          renderItem={({ item }) => {
            if (customers) {
              const segs = ((item.segments as string[]) ?? []).filter((s) => SEGMENT[s]);
              return (
                <Pressable accessibilityRole="button" onPress={() => router.push(`/party/${item.party_id}` as never)} style={({ pressed }) => [styles.card, pressed && { backgroundColor: Colors.bgSoft }]}>
                  <View style={styles.top}>
                    <Text style={styles.name} numberOfLines={1}>{String(item.name ?? '—')}</Text>
                    <Text style={styles.value}>{formatMoney(item.revenue as string | number)}</Text>
                  </View>
                  <View style={styles.tags}>
                    {segs.map((s) => <View key={s} style={[styles.badge, { backgroundColor: SEGMENT[s].bg }]}><Text style={[styles.badgeText, { color: SEGMENT[s].fg }]}>{SEGMENT[s].label}</Text></View>)}
                  </View>
                  <Text style={styles.small}>
                    {[`${num(item.invoice_count)} فاتورة`, item.days_since_sale != null ? `آخر شراء قبل ${num(item.days_since_sale)} يوم` : 'لم يشترِ بعد', item.margin_estimate_percent != null ? `هامش ${num(item.margin_estimate_percent)}%` : null].filter(Boolean).join(' • ')}
                  </Text>
                  {num(item.outstanding) > 0 ? (
                    <Text style={[styles.small, { color: num(item.overdue_balance) > 0 ? StatusText.danger : StatusText.warning }]}>
                      عليه {formatMoney(item.outstanding as string | number)}{num(item.overdue_balance) > 0 ? ` (متأخر ${formatMoney(item.overdue_balance as string | number)})` : ''}
                    </Text>
                  ) : null}
                </Pressable>
              );
            }
            if (tab === 'reorder') {
              const days = item.stockout_days != null ? num(item.stockout_days) : null;
              return (
                <Pressable accessibilityRole="button" onPress={() => router.push(`/stock/${item.product_id}` as never)} style={styles.card}>
                  <View style={styles.top}>
                    <Text style={styles.name} numberOfLines={1}>{String(item.name)}</Text>
                    {days != null ? <View style={[styles.badge, { backgroundColor: days <= 7 ? Tint.dangerBg : Tint.warningBg }]}><Text style={[styles.badgeText, { color: days <= 7 ? StatusText.danger : StatusText.warning }]}>يكفي {days} يوم</Text></View> : null}
                  </View>
                  <Text style={styles.small}>{[item.sku ? String(item.sku) : null, `المتاح ${num(item.available)}`, `الطلب اليومي ${num(item.daily_demand).toFixed(1)}`].filter(Boolean).join(' • ')}</Text>
                  <Text style={styles.suggest}>الكمية المقترحة لإعادة الطلب: {num(item.reorder_quantity)} {String(item.unit ?? '')}</Text>
                </Pressable>
              );
            }
            return (
              <Pressable accessibilityRole="button" onPress={() => router.push(`/stock/${item.product_id}` as never)} style={styles.card}>
                <View style={styles.top}>
                  <Text style={styles.name} numberOfLines={1}>{String(item.name)}</Text>
                  <Text style={styles.value}>{formatMoney((item.frozen_capital ?? item.dead_stock_capital) as string | number)}</Text>
                </View>
                <Text style={styles.small}>{[item.sku ? String(item.sku) : null, `الرصيد ${num(item.on_hand)}`, `بدون حركة منذ ${num(item.dead_stock_days ?? item.inventory_age_days)} يوم`].filter(Boolean).join(' • ')}</Text>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  hero: { borderRadius: Radius.lg, padding: 24, gap: 8, shadowColor: Colors.accentStrong, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 24, elevation: 6 },
  glow: { position: 'absolute', top: -48, right: -48, width: 160, height: 160, borderRadius: 80, backgroundColor: '#fff', opacity: 0.12 },
  heroLabel: { fontSize: 14, fontWeight: '600', color: '#fff', opacity: 0.85, textAlign: 'auto' },
  heroValue: { fontSize: 32, fontWeight: '800', color: '#fff', textAlign: 'auto' },
  heroSub: { fontSize: 14, color: '#fff', opacity: 0.9, textAlign: 'auto' },
  statRow: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 4, ...Shadow.soft },
  statValue: { fontSize: 24, fontWeight: '800', textAlign: 'auto' },
  statLabel: { fontSize: 14, color: Colors.textMuted, textAlign: 'auto' },
  pill: { minHeight: Layout.minTouch, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line },
  pillOn: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  pillText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  note: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto', lineHeight: 20 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 8, ...Shadow.soft },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  value: { fontSize: 16, fontWeight: '800', color: Colors.text },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  small: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  suggest: { fontSize: 14, fontWeight: '800', color: Colors.accentStrong, textAlign: 'auto' },
});
