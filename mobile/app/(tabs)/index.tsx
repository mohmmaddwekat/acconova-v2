import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, IconName } from '../../components/ui/Icon';
import { SkeletonList } from '../../components/ui/Skeleton';
import { Colors, Layout, Radius, Shadow, StatusText, Tint } from '../../constants/theme';
import { api } from '../../lib/api';
import { getUser, User } from '../../lib/auth';
import { formatMoney } from '../../lib/format';

interface BriefData {
  revenue?: number;
  expenses?: number;
  receivables?: number;
  payables?: number;
}

interface QuickAction {
  label: string;
  icon: IconName;
  fg: string;
  bg: string;
  onPress: () => void;
}

const ACTIONS: QuickAction[] = [
  { label: 'فاتورة بيع', icon: 'fileUp', fg: Colors.info, bg: Tint.infoBg, onPress: () => router.push({ pathname: '/(tabs)/new-invoice', params: { kind: 'sale' } }) },
  { label: 'فاتورة شراء', icon: 'fileDown', fg: StatusText.warning, bg: Tint.warningBg, onPress: () => router.push({ pathname: '/(tabs)/new-invoice', params: { kind: 'purchase' } }) },
  { label: 'قبض / دفع', icon: 'banknote', fg: StatusText.success, bg: Tint.successBg, onPress: () => router.push('/(tabs)/quick-entry') },
  { label: 'الموظفون', icon: 'users', fg: Tint.purple, bg: Tint.purpleBg, onPress: () => router.push('/(tabs)/employees') },
  { label: 'الموافقات', icon: 'checkSquare', fg: Colors.accent, bg: Colors.accentSoft, onPress: () => router.push('/(tabs)/approvals') },
  { label: 'التقارير', icon: 'barChart', fg: Colors.accent, bg: Colors.accentSoft, onPress: () => router.push('/(tabs)/reports') },
];

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.kpiCard} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[styles.kpiValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  async function load() {
    try {
      const [userData, briefRes] = await Promise.allSettled([getUser(), api.get('/business-pulse/brief')]);
      if (userData.status === 'fulfilled') setUser(userData.value);
      if (briefRes.status === 'fulfilled') {
        setBrief(briefRes.value.data);
        setFailed(false);
      } else {
        setFailed(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>مرحباً، {user?.name?.split(' ')[0] ?? 'بك'}</Text>
          <Text style={styles.date}>
            {new Date().toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="التنبيهات"
          onPress={() => router.push('/(tabs)/notifications')}
          style={styles.bell}
        >
          <Icon name="bell" size={22} color={Colors.text} />
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

          <Text style={styles.sectionTitle}>الملخص المالي</Text>
          <View style={styles.kpiGrid}>
            <KpiCard label="الإيرادات" value={formatMoney(brief?.revenue)} color={StatusText.success} />
            <KpiCard label="المصاريف" value={formatMoney(brief?.expenses)} color={StatusText.danger} />
            <KpiCard label="المستحقات" value={formatMoney(brief?.receivables)} color={Colors.accentStrong} />
            <KpiCard label="الالتزامات" value={formatMoney(brief?.payables)} color={StatusText.warning} />
          </View>

          <Text style={styles.sectionTitle}>إجراءات سريعة</Text>
          <View style={styles.actions}>
            {ACTIONS.map((a) => (
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
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  greeting: { fontSize: 20, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  date: { fontSize: 13, color: Colors.textMuted, marginTop: 2, textAlign: 'right' },
  bell: { width: Layout.minTouch, height: Layout.minTouch, borderRadius: 22, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, gap: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.textSoft, textAlign: 'right' },
  errorBanner: {
    minHeight: Layout.minTouch, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
    backgroundColor: Tint.warningBg, borderRadius: Radius.xs,
  },
  errorText: { flex: 1, fontSize: 13, fontWeight: '600', color: StatusText.warning, textAlign: 'right' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  kpiCard: {
    width: '48%', backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line,
    padding: 16, gap: 4, ...Shadow.soft,
  },
  kpiValue: { fontSize: 22, fontWeight: '800', textAlign: 'right' },
  kpiLabel: { fontSize: 13, color: Colors.textMuted, textAlign: 'right' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  action: {
    width: '31%', backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line,
    paddingVertical: 14, paddingHorizontal: 6, alignItems: 'center', gap: 8, minHeight: 92, ...Shadow.soft,
  },
  actionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 13, fontWeight: '700', color: Colors.textSoft, textAlign: 'center' },
});
