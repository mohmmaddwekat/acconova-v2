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

const SECTIONS: { title: string; fields: { key: string; label: string; keyboard?: 'email-address' | 'phone-pad' | 'number-pad' | 'url'; multiline?: boolean }[] }[] = [
  { title: 'بيانات الشركة', fields: [
    { key: 'name', label: 'اسم المؤسسة' }, { key: 'legal_name', label: 'الاسم القانوني' }, { key: 'trade_name', label: 'الاسم التجاري' },
    { key: 'commercial_registration', label: 'رقم السجل التجاري' }, { key: 'vat_number', label: 'الرقم الضريبي' },
  ] },
  { title: 'التواصل والعنوان', fields: [
    { key: 'support_email', label: 'بريد الدعم', keyboard: 'email-address' }, { key: 'phone', label: 'الهاتف', keyboard: 'phone-pad' },
    { key: 'website', label: 'الموقع الإلكتروني', keyboard: 'url' }, { key: 'country', label: 'الدولة' }, { key: 'city', label: 'المدينة' }, { key: 'address', label: 'العنوان', multiline: true },
  ] },
  { title: 'المالية والتنبيهات', fields: [
    { key: 'currency', label: 'العملة الأساسية (3 أحرف)' }, { key: 'reminder_days', label: 'التذكير قبل الاستحقاق (أيام)', keyboard: 'number-pad' },
  ] },
  { title: 'الفواتير', fields: [{ key: 'invoice_footer', label: 'نص أسفل الفاتورة', multiline: true }] },
];

export default function WorkspaceSettingsScreen() {
  const styles = useStyles(createStyles);
  const toast = useToast();
  const [original, setOriginal] = useState<Values>({});
  const [values, setValues] = useState<Values>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Values>({});

  const load = useCallback(async () => {
    try {
      setFailed(null);
      const res = await api.get('/workspace-settings');
      const body = (res.data?.data ?? res.data) as Record<string, unknown>;
      const next: Values = {};
      SECTIONS.forEach((s) => s.fields.forEach((f) => { next[f.key] = body[f.key] == null ? '' : String(body[f.key]); }));
      setOriginal(next);
      setValues(next);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setFailed(status === 403 ? 'تعديل إعدادات المؤسسة يحتاج صلاحية الإعدادات.' : 'تعذّر تحميل الإعدادات.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const changed = Object.keys(values).filter((k) => values[k] !== original[k]);

  async function save() {
    const body: Record<string, unknown> = {};
    changed.forEach((k) => { body[k] = k === 'reminder_days' ? Number(values[k]) : k === 'currency' ? values[k].toUpperCase() : values[k].trim() === '' ? null : values[k].trim(); });
    setSaving(true);
    setErrors({});
    try {
      await api.patch('/workspace-settings', body);
      toast('تم حفظ الإعدادات');
      await load();
    } catch (err: unknown) {
      const fields = (err as { response?: { data?: { errors?: Record<string, string[]> } } })?.response?.data?.errors;
      if (fields) setErrors(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v[0]])));
      toast(apiErrorMessage(err, 'تعذّر حفظ الإعدادات'));
    } finally {
      setSaving(false);
    }
  }

  const header = <Stack.Screen options={{ headerShown: true, title: t('تخصيص النظام'), headerTitleAlign: 'center', headerShadowVisible: false }} />;

  if (loading) return <View style={styles.flex}>{header}<SkeletonList rows={5} /></View>;
  if (failed) return <View style={styles.flex}>{header}<EmptyState icon="lock" title="تخصيص النظام" message={failed} actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} /></View>;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {header}
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.note}>هذه البيانات تظهر في فواتيرك ومستنداتك. لتخصيص الحالات والحقول وقواعد الموافقة المتقدمة استخدم الموقع.</Text>
        {SECTIONS.map((s) => (
          <View key={s.title} style={styles.card}>
            <Text style={styles.section}>{s.title}</Text>
            {s.fields.map((f) => (
              <Input
                key={f.key}
                label={f.label}
                value={values[f.key] ?? ''}
                onChangeText={(v) => setValues((cur) => ({ ...cur, [f.key]: f.key === 'currency' ? v.toUpperCase().slice(0, 3) : v }))}
                keyboardType={f.keyboard}
                autoCapitalize={f.keyboard ? 'none' : 'sentences'}
                multiline={f.multiline}
                style={f.multiline ? { minHeight: 80, textAlignVertical: 'top' } : undefined}
                error={errors[f.key]}
              />
            ))}
          </View>
        ))}
      </ScrollView>
      <StickyFooter safeBottom totalLabel={changed.length ? 'تعديلات غير محفوظة' : 'لا توجد تعديلات'} totalValue={String(changed.length)}>
        <Button label="حفظ الإعدادات" onPress={save} loading={saving} disabled={!changed.length} />
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  body: { padding: 16, gap: 16, paddingBottom: 32 },
  note: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto', lineHeight: 20 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 12, ...Shadow.soft },
  section: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
});
