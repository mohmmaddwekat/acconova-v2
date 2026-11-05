import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { PickerItem, PickerSheet } from '../components/ui/PickerSheet';
import { SelectField } from '../components/ui/SelectField';
import { StickyFooter } from '../components/ui/StickyFooter';
import { Text } from '../components/ui/Text';
import { useToast } from '../components/ui/Toast';
import { Colors, Layout, Radius } from '../constants/theme';
import { api } from '../lib/api';
import { apiErrorMessage, todayISO } from '../lib/format';
import { t } from '../lib/i18n';
import { useStyles } from '../lib/theme';

const BASES: { key: string; label: string; hint: string }[] = [
  { key: 'month', label: 'شهري', hint: 'راتب شهري ثابت' },
  { key: 'day', label: 'يومي', hint: 'أجر اليوم' },
  { key: 'hour', label: 'بالساعة', hint: 'أجر الساعة' },
  { key: 'piece', label: 'بالقطعة', hint: 'أجر القطعة' },
];

const NUMBER = /^\d+(\.\d{1,4})?$/;

export default function NewEmployeeScreen() {
  const styles = useStyles(createStyles);
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [basis, setBasis] = useState('month');
  const [rate, setRate] = useState('');
  const [allowance, setAllowance] = useState('0');
  const [startedOn, setStartedOn] = useState(todayISO());
  const [departments, setDepartments] = useState<PickerItem[]>([]);
  const [department, setDepartment] = useState<PickerItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    api
      .get('/departments')
      .then((res) => setDepartments((res.data?.departments ?? []).map((d: { id: number; name: string }) => ({ id: d.id, title: d.name }))))
      .catch(() => setDepartments([]));
  }, []);

  async function save() {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'اسم الموظف مطلوب';
    if (!NUMBER.test(rate)) next.rate = 'أدخل رقماً صحيحاً (مثال: 2500)';
    if (!NUMBER.test(allowance)) next.allowance = 'أدخل رقماً صحيحاً';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startedOn)) next.started = 'التاريخ بصيغة 2026-12-31';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      await api.post('/staff', {
        name: name.trim(),
        job_title: jobTitle.trim() || null,
        phone: phone.trim() || null,
        contact_email: email.trim() || null,
        department_id: department?.id ?? null,
        basis,
        rate,
        monthly_allowance: allowance,
        started_on: startedOn,
        active: true,
      });
      toast('تمت إضافة الموظف');
      router.back();
    } catch (err: unknown) {
      const fields = (err as { response?: { data?: { errors?: Record<string, string[]> } } })?.response?.data?.errors;
      if (fields) setErrors(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k === 'contact_email' ? 'email' : k, v[0]])));
      toast(apiErrorMessage(err, 'تعذّرت إضافة الموظف'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: true, title: t('موظف جديد'), headerTitleAlign: 'center', headerShadowVisible: false }} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Input label="اسم الموظف" value={name} onChangeText={setName} error={errors.name} />
        <Input label="المسمى الوظيفي (اختياري)" value={jobTitle} onChangeText={setJobTitle} />
        <SelectField label="القسم (اختياري)" value={department?.title} placeholder={departments.length ? 'اختر القسم' : 'لا توجد أقسام'} onPress={() => setPickerOpen(true)} />
        <Input label="الجوال (اختياري)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Input label="البريد الإلكتروني (اختياري)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={errors.email} />

        <View style={{ gap: 8 }}>
          <Text style={styles.label}>طريقة احتساب الأجر</Text>
          <View style={styles.row}>
            {BASES.map((b) => (
              <Pressable key={b.key} accessibilityRole="button" accessibilityState={{ selected: basis === b.key }} onPress={() => setBasis(b.key)} style={[styles.chip, basis === b.key && styles.chipOn]}>
                <Text style={[styles.chipText, basis === b.key && { color: Colors.accent }]}>{b.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>{BASES.find((b) => b.key === basis)?.hint}</Text>
        </View>

        <Input label="الأجر" value={rate} onChangeText={setRate} keyboardType="decimal-pad" placeholder="2500" error={errors.rate} />
        <Input label="البدلات الشهرية" value={allowance} onChangeText={setAllowance} keyboardType="decimal-pad" error={errors.allowance ?? errors.monthly_allowance} />
        <Input label="تاريخ المباشرة" value={startedOn} onChangeText={setStartedOn} keyboardType="numbers-and-punctuation" error={errors.started ?? errors.started_on} />
      </ScrollView>

      <StickyFooter safeBottom>
        <Button label="حفظ الموظف" onPress={save} loading={saving} />
      </StickyFooter>

      <PickerSheet
        visible={pickerOpen}
        title="القسم"
        items={[{ id: 0, title: 'بدون قسم' }, ...departments]}
        onSelect={(i) => { setDepartment(Number(i.id) ? i : null); setPickerOpen(false); }}
        onClose={() => setPickerOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  body: { padding: 16, gap: 16 },
  label: { fontSize: 14, fontWeight: '700', color: Colors.textSoft, textAlign: 'auto' },
  hint: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { minHeight: Layout.minTouch, paddingHorizontal: 16, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line },
  chipOn: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  chipText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
});
