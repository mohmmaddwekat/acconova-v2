import { Stack, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { EmptyState } from '../components/ui/EmptyState';
import { Gradient } from '../components/ui/Gradient';
import { Icon } from '../components/ui/Icon';
import { SkeletonList } from '../components/ui/Skeleton';
import { Text } from '../components/ui/Text';
import { Colors, Radius, Shadow, StatusText, Tint } from '../constants/theme';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { useBottomInset } from '../lib/insets';
import { useStyles } from '../lib/theme';

interface Item { key: string; severity: string; kind: string; title: string | null; detail: string | null; url: string | null }

const KIND: Record<string, { title: string; meaning: string; action: string }> = {
  unusual_customer_balance: { title: 'رصيد عميل مرتفع', meaning: 'عميل عليه رصيد أعلى بكثير من المعتاد.', action: 'راجع حساب العميل وتابع التحصيل' },
  product_without_cost: { title: 'منتج بدون تكلفة', meaning: 'منتج يُباع بدون سعر تكلفة، فلن يظهر الربح الحقيقي.', action: 'أضف سعر التكلفة للمنتج' },
  possible_duplicate_invoice: { title: 'فاتورة مكررة محتملة', meaning: 'فواتير متشابهة (نفس الطرف والمبلغ والتاريخ).', action: 'تأكد أنها ليست مدخلة مرتين' },
  unusual_price: { title: 'سعر غير معتاد', meaning: 'سعر بند يختلف كثيراً عن أسعاره السابقة.', action: 'راجع الفاتورة وصحّح السعر إن لزم' },
  large_payment: { title: 'دفعة كبيرة', meaning: 'دفعة أكبر بكثير من متوسط الدفعات الأخيرة.', action: 'تأكد من صحة المبلغ والجهة' },
};

const SEVERITY: Record<string, { label: string; fg: string; bg: string }> = {
  warning: { label: 'تنبيه', fg: StatusText.warning, bg: Tint.warningBg },
  review: { label: 'للمراجعة', fg: Colors.accentStrong, bg: Tint.infoBg },
  critical: { label: 'عاجل', fg: StatusText.danger, bg: Tint.dangerBg },
};

/** Maps the website link of an item to the matching mobile screen. */
function target(url: string | null): string | null {
  if (!url) return null;
  const party = url.match(/parties\?focus=(\d+)/);
  if (party) return `/party/${party[1]}`;
  const invoice = url.match(/invoices\/(?:sales|purchases)\/(\d+)/);
  if (invoice) return `/invoice/${invoice[1]}`;
  if (url.includes('/products')) return '/inventory';
  if (url.includes('/payments')) return '/transactions';
  return null;
}

/** The server writes a few detail lines in English; show them in Arabic. */
function detailText(item: Item): string | null {
  if (!item.detail) return null;
  return item.detail
    .replace(/×\s*recent average/i, '× المتوسط الأخير')
    .replace(/recent average/i, 'المتوسط الأخير');
}

export default function AnomaliesScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setFailed(false);
      const res = await api.get('/business-pulse/anomalies');
      const list = res.data?.data?.items ?? res.data?.items ?? [];
      setItems(Array.isArray(list) ? list : []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const warnings = items.filter((i) => i.severity === 'warning' || i.severity === 'critical').length;

  const header = (
    <Gradient colors={[warnings ? StatusText.warning : Colors.accent, Colors.accentStrong]} style={styles.hero}>
      <View style={styles.glow} />
      <Text style={styles.heroLabel}>عمليات تحتاج مراجعتك</Text>
      <Text style={styles.heroValue}>{items.length}</Text>
      <Text style={styles.heroSub}>
        {items.length === 0 ? 'كل شيء يبدو طبيعياً حالياً' : `${warnings} تنبيه و${items.length - warnings} للمراجعة. النظام يكتشفها تلقائياً.`}
      </Text>
    </Gradient>
  );

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: true, title: t('العمليات غير المعتادة'), headerTitleAlign: 'center', headerShadowVisible: false }} />
      {loading ? (
        <SkeletonList rows={5} />
      ) : failed ? (
        <EmptyState icon="wifiOff" title="تعذّر تحميل التنبيهات" message="تحقق من الاتصال أو الصلاحيات." actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.key}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + bottomInset }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
          ListEmptyComponent={<EmptyState icon="checkSquare" title="لا توجد عمليات غير معتادة" message="سنخبرك هنا عندما يلاحظ النظام شيئاً يستحق المراجعة." compact />}
          renderItem={({ item }) => {
            const info = KIND[item.kind];
            const sev = SEVERITY[item.severity] ?? SEVERITY.review;
            const to = target(item.url);
            const name = item.title && !/^[A-Za-z ]+$/.test(item.title) ? item.title : null;
            const detail = detailText(item);
            return (
              <Pressable
                accessibilityRole={to ? 'button' : undefined}
                disabled={!to}
                onPress={() => to && router.push(to as never)}
                style={({ pressed }) => [styles.card, pressed && { backgroundColor: Colors.bgSoft }]}
              >
                <View style={styles.top}>
                  <Text style={styles.title}>{info?.title ?? 'عملية غير معتادة'}</Text>
                  <View style={[styles.badge, { backgroundColor: sev.bg }]}><Text style={[styles.badgeText, { color: sev.fg }]}>{sev.label}</Text></View>
                </View>
                {name ? <Text style={styles.name}>{name}{detail && !/[A-Za-z]{4,}/.test(detail) ? ` • ${detail}` : ''}</Text> : detail && !/[A-Za-z]{4,}/.test(detail) ? <Text style={styles.name}>{detail}</Text> : null}
                {info ? <Text style={styles.meaning}>{info.meaning}</Text> : null}
                {info ? (
                  <View style={styles.actionRow}>
                    <Icon name="alertCircle" size={16} color={Colors.accentStrong} />
                    <Text style={styles.action}>{info.action}</Text>
                    {to ? <Icon name="chevronLeft" size={18} color={Colors.textFaint} /> : null}
                  </View>
                ) : null}
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
  hero: { borderRadius: Radius.lg, padding: 24, gap: 8, marginBottom: 4, shadowColor: Colors.accentStrong, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 24, elevation: 6 },
  glow: { position: 'absolute', top: -48, right: -48, width: 160, height: 160, borderRadius: 80, backgroundColor: '#fff', opacity: 0.12 },
  heroLabel: { fontSize: 14, fontWeight: '600', color: '#fff', opacity: 0.85, textAlign: 'auto' },
  heroValue: { fontSize: 40, fontWeight: '800', color: '#fff', textAlign: 'auto' },
  heroSub: { fontSize: 14, color: '#fff', opacity: 0.9, textAlign: 'auto' },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 8, ...Shadow.soft },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  badge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  name: { fontSize: 14, fontWeight: '700', color: Colors.textSoft, textAlign: 'auto' },
  meaning: { fontSize: 14, color: Colors.textMuted, textAlign: 'auto', lineHeight: 22 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  action: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.accentStrong, textAlign: 'auto' },
});
