import { Stack, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { PickerItem, PickerSheet } from '../components/ui/PickerSheet';
import { SelectField } from '../components/ui/SelectField';
import { SkeletonList } from '../components/ui/Skeleton';
import { Text } from '../components/ui/Text';
import { useToast } from '../components/ui/Toast';
import { Colors, Layout, Radius, Shadow, StatusText, Tint } from '../constants/theme';
import { api } from '../lib/api';
import { apiErrorMessage, formatMoney } from '../lib/format';
import { t } from '../lib/i18n';
import { useBottomInset } from '../lib/insets';
import { listOf } from '../lib/tasks';
import { useStyles } from '../lib/theme';

interface Req {
  id: number; number: string; product_id: number | null; product_name: string | null; description: string; quantity: string;
  expected_unit_cost: string | null; preferred_supplier_id: number | null; supplier_name: string | null; needed_by: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'converted'; note: string | null; requested_by_name: string | null;
  converted_document_id: number | null; converted_document_number: string | null;
}

type Filter = 'all' | 'pending' | 'approved' | 'converted' | 'rejected';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'الكل' }, { key: 'pending', label: 'بانتظار القرار' }, { key: 'approved', label: 'معتمدة' },
  { key: 'converted', label: 'محوّلة لفاتورة' }, { key: 'rejected', label: 'مرفوضة' },
];
const STATUS: Record<string, { label: string; fg: string; bg: string }> = {
  pending: { label: 'بانتظار القرار', fg: StatusText.warning, bg: Tint.warningBg },
  approved: { label: 'معتمد', fg: Colors.accentStrong, bg: Tint.infoBg },
  rejected: { label: 'مرفوض', fg: StatusText.danger, bg: Tint.dangerBg },
  converted: { label: 'تحوّل لفاتورة', fg: StatusText.success, bg: Tint.successBg },
};

export default function RequisitionsScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [rows, setRows] = useState<Req[]>([]);
  const [products, setProducts] = useState<PickerItem[]>([]);
  const [suppliers, setSuppliers] = useState<PickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<'product' | 'supplier' | null>(null);

  const [product, setProduct] = useState<PickerItem | null>(null);
  const [supplier, setSupplier] = useState<PickerItem | null>(null);
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      setFailed(null);
      const res = await api.get('/purchase-requisitions', { params: { status: 'all' } });
      setRows(listOf<Req>(res.data));
      const options = res.data?.options ?? {};
      setProducts((options.products ?? []).map((p: { id: number; name: string; sku?: string }) => ({ id: p.id, title: p.name, subtitle: p.sku })));
      setSuppliers((options.suppliers ?? []).map((s: { id: number; name: string }) => ({ id: s.id, title: s.name })));
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setFailed(status === 403 ? 'ليست لديك صلاحية لعرض طلبات الشراء.' : 'تعذّر تحميل الطلبات. تحقق من الاتصال.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function act(row: Req, action: () => Promise<unknown>, ok: string, fallback: string) {
    setBusyId(row.id);
    try {
      await action();
      toast(ok);
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, fallback));
    } finally {
      setBusyId(null);
    }
  }

  async function create() {
    if (!description.trim() || !/^\d+(\.\d+)?$/.test(quantity) || Number(quantity) <= 0) {
      toast('اكتب وصف الصنف وكمية صحيحة');
      return;
    }
    setSaving(true);
    try {
      await api.post('/purchase-requisitions', {
        description: description.trim(), quantity,
        ...(product ? { product_id: product.id } : {}),
        ...(supplier ? { preferred_supplier_id: supplier.id } : {}),
        ...(cost.trim() ? { expected_unit_cost: cost.trim() } : {}),
        ...(neededBy.trim() ? { needed_by: neededBy.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast('تم إرسال طلب الشراء');
      setAdding(false);
      setDescription(''); setQuantity(''); setCost(''); setNeededBy(''); setNote(''); setProduct(null); setSupplier(null);
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر إرسال الطلب'));
    } finally {
      setSaving(false);
    }
  }

  const visible = rows.filter((r) => filter === 'all' || r.status === filter);
  const pending = rows.filter((r) => r.status === 'pending').length;

  const header = (
    <View style={{ gap: 16 }}>
      <View style={styles.summary}>
        <Text style={styles.summaryValue}>{pending}</Text>
        <Text style={styles.summaryLabel}>طلب بانتظار القرار</Text>
      </View>
      {adding ? (
        <View style={styles.card}>
          <Text style={styles.name}>طلب شراء جديد</Text>
          <SelectField label="الصنف (اختياري)" value={product?.title} placeholder="اختر من الكتالوج" onPress={() => setPicker('product')} />
          <Input label="وصف المطلوب" value={description} onChangeText={setDescription} placeholder={product?.title ?? 'مثال: كراتين تغليف'} />
          <Input label="الكمية" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
          <Input label="التكلفة المتوقعة للوحدة (اختياري)" value={cost} onChangeText={setCost} keyboardType="decimal-pad" />
          <SelectField label="المورد المفضل (اختياري)" value={supplier?.title} placeholder="اختر مورداً" onPress={() => setPicker('supplier')} />
          <Input label="مطلوب بتاريخ (اختياري)" value={neededBy} onChangeText={setNeededBy} placeholder="2026-12-15" keyboardType="numbers-and-punctuation" />
          <Input label="ملاحظة (اختياري)" value={note} onChangeText={setNote} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button label="إرسال الطلب" onPress={create} loading={saving} /></View>
            <View style={{ flex: 1 }}><Button label="إلغاء" variant="ghost" onPress={() => setAdding(false)} /></View>
          </View>
        </View>
      ) : (
        <Button label="+ طلب شراء جديد" onPress={() => setAdding(true)} />
      )}
      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(f) => f.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: filter === item.key }} onPress={() => setFilter(item.key)} style={[styles.pill, filter === item.key && styles.pillOn]}>
            <Text style={[styles.pillText, filter === item.key && { color: Colors.accent }]}>{item.label}</Text>
          </Pressable>
        )}
      />
    </View>
  );

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: true, title: t('طلبات الشراء'), headerTitleAlign: 'center', headerShadowVisible: false }} />
      {loading ? (
        <SkeletonList rows={5} />
      ) : failed ? (
        <EmptyState icon="fileDown" title="طلبات الشراء" message={failed} actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(r) => String(r.id)}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + bottomInset }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
          ListEmptyComponent={<EmptyState icon="fileDown" title="لا توجد طلبات هنا" compact />}
          renderItem={({ item }) => {
            const st = STATUS[item.status];
            const busy = busyId === item.id;
            const canConvert = item.status === 'approved' && !!item.preferred_supplier_id && !!item.product_id;
            return (
              <View style={styles.card}>
                <View style={styles.top}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.name}>{item.product_name ?? item.description}</Text>
                    <Text style={styles.small}>{[item.number, item.requested_by_name ? `من ${item.requested_by_name}` : null, item.needed_by ? `مطلوب ${item.needed_by}` : null].filter(Boolean).join(' • ')}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: st.bg }]}><Text style={[styles.badgeText, { color: st.fg }]}>{st.label}</Text></View>
                </View>
                <View style={styles.split}>
                  <View style={styles.cell}><Text style={styles.small}>الكمية</Text><Text style={styles.val}>{Number(item.quantity)}</Text></View>
                  <View style={styles.cell}><Text style={styles.small}>التكلفة المتوقعة</Text><Text style={styles.val}>{item.expected_unit_cost ? formatMoney(Number(item.expected_unit_cost) * Number(item.quantity)) : '—'}</Text></View>
                  <View style={styles.cell}><Text style={styles.small}>المورد</Text><Text style={styles.val} numberOfLines={1}>{item.supplier_name ?? '—'}</Text></View>
                </View>
                {item.note ? <Text style={styles.small}>{item.note}</Text> : null}

                {item.status === 'pending' ? (
                  <View style={styles.actions}>
                    <Pressable accessibilityRole="button" disabled={busy} onPress={() => act(item, () => api.patch(`/purchase-requisitions/${item.id}/review`, { decision: 'approved' }), 'تم اعتماد الطلب', 'تعذّر اعتماد الطلب')} style={[styles.action, { backgroundColor: Tint.successBg, opacity: busy ? 0.5 : 1 }]}><Text style={[styles.actionText, { color: StatusText.success }]}>اعتماد</Text></Pressable>
                    <Pressable accessibilityRole="button" disabled={busy} onPress={() => act(item, () => api.patch(`/purchase-requisitions/${item.id}/review`, { decision: 'rejected' }), 'تم رفض الطلب', 'تعذّر رفض الطلب')} style={[styles.action, { backgroundColor: Tint.dangerBg, opacity: busy ? 0.5 : 1 }]}><Text style={[styles.actionText, { color: StatusText.danger }]}>رفض</Text></Pressable>
                  </View>
                ) : null}
                {item.status === 'approved' ? (
                  canConvert ? (
                    <Button label="تحويل إلى فاتورة شراء" onPress={() => act(item, () => api.post(`/purchase-requisitions/${item.id}/convert`), 'تم إنشاء فاتورة الشراء', 'تعذّر التحويل')} loading={busy} />
                  ) : (
                    <Text style={styles.hint}>لتحويل الطلب لفاتورة يلزم تحديد الصنف والمورد المفضل في الطلب.</Text>
                  )
                ) : null}
                {item.status === 'converted' && item.converted_document_id ? (
                  <Pressable accessibilityRole="button" onPress={() => router.push(`/invoice/${item.converted_document_id}` as never)} style={styles.action}><Text style={styles.actionText}>فتح الفاتورة {item.converted_document_number ?? ''}</Text></Pressable>
                ) : null}
              </View>
            );
          }}
        />
      )}
      <PickerSheet
        visible={picker !== null}
        title={picker === 'product' ? 'الصنف' : 'المورد'}
        items={picker === 'product' ? products : suppliers}
        onSelect={(i) => {
          if (picker === 'product') { setProduct(i); if (!description.trim()) setDescription(i.title); } else setSupplier(i);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16 },
  summaryValue: { fontSize: 32, fontWeight: '800', color: Colors.accentStrong },
  summaryLabel: { fontSize: 16, fontWeight: '700', color: Colors.textSoft },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 12, ...Shadow.soft },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  small: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  hint: { fontSize: 12, color: StatusText.warning, textAlign: 'auto', lineHeight: 20 },
  split: { flexDirection: 'row', gap: 12 },
  cell: { flex: 1, gap: 4 },
  val: { fontSize: 14, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  badge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, minHeight: Layout.minTouch, borderRadius: Radius.sm, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14, fontWeight: '800', color: Colors.accentStrong },
  pill: { minHeight: Layout.minTouch, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line },
  pillOn: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  pillText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
});
