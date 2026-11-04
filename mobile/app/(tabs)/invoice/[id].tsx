import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow, Spacing } from '../../../constants/theme';
import { api } from '../../../lib/api';

interface InvoiceDetail {
  id: number;
  number: string;
  party_name: string;
  date: string;
  due_date?: string;
  total: number;
  balance_due: number;
  status: string;
  notes?: string;
  items?: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
  }>;
}

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetch() {
      try {
        const res = await api.get(`/finance/documents/${id}`);
        setInvoice(res.data?.data ?? res.data);
      } catch {
        setError('تعذر تحميل الفاتورة');
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [id]);

  async function recordPayment() {
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) {
      Alert.alert('خطأ', 'أدخل مبلغاً صحيحاً');
      return;
    }

    setPaying(true);
    try {
      await api.post(`/finance/documents/${id}/payments`, { amount });
      Alert.alert('تم', 'تم تسجيل الدفعة بنجاح', [
        { text: 'حسناً', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'تعذر تسجيل الدفعة';
      Alert.alert('خطأ', msg);
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  if (error || !invoice) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? 'فاتورة غير موجودة'}</Text>
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
        <Text style={styles.topTitle}>{invoice.number}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>الطرف</Text>
            <Text style={styles.value}>{invoice.party_name}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>التاريخ</Text>
            <Text style={styles.value}>{invoice.date}</Text>
          </View>
          {invoice.due_date ? (
            <View style={styles.row}>
              <Text style={styles.label}>تاريخ الاستحقاق</Text>
              <Text style={styles.value}>{invoice.due_date}</Text>
            </View>
          ) : null}
          <View style={styles.row}>
            <Text style={styles.label}>الإجمالي</Text>
            <Text style={[styles.value, styles.boldValue]}>
              {Number(invoice.total).toLocaleString()} ₪
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>المتبقي</Text>
            <Text style={[styles.value, { color: invoice.balance_due > 0 ? Colors.warning : Colors.success }]}>
              {Number(invoice.balance_due).toLocaleString()} ₪
            </Text>
          </View>
        </View>

        {invoice.items && invoice.items.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>بنود الفاتورة</Text>
            {invoice.items.map((item, i) => (
              <View key={i} style={styles.item}>
                <Text style={styles.itemDesc}>{item.description}</Text>
                <View style={styles.itemMeta}>
                  <Text style={styles.itemQty}>{item.quantity} × {Number(item.unit_price).toLocaleString()}</Text>
                  <Text style={styles.itemTotal}>{Number(item.total).toLocaleString()} ₪</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {invoice.balance_due > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>تسجيل دفعة</Text>
            <TextInput
              style={styles.amountInput}
              value={payAmount}
              onChangeText={setPayAmount}
              placeholder={`أقصى: ${Number(invoice.balance_due).toLocaleString()} ₪`}
              keyboardType="decimal-pad"
              placeholderTextColor={Colors.textMuted}
              textAlign="right"
            />
            <TouchableOpacity
              style={[styles.payBtn, paying && styles.payBtnDisabled]}
              onPress={recordPayment}
              disabled={paying}
            >
              {paying ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.payBtnText}>تسجيل الدفعة</Text>
              )}
            </TouchableOpacity>
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
  topTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  container: { padding: Spacing.lg, gap: Spacing.md },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    ...Shadow.soft,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: Spacing.xs },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  label: { fontSize: 14, color: Colors.textMuted },
  value: { fontSize: 14, color: Colors.text },
  boldValue: { fontWeight: '700' },
  item: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
    gap: 4,
  },
  itemDesc: { fontSize: 14, color: Colors.text },
  itemMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  itemQty: { fontSize: 12, color: Colors.textMuted },
  itemTotal: { fontSize: 13, fontWeight: '600', color: Colors.text },
  amountInput: {
    backgroundColor: Colors.bg,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.line,
    padding: Spacing.md,
    fontSize: 16,
    color: Colors.text,
  },
  payBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    alignItems: 'center',
  },
  payBtnDisabled: { opacity: 0.6 },
  payBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  errorText: { fontSize: 15, color: Colors.danger, textAlign: 'center', marginBottom: Spacing.md },
  backBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  backBtnText: { color: '#fff', fontWeight: '600' },
});
