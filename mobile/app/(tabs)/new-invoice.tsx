import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { PickerSheet } from '../../components/ui/PickerSheet';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { SelectField } from '../../components/ui/SelectField';
import { StickyFooter } from '../../components/ui/StickyFooter';
import { useToast } from '../../components/ui/Toast';
import { Colors, Layout, Radius } from '../../constants/theme';
import { apiErrorMessage, formatMoney, todayISO } from '../../lib/format';
import { PartyOption, ProductOption, useParties, useProducts } from '../../lib/lookups';
import { submitQuickEntry } from '../../lib/quickEntry';

type Kind = 'sale' | 'purchase';
type PayMode = 'credit' | 'cash' | 'transfer';

interface Line {
  key: string;
  product: ProductOption;
  quantity: number;
  unitPrice: string;
}

const KINDS: Record<Kind, { title: string; party: string; partyType: string; color: string }> = {
  sale: { title: 'فاتورة بيع', party: 'العميل', partyType: 'customer', color: '#0369A1' },
  purchase: { title: 'فاتورة شراء', party: 'المورد', partyType: 'supplier', color: '#B45309' },
};

const PAY_MODES: { key: PayMode; label: string }[] = [
  { key: 'credit', label: 'آجل' },
  { key: 'cash', label: 'نقدي' },
  { key: 'transfer', label: 'تحويل' },
];

export default function NewInvoiceScreen() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const toast = useToast();
  const [kind, setKind] = useState<Kind>(params.kind === 'purchase' ? 'purchase' : 'sale');
  const meta = KINDS[kind];

  const { items: parties, loading: partiesLoading } = useParties();
  const { items: products, loading: productsLoading } = useProducts();
  const [party, setParty] = useState<PartyOption | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [payMode, setPayMode] = useState<PayMode>('credit');
  const [reference, setReference] = useState('');
  const [partyPicker, setPartyPicker] = useState(false);
  const [productPicker, setProductPicker] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [partyError, setPartyError] = useState<string | undefined>();

  const eligibleParties = useMemo(
    () => parties.filter((p) => !p.type || p.type === meta.partyType),
    [parties, meta.partyType],
  );

  const { subtotal, tax } = useMemo(() => {
    let sub = 0;
    let t = 0;
    lines.forEach((l) => {
      const amount = l.quantity * (Number(l.unitPrice) || 0);
      sub += amount;
      t += (amount * (Number(l.product.tax_rate) || 0)) / 100;
    });
    return { subtotal: sub, tax: t };
  }, [lines]);

  function addProduct(p: ProductOption) {
    setLines((prev) => {
      const existing = prev.find((l) => l.product.id === p.id);
      if (existing) return prev.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { key: `${p.id}-${Date.now()}`, product: p, quantity: 1, unitPrice: String(p.unit_price ?? 0) }];
    });
  }

  function changeQty(key: string, delta: number) {
    setLines((prev) =>
      prev.flatMap((l) => {
        if (l.key !== key) return [l];
        const q = l.quantity + delta;
        return q <= 0 ? [] : [{ ...l, quantity: q }];
      }),
    );
  }

  function validate(): boolean {
    if (!party) {
      setPartyError(`اختر ${meta.party}`);
      return false;
    }
    if (lines.length === 0) {
      toast('أضف بنداً واحداً على الأقل');
      return false;
    }
    return true;
  }

  async function save() {
    if (!party) return;
    setSaving(true);
    try {
      await submitQuickEntry({
        type: kind,
        party_id: party.id,
        reference: reference.trim() || undefined,
        lines: lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity, unit_price: Number(l.unitPrice) || 0 })),
        payment: payMode === 'credit' ? undefined : { full: true, method: payMode },
      });
      setConfirming(false);
      toast('تم حفظ الفاتورة');
      router.navigate('/(tabs)/invoices');
    } catch (err: any) {
      setConfirming(false);
      toast(err?.response ? apiErrorMessage(err, 'تعذّر حفظ الفاتورة') : err?.message ?? 'تعذّر الاتصال بالخادم');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader title="فاتورة جديدة" tone="solid" color={meta.color}>
        <View style={styles.toggle}>
          {(['sale', 'purchase'] as Kind[]).map((k) => (
            <Pressable
              key={k}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === k }}
              onPress={() => {
                setKind(k);
                setParty(null);
              }}
              style={[styles.toggleBtn, kind === k && styles.toggleBtnOn]}
            >
              <Text style={[styles.toggleText, kind === k && { color: KINDS[k].color }]}>{KINDS[k].title}</Text>
            </Pressable>
          ))}
        </View>
      </ScreenHeader>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <SelectField
            label={meta.party}
            value={party?.name}
            placeholder={partiesLoading ? 'جارٍ التحميل...' : `اختر ${meta.party}`}
            onPress={() => setPartyPicker(true)}
            error={partyError}
          />

          <View style={styles.dateBox}>
            <Icon name="calendar" size={18} color={Colors.textMuted} />
            <Text style={styles.dateText}>تاريخ الفاتورة: {todayISO()}</Text>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={styles.sectionLabel}>طريقة الدفع</Text>
            <View style={styles.row}>
              {PAY_MODES.map((m) => (
                <Chip key={m.key} label={m.label} selected={payMode === m.key} onPress={() => setPayMode(m.key)} />
              ))}
            </View>
          </View>

          <View style={styles.itemsHeader}>
            <Text style={styles.itemsTitle}>البنود ({lines.length})</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setProductPicker(true)}
              style={styles.addBtn}
            >
              <Icon name="plus" size={16} color={Colors.accent} strokeWidth={2.4} />
              <Text style={styles.addText}>إضافة بند</Text>
            </Pressable>
          </View>

          {lines.length === 0 ? (
            <View style={styles.emptyBox}>
              <EmptyState icon="file" title="لا توجد بنود بعد" message="أضف منتجاً أو خدمة لإنشاء الفاتورة." compact />
            </View>
          ) : (
            <View style={styles.linesBox}>
              {lines.map((l, i) => (
                <View key={l.key} style={[styles.line, i === lines.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.lineName} numberOfLines={1}>{l.product.name}</Text>
                    <Text style={styles.lineSub}>
                      {l.quantity} × {formatMoney(l.unitPrice)}
                    </Text>
                  </View>
                  <View style={styles.stepper}>
                    <Pressable accessibilityRole="button" accessibilityLabel="إنقاص الكمية" onPress={() => changeQty(l.key, -1)} style={styles.stepBtn}>
                      <Text style={styles.stepText}>−</Text>
                    </Pressable>
                    <Text style={styles.qty}>{l.quantity}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="زيادة الكمية" onPress={() => changeQty(l.key, 1)} style={styles.stepBtn}>
                      <Text style={styles.stepText}>+</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.lineTotal}>{formatMoney(l.quantity * (Number(l.unitPrice) || 0))}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>المجموع الفرعي</Text>
              <Text style={styles.totalNum}>{formatMoney(subtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>الضريبة (تقديرية)</Text>
              <Text style={styles.totalNum}>{formatMoney(tax)}</Text>
            </View>
            <View style={styles.sep} />
            <View style={styles.totalRow}>
              <Text style={styles.grandLabel}>الإجمالي</Text>
              <Text style={styles.grandNum}>{formatMoney(subtotal + tax)}</Text>
            </View>
          </View>

          <TextInput
            value={reference}
            onChangeText={setReference}
            placeholder="مرجع / ملاحظات (اختياري)"
            placeholderTextColor={Colors.textFaint}
            style={styles.reference}
            maxLength={96}
            accessibilityLabel="مرجع أو ملاحظات"
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <StickyFooter totalLabel="الإجمالي" totalValue={formatMoney(subtotal + tax)}>
        <Button label="حفظ الفاتورة" onPress={() => validate() && setConfirming(true)} style={{ flex: 1 }} />
      </StickyFooter>

      <PickerSheet
        visible={partyPicker}
        title={`اختيار ${meta.party}`}
        loading={partiesLoading}
        items={eligibleParties.map((p) => ({ id: p.id, title: p.name }))}
        onSelect={(item) => {
          setParty(parties.find((p) => p.id === item.id) ?? null);
          setPartyError(undefined);
          setPartyPicker(false);
        }}
        onClose={() => setPartyPicker(false)}
      />
      <PickerSheet
        visible={productPicker}
        title="إضافة بند"
        loading={productsLoading}
        items={products.map((p) => ({ id: p.id, title: p.name, subtitle: formatMoney(p.unit_price) }))}
        onSelect={(item) => {
          const p = products.find((x) => x.id === item.id);
          if (p) addProduct(p);
          setProductPicker(false);
        }}
        onClose={() => setProductPicker(false)}
      />
      <ConfirmDialog
        visible={confirming}
        title="تأكيد حفظ الفاتورة"
        description="سيتم ترحيل الفاتورة إلى الحسابات فور الحفظ."
        rows={[
          { label: 'النوع', value: meta.title },
          { label: meta.party, value: party?.name ?? '—' },
          { label: 'الإجمالي', value: formatMoney(subtotal + tax) },
        ]}
        confirmLabel="حفظ الفاتورة"
        loading={saving}
        onConfirm={save}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  toggle: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: 3, gap: 3, marginBottom: 4 },
  toggleBtn: { flex: 1, minHeight: Layout.minTouch, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  toggleBtnOn: { backgroundColor: '#fff' },
  toggleText: { fontSize: 14, fontWeight: '800', color: 'rgba(255,255,255,0.9)' },
  body: { padding: 14, gap: 12 },
  row: { flexDirection: 'row', gap: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, textAlign: 'right' },
  dateBox: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14,
    borderRadius: Radius.xs, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.line,
  },
  dateText: { fontSize: 14, fontWeight: '600', color: Colors.textSoft },
  itemsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemsTitle: { fontSize: 15, fontWeight: '800', color: Colors.text },
  addBtn: {
    minHeight: Layout.minTouch, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14,
    borderRadius: 12, backgroundColor: Colors.accentSoft,
  },
  addText: { fontSize: 14, fontWeight: '700', color: Colors.accentStrong },
  emptyBox: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.line, borderStyle: 'dashed' },
  linesBox: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.line, overflow: 'hidden' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.line },
  lineName: { fontSize: 14, fontWeight: '700', color: Colors.text, textAlign: 'right' },
  lineSub: { fontSize: 12, color: Colors.textMuted, textAlign: 'right' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  stepBtn: { width: Layout.minTouch, height: Layout.minTouch, borderRadius: 12, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 20, fontWeight: '800', color: Colors.accentStrong },
  qty: { minWidth: 22, textAlign: 'center', fontSize: 15, fontWeight: '800', color: Colors.text },
  lineTotal: { minWidth: 70, fontSize: 14, fontWeight: '800', color: Colors.text, textAlign: 'left' },
  totals: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.line, padding: 14, gap: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 14, color: Colors.textMuted },
  totalNum: { fontSize: 14, fontWeight: '700', color: Colors.text },
  sep: { height: 1, backgroundColor: Colors.line },
  grandLabel: { fontSize: 16, fontWeight: '800', color: Colors.text },
  grandNum: { fontSize: 16, fontWeight: '800', color: Colors.accentStrong },
  reference: {
    minHeight: 52, borderRadius: Radius.xs, borderWidth: 1.5, borderColor: Colors.line, backgroundColor: Colors.surface,
    paddingHorizontal: 14, fontSize: 15, color: Colors.text, textAlign: 'right',
  },
});
