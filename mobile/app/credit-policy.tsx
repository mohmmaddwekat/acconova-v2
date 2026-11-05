import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { SkeletonList } from '../components/ui/Skeleton';
import { StickyFooter } from '../components/ui/StickyFooter';
import { Text } from '../components/ui/Text';
import { useToast } from '../components/ui/Toast';
import { Colors, Radius, Shadow } from '../constants/theme';
import { api } from '../lib/api';
import { apiErrorMessage } from '../lib/format';
import { t } from '../lib/i18n';
import { useStyles } from '../lib/theme';

type Values = Record<string, string>;

const GROUPS: { title: string; hint: string; fields: { key: string; label: string; hint?: string }[] }[] = [
  { title: 'شروط الأهلية للائتمان', hint: 'متى نعتبر العميل مؤهلاً للشراء بالدين', fields: [
    { key: 'min_history_invoices', label: 'أقل عدد فواتير سابقة' },
    { key: 'min_history_days', label: 'أقل مدة تعامل (أيام)' },
    { key: 'min_on_time_ratio', label: 'أقل نسبة سداد في الموعد', hint: 'مثال: 0.7 تعني 70%' },
    { key: 'max_avg_days_late', label: 'أقصى متوسط أيام تأخير' },
    { key: 'max_overdue_ratio', label: 'أقصى نسبة متأخرات', hint: 'مثال: 0.2 تعني 20%' },
    { key: 'lookback_days', label: 'فترة مراجعة السجل (أيام)' },
  ] },
  { title: 'إيقاف الائتمان تلقائياً', hint: 'حالات توقف البيع بالدين للعميل', fields: [
    { key: 'stop_credit_overdue_days', label: 'إيقاف عند تأخر (أيام)' },
    { key: 'stop_credit_bounced_cheques', label: 'إيقاف عند عدد شيكات مرتجعة' },
    { key: 'stop_credit_missed_promises', label: 'إيقاف عند وعود دفع مخلَّفة' },
  ] },
  { title: 'شروط الدفع والحدود', hint: 'ما نعرضه على العميل المؤهل', fields: [
    { key: 'credit_days', label: 'مدة الائتمان (أيام)' },
    { key: 'advance_percent', label: 'نسبة الدفعة المقدمة %' },
    { key: 'limit_months_of_sales', label: 'الحد = كم شهر من المبيعات' },
    { key: 'max_credit_limit', label: 'أعلى حد ائتماني' },
    { key: 'new_customer_terms', label: 'شروط العميل الجديد' },
  ] },
  { title: 'الشيكات', hint: 'قيود قبول الشيكات المؤجلة', fields: [
    { key: 'cheque_max_postdated_days', label: 'أقصى تأجيل للشيك (أيام)' },
    { key: 'cheque_exposure_ratio', label: 'نسبة انكشاف الشيكات', hint: 'مثال: 0.5 تعني 50%' },
  ] },
];
const KEYS = GROUPS.flatMap((g) => g.fields.map((f) => f.key));

export default function CreditPolicyScreen() {
  const styles = useStyles(createStyles);
  const toast = useToast();
  const [original, setOriginal] = useState<Values>({});
  const [values, setValues] = useState<Values>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setFailed(null);
      const res = await api.get('/credit-policy');
      const body = (res.data?.data ?? res.data) as Record<string, unknown>;
      const next: Values = {};
      KEYS.forEach((k) => { next[k] = body[k] == null ? '' : String(body[k]); });
      setOriginal(next);
      setValues(next);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setFailed(status === 403 ? 'عرض سياسة الائتمان يحتاج صلاحية المبيعات.' : 'تعذّر تحميل السياسة.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const changed = KEYS.filter((k) => values[k] !== original[k]);

  async function save() {
    for (const k of changed) {
      const v = values[k].trim();
      if (v !== '' && k !== 'new_customer_terms' && !/^\d+(\.\d+)?$/.test(v)) { toast('أدخل أرقاماً صحيحة في الحقول الرقمية'); return; }
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      changed.forEach((k) => { body[k] = values[k].trim(); });
      await api.put('/credit-policy', body);
      toast('تم حفظ سياسة الائتمان');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر الحفظ. التعديل يحتاج صلاحية مراجعة الموافقات'));
    } finally {
      setSaving(false);
    }
  }

  const header = <Stack.Screen options={{ headerShown: true, title: t('سياسة الائتمان'), headerTitleAlign: 'center', headerShadowVisible: false }} />;

  if (loading) return <View style={styles.flex}>{header}<SkeletonList rows={5} /></View>;
  if (failed) return <View style={styles.flex}>{header}<EmptyState icon="lock" title="سياسة الائتمان" message={failed} actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} /></View>;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {header}
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.note}>يعتمد النظام هذه القواعد لتقدير الحد الائتماني الموصى به لكل عميل، ولإيقاف البيع بالدين عند المخاطر.</Text>
        {GROUPS.map((g) => (
          <View key={g.title} style={styles.card}>
            <View style={{ gap: 4 }}>
              <Text style={styles.section}>{g.title}</Text>
              <Text style={styles.note}>{g.hint}</Text>
            </View>
            {g.fields.map((f) => (
              <View key={f.key} style={{ gap: 4 }}>
                <Input label={f.label} value={values[f.key] ?? ''} onChangeText={(v) => setValues((cur) => ({ ...cur, [f.key]: v }))} keyboardType={f.key === 'new_customer_terms' ? 'default' : 'decimal-pad'} />
                {f.hint ? <Text style={styles.note}>{f.hint}</Text> : null}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
      <StickyFooter safeBottom totalLabel={changed.length ? 'تعديلات غير محفوظة' : 'لا توجد تعديلات'} totalValue={String(changed.length)}>
        <Button label="حفظ السياسة" onPress={save} loading={saving} disabled={!changed.length} />
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  body: { padding: 16, gap: 16, paddingBottom: 32 },
  note: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto', lineHeight: 20 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 16, ...Shadow.soft },
  section: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
});
