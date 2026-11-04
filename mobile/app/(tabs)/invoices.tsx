import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow, Spacing } from '../../constants/theme';
import { api } from '../../lib/api';

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

function statusColor(status: string): string {
  if (status === 'paid') return Colors.success;
  if (status === 'partial') return Colors.warning;
  if (status === 'overdue') return Colors.danger;
  return Colors.textMuted;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    paid: 'مدفوعة',
    partial: 'جزئي',
    overdue: 'متأخرة',
    draft: 'مسودة',
    pending: 'معلقة',
  };
  return map[status] ?? status;
}

export default function InvoicesScreen() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchInvoices() {
    try {
      setError(null);
      const res = await api.get('/finance/documents', {
        params: { type: 'invoice', per_page: 50 },
      });
      const data = res.data?.data ?? res.data ?? [];
      setInvoices(Array.isArray(data) ? data : []);
    } catch {
      setError('تعذر تحميل الفواتير');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { fetchInvoices(); }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchInvoices();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.titleBar}>
        <Text style={styles.title}>الفواتير</Text>
      </View>

      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchInvoices} style={styles.retryBtn}>
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={invoices}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>لا توجد فواتير</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/(tabs)/invoice/${item.id}` as any)}
              activeOpacity={0.7}
            >
              <View style={styles.cardTop}>
                <Text style={styles.invoiceNum}>{item.number}</Text>
                <View style={[styles.statusBadge, { backgroundColor: statusColor(item.status) + '20' }]}>
                  <Text style={[styles.statusText, { color: statusColor(item.status) }]}>
                    {statusLabel(item.status)}
                  </Text>
                </View>
              </View>
              <Text style={styles.partyName}>{item.party_name}</Text>
              <View style={styles.cardBottom}>
                <Text style={styles.date}>{item.date}</Text>
                <View style={styles.amounts}>
                  <Text style={styles.total}>{Number(item.total).toLocaleString()} ₪</Text>
                  {item.balance_due > 0 && (
                    <Text style={styles.due}>متبقي: {Number(item.balance_due).toLocaleString()}</Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  titleBar: { padding: Spacing.lg, paddingBottom: Spacing.sm },
  title: { fontSize: 22, fontWeight: '700', color: Colors.text },
  list: { padding: Spacing.lg, gap: Spacing.md },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    ...Shadow.soft,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  invoiceNum: { fontSize: 15, fontWeight: '700', color: Colors.text },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontSize: 12, fontWeight: '600' },
  partyName: { fontSize: 13, color: Colors.textSoft },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  date: { fontSize: 12, color: Colors.textMuted },
  amounts: { alignItems: 'flex-end', gap: 2 },
  total: { fontSize: 15, fontWeight: '700', color: Colors.text },
  due: { fontSize: 12, color: Colors.warning },
  errorText: { fontSize: 15, color: Colors.danger, textAlign: 'center', marginBottom: Spacing.md },
  retryBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  retryText: { color: '#fff', fontWeight: '600' },
  emptyText: { fontSize: 15, color: Colors.textMuted },
});
