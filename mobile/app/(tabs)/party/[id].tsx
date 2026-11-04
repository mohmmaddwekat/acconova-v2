import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow, Spacing } from '../../../constants/theme';
import { api } from '../../../lib/api';

interface PartyDetail {
  id: number;
  name: string;
  type: string;
  balance: number;
  phone?: string;
  email?: string;
  address?: string;
  tax_number?: string;
}

interface Transaction {
  id: number;
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  reference?: string;
}

export default function PartyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [party, setParty] = useState<PartyDetail | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetch() {
      try {
        const [partyRes, txRes] = await Promise.allSettled([
          api.get(`/parties/${id}`),
          api.get(`/parties/${id}/transactions`, { params: { per_page: 30 } }),
        ]);

        if (partyRes.status === 'fulfilled') {
          setParty(partyRes.value.data?.data ?? partyRes.value.data);
        } else {
          setError('تعذر تحميل بيانات الطرف');
        }

        if (txRes.status === 'fulfilled') {
          const d = txRes.value.data?.data ?? txRes.value.data ?? [];
          setTransactions(Array.isArray(d) ? d : []);
        }
      } catch {
        setError('تعذر تحميل البيانات');
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  if (error || !party) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? 'الطرف غير موجود'}</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>عودة</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backArrow}>
          <Text style={styles.backArrowText}>‹ عودة</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>{party.name}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.summaryCard}>
          <View style={styles.avatarRow}>
            <View style={[
              styles.avatar,
              { backgroundColor: party.type === 'customer' ? Colors.success + '20' : Colors.accentSoft },
            ]}>
              <Text style={styles.avatarText}>{party.name.charAt(0)}</Text>
            </View>
            <View>
              <Text style={styles.partyName}>{party.name}</Text>
              <Text style={styles.partyType}>
                {party.type === 'customer' ? 'عميل' : 'مورد'}
              </Text>
            </View>
          </View>

          <View style={styles.balanceBox}>
            <Text style={styles.balanceLabel}>الرصيد الحالي</Text>
            <Text style={[
              styles.balanceValue,
              { color: party.balance > 0 ? Colors.success : party.balance < 0 ? Colors.danger : Colors.textMuted },
            ]}>
              {Number(party.balance).toLocaleString()} ₪
            </Text>
            <Text style={styles.balanceDir}>
              {party.balance > 0 ? 'له علينا' : party.balance < 0 ? 'علينا له' : 'متوازن'}
            </Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          {party.phone ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>الهاتف</Text>
              <Text style={styles.infoValue}>{party.phone}</Text>
            </View>
          ) : null}
          {party.email ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>البريد</Text>
              <Text style={styles.infoValue}>{party.email}</Text>
            </View>
          ) : null}
          {party.address ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>العنوان</Text>
              <Text style={styles.infoValue}>{party.address}</Text>
            </View>
          ) : null}
          {party.tax_number ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>الرقم الضريبي</Text>
              <Text style={styles.infoValue}>{party.tax_number}</Text>
            </View>
          ) : null}
        </View>

        {transactions.length > 0 && (
          <View style={styles.txCard}>
            <Text style={styles.sectionTitle}>آخر المعاملات</Text>
            {transactions.map((tx) => (
              <View key={tx.id} style={styles.txRow}>
                <View style={styles.txLeft}>
                  <Text style={styles.txDate}>{tx.date}</Text>
                  <Text style={styles.txDesc}>{tx.description}</Text>
                  {tx.reference ? <Text style={styles.txRef}>{tx.reference}</Text> : null}
                </View>
                <View style={styles.txRight}>
                  {tx.credit > 0 ? (
                    <Text style={styles.txCredit}>+{Number(tx.credit).toLocaleString()}</Text>
                  ) : null}
                  {tx.debit > 0 ? (
                    <Text style={styles.txDebit}>-{Number(tx.debit).toLocaleString()}</Text>
                  ) : null}
                  <Text style={[
                    styles.txBalance,
                    { color: tx.balance >= 0 ? Colors.success : Colors.danger },
                  ]}>
                    {Number(tx.balance).toLocaleString()}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  backArrow: { width: 60 },
  backArrowText: { fontSize: 16, color: Colors.accent, fontWeight: '500' },
  topTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  container: { padding: Spacing.lg, gap: Spacing.md },
  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.md,
    ...Shadow.soft,
  },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: '700', color: Colors.accent },
  partyName: { fontSize: 18, fontWeight: '700', color: Colors.text },
  partyType: { fontSize: 13, color: Colors.textMuted },
  balanceBox: {
    backgroundColor: Colors.bg,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  balanceLabel: { fontSize: 12, color: Colors.textMuted },
  balanceValue: { fontSize: 28, fontWeight: '800' },
  balanceDir: { fontSize: 13, color: Colors.textMuted },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    overflow: 'hidden',
    ...Shadow.soft,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  infoLabel: { fontSize: 14, color: Colors.textMuted },
  infoValue: { fontSize: 14, color: Colors.text, fontWeight: '500' },
  txCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    ...Shadow.soft,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  txLeft: { flex: 1, gap: 2 },
  txDate: { fontSize: 11, color: Colors.textMuted },
  txDesc: { fontSize: 13, color: Colors.text },
  txRef: { fontSize: 11, color: Colors.textFaint },
  txRight: { alignItems: 'flex-end', gap: 2 },
  txCredit: { fontSize: 13, fontWeight: '600', color: Colors.success },
  txDebit: { fontSize: 13, fontWeight: '600', color: Colors.danger },
  txBalance: { fontSize: 13, fontWeight: '700' },
  errorText: { fontSize: 15, color: Colors.danger, textAlign: 'center', marginBottom: Spacing.md },
  backBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  backBtnText: { color: '#fff', fontWeight: '600' },
});
