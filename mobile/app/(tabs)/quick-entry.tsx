import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { api } from '../../lib/api';

type EntryType = 'revenue' | 'expense' | 'transfer';

const ENTRY_TYPES: { key: EntryType; label: string; color: string }[] = [
  { key: 'revenue', label: 'إيراد', color: Colors.success },
  { key: 'expense', label: 'مصروف', color: Colors.danger },
  { key: 'transfer', label: 'تحويل', color: Colors.accent },
];

export default function QuickEntryScreen() {
  const [type, setType] = useState<EntryType>('revenue');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!amount || isNaN(Number(amount))) {
      Alert.alert('خطأ', 'أدخل مبلغاً صحيحاً');
      return;
    }
    if (!description.trim()) {
      Alert.alert('خطأ', 'أدخل وصفاً للقيد');
      return;
    }

    setLoading(true);
    try {
      await api.post('/finance/quick-entries', {
        type,
        amount: Number(amount),
        description: description.trim(),
        reference: reference.trim() || undefined,
      });
      Alert.alert('تم', 'تم حفظ القيد بنجاح ✅');
      setAmount('');
      setDescription('');
      setReference('');
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'تعذّر حفظ القيد';
      Alert.alert('خطأ', msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>إدخال سريع</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Entry Type */}
          <Card>
            <Text style={styles.fieldLabel}>نوع القيد</Text>
            <View style={styles.typeRow}>
              {ENTRY_TYPES.map((t) => (
                <Pressable
                  key={t.key}
                  style={[
                    styles.typeBtn,
                    type === t.key && { backgroundColor: t.color, borderColor: t.color },
                  ]}
                  onPress={() => setType(t.key)}
                >
                  <Text
                    style={[
                      styles.typeBtnText,
                      type === t.key && { color: '#fff' },
                    ]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Card>

          {/* Amount */}
          <Card>
            <Text style={styles.fieldLabel}>المبلغ</Text>
            <View style={styles.amountRow}>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={Colors.textFaint}
                keyboardType="decimal-pad"
              />
              <Text style={styles.currency}>ر.س</Text>
            </View>
          </Card>

          {/* Description & Reference */}
          <Card style={{ gap: Spacing.md }}>
            <Input
              label="الوصف"
              value={description}
              onChangeText={setDescription}
              placeholder="وصف القيد..."
              multiline
            />
            <Input
              label="المرجع (اختياري)"
              value={reference}
              onChangeText={setReference}
              placeholder="رقم الفاتورة أو المرجع..."
            />
          </Card>

          <Button label="حفظ القيد" onPress={handleSubmit} loading={loading} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  header: {
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
    backgroundColor: Colors.surface,
  },
  title: { fontSize: 18, fontWeight: '700', color: Colors.text },
  scroll: { padding: Spacing.lg, gap: Spacing.md },
  fieldLabel: { fontSize: 13, fontWeight: '500', color: Colors.textSoft, marginBottom: 8 },
  typeRow: { flexDirection: 'row', gap: Spacing.sm },
  typeBtn: {
    flex: 1,
    height: 40,
    borderRadius: Radius.xs,
    borderWidth: 1.5,
    borderColor: Colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textSoft },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: Radius.xs,
    overflow: 'hidden',
  },
  amountInput: {
    flex: 1,
    height: 56,
    paddingHorizontal: Spacing.md,
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
  },
  currency: {
    paddingHorizontal: Spacing.md,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textMuted,
  },
});
