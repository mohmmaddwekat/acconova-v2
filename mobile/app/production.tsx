import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { PickerItem, PickerSheet } from '../components/ui/PickerSheet';
import { SelectField } from '../components/ui/SelectField';
import { SkeletonList } from '../components/ui/Skeleton';
import { Text } from '../components/ui/Text';
import { useToast } from '../components/ui/Toast';
import { Colors, Layout, Radius, Shadow, StatusText, Tint } from '../constants/theme';
import { api } from '../lib/api';
import { apiErrorMessage, todayISO } from '../lib/format';
import { t } from '../lib/i18n';
import { useBottomInset } from '../lib/insets';
import { listOf } from '../lib/tasks';
import { useStyles } from '../lib/theme';

interface Output { id: number; quantity: string; product?: { id?: number; name?: string; sku?: string | null } | null }
interface Run {
  id: number; run_number: string; occurred_on: string; status: 'draft' | 'posted' | 'partially_reversed' | 'reversed';
  revision: number; note?: string | null; can_post?: boolean; can_reverse?: boolean; outputs?: Output[];
}

type Filter = 'all' | 'draft' | 'posted' | 'reversed';
const FILTERS: { key: Filter; label: string }[] = [{ key: 'all', label: 'الكل' }, { key: 'draft', label: 'مسودة' }, { key: 'posted', label: 'مرحّلة' }, { key: 'reversed', label: 'معكوسة' }];
const STATUS: Record<string, { label: string; fg: string; bg: string }> = {
  draft: { label: 'مسودة', fg: StatusText.warning, bg: Tint.warningBg },
  posted: { label: 'مرحّل', fg: StatusText.success, bg: Tint.successBg },
  partially_reversed: { label: 'معكوس جزئياً', fg: Colors.accentStrong, bg: Tint.infoBg },
  reversed: { label: 'معكوس', fg: StatusText.danger, bg: Tint.dangerBg },
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function ProductionScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [runs, setRuns] = useState<Run[]>([]);
  const [products, setProducts] = useState<PickerItem[]>([]);
  const [warehouses, setWarehouses] = useState<PickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [picker, setPicker] = useState<'product' | 'warehouse' | null>(null);
  const [product, setProduct] = useState<PickerItem | null>(null);
  const [warehouse, setWarehouse] = useState<PickerItem | null>(null);
  const [quantity, setQuantity] = useState('');
  const [date, setDate] = useState(todayISO());
  const [postNow, setPostNow] = useState(true);
  const [reversing, setReversing] = useState<Run | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      setFailed(null);
      const [runsRes, prodRes, whRes] = await Promise.all([
        api.get('/production-runs', { params: { per_page: 50 } }),
        api.get('/products', { params: { per_page: 100 } }).catch(() => null),
        api.get('/warehouses').catch(() => null),
      ]);
      setRuns(listOf<Run>(runsRes.data));
      const list = listOf<{ id: number; name: string; sku?: string | null; type?: string }>(prodRes?.data);
      setProducts(list.filter((p) => p.type !== 'service').map((p) => ({ id: p.id, title: p.name, subtitle: p.sku ?? undefined })));
      setWarehouses(listOf<{ id: number; name: string }>(whRes?.data).map((w) => ({ id: w.id, title: w.name })));
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setFailed(status === 403 ? 'ليست لديك صلاحية لعرض الإنتاج.' : 'تعذّر تحميل أوامر الإنتاج. تحقق من الاتصال.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!product || !warehouse) { toast('اختر المنتج والمستودع'); return; }
    if (!/^\d+(\.\d{1,4})?$/.test(quantity) || Number(quantity) <= 0 || !DATE.test(date)) { toast('تحقق من الكمية والتاريخ'); return; }
    setSaving(true);
    try {
      await api.post('/production-runs/quick', { warehouse_id: warehouse.id, post: postNow, rows: [{ occurred_on: date, product_id: product.id, quantity }] });
      toast(postNow ? 'تم تسجيل الإنتاج وترحيله' : 'تم حفظ أمر الإنتاج كمسودة');
      setAdding(false);
      setProduct(null); setQuantity('');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر تسجيل الإنتاج. تأكد من وجود وصفة ومواد خام كافية'));
    } finally {
      setSaving(false);
    }
  }

  async function post(run: Run) {
    setBusyId(run.id);
    try {
      await api.post(`/production-runs/${run.id}/post`, { expected_revision: run.revision });
      toast('تم ترحيل الإنتاج وتحديث المخزون');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر الترحيل. قد لا تكفي المواد الخام'));
    } finally {
      setBusyId(null);
    }
  }

  async function reverse() {
    if (!reversing) return;
    if (reason.trim().length < 3) { toast('اكتب سبب العكس'); return; }
    setBusyId(reversing.id);
    try {
      await api.post(`/production-runs/${reversing.id}/reverse`, { expected_revision: reversing.revision, reason: reason.trim() });
      toast('تم عكس الإنتاج');
      setReversing(null);
      setReason('');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر عكس الإنتاج'));
    } finally {
      setBusyId(null);
    }
  }

  const visible = runs.filter((r) => filter === 'all' || (filter === 'reversed' ? r.status === 'reversed' || r.status === 'partially_reversed' : r.status === filter));
  const drafts = runs.filter((r) => r.status === 'draft').length;

  const header = (
    <View style={{ gap: 16 }}>
      <View style={styles.summary}>
        <Text style={styles.summaryValue}>{drafts}</Text>
        <Text style={styles.summaryLabel}>أمر إنتاج بانتظار الترحيل</Text>
      </View>
      {adding ? (
        <View style={styles.card}>
          <Text style={styles.name}>تسجيل إنتاج</Text>
          <SelectField label="المنتج" value={product?.title} placeholder="اختر المنتج" onPress={() => setPicker('product')} />
          <SelectField label="مستودع الإنتاج" value={warehouse?.title} placeholder="اختر المستودع" onPress={() => setPicker('warehouse')} />
          <Input label="الكمية المنتجة" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
          <Input label="تاريخ الإنتاج" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" />
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: postNow }} onPress={() => setPostNow((v) => !v)} style={styles.checkRow}>
            <View style={[styles.box, postNow && styles.boxOn]}>{postNow ? <Text style={styles.tick}>✓</Text> : null}</View>
            <Text style={styles.small}>ترحيل مباشرة (خصم المواد الخام وإضافة المنتج للمخزون)</Text>
          </Pressable>
          <Text style={styles.small}>الترحيل متاح للمالك والمدير. غيرهم يحفظ الأمر كمسودة.</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button label="حفظ" onPress={create} loading={saving} /></View>
            <View style={{ flex: 1 }}><Button label="إلغاء" variant="ghost" onPress={() => setAdding(false)} /></View>
          </View>
        </View>
      ) : (
        <Button label="+ تسجيل إنتاج" onPress={() => setAdding(true)} />
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
      <Stack.Screen options={{ headerShown: true, title: t('الإنتاج'), headerTitleAlign: 'center', headerShadowVisible: false }} />
      {loading ? (
        <SkeletonList rows={5} />
      ) : failed ? (
        <EmptyState icon="checkSquare" title="الإنتاج" message={failed} actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(r) => String(r.id)}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + bottomInset }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
          ListEmptyComponent={<EmptyState icon="checkSquare" title="لا توجد أوامر إنتاج" message="سجّل أول إنتاج من الأعلى." compact />}
          renderItem={({ item }) => {
            const st = STATUS[item.status];
            const busy = busyId === item.id;
            return (
              <View style={styles.card}>
                <View style={styles.top}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.name}>{item.run_number}</Text>
                    <Text style={styles.small}>{item.occurred_on?.slice(0, 10)}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: st.bg }]}><Text style={[styles.badgeText, { color: st.fg }]}>{st.label}</Text></View>
                </View>
                {(item.outputs ?? []).map((o) => (
                  <View key={o.id} style={styles.lineRow}>
                    <Text style={styles.lineText} numberOfLines={1}>{o.product?.name ?? 'منتج'}</Text>
                    <Text style={styles.lineQty}>× {Number(o.quantity)}</Text>
                  </View>
                ))}
                {item.note ? <Text style={styles.small}>{item.note}</Text> : null}
                {item.can_post ? <Button label="ترحيل (تحديث المخزون)" onPress={() => post(item)} loading={busy} /> : null}
                {item.can_reverse ? (
                  <Pressable accessibilityRole="button" onPress={() => { setReversing(item); setReason(''); }} style={styles.reverse}><Text style={styles.reverseText}>عكس الإنتاج</Text></Pressable>
                ) : null}
              </View>
            );
          }}
        />
      )}
      <PickerSheet
        visible={picker !== null}
        title={picker === 'product' ? 'المنتج' : 'المستودع'}
        items={picker === 'product' ? products : warehouses}
        onSelect={(i) => { if (picker === 'product') setProduct(i); else setWarehouse(i); setPicker(null); }}
        onClose={() => setPicker(null)}
      />
      <ConfirmDialog
        visible={!!reversing}
        title="عكس أمر الإنتاج؟"
        description="سيُعاد المخزون كما كان قبل الترحيل. اكتب سبب العكس."
        confirmLabel="عكس"
        loading={busyId === reversing?.id}
        onConfirm={reverse}
        onCancel={() => setReversing(null)}
      >
        <Input label="السبب" value={reason} onChangeText={setReason} />
      </ConfirmDialog>
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
  small: { flexShrink: 1, fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  badge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  lineText: { flex: 1, fontSize: 14, color: Colors.textSoft, textAlign: 'auto' },
  lineQty: { fontSize: 14, fontWeight: '800', color: Colors.accentStrong },
  reverse: { minHeight: Layout.minTouch, alignItems: 'center', justifyContent: 'center' },
  reverseText: { fontSize: 14, fontWeight: '800', color: StatusText.danger },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: Layout.minTouch },
  box: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: Colors.lineStrong, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  tick: { color: '#fff', fontWeight: '800' },
  pill: { minHeight: Layout.minTouch, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line },
  pillOn: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  pillText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
});
