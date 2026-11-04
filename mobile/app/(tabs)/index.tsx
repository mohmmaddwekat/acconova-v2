import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gradient } from '../../components/ui/Gradient';
import { Icon, IconName } from '../../components/ui/Icon';
import { SkeletonList } from '../../components/ui/Skeleton';
import { Colors, Layout, Radius, Shadow, StatusText, Tint } from '../../constants/theme';
import { api } from '../../lib/api';
import { getUser, User } from '../../lib/auth';
import { DocumentSummary, MonthRange, monthRange, percentChange } from '../../lib/documents';
import { BarChart, MonthBar } from '../../components/BarChart';
import { MovementRow } from '../../components/MovementRow';
import { formatMoney } from '../../lib/format';
import { Movement } from '../../lib/movements';
import { dateLocale } from '../../lib/i18n';
import { useNotifications } from '../../lib/notifications';
import { useStyles } from '../../lib/theme';
import { Text } from '../../components/ui/Text';

interface Totals {
  revenue: number;
  expenses: number;
  receivables: number;
  payables: number;
  overdueAmount: number;
  revenueChange: number | null;
  expensesChange: number | null;
}

interface QuickAction {
  label: string;
  icon: IconName;
  fg: string;
  bg: string;
  onPress: () => void;
}

const getActions = (): QuickAction[] => [
  { label: 'فاتورة بيع', icon: 'fileUp', fg: Colors.info, bg: Tint.infoBg, onPress: () => router.push({ pathname: '/new-invoice', params: { kind: 'sale' } }) },
  { label: 'فاتورة شراء', icon: 'fileDown', fg: StatusText.warning, bg: Tint.warningBg, onPress: () => router.push({ pathname: '/new-invoice', params: { kind: 'purchase' } }) },
  { label: 'قبض / دفع', icon: 'banknote', fg: StatusText.success, bg: Tint.successBg, onPress: () => router.push('/(tabs)/quick-entry') },
  { label: 'الموظفون', icon: 'users', fg: Tint.purple, bg: Tint.purpleBg, onPress: () => router.push('/employees') },
  { label: 'الموافقات', icon: 'checkSquare', fg: StatusText.success, bg: Tint.successBg, onPress: () => router.push('/(tabs)/approvals') },
  { label: 'التقارير', icon: 'barChart', fg: Colors.accent, bg: Colors.accentSoft, onPress: () => router.push('/reports') },
];

const summaryOf = (kind: string, params: Record<string, unknown> = {}) =>
  api
    .get('/finance/documents', { params: { kind, per_page: 10, ...params } })
    .then((r) => r.data?.summary as DocumentSummary);

function KpiCard({
  label, value, color, icon, bg, change, note,
}: {
  label: string; value: string; color: string; icon: IconName; bg: string; change?: number | null; note?: string;
}) {
  const styles = useStyles(createStyles);
  return (
    <View style={styles.kpiCard} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={[styles.kpiBlob, { backgroundColor: color }]} />
      <View style={[styles.kpiIcon, { backgroundColor: bg }]}>
        <Icon name={icon} size={16} color={color} />
      </View>
      <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {change != null ? (
        <View style={styles.kpiChange}>
          <Icon name={change >= 0 ? 'trendUp' : 'trendDown'} size={12} color={change >= 0 ? StatusText.success : StatusText.danger} strokeWidth={2.5} />
          <Text style={[styles.kpiChangeText, { color: change >= 0 ? StatusText.success : StatusText.danger }]}>
            {Math.abs(change)}% عن الشهر السابق
          </Text>
        </View>
      ) : note ? (
        <Text style={styles.kpiNote}>{note}</Text>
      ) : null}
    </View>
  );
}

export default function DashboardScreen() {
  const styles = useStyles(createStyles);
  const [user, setUser] = useState<User | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [bars, setBars] = useState<MonthBar[] | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const { unread } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const thisMonth = monthRange(0);
    const lastMonth = monthRange(1);
    const inMonth = (m: MonthRange) => ({ date_from: m.from, date_to: m.to });

    try {
      const [userData, sm, pm, sl, pl, sa, pa, mv] = await Promise.allSettled([
        getUser(),
        summaryOf('sale_invoice', inMonth(thisMonth)),
        summaryOf('purchase_invoice', inMonth(thisMonth)),
        summaryOf('sale_invoice', inMonth(lastMonth)),
        summaryOf('purchase_invoice', inMonth(lastMonth)),
        summaryOf('sale_invoice'),
        summaryOf('purchase_invoice'),
        api.get('/finance/cash-movements', { params: { per_page: 10, status: 'posted', sort: 'date', sort_direction: 'desc' } }),
      ]);

      if (userData.status === 'fulfilled') setUser(userData.value);
      if (mv.status === 'fulfilled') setMovements(Array.isArray(mv.value.data?.data) ? mv.value.data.data.slice(0, 5) : []);

      const core = [sm, pm, sl, pl, sa, pa];
      if (core.every((r) => r.status === 'fulfilled')) {
        const [smV, pmV, slV, plV, saV, paV] = core.map((r) => (r as PromiseFulfilledResult<DocumentSummary>).value);
        setTotals({
          revenue: Number(smV.total),
          expenses: Number(pmV.total),
          receivables: Number(saV.outstanding),
          payables: Number(paV.outstanding),
          overdueAmount: Number(saV.overdue_amount),
          revenueChange: percentChange(Number(smV.total), Number(slV.total)),
          expensesChange: percentChange(Number(pmV.total), Number(plV.total)),
        });
        setFailed(false);
      } else {
        setFailed(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }

    // The six-month chart needs twelve small requests, so it fills in after the main numbers.
    try {
      const months = [5, 4, 3, 2, 1, 0].map(monthRange);
      const rows = await Promise.all(
        months.map(async (m) => {
          const [s, p] = await Promise.all([summaryOf('sale_invoice', inMonth(m)), summaryOf('purchase_invoice', inMonth(m))]);
          return { label: m.label, revenue: Number(s.total), expenses: Number(p.total) };
        }),
      );
      setBars(rows);
    } catch {
      setBars(null);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // When the current month has no invoices yet, show the latest month that does so the card is not a bare zero.
  const currentEmpty = !!totals && totals.revenue === 0 && totals.expenses === 0;
  const latest = currentEmpty && bars ? [...bars].reverse().find((b) => b.revenue > 0 || b.expenses > 0) : undefined;
  const period = latest ?? null;
  const shown = period ? { revenue: period.revenue, expenses: period.expenses } : totals;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>مرحباً، {user?.name?.split(' ')[0] ?? 'بك'}</Text>
          <Text style={styles.date}>
            {new Date().toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unread > 0 ? `التنبيهات، ${unread} غير مقروءة` : 'التنبيهات'}
          onPress={() => router.push('/notifications')}
          style={styles.bell}
        >
          <Icon name="bell" size={22} color={Colors.text} />
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {loading ? (
        <SkeletonList rows={5} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />
          }
        >
          {failed && (
            <Pressable accessibilityRole="button" style={styles.errorBanner} onPress={() => { setLoading(true); load(); }}>
              <Icon name="wifiOff" size={18} color={StatusText.warning} />
              <Text style={styles.errorText}>تعذّر تحديث الملخص المالي. اضغط لإعادة المحاولة.</Text>
            </Pressable>
          )}

          <Gradient colors={[Colors.accent, Colors.accentStrong]} style={styles.hero}>
            <View style={styles.heroGlow} />
            <Text style={styles.heroLabel}>{period ? `صافي شهر ${period.label}` : 'صافي هذا الشهر'}</Text>
            <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
              {shown ? formatMoney(shown.revenue - shown.expenses) : '—'}
            </Text>
            {!period && totals?.revenueChange != null && (
              <View style={styles.heroTrend}>
                <Icon name={totals.revenueChange >= 0 ? 'trendUp' : 'trendDown'} size={14} color="#fff" strokeWidth={2.5} />
                <Text style={styles.heroTrendText}>{Math.abs(totals.revenueChange)}% في الإيرادات عن الشهر السابق</Text>
              </View>
            )}
            <View style={styles.heroSplit}>
              <View style={styles.heroCell}>
                <Text style={styles.heroCellLabel}>الإيرادات</Text>
                <Text style={styles.heroCellValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(shown?.revenue)}</Text>
              </View>
              <View style={styles.heroDivider} />
              <View style={styles.heroCell}>
                <Text style={styles.heroCellLabel}>المصاريف</Text>
                <Text style={styles.heroCellValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(shown?.expenses)}</Text>
              </View>
            </View>
          </Gradient>

          <Text style={styles.sectionTitle}>المستحقات والالتزامات</Text>
          <View style={styles.kpiGrid}>
            <KpiCard
              label="مستحق لنا"
              value={formatMoney(totals?.receivables)}
              color={Colors.accentStrong}
              icon="card"
              bg={Tint.infoBg}
              note={totals && totals.overdueAmount > 0 ? `منها متأخر ${formatMoney(totals.overdueAmount)}` : undefined}
            />
            <KpiCard label="مستحق علينا" value={formatMoney(totals?.payables)} color={StatusText.warning} icon="clock" bg={Tint.warningBg} />
          </View>

          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>الإيرادات والمصاريف</Text>
              <View style={styles.period}><Text style={styles.periodText}>آخر 6 أشهر</Text></View>
            </View>
            {bars ? <BarChart bars={bars} /> : <View style={styles.chartPlaceholder}><SkeletonList rows={1} /></View>}
            <View style={styles.legend}>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.accent }]} /><Text style={styles.legendText}>الإيرادات</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.danger, opacity: 0.6 }]} /><Text style={styles.legendText}>المصاريف</Text></View>
            </View>
          </View>

          <Text style={styles.sectionTitle}>إجراءات سريعة</Text>
          <View style={styles.actions}>
            {getActions().map((a) => (
              <Pressable
                key={a.label}
                accessibilityRole="button"
                accessibilityLabel={a.label}
                onPress={a.onPress}
                style={({ pressed }) => [styles.action, pressed && { backgroundColor: Colors.bgSoft }]}
              >
                <View style={[styles.actionIcon, { backgroundColor: a.bg }]}>
                  <Icon name={a.icon} size={22} color={a.fg} />
                </View>
                <Text style={styles.actionLabel}>{a.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>آخر المعاملات</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/transactions')} style={styles.seeAll}>
              <Text style={styles.seeAllText}>عرض الكل</Text>
            </Pressable>
          </View>
          <View style={styles.txCard}>
            {movements.length === 0 ? (
              <Text style={styles.txEmpty}>لا توجد معاملات مرحّلة بعد.</Text>
            ) : (
              movements.map((m, i) => <MovementRow key={m.id} movement={m} last={i === movements.length - 1} />)
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const createStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 16, backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  greeting: { fontSize: 20, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  date: { fontSize: 13, color: Colors.textMuted, marginTop: 2, textAlign: 'auto' },
  bell: { width: Layout.minTouch, height: Layout.minTouch, borderRadius: 22, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', top: 2, right: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: Colors.danger,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  scroll: { padding: 16, gap: 16, paddingBottom: 32 },
  hero: { borderRadius: Radius.lg, padding: 24, gap: 8 },
  heroGlow: { position: 'absolute', top: -48, right: -48, width: 160, height: 160, borderRadius: 80, backgroundColor: '#fff', opacity: 0.12 },
  heroLabel: { fontSize: 14, fontWeight: '600', color: '#fff', opacity: 0.85, textAlign: 'auto' },
  heroValue: { fontSize: 32, fontWeight: '800', color: '#fff', textAlign: 'auto' },
  heroTrend: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)' },
  heroTrendText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  heroSplit: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)' },
  heroCell: { flex: 1, gap: 4 },
  heroCellLabel: { fontSize: 12, fontWeight: '600', color: '#fff', opacity: 0.8, textAlign: 'auto' },
  heroCellValue: { fontSize: 16, fontWeight: '800', color: '#fff', textAlign: 'auto' },
  heroDivider: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.textSoft, textAlign: 'auto' },
  errorBanner: {
    minHeight: Layout.minTouch, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
    backgroundColor: Tint.warningBg, borderRadius: Radius.xs,
  },
  errorText: { flex: 1, fontSize: 13, fontWeight: '600', color: StatusText.warning, textAlign: 'auto' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  kpiCard: {
    width: '48%', backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line,
    padding: 14, gap: 6, overflow: 'hidden', ...Shadow.soft,
  },
  kpiBlob: { position: 'absolute', top: -20, right: -20, width: 64, height: 64, borderRadius: 32, opacity: 0.1 },
  kpiIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  kpiValue: { fontSize: 20, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  kpiLabel: { fontSize: 13, color: Colors.textMuted, fontWeight: '500', textAlign: 'auto' },
  kpiChange: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  kpiChangeText: { fontSize: 12, fontWeight: '700' },
  kpiNote: { fontSize: 12, color: StatusText.danger, fontWeight: '600', textAlign: 'auto' },
  chartCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 14, ...Shadow.soft },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  chartTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  period: { backgroundColor: Colors.bgSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  periodText: { fontSize: 12, color: Colors.textMuted },
  chartPlaceholder: { height: 110, justifyContent: 'center' },
  legend: { flexDirection: 'row', gap: 16, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 12, color: Colors.textMuted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  action: {
    width: '31%', backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line,
    paddingVertical: 14, paddingHorizontal: 6, alignItems: 'center', gap: 8, minHeight: 92, ...Shadow.soft,
  },
  actionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 13, fontWeight: '700', color: Colors.textSoft, textAlign: 'center' },
  txCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, overflow: 'hidden', ...Shadow.soft },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seeAll: { minHeight: Layout.minTouch, justifyContent: 'center', paddingHorizontal: 4 },
  seeAllText: { fontSize: 14, fontWeight: '800', color: Colors.accent },
  txEmpty: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', padding: 20 },
});
