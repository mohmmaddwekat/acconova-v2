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

interface Approval {
  id: number;
  description: string;
  type: string;
  amount?: number;
  requested_by?: string;
  created_at: string;
  status: string;
}

export default function ApprovalsScreen() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState<number | null>(null);

  async function load() {
    try {
      const { data } = await api.get('/approval-requests');
      setApprovals(data.data ?? data ?? []);
    } catch {
      // keep empty list
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function review(id: number, decision: 'approved' | 'rejected') {
    setActing(id);
    try {
      await api.patch(`/approval-requests/${id}`, { decision });
      setApprovals((prev) => prev.filter((a) => a.id !== id));
    } catch {
      Alert.alert('خطأ', 'تعذّر تنفيذ الإجراء');
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
        <Text style={styles.title}>الموافقات المعلّقة</Text>
        {approvals.length > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{approvals.length}</Text>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />
        }
      >
        {approvals.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.emptyText}>لا توجد موافقات معلّقة</Text>
          </View>
        ) : (
          approvals.map((item) => (
            <Card key={item.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardType}>{item.type}</Text>
                {item.amount != null && (
                  <Text style={styles.cardAmount}>
                    {new Intl.NumberFormat('ar-SA').format(item.amount)}
                  </Text>
                )}
              </View>
              <Text style={styles.cardDesc}>{item.description}</Text>
              {item.requested_by && (
                <Text style={styles.cardMeta}>طلب بواسطة: {item.requested_by}</Text>
              )}
              <View style={styles.cardActions}>
                <Pressable
                  style={[styles.btn, styles.approveBtn]}
                  onPress={() => review(item.id, 'approved')}
                  disabled={acting === item.id}
                >
                  <Text style={styles.approveBtnText}>
                    {acting === item.id ? '...' : 'موافقة'}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.rejectBtn]}
                  onPress={() => review(item.id, 'rejected')}
                  disabled={acting === item.id}
                >
                  <Text style={styles.rejectBtnText}>رفض</Text>
                </Pressable>
              </View>
            </Card>
          ))
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
    backgroundColor: Colors.accent,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  scroll: { padding: Spacing.lg, gap: Spacing.md },
  empty: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 15, color: Colors.textMuted },
  card: { gap: Spacing.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardType: { fontSize: 12, fontWeight: '600', color: Colors.accent, textTransform: 'uppercase' },
  cardAmount: { fontSize: 16, fontWeight: '700', color: Colors.text },
  cardDesc: { fontSize: 14, color: Colors.text },
  cardMeta: { fontSize: 12, color: Colors.textMuted },
  cardActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: 4 },
  btn: {
    flex: 1,
    height: 40,
    borderRadius: Radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtn: { backgroundColor: Colors.success },
  rejectBtn: { backgroundColor: Colors.bgSoft, borderWidth: 1, borderColor: Colors.danger },
  approveBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  rejectBtnText: { fontSize: 14, fontWeight: '600', color: Colors.danger },
});
