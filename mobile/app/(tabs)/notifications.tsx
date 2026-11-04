import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../../components/ui/Card';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { api } from '../../lib/api';

interface FollowUp {
  id: number;
  party_name: string;
  amount: number;
  days_overdue: number;
  kind: string;
}

function severityColor(days: number) {
  if (days > 60) return Colors.danger;
  if (days > 30) return Colors.warning;
  return Colors.accent;
}

export default function NotificationsScreen() {
  const [alerts, setAlerts] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState<number | null>(null);

  async function load() {
    try {
      const { data } = await api.get('/collections/follow-ups');
      setAlerts(data.data ?? data ?? []);
    } catch {
      // keep empty
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function snooze(id: number) {
    setActing(id);
    try {
      await api.post(`/collections/alerts/${id}/snooze`);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch {
      Alert.alert('خطأ', 'تعذّر التأجيل');
    } finally {
      setActing(null);
    }
  }

  async function resolve(id: number) {
    setActing(id);
    try {
      await api.post(`/collections/alerts/${id}/resolve`);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch {
      Alert.alert('خطأ', 'تعذّر الإغلاق');
    } finally {
      setActing(null);
    }
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
      <View style={styles.header}>
        <Text style={styles.title}>تنبيهات التحصيل</Text>
        {alerts.length > 0 && (
          <View style={[styles.badge, { backgroundColor: Colors.danger }]}>
            <Text style={styles.badgeText}>{alerts.length}</Text>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />
        }
      >
        {alerts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyText}>لا توجد تنبيهات معلّقة</Text>
          </View>
        ) : (
          alerts.map((item) => {
            const color = severityColor(item.days_overdue);
            return (
              <Card key={item.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.partyName}>{item.party_name}</Text>
                  <View style={[styles.daysBadge, { backgroundColor: color + '22', borderColor: color }]}>
                    <Text style={[styles.daysText, { color }]}>{item.days_overdue} يوم</Text>
                  </View>
                </View>
                <Text style={styles.amount}>
                  {new Intl.NumberFormat('ar-SA').format(item.amount)} ر.س
                </Text>
                <View style={styles.cardActions}>
                  <Pressable
                    style={[styles.btn, styles.resolveBtn]}
                    onPress={() => resolve(item.id)}
                    disabled={acting === item.id}
                  >
                    <Text style={styles.resolveBtnText}>تم التحصيل</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.btn, styles.snoozeBtn]}
                    onPress={() => snooze(item.id)}
                    disabled={acting === item.id}
                  >
                    <Text style={styles.snoozeBtnText}>تأجيل</Text>
                  </Pressable>
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
    backgroundColor: Colors.surface,
  },
  title: { fontSize: 18, fontWeight: '700', color: Colors.text },
  badge: {
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  scroll: { padding: Spacing.lg, gap: Spacing.md },
  empty: { alignItems: 'center', paddingVertical: 80, gap: Spacing.md },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 15, color: Colors.textMuted },
  card: { gap: Spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  partyName: { fontSize: 15, fontWeight: '600', color: Colors.text, flex: 1 },
  daysBadge: {
    borderRadius: Radius.xs,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  daysText: { fontSize: 12, fontWeight: '600' },
  amount: { fontSize: 18, fontWeight: '700', color: Colors.text },
  cardActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: 4 },
  btn: {
    flex: 1,
    height: 40,
    borderRadius: Radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resolveBtn: { backgroundColor: Colors.success },
  snoozeBtn: { backgroundColor: Colors.bgSoft, borderWidth: 1, borderColor: Colors.line },
  resolveBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  snoozeBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textSoft },
});
