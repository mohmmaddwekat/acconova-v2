import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../../components/ui/Card';
import { Colors, Spacing } from '../../constants/theme';
import { api } from '../../lib/api';
import { logout, User, getUser } from '../../lib/auth';

interface BriefData {
  revenue?: number;
  expenses?: number;
  receivables?: number;
  payables?: number;
}

function formatCurrency(val?: number) {
  if (val == null) return '—';
  return new Intl.NumberFormat('ar-SA', {
    style: 'decimal',
    maximumFractionDigits: 0,
  }).format(val);
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Card style={styles.kpiCard}>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </Card>
  );
}

export default function DashboardScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      const [userData, briefRes] = await Promise.allSettled([
        getUser(),
        api.get('/business-pulse/brief'),
      ]);
      if (userData.status === 'fulfilled') setUser(userData.value);
      if (briefRes.status === 'fulfilled') setBrief(briefRes.value.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleLogout() {
    await logout();
    router.replace('/(auth)/login');
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>مرحباً، {user?.name?.split(' ')[0] ?? 'بك'} 👋</Text>
          <Text style={styles.date}>{new Date().toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
        </View>
        <Pressable onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>خروج</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />
        }
      >
        {/* KPI Grid */}
        <Text style={styles.sectionTitle}>الملخص المالي</Text>
        <View style={styles.kpiGrid}>
          <KpiCard label="الإيرادات" value={formatCurrency(brief?.revenue)} color={Colors.success} />
          <KpiCard label="المصاريف" value={formatCurrency(brief?.expenses)} color={Colors.danger} />
          <KpiCard label="المستحقات" value={formatCurrency(brief?.receivables)} color={Colors.accent} />
          <KpiCard label="الالتزامات" value={formatCurrency(brief?.payables)} color={Colors.warning} />
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>إجراءات سريعة</Text>
        <View style={styles.actions}>
          <Pressable style={styles.actionBtn} onPress={() => router.push('/(tabs)/quick-entry')}>
            <Text style={styles.actionIcon}>✏️</Text>
            <Text style={styles.actionLabel}>إدخال سريع</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={() => router.push('/(tabs)/approvals')}>
            <Text style={styles.actionIcon}>✅</Text>
            <Text style={styles.actionLabel}>الموافقات</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={() => router.push('/(tabs)/notifications')}>
            <Text style={styles.actionIcon}>🔔</Text>
            <Text style={styles.actionLabel}>التنبيهات</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
    backgroundColor: Colors.surface,
  },
  greeting: { fontSize: 18, fontWeight: '700', color: Colors.text },
  date: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  logoutBtn: { padding: Spacing.xs },
  logoutText: { fontSize: 13, color: Colors.danger },
  scroll: { padding: Spacing.lg, gap: Spacing.lg },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: Colors.textSoft },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  kpiCard: {
    width: '47%',
    alignItems: 'flex-start',
    gap: 4,
  },
  kpiValue: { fontSize: 22, fontWeight: '700' },
  kpiLabel: { fontSize: 12, color: Colors.textMuted },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.line,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 6,
  },
  actionIcon: { fontSize: 24 },
  actionLabel: { fontSize: 11, fontWeight: '500', color: Colors.textSoft, textAlign: 'center' },
});
