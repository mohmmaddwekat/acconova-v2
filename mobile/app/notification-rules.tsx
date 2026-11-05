import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Switch, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { Input } from '../components/ui/Input';
import { SkeletonList } from '../components/ui/Skeleton';
import { Text } from '../components/ui/Text';
import { useToast } from '../components/ui/Toast';
import { Colors, Layout, Radius, Shadow, StatusText } from '../constants/theme';
import { api } from '../lib/api';
import { apiErrorMessage } from '../lib/format';
import { t } from '../lib/i18n';
import { useBottomInset } from '../lib/insets';
import { listOf } from '../lib/tasks';
import { useStyles } from '../lib/theme';

interface Rule {
  id: number;
  name: string;
  category: string | null;
  kind: string | null;
  field: string;
  operator: string;
  threshold: string;
  active: boolean | number;
}

const KINDS: Record<string, string> = {
  low_stock: 'مخزون منخفض', out_of_stock: 'نفاد المخزون', inventory_expiry: 'انتهاء صلاحية المخزون', payment_due: 'استحقاق دفعة',
  payment_soon: 'دفعة قريبة', payment_recorded: 'تسجيل دفعة', approval_required: 'طلب موافقة', contract_expiry: 'انتهاء عقد',
  document_expiry: 'انتهاء وثيقة', follow_up_due: 'متابعة مستحقة',
};
const FIELDS: Record<string, string> = { amount: 'المبلغ', stock_quantity: 'كمية المخزون', invoice_total: 'إجمالي الفاتورة', count: 'العدد' };
const OPERATORS: Record<string, string> = { gt: 'أكبر من', gte: 'أكبر من أو يساوي', lt: 'أقل من', lte: 'أقل من أو يساوي', eq: 'يساوي' };
const CATEGORIES: Record<string, string> = { stock: 'المخزون', payments: 'المدفوعات', activity: 'النشاط', messages: 'الرسائل' };

const Chips = ({ options, value, onChange, styles }: { options: Record<string, string>; value: string; onChange: (k: string) => void; styles: ReturnType<typeof createStyles> }) => (
  <View style={styles.chips}>
    {Object.entries(options).map(([k, label]) => (
      <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: value === k }} onPress={() => onChange(k)} style={[styles.chip, value === k && styles.chipOn]}>
        <Text style={[styles.chipText, value === k && { color: Colors.accent }]}>{label}</Text>
      </Pressable>
    ))}
  </View>
);

export default function NotificationRulesScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const toast = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('stock');
  const [kind, setKind] = useState('low_stock');
  const [field, setField] = useState('stock_quantity');
  const [operator, setOperator] = useState('lt');
  const [threshold, setThreshold] = useState('');

  const load = useCallback(async () => {
    try {
      setFailed(false);
      const res = await api.get('/notification-rules');
      setRules(listOf<Rule>(res.data));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const payload = (r: Rule, active: boolean) => ({ name: r.name, category: r.category, kind: r.kind, field: r.field, operator: r.operator, threshold: String(r.threshold), active });

  async function toggle(rule: Rule, value: boolean) {
    setRules((cur) => cur.map((r) => (r.id === rule.id ? { ...r, active: value } : r)));
    try {
      await api.patch(`/notification-rules/${rule.id}`, payload(rule, value));
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر تحديث القاعدة'));
      await load();
    }
  }

  async function remove(rule: Rule) {
    try {
      await api.delete(`/notification-rules/${rule.id}`);
      toast('تم حذف القاعدة');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر حذف القاعدة'));
    }
  }

  async function create() {
    if (!name.trim() || !threshold.trim()) {
      toast('اكتب اسم القاعدة والقيمة');
      return;
    }
    setSaving(true);
    try {
      await api.post('/notification-rules', { name: name.trim(), category, kind, field, operator, threshold: threshold.trim(), active: true });
      toast('تمت إضافة القاعدة');
      setAdding(false);
      setName('');
      setThreshold('');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّرت إضافة القاعدة'));
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <View style={{ gap: 12 }}>
      <Text style={styles.intro}>حدّد متى يرسل لك النظام تنبيهاً، مثل: عندما ينزل مخزون صنف عن كمية معيّنة.</Text>
      {adding ? (
        <View style={styles.card}>
          <Input label="اسم القاعدة" value={name} onChangeText={setName} placeholder="مثال: تنبيه نفاد السكر" />
          <Text style={styles.label}>القسم</Text>
          <Chips options={CATEGORIES} value={category} onChange={setCategory} styles={styles} />
          <Text style={styles.label}>نوع الحدث</Text>
          <Chips options={KINDS} value={kind} onChange={setKind} styles={styles} />
          <Text style={styles.label}>الحقل</Text>
          <Chips options={FIELDS} value={field} onChange={setField} styles={styles} />
          <Text style={styles.label}>الشرط</Text>
          <Chips options={OPERATORS} value={operator} onChange={setOperator} styles={styles} />
          <Input label="القيمة" value={threshold} onChangeText={setThreshold} keyboardType="decimal-pad" placeholder="10" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button label="حفظ القاعدة" onPress={create} loading={saving} /></View>
            <View style={{ flex: 1 }}><Button label="إلغاء" variant="ghost" onPress={() => setAdding(false)} /></View>
          </View>
        </View>
      ) : (
        <Button label="+ قاعدة جديدة" onPress={() => setAdding(true)} />
      )}
    </View>
  );

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: true, title: t('قواعد الإشعارات'), headerTitleAlign: 'center', headerShadowVisible: false }} />
      {loading ? (
        <SkeletonList rows={4} />
      ) : failed ? (
        <EmptyState icon="wifiOff" title="تعذّر تحميل القواعد" actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={rules}
          keyExtractor={(r) => String(r.id)}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + bottomInset }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
          ListEmptyComponent={<EmptyState icon="bell" title="لا توجد قواعد بعد" message="أضف قاعدة ليصلك تنبيه عند حدوث الحالة." compact />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.top}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.meta}>
                    {[item.kind ? KINDS[item.kind] ?? null : null, `${FIELDS[item.field] ?? ''} ${OPERATORS[item.operator] ?? ''} ${item.threshold}`.trim()].filter(Boolean).join(' • ')}
                  </Text>
                </View>
                <Switch value={!!item.active} onValueChange={(v) => toggle(item, v)} trackColor={{ true: Colors.accent, false: Colors.lineStrong }} accessibilityLabel={`تفعيل ${item.name}`} />
              </View>
              <Pressable accessibilityRole="button" onPress={() => remove(item)} style={styles.delete}>
                <Icon name="close" size={16} color={StatusText.danger} />
                <Text style={styles.deleteText}>حذف القاعدة</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  intro: { fontSize: 14, color: Colors.textMuted, textAlign: 'auto', lineHeight: 22 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 12, ...Shadow.soft },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  meta: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  label: { fontSize: 14, fontWeight: '700', color: Colors.textSoft, textAlign: 'auto' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: Layout.minTouch, paddingHorizontal: 12, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.line },
  chipOn: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  chipText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  delete: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: Layout.minTouch, alignSelf: 'flex-start' },
  deleteText: { fontSize: 14, fontWeight: '700', color: StatusText.danger },
});
