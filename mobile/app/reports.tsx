import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Gradient } from '../components/ui/Gradient';
import { Icon, IconName } from '../components/ui/Icon';
import { SkeletonList } from '../components/ui/Skeleton';
import { Text } from '../components/ui/Text';
import { Colors, Radius, Shadow, StatusText, Tint } from '../constants/theme';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useBottomInset } from '../lib/insets';
import { useStyles } from '../lib/theme';

interface Profitability {
  visible: boolean;
  period: string;
  revenue: string;
  gross_profit: string;
  margin_percent: string;
}

interface ReportCard {
  name: string;
  title: string;
  desc: string;
  icon: IconName;
  fg: string;
  bg: string;
  route?: string;
}

const getCards = (): ReportCard[] => [
  { name: 'sales-purchases', title: 'المبيعات والمشتريات', desc: 'إجمالي كل شهر لآخر 6 أشهر مع المتبقي للتحصيل والدفع', icon: 'barChart', fg: Colors.accent, bg: Colors.accentSoft },
  { name: 'profitability', title: 'الربحية', desc: 'الإيرادات وتكلفة البضاعة والربح الإجمالي وأفضل العملاء والمنتجات', icon: 'trendUp', fg: StatusText.success, bg: Tint.successBg },
  { name: 'ar-aging', title: 'أعمار الذمم المدينة', desc: 'ما يستحق لنا عند العملاء حسب عمر الدين', icon: 'users', fg: StatusText.warning, bg: Tint.warningBg },
  { name: 'ap-aging', title: 'أعمار الذمم الدائنة', desc: 'ما علينا للموردين حسب عمر الاستحقاق', icon: 'card', fg: StatusText.danger, bg: Tint.dangerBg },
  { name: 'cashflow', title: 'التدفق النقدي', desc: 'السيولة المؤكدة والمتوقعة والاستحقاقات القادمة', icon: 'dollar', fg: Colors.info, bg: Tint.infoBg },
  { name: 'inventory', title: 'المخزون', desc: 'قيمة المخزون والمنتجات المنخفضة والنافدة', icon: 'file', fg: Colors.accentStrong, bg: Tint.infoBg },
  { name: 'payroll', title: 'الرواتب والموظفون', desc: 'المستحقات والحضور والالتزام الشهري', icon: 'users', fg: Colors.accentStrong, bg: Tint.infoBg, route: '/employees?tab=salary' },
  { name: 'transactions', title: 'سجل المعاملات', desc: 'كل سندات القبض والدفع المرحّلة', icon: 'banknote', fg: StatusText.success, bg: Tint.successBg, route: '/transactions' },
];

export default function ReportsScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const [profit, setProfit] = useState<Profitability | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/dashboard-intelligence');
      setProfit(data?.data?.profitability ?? null);
    } catch {
      setProfit(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <SkeletonList rows={4} />;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={Colors.accent} />}
    >
      {profit?.visible ? (
        <Gradient colors={[Colors.accent, Colors.accentHover]} style={styles.strip}>
          <Text style={styles.stripCaption}>أداء شهر {profit.period}</Text>
          <View style={styles.stripRow}>
            <View style={styles.stripItem}>
              <Text style={styles.stripValue}>{formatMoney(profit.revenue, false)}</Text>
              <Text style={styles.stripLabel}>الإيرادات</Text>
            </View>
            <View style={styles.stripDivider} />
            <View style={styles.stripItem}>
              <Text style={styles.stripValue}>{formatMoney(profit.gross_profit, false)}</Text>
              <Text style={styles.stripLabel}>الربح الإجمالي</Text>
            </View>
            <View style={styles.stripDivider} />
            <View style={styles.stripItem}>
              <Text style={styles.stripValue}>{Number(profit.margin_percent)}%</Text>
              <Text style={styles.stripLabel}>هامش الربح</Text>
            </View>
          </View>
        </Gradient>
      ) : null}

      <Text style={styles.sectionTitle}>التقارير</Text>

      {getCards().map((c) => (
        <Pressable
          key={c.name}
          accessibilityRole="button"
          onPress={() => router.push((c.route ?? `/reports/${c.name}`) as any)}
          style={({ pressed }) => [styles.card, pressed && { backgroundColor: Colors.bgSoft }]}
        >
          <View style={[styles.cardIcon, { backgroundColor: c.bg }]}>
            <Icon name={c.icon} size={22} color={c.fg} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.cardTitle}>{c.title}</Text>
            <Text style={styles.cardDesc}>{c.desc}</Text>
          </View>
          <Icon name="chevronLeft" size={20} color={Colors.textFaint} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  container: { padding: 14, gap: 12 },
  strip: { borderRadius: Radius.md, padding: 16, gap: 10 },
  stripCaption: { fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '600', textAlign: 'auto' },
  stripRow: { flexDirection: 'row', alignItems: 'center' },
  stripItem: { flex: 1, alignItems: 'center' },
  stripValue: { fontSize: 18, fontWeight: '800', color: '#fff' },
  stripLabel: { fontSize: 12, color: 'rgba(255,255,255,0.88)', marginTop: 2 },
  stripDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.25)' },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.textSoft, textAlign: 'auto' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.line, padding: 14, minHeight: 76, ...Shadow.soft,
  },
  cardIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  cardDesc: { fontSize: 13, color: Colors.textMuted, lineHeight: 19, textAlign: 'auto' },
});
