import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Colors, Layout, Radius, Shadow, StatusText } from '../constants/theme';
import { api } from '../lib/api';
import { apiErrorMessage, formatMoney } from '../lib/format';
import { useProducts } from '../lib/lookups';
import { useStyles } from '../lib/theme';
import { Icon } from './ui/Icon';
import { PickerSheet } from './ui/PickerSheet';
import { SelectField } from './ui/SelectField';
import { Text } from './ui/Text';
import { TextInput } from './ui/TextInput';
import { useToast } from './ui/Toast';

interface PartyPrice {
  product_id: number;
  product_name: string;
  sku: string | null;
  unit_price: string;
  currency: string | null;
  note: string | null;
}

/** Customer-specific prices: the same list the website keeps, editable from the phone. */
export function PartyPricingPanel({ partyId }: { partyId: number }) {
  const styles = useStyles(createStyles);
  const toast = useToast();
  const { items: products } = useProducts();
  const [prices, setPrices] = useState<PartyPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [productId, setProductId] = useState<number | null>(null);
  const [unitPrice, setUnitPrice] = useState('');
  const [note, setNote] = useState('');
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/parties/${partyId}/prices`);
      setPrices(Array.isArray(data?.data) ? data.data : []);
    } catch {
      toast('تعذّر تحميل الأسعار الخاصة');
    } finally {
      setLoading(false);
    }
  }, [partyId, toast]);

  useEffect(() => { load(); }, [load]);

  const available = useMemo(
    () => products.filter((p) => !prices.some((x) => x.product_id === p.id)),
    [products, prices],
  );
  const selected = products.find((p) => p.id === productId);

  async function add() {
    if (busy || productId == null || unitPrice.trim() === '') return;
    setBusy(true);
    try {
      await api.post(`/parties/${partyId}/prices`, {
        product_id: productId,
        unit_price: Number(unitPrice),
        note: note.trim() || null,
      });
      setProductId(null);
      setUnitPrice('');
      setNote('');
      await load();
      toast('تم حفظ السعر الخاص');
    } catch (err: any) {
      toast(apiErrorMessage(err, 'تعذّر حفظ السعر الخاص'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (busy) return;
    setBusy(true);
    try {
      await api.delete(`/parties/${partyId}/prices/${id}`);
      await load();
    } catch (err: any) {
      toast(apiErrorMessage(err, 'تعذّر حذف السعر الخاص'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>الأسعار الخاصة</Text>
      <Text style={styles.hint}>يُقترح هذا السعر تلقائياً عند إنشاء فاتورة لهذا الطرف، ويمكن تعديله داخل الفاتورة.</Text>

      <SelectField
        label="المنتج"
        value={selected?.name}
        placeholder="اختر منتجاً"
        onPress={() => setPicker(true)}
      />
      <View style={styles.formRow}>
        <TextInput
          value={unitPrice}
          onChangeText={(t) => setUnitPrice(t.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          placeholder="السعر"
          style={[styles.input, { flex: 1 }]}
          accessibilityLabel="السعر الخاص"
        />
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="ملاحظة (اختياري)"
          style={[styles.input, { flex: 1.4 }]}
          accessibilityLabel="ملاحظة"
        />
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={busy || productId == null || unitPrice.trim() === ''}
        onPress={add}
        style={[styles.addBtn, (busy || productId == null || unitPrice.trim() === '') && { opacity: 0.45 }]}
      >
        <Icon name="plus" size={16} color="#fff" strokeWidth={2.4} />
        <Text style={styles.addText}>إضافة السعر</Text>
      </Pressable>

      {loading ? null : prices.length === 0 ? (
        <Text style={styles.empty}>لا توجد أسعار خاصة لهذا الطرف بعد.</Text>
      ) : (
        prices.map((p) => (
          <View key={p.product_id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{p.product_name}</Text>
              {[p.sku, p.note].filter(Boolean).length > 0 && (
                <Text style={styles.meta} numberOfLines={1}>{[p.sku, p.note].filter(Boolean).join(' · ')}</Text>
              )}
            </View>
            <Text style={styles.price}>{formatMoney(p.unit_price)}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`حذف سعر ${p.product_name}`}
              onPress={() => remove(p.product_id)}
              style={styles.delBtn}
            >
              <Icon name="close" size={16} color={StatusText.danger} />
            </Pressable>
          </View>
        ))
      )}

      <PickerSheet
        visible={picker}
        title="اختر منتجاً"
        items={available.map((p) => ({ id: p.id, title: p.name, subtitle: formatMoney(p.unit_price) }))}
        onSelect={(item) => {
          setProductId(Number(item.id));
          setPicker(false);
        }}
        onClose={() => setPicker(false)}
      />
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 14, gap: 10, ...Shadow.soft },
  title: { fontSize: 15, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  hint: { fontSize: 12, color: Colors.textMuted, lineHeight: 18, textAlign: 'auto' },
  formRow: { flexDirection: 'row', gap: 8 },
  input: {
    minHeight: Layout.minTouch, borderRadius: 12, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.bg,
    paddingHorizontal: 12, fontSize: 14, color: Colors.text,
  },
  addBtn: {
    minHeight: Layout.minTouch, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 12, backgroundColor: Colors.accent,
  },
  addText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  empty: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.line },
  name: { fontSize: 14, fontWeight: '700', color: Colors.text, textAlign: 'auto' },
  meta: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  price: { fontSize: 14, fontWeight: '800', color: Colors.accentStrong },
  delBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
