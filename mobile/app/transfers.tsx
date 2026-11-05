import { Stack } from 'expo-router';
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
import { apiErrorMessage } from '../lib/format';
import { t } from '../lib/i18n';
import { useBottomInset } from '../lib/insets';
import { listOf } from '../lib/tasks';
import { useStyles } from '../lib/theme';

interface Transfer {
  id: number; product_name: string; sku?: string | null; source_warehouse_name: string; destination_warehouse_name: string;
  quantity: string; status: 'requested' | 'approved' | 'shipped' | 'received' | 'rejected'; note?: string | null; requested_by_name?: string | null;
}

type Filter = 'all' | 'requested' | 'approved' | 'shipped' | 'received' | 'rejected';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'الكل' }, { key: 'requested', label: 'مطلوب' }, { key: 'approved', label: 'معتمد' },
  { key: 'shipped', label: 'في الطريق' }, { key: 'received', label: 'مستلم' }, { key: 'rejected', label: 'مرفوض' },
];
const STATUS: Record<string, { label: string; fg: string; bg: string }> = {
  requested: { label: 'بانتظار الاعتماد', fg: StatusText.warning, bg: Tint.warningBg },
  approved: { label: 'معتمد', fg: Colors.accentStrong, bg: Tint.infoBg },
  shipped: { label: 'في الطريق', fg: Colors.accentStrong, bg: Tint.infoBg },
  received: { label: 'تم الاستلام', fg: StatusText.success, bg: Tint.successBg },
  rejected: { label: 'مرفوض', fg: StatusText.danger, bg: Tint.dangerBg },
};

export default function TransfersScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [rows, setRows] = useState<Transfer[]>([]);
  const [products, setProducts] = useState<PickerItem[]>([]);
  const [warehouses, setWarehouses] = useState<PickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [picker, setPicker] = useState<'product' | 'from' | 'to' | null>(null);
  const [product, setProduct] = useState<PickerItem | null>(null);
  const [from, setFrom] = useState<PickerItem | null>(null);
  const [to, setTo] = useState<PickerItem | null>(null);
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      setFailed(null);
      const res = await api.get('/inventory/transfer-requests', { params: { status: 'all' } });
      setRows(listOf<Transfer>(res.data));
      const options = res.data?.options ?? {};
      setProducts((options.products ?? []).map((p: { id: number; name: string; sku?: string }) => ({ id: p.id, title: p.name, subtitle: p.sku })));
      setWarehouses((options.warehouses ?? []).map((w: { id: number; name: string }) => ({ id: w.id, title: w.name })));
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setFailed(status === 403 ? 'ليست لديك صلاحية لعرض التحويلات.' : 'تعذّر تحميل التحويلات. تحقق من الاتصال.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!product || !from || !to) { toast('اختر الصنف والمستودعين'); return; }
    if (!/^\d+(\.\d+)?$/.test(quantity) || Number(quantity) <= 0) { toast('أدخل كمية صحيحة'); return; }
    setSaving(true);
    try {
      await api.post('/inventory/transfer-requests', { product_id: product.id, source_warehouse_id: from.id, destination_warehouse_id: to.id, quantity, ...(note.trim() ? { note: note.trim() } : {}) });
      toast('تم إرسال طلب النقل');
      setAdding(false);
      setProduct(null); setFrom(null); setTo(null); setQuantity(''); setNote('');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر إرسال الطلب'));
    } finally {
      setSaving(false);
    }
  }

  async function transition(row: Transfer, action: 'approve' | 'reject' | 'ship' | 'receive', ok: string) {
    setBusyId(row.id);
    try {
      await api.patch(`/inventory/transfer-requests/${row.id}`, { action });
      toast(ok);
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر تنفيذ الإجراء. قد لا يكفي الرصيد أو لا تملك الصلاحية'));
    } finally {
      setBusyId(null);
    }
  }

  const visible = rows.filter((r) => filter === 'all' || r.status === filter);
  const open = rows.filter((r) => r.status === 'requested' || r.status === 'approved' || r.status === 'shipped').length;

  const header = (
    <View style={{ gap: 16 }}>
      <View style={styles.summary}>
        <Text style={styles.summaryValue}>{open}</Text>
        <Text style={styles.summaryLabel}>تحويل قيد التنفيذ</Text>
      </View>
      {adding ? (
        <View style={styles.card}>
          <Text style={styles.name}>طلب نقل جديد</Text>
          <SelectField label="الصنف" value={product?.title} placeholder="اختر الصنف" onPress={() => setPicker('product')} />
          <SelectField label="من مستودع" value={from?.title} placeholder="اختر المستودع" onPress={() => setPicker('from')} />
          <SelectField label="إلى مستودع" value={to?.title} placeholder="اختر المستودع" onPress={() => setPicker('to')} />
          <Input label="الكمية" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
          <Input label="ملاحظة (اختياري)" value={note} onChangeText={setNote} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button label="إرسال الطلب" onPress={create} loading={saving} /></View>
            <View style={{ flex: 1 }}><Button label="إلغاء" variant="ghost" onPress={() => setAdding(false)} /></View>
          </View>
        </View>
      ) : (
        <Button label="+ طلب نقل بين مستودعات" onPress={() => setAdding(true)} />
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
      <Stack.Screen options={{ headerShown: true, title: t('تحويلات المستودعات'), headerTitleAlign: 'center', headerShadowVisible: false }} />
      {loading ? (
        <SkeletonList rows={5} />
      ) : failed ? (
        <EmptyState icon="refresh" title="تحويلات المستودعات" message={failed} actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(r) => String(r.id)}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + bottomInset }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
          ListEmptyComponent={<EmptyState icon="refresh" title="لا توجد تحويلات هنا" compact />}
          renderItem={({ item }) => {
            const st = STATUS[item.status];
            const busy = busyId === item.id;
            return (
              <View style={styles.card}>
                <View style={styles.top}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.name}>{item.product_name}</Text>
                    <Text style={styles.small}>{item.source_warehouse_name} ← {item.destination_warehouse_name}</Text>
                    <Text style={styles.small}>{[`الكمية ${Number(item.quantity)}`, item.requested_by_name ? `طلبها ${item.requested_by_name}` : null].filter(Boolean).join(' • ')}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: st.bg }]}><Text style={[styles.badgeText, { color: st.fg }]}>{st.label}</Text></View>
                </View>
                {item.note ? <Text style={styles.small}>{item.note}</Text> : null}
                {item.status === 'requested' ? (
                  <View style={styles.actions}>
                    <Pressable accessibilityRole="button" disabled={busy} onPress={() => transition(item, 'approve', 'تم اعتماد الطلب')} style={[styles.action, { backgroundColor: Tint.successBg, opacity: busy ? 0.5 : 1 }]}><Text style={[styles.actionText, { color: StatusText.success }]}>اعتماد</Text></Pressable>
                    <Pressable accessibilityRole="button" disabled={busy} onPress={() => transition(item, 'reject', 'تم رفض الطلب')} style={[styles.action, { backgroundColor: Tint.dangerBg, opacity: busy ? 0.5 : 1 }]}><Text style={[styles.actionText, { color: StatusText.danger }]}>رفض</Text></Pressable>
                  </View>
                ) : null}
                {item.status === 'approved' ? <Button label="شحن (خروج من المستودع المصدر)" onPress={() => transition(item, 'ship', 'تم الشحن')} loading={busy} /> : null}
                {item.status === 'shipped' ? <Button label="تأكيد الاستلام (دخول للمستودع الوجهة)" onPress={() => transition(item, 'receive', 'تم الاستلام وتحديث الرصيد')} loading={busy} /> : null}
              </View>
            );
          }}
        />
      )}
      <PickerSheet
        visible={picker !== null}
        title={picker === 'product' ? 'الصنف' : 'المستودع'}
        items={picker === 'product' ? products : picker === 'to' ? warehouses.filter((w) => w.id !== from?.id) : warehouses.filter((w) => w.id !== to?.id)}
        onSelect={(i) => { if (picker === 'product') setProduct(i); else if (picker === 'from') setFrom(i); else setTo(i); setPicker(null); }}
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
  badge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, minHeight: Layout.minTouch, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14, fontWeight: '800' },
  pill: { minHeight: Layout.minTouch, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line },
  pillOn: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  pillText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
});
