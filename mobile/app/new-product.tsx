import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { StickyFooter } from '../components/ui/StickyFooter';
import { Text } from '../components/ui/Text';
import { useToast } from '../components/ui/Toast';
import { Colors, Layout, Radius } from '../constants/theme';
import { api } from '../lib/api';
import { apiErrorMessage } from '../lib/format';
import { t } from '../lib/i18n';
import { useStyles } from '../lib/theme';

const TYPES = [
  { key: 'product', label: 'منتج', hint: 'بضاعة تُباع وتُخزَّن' },
  { key: 'raw_material', label: 'مادة خام', hint: 'تدخل في تصنيع المنتجات' },
  { key: 'service', label: 'خدمة', hint: 'بدون مخزون' },
];
const NUMBER = /^\d+(\.\d+)?$/;

export default function NewProductScreen() {
  const styles = useStyles(createStyles);
  const router = useRouter();
  const toast = useToast();
  const [type, setType] = useState('product');
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState('قطعة');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [tax, setTax] = useState('0');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function save() {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'اسم الصنف مطلوب';
    if (!unit.trim()) next.unit = 'الوحدة مطلوبة';
    if (!NUMBER.test(price)) next.unit_price = 'أدخل سعر البيع';
    if (cost && !NUMBER.test(cost)) next.cost_price = 'رقم غير صحيح';
    if (!NUMBER.test(tax) || Number(tax) > 100) next.tax_rate = 'نسبة من 0 إلى 100';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      await api.post('/products', {
        type, name: name.trim(), sku: sku.trim() || null, unit: unit.trim(), unit_price: price,
        cost_price: cost || null, tax_rate: tax, description: description.trim() || null,
      });
      toast('تمت إضافة الصنف');
      router.back();
    } catch (err: unknown) {
      const fields = (err as { response?: { data?: { errors?: Record<string, string[]> } } })?.response?.data?.errors;
      if (fields) setErrors(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v[0]])));
      toast(apiErrorMessage(err, 'تعذّرت إضافة الصنف'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: true, title: t('صنف جديد'), headerTitleAlign: 'center', headerShadowVisible: false }} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 8 }}>
          <Text style={styles.label}>النوع</Text>
          <View style={styles.row}>
            {TYPES.map((x) => (
              <Pressable key={x.key} accessibilityRole="button" accessibilityState={{ selected: type === x.key }} onPress={() => setType(x.key)} style={[styles.chip, type === x.key && styles.chipOn]}>
                <Text style={[styles.chipText, type === x.key && { color: Colors.accent }]}>{x.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>{TYPES.find((x) => x.key === type)?.hint}</Text>
        </View>
        <Input label="اسم الصنف" value={name} onChangeText={setName} error={errors.name} />
        <Input label="الرمز SKU (اختياري)" value={sku} onChangeText={setSku} autoCapitalize="characters" error={errors.sku} />
        <Input label="الوحدة" value={unit} onChangeText={setUnit} error={errors.unit} placeholder="قطعة، كغ، لتر…" />
        <Input label="سعر البيع" value={price} onChangeText={setPrice} keyboardType="decimal-pad" error={errors.unit_price} />
        <Input label="سعر التكلفة (اختياري)" value={cost} onChangeText={setCost} keyboardType="decimal-pad" error={errors.cost_price} />
        <Input label="نسبة الضريبة %" value={tax} onChangeText={setTax} keyboardType="decimal-pad" error={errors.tax_rate} />
        <Input label="الوصف (اختياري)" value={description} onChangeText={setDescription} multiline style={{ minHeight: 80, textAlignVertical: 'top' }} />
      </ScrollView>
      <StickyFooter safeBottom>
        <Button label="حفظ الصنف" onPress={save} loading={saving} />
      </StickyFooter>
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
