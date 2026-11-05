import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Gradient } from '../../components/ui/Gradient';
import { Input } from '../../components/ui/Input';
import { PickerItem, PickerSheet } from '../../components/ui/PickerSheet';
import { SelectField } from '../../components/ui/SelectField';
import { SkeletonList } from '../../components/ui/Skeleton';
import { Text } from '../../components/ui/Text';
import { useToast } from '../../components/ui/Toast';
import { Colors, Layout, Radius, Shadow } from '../../constants/theme';
import { api } from '../../lib/api';
import { apiErrorMessage } from '../../lib/format';
import { t } from '../../lib/i18n';
import { useBottomInset } from '../../lib/insets';
import { useStyles } from '../../lib/theme';

interface Balance { warehouse: { id: number; name: string; is_default?: boolean }; on_hand: string; reserved: string; available: string }
interface WarehouseOpt { id: number; name: string }
interface Movement { id: number; type: string; quantity: string; balance_after?: string; note?: string | null; warehouse?: { name: string } | null; created_at?: string }
interface Detail { id: number; name: string; sku?: string | null; unit?: string | null; track_inventory?: boolean; balances?: Balance[]; warehouses?: WarehouseOpt[]; recent_movements?: Movement[] }

const MOVEMENT: Record<string, string> = {
  opening: 'رصيد افتتاحي', production_in: 'إنتاج (دخول)', production_out: 'إنتاج (صرف مواد)', production_reversal_in: 'عكس إنتاج (دخول)',
  production_reversal_out: 'عكس إنتاج (خروج)', adjustment: 'تعديل كمية', transfer_out: 'نقل (خروج)', transfer_in: 'نقل (دخول)',
  sale: 'بيع', purchase: 'شراء', customer_return: 'مرتجع عميل', supplier_return: 'مرتجع مورد',
};

type Mode = 'opening' | 'adjust' | 'transfer' | null;
const QTY = /^\d{1,14}(\.\d{1,4})?$/;

export default function StockScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [warehouse, setWarehouse] = useState<PickerItem | null>(null);
  const [target, setTarget] = useState<PickerItem | null>(null);
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [quantity, setQuantity] = useState('');
  const [decrease, setDecrease] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setFailed(false);
      const res = await api.get(`/inventory/products/${id}`);
      const body = (res.data?.data ?? res.data) as Detail;
      setDetail(body);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const warehouses: PickerItem[] = (detail?.warehouses ?? []).map((w) => ({ id: w.id, title: w.name }));
  const balances = detail?.balances ?? [];
  const totalOnHand = balances.reduce((s, b) => s + Number(b.on_hand), 0);
  const totalAvailable = balances.reduce((s, b) => s + Number(b.available), 0);
  const unit = detail?.unit ?? '';

  function open(next: Mode, source?: PickerItem) {
    setMode(next);
    setWarehouse(source ?? (warehouses.length === 1 ? warehouses[0] : null));
    setTarget(null);
    setQuantity('');
    setDecrease(false);
    setNote('');
  }

  async function submit() {
    if (!warehouse) { toast('اختر المستودع'); return; }
    if (!QTY.test(quantity) || Number(quantity) <= 0) { toast('أدخل كمية صحيحة'); return; }
    if (mode === 'transfer' && !target) { toast('اختر المستودع المستلم'); return; }
    setBusy(true);
    try {
      if (mode === 'opening') {
        await api.post(`/inventory/products/${id}/opening-stock`, { warehouse_id: warehouse.id, quantity, note: note.trim() || null });
        toast('تم تسجيل الرصيد الافتتاحي');
      } else if (mode === 'adjust') {
        await api.post(`/inventory/products/${id}/adjust`, { warehouse_id: warehouse.id, quantity: decrease ? `-${quantity}` : quantity, note: note.trim() || null });
        toast('تم تعديل الكمية');
      } else if (mode === 'transfer' && target) {
        await api.post(`/inventory/products/${id}/transfer`, { source_warehouse_id: warehouse.id, destination_warehouse_id: target.id, quantity, note: note.trim() || null });
        toast('تم نقل الكمية بين المستودعين');
      }
      setMode(null);
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّرت العملية'));
    } finally {
      setBusy(false);
    }
  }

  const header = <Stack.Screen options={{ headerShown: true, title: t('المخزون'), headerTitleAlign: 'center', headerShadowVisible: false }} />;

  if (loading) return <View style={styles.flex}>{header}<SkeletonList rows={4} /></View>;
  if (failed || !detail) return <View style={styles.flex}>{header}<EmptyState icon="wifiOff" title="تعذّر تحميل المخزون" message="قد لا تملك صلاحية عرضه." actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} /></View>;

  const tracked = detail.track_inventory !== false;

  return (
    <View style={styles.flex}>
      {header}
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 24 + bottomInset }]} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}>
        <Gradient colors={[Colors.accent, Colors.accentStrong]} style={styles.hero}>
          <View style={styles.glow} />
          <Text style={styles.heroLabel}>{detail.name}</Text>
          <Text style={styles.heroValue}>{totalOnHand} {unit}</Text>
          <Text style={styles.heroSub}>المتاح للبيع {totalAvailable} {unit} • {detail.sku ?? ''}</Text>
        </Gradient>

        {!tracked ? <Text style={styles.note}>هذا الصنف لا يتتبع المخزون. فعّل تتبع المخزون من الموقع لتسجيل الكميات.</Text> : (
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={() => open('opening')} style={styles.action}><Text style={styles.actionText}>رصيد افتتاحي</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => open('adjust')} style={styles.action}><Text style={styles.actionText}>تعديل الكمية</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => open('transfer')} style={styles.action}><Text style={styles.actionText}>نقل بين مستودعات</Text></Pressable>
          </View>
        )}

        {mode ? (
          <View style={styles.card}>
            <Text style={styles.name}>{mode === 'opening' ? 'رصيد افتتاحي' : mode === 'adjust' ? 'تعديل الكمية' : 'نقل بين مستودعات'}</Text>
            <SelectField label={mode === 'transfer' ? 'من مستودع' : 'المستودع'} value={warehouse?.title} placeholder="اختر المستودع" onPress={() => setPicker('from')} />
            {mode === 'transfer' ? <SelectField label="إلى مستودع" value={target?.title} placeholder="اختر المستودع المستلم" onPress={() => setPicker('to')} /> : null}
            {mode === 'adjust' ? (
              <View style={styles.seg}>
                {[{ k: false, l: 'زيادة' }, { k: true, l: 'نقص' }].map((o) => (
                  <Pressable key={String(o.k)} accessibilityRole="tab" accessibilityState={{ selected: decrease === o.k }} onPress={() => setDecrease(o.k)} style={[styles.segBtn, decrease === o.k && styles.segOn]}>
                    <Text style={[styles.segText, decrease === o.k && { color: Colors.accentStrong }]}>{o.l}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Input label={`الكمية${unit ? ` (${unit})` : ''}`} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
            <Input label="ملاحظة (اختياري)" value={note} onChangeText={setNote} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Button label="تأكيد" onPress={submit} loading={busy} /></View>
              <View style={{ flex: 1 }}><Button label="إلغاء" variant="ghost" onPress={() => setMode(null)} /></View>
            </View>
          </View>
        ) : null}

        <Text style={styles.section}>الأرصدة حسب المستودع</Text>
        {balances.length === 0 ? <EmptyState icon="home" title="لا توجد أرصدة بعد" message="سجّل رصيداً افتتاحياً في أحد المستودعات." compact /> : null}
        {balances.map((b) => (
          <View key={b.warehouse.id} style={styles.card}>
            <View style={styles.top}>
              <Text style={styles.name}>{b.warehouse.name}</Text>
              <Text style={styles.big}>{Number(b.on_hand)} {unit}</Text>
            </View>
            <Text style={styles.meta}>محجوز {Number(b.reserved)} • متاح {Number(b.available)}</Text>
            {tracked ? (
              <Pressable accessibilityRole="button" onPress={() => open('transfer', { id: b.warehouse.id, title: b.warehouse.name })} style={styles.link}><Text style={styles.actionText}>نقل من هذا المستودع</Text></Pressable>
            ) : null}
          </View>
        ))}
        {(detail.recent_movements?.length ?? 0) > 0 ? (
          <>
            <Text style={styles.section}>آخر الحركات</Text>
            {detail.recent_movements?.map((m) => (
              <View key={m.id} style={styles.card}>
                <View style={styles.top}>
                  <Text style={styles.name}>{MOVEMENT[m.type] ?? 'حركة'}</Text>
                  <Text style={[styles.big, Number(m.quantity) < 0 && { color: Colors.danger }]}>{Number(m.quantity) > 0 ? '+' : ''}{Number(m.quantity)}</Text>
                </View>
                <Text style={styles.meta}>{[m.warehouse?.name, m.created_at?.slice(0, 10), m.balance_after != null ? `الرصيد بعدها ${Number(m.balance_after)}` : null].filter(Boolean).join(' • ')}</Text>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>

      <PickerSheet
        visible={picker !== null}
        title="المستودع"
        items={picker === 'to' ? warehouses.filter((w) => w.id !== warehouse?.id) : warehouses}
        onSelect={(i) => { if (picker === 'to') setTarget(i); else setWarehouse(i); setPicker(null); }}
        onClose={() => setPicker(null)}
      />
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  body: { padding: 16, gap: 16 },
  hero: { borderRadius: Radius.lg, padding: 24, gap: 8, shadowColor: Colors.accentStrong, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 24, elevation: 6 },
  glow: { position: 'absolute', top: -48, right: -48, width: 160, height: 160, borderRadius: 80, backgroundColor: '#fff', opacity: 0.12 },
  heroLabel: { fontSize: 16, fontWeight: '700', color: '#fff', opacity: 0.9, textAlign: 'auto' },
  heroValue: { fontSize: 32, fontWeight: '800', color: '#fff', textAlign: 'auto' },
  heroSub: { fontSize: 14, color: '#fff', opacity: 0.9, textAlign: 'auto' },
  note: { fontSize: 14, color: Colors.textMuted, textAlign: 'auto', lineHeight: 22 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  action: { flexGrow: 1, minHeight: Layout.minTouch, paddingHorizontal: 12, borderRadius: Radius.sm, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14, fontWeight: '800', color: Colors.accentStrong },
  link: { minHeight: Layout.minTouch, justifyContent: 'center' },
  section: { fontSize: 14, fontWeight: '800', color: Colors.textSoft, textAlign: 'auto' },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 12, ...Shadow.soft },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  big: { fontSize: 18, fontWeight: '800', color: Colors.accentStrong },
  meta: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  seg: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: 12, backgroundColor: Colors.bgSoft },
  segBtn: { flex: 1, minHeight: Layout.minTouch, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: Colors.surface },
  segText: { fontSize: 14, fontWeight: '800', color: Colors.textMuted },
});
