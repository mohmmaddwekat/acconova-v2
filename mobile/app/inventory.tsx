import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { EmptyState } from '../components/ui/EmptyState';
import { Gradient } from '../components/ui/Gradient';
import { Icon } from '../components/ui/Icon';
import { SkeletonList } from '../components/ui/Skeleton';
import { Text } from '../components/ui/Text';
import { TextInput } from '../components/ui/TextInput';
import { Colors, Radius, Shadow, StatusText, Tint } from '../constants/theme';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useBottomInset } from '../lib/insets';
import { useStyles } from '../lib/theme';

interface Metrics {
  active_warehouses: number;
  tracked_products: number;
  low_stock_products: number;
  out_of_stock_products: number;
  inventory_value: string;
}

interface Product {
  id: number;
  name: string;
  sku: string | null;
  unit: string | null;
  unit_price: string | null;
  track_inventory: boolean;
  low_stock_threshold: string | null;
  stock_on_hand?: string | null;
  stock_reserved?: string | null;
}

function stockState(p: Product): { label: string; fg: string; bg: string } | null {
  if (!p.track_inventory) return null;
  const available = Number(p.stock_on_hand ?? 0) - Number(p.stock_reserved ?? 0);
  if (available <= 0) return { label: 'نفد', fg: StatusText.danger, bg: Tint.dangerBg };
  const threshold = Number(p.low_stock_threshold ?? 0);
  if (threshold > 0 && available <= threshold) return { label: 'منخفض', fg: StatusText.warning, bg: Tint.warningBg };
  return { label: 'متوفر', fg: StatusText.success, bg: Tint.successBg };
}

export default function InventoryScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setFailed(false);
      const [overview, list] = await Promise.allSettled([
        api.get('/inventory/overview'),
        api.get('/products', { params: { per_page: 100 } }),
      ]);
      if (overview.status === 'fulfilled') setMetrics(overview.value.data?.data?.metrics ?? null);
      if (list.status === 'fulfilled') {
        setProducts(Array.isArray(list.value.data?.data) ? list.value.data.data : []);
      } else {
        setFailed(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => !q || `${p.name} ${p.sku ?? ''}`.toLowerCase().includes(q));
  }, [products, query]);

  const header = (
    <View style={styles.headerWrap}>
      <Gradient colors={[Colors.accent, Colors.accentStrong]} style={styles.hero}>
        <View style={styles.glow} />
        <Text style={styles.heroLabel}>قيمة المخزون</Text>
        <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
          {formatMoney(metrics?.inventory_value)}
        </Text>
        <Text style={styles.heroSub}>
          {metrics ? `${metrics.tracked_products} صنف في ${metrics.active_warehouses} مستودع` : ' '}
        </Text>
      </Gradient>

      <View style={styles.statRow}>
        <View style={styles.stat}>
          <View style={[styles.statIcon, { backgroundColor: Tint.warningBg }]}>
            <Icon name="alertCircle" size={18} color={StatusText.warning} />
          </View>
          <Text style={styles.statValue}>{metrics?.low_stock_products ?? '—'}</Text>
          <Text style={styles.statLabel}>مخزون منخفض</Text>
        </View>
        <View style={styles.stat}>
          <View style={[styles.statIcon, { backgroundColor: Tint.dangerBg }]}>
            <Icon name="close" size={18} color={StatusText.danger} />
          </View>
          <Text style={styles.statValue}>{metrics?.out_of_stock_products ?? '—'}</Text>
          <Text style={styles.statLabel}>نفد من المخزون</Text>
        </View>
      </View>

      <View style={styles.shortcuts}>
        {[
          { label: 'المستودعات', route: '/warehouses' },
          { label: 'التحويلات', route: '/transfers' },
          { label: 'الإنتاج', route: '/production' },
          { label: '+ صنف جديد', route: '/new-product' },
        ].map((x) => (
          <Pressable key={x.route} accessibilityRole="button" onPress={() => router.push(x.route as never)} style={styles.shortcut}>
            <Text style={styles.shortcutText}>{x.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.searchWrap}>
        <Icon name="search" size={18} color={Colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="بحث باسم المنتج أو الرمز..."
          placeholderTextColor={Colors.textFaint}
          style={styles.search}
          accessibilityLabel="بحث في المنتجات"
        />
      </View>
    </View>
  );

  if (loading) return <View style={styles.flex}><SkeletonList rows={6} /></View>;

  if (failed && products.length === 0) {
    return (
      <View style={styles.flex}>
        <EmptyState
          icon="wifiOff"
          title="تعذّر تحميل المنتجات"
          message="تحقق من الاتصال أو الصلاحيات ثم حاول مرة أخرى."
          actionLabel="إعادة المحاولة"
          onAction={() => { setLoading(true); load(); }}
        />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.flex}
      data={visible}
      keyExtractor={(p) => String(p.id)}
      ListHeaderComponent={header}
      contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
      ListEmptyComponent={<EmptyState icon="file" title="لا توجد منتجات مطابقة" message="جرّب بحثاً آخر." compact />}
      renderItem={({ item }) => {
        const state = stockState(item);
        return (
          <Pressable accessibilityRole="button" onPress={() => router.push(`/stock/${item.id}` as never)} style={({ pressed }) => [styles.card, pressed && { backgroundColor: Colors.bgSoft }]}>
            <View style={styles.cardMain}>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.sku}>{item.sku ?? '—'}</Text>
            </View>
            <View style={styles.cardSide}>
              <Text style={styles.price}>{formatMoney(item.unit_price)}</Text>
              {state ? (
                <View style={[styles.badge, { backgroundColor: state.bg }]}>
                  <Text style={[styles.badgeText, { color: state.fg }]}>
                    {state.label} · {Number(item.stock_on_hand ?? 0)} {item.unit ?? ''}
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  headerWrap: { gap: 16, marginBottom: 4 },
  hero: { borderRadius: Radius.lg, padding: 24, gap: 8, shadowColor: Colors.accentStrong, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 24, elevation: 6 },
  glow: { position: 'absolute', top: -48, right: -48, width: 160, height: 160, borderRadius: 80, backgroundColor: '#fff', opacity: 0.12 },
  heroLabel: { fontSize: 14, fontWeight: '600', color: '#fff', opacity: 0.85, textAlign: 'auto' },
  heroValue: { fontSize: 32, fontWeight: '800', color: '#fff', textAlign: 'auto' },
  heroSub: { fontSize: 14, color: '#fff', opacity: 0.85, textAlign: 'auto' },
  statRow: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 8, ...Shadow.soft },
  statIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 24, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  statLabel: { fontSize: 14, color: Colors.textMuted, textAlign: 'auto' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, minHeight: 48, borderRadius: Radius.sm, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.line },
  search: { flex: 1, fontSize: 16, color: Colors.text, textAlign: 'auto', minHeight: 44 },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shortcut: { flexGrow: 1, minHeight: 44, paddingHorizontal: 12, borderRadius: Radius.sm, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line, alignItems: 'center', justifyContent: 'center' },
  shortcutText: { fontSize: 14, fontWeight: '800', color: Colors.accentStrong },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, ...Shadow.soft },
  cardMain: { flex: 1, gap: 4 },
  cardSide: { alignItems: 'flex-end', gap: 8 },
  name: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  sku: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  price: { fontSize: 16, fontWeight: '800', color: Colors.text },
  badge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
});
