import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { PickerSheet } from '../components/ui/PickerSheet';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { SelectField } from '../components/ui/SelectField';
import { StickyFooter } from '../components/ui/StickyFooter';
import { useToast } from '../components/ui/Toast';
import { Colors, Layout, Radius } from '../constants/theme';
import { apiErrorMessage, formatMoney, todayISO } from '../lib/format';
import { PartyOption, ProductOption, partiesFor, useParties, useProducts } from '../lib/lookups';
import { fetchReferencePrice, priceSourceLabel, ReferencePrice, savePartyPrice } from '../lib/pricing';
import { submitQuickEntry } from '../lib/quickEntry';
import { useStyles } from '../lib/theme';
import { Text } from '../components/ui/Text';
import { TextInput } from '../components/ui/TextInput';

type Kind = 'sale' | 'purchase';
type PayMode = 'credit' | 'cash' | 'transfer';

interface Line {
  key: string;
  product: ProductOption;
  quantity: number;
  unitPrice: string;
  reference?: ReferencePrice | null;
  edited: boolean;
  savePrice: boolean;
}

const KINDS: Record<Kind, { title: string; party: string; partyType: 'customer' | 'supplier'; color: string }> = {
  sale: { title: 'فاتورة بيع', party: 'العميل', partyType: 'customer', color: '#0369A1' },
  purchase: { title: 'فاتورة شراء', party: 'المورد', partyType: 'supplier', color: '#B45309' },
};

const PAY_MODES: { key: PayMode; label: string }[] = [
  { key: 'credit', label: 'آجل' },
  { key: 'cash', label: 'نقدي' },
  { key: 'transfer', label: 'تحويل' },
];

export default function NewInvoiceScreen() {
  const styles = useStyles(createStyles);
  const params = useLocalSearchParams<{ kind?: string }>();
  const toast = useToast();
  const [kind, setKind] = useState<Kind>(params.kind === 'purchase' ? 'purchase' : 'sale');
  const meta = KINDS[kind];

  const { items: parties, loading: partiesLoading } = useParties();
  const { items: products, loading: productsLoading } = useProducts();
  const [party, setParty] = useState<PartyOption | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [payMode, setPayMode] = useState<PayMode>('credit');
  const [payAmount, setPayAmount] = useState('');
  const [reference, setReference] = useState('');
  const [partyPicker, setPartyPicker] = useState(false);
  const [productPicker, setProductPicker] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [partyError, setPartyError] = useState<string | undefined>();

  const documentKind = kind === 'sale' ? 'sale_invoice' : 'purchase_invoice';
  const eligibleParties = useMemo(() => partiesFor(parties, meta.partyType), [parties, meta.partyType]);

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

  function basePrice(p: ProductOption): string {
    const raw = kind === 'sale' ? p.unit_price : (p.cost_price ?? p.unit_price);
    return String(raw ?? 0);
  }

  /** Applies the party's reference price to lines whose price was not typed by hand. */
  async function applyReferencePrices(forParty: PartyOption, targets: Line[]) {
    const results = await Promise.all(targets.map((l) => fetchReferencePrice(documentKind, forParty.id, l.product.id)));
    setLines((prev) =>
      prev.map((l) => {
        const i = targets.findIndex((t) => t.key === l.key);
        const ref = i >= 0 ? results[i] : undefined;
        if (!ref) return l;
        if (l.edited) return { ...l, reference: ref };
        return { ...l, reference: ref, unitPrice: String(Number(ref.unit_price)) };
      }),
    );
  }

  function addProduct(p: ProductOption) {
    const existing = lines.find((l) => l.product.id === p.id);
    if (existing) {
      setLines((prev) => prev.map((l) => (l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l)));
      return;
    }
    const line: Line = {
      key: `${p.id}-${Date.now()}`,
      product: p,
      quantity: 1,
      unitPrice: basePrice(p),
      reference: null,
      edited: false,
      savePrice: false,
    };
    setLines((prev) => [...prev, line]);
    if (party) void applyReferencePrices(party, [line]);
  }

  function changePrice(key: string, text: string) {
    const cleaned = text.replace(/[^0-9.]/g, '');
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, unitPrice: cleaned, edited: true } : l)));
  }

  function toggleSavePrice(key: string) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, savePrice: !l.savePrice } : l)));
  }

  function selectParty(next: PartyOption | null) {
    setParty(next);
    if (next && lines.length > 0) void applyReferencePrices(next, lines);
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
    if (payMode !== 'credit' && payAmount !== '') {
      const paid = Number(payAmount);
      if (!(paid > 0) || paid > subtotal + tax + 0.005) {
        toast('مبلغ الدفعة يجب أن يكون أكبر من صفر ولا يتجاوز إجمالي الفاتورة');
        return false;
      }
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
        payment:
          payMode === 'credit'
            ? undefined
            : payAmount !== ''
              ? { amount: Number(payAmount), method: payMode }
              : { full: true, method: payMode },
      });
      if (kind === 'sale') {
        const toSave = lines.filter((l) => l.savePrice && Number(l.unitPrice) >= 0);
        const outcomes = await Promise.allSettled(toSave.map((l) => savePartyPrice(party.id, l.product.id, Number(l.unitPrice))));
        const failures = outcomes.filter((r) => r.status === 'rejected').length;
        if (failures > 0) toast('تم حفظ الفاتورة، لكن تعذّر حفظ بعض الأسعار الخاصة');
        else if (toSave.length > 0) toast('تم حفظ الفاتورة وأسعار العميل');
        else toast('تم حفظ الفاتورة');
      } else {
        toast('تم حفظ الفاتورة');
      }
      setConfirming(false);
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
                setLines([]);
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
            {payMode !== 'credit' && (
              <View style={styles.payBox}>
                <Text style={styles.priceLabel}>المبلغ المدفوع (اتركه فارغاً لدفع الإجمالي كاملاً)</Text>
                <TextInput
                  value={payAmount}
                  onChangeText={(t) => setPayAmount(t.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                  placeholder={formatMoney(subtotal + tax)}
                  style={styles.priceInput}
                  accessibilityLabel="المبلغ المدفوع"
                />
              </View>
            )}
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
              {lines.map((l, i) => {
                const priceNumber = Number(l.unitPrice) || 0;
                const differs = !!l.reference && Math.abs(priceNumber - Number(l.reference.unit_price)) > 0.0001;
                return (
                  <View key={l.key} style={[styles.line, i === lines.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={styles.lineTop}>
                      <Text style={styles.lineName} numberOfLines={1}>{l.product.name}</Text>
                      <Text style={styles.lineTotal}>{formatMoney(l.quantity * priceNumber)}</Text>
                    </View>
                    <View style={styles.lineControls}>
                      <View style={styles.priceBox}>
                        <Text style={styles.priceLabel}>سعر الوحدة</Text>
                        <TextInput
                          value={l.unitPrice}
                          onChangeText={(t) => changePrice(l.key, t)}
                          keyboardType="decimal-pad"
                          selectTextOnFocus
                          style={styles.priceInput}
                          accessibilityLabel={`سعر وحدة ${l.product.name}`}
                        />
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
                    </View>
                    {l.reference ? (
                      <Text style={styles.priceHint}>{priceSourceLabel(l.reference)}: {formatMoney(l.reference.unit_price)}</Text>
                    ) : !party ? (
                      <Text style={styles.priceHint}>اختر {meta.party} لتطبيق سعره المحفوظ.</Text>
                    ) : null}
                    {kind === 'sale' && party && differs ? (
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: l.savePrice }}
                        onPress={() => toggleSavePrice(l.key)}
                        style={[styles.saveChip, l.savePrice && styles.saveChipOn]}
                      >
                        <Icon name={l.savePrice ? 'check' : 'plus'} size={14} color={l.savePrice ? '#fff' : Colors.accentStrong} strokeWidth={2.6} />
                        <Text style={[styles.saveChipText, l.savePrice && { color: '#fff' }]}>حفظ كسعر دائم لهذا العميل</Text>
                      </Pressable>
                    ) : null}
                    {differs && !l.savePrice ? (
                      <Text style={styles.priceHint}>السعر الجديد سيُستخدم تلقائياً كآخر سعر في الفاتورة القادمة لنفس {meta.party}.</Text>
                    ) : null}
                  </View>
                );
              })}
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

      <StickyFooter safeBottom totalLabel="الإجمالي" totalValue={formatMoney(subtotal + tax)}>
        <Button label="حفظ الفاتورة" onPress={() => validate() && setConfirming(true)} style={{ flex: 1 }} />
      </StickyFooter>

      <PickerSheet
        visible={partyPicker}
        title={`اختيار ${meta.party}`}
        loading={partiesLoading}
        items={eligibleParties.map((p) => ({ id: p.id, title: p.name }))}
        onSelect={(item) => {
          selectParty(parties.find((p) => p.id === item.id) ?? null);
          setPartyError(undefined);
          setPartyPicker(false);
        }}
        onClose={() => setPartyPicker(false)}
      />
      <PickerSheet
        visible={productPicker}
        title="إضافة بند"
        loading={productsLoading}
        items={products.map((p) => ({ id: p.id, title: p.name, subtitle: formatMoney(basePrice(p)) }))}
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

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  toggle: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: 3, gap: 3, marginBottom: 4 },
  toggleBtn: { flex: 1, minHeight: Layout.minTouch, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  toggleBtnOn: { backgroundColor: '#fff' },
  toggleText: { fontSize: 14, fontWeight: '800', color: 'rgba(255,255,255,0.9)' },
  body: { padding: 14, gap: 12 },
  row: { flexDirection: 'row', gap: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, textAlign: 'auto' },
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
  line: { padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.line },
  lineTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  lineControls: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  priceBox: { flex: 1, gap: 4 },
  priceLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '600', textAlign: 'auto' },
  priceInput: {
    height: Layout.minTouch, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.line, backgroundColor: Colors.bg,
    paddingHorizontal: 12, fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto',
  },
  priceHint: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto', lineHeight: 18 },
  saveChip: {
    alignSelf: 'flex-start', minHeight: Layout.minTouch, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12,
    borderRadius: 12, backgroundColor: Colors.accentSoft,
  },
  saveChipOn: { backgroundColor: Colors.accent },
  saveChipText: { fontSize: 13, fontWeight: '800', color: Colors.accentStrong },
  lineName: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.text, textAlign: 'auto' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  stepBtn: { width: Layout.minTouch, height: Layout.minTouch, borderRadius: 12, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 20, fontWeight: '800', color: Colors.accentStrong },
  qty: { minWidth: 22, textAlign: 'center', fontSize: 15, fontWeight: '800', color: Colors.text },
  lineTotal: { fontSize: 14, fontWeight: '800', color: Colors.text },
  payBox: { gap: 4, marginTop: 6 },
  totals: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.line, padding: 14, gap: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 14, color: Colors.textMuted },
  totalNum: { fontSize: 14, fontWeight: '700', color: Colors.text },
  sep: { height: 1, backgroundColor: Colors.line },
  grandLabel: { fontSize: 16, fontWeight: '800', color: Colors.text },
  grandNum: { fontSize: 16, fontWeight: '800', color: Colors.accentStrong },
  reference: {
    minHeight: 52, borderRadius: Radius.xs, borderWidth: 1.5, borderColor: Colors.line, backgroundColor: Colors.surface,
    paddingHorizontal: 14, fontSize: 15, color: Colors.text, textAlign: 'auto',
  },
});
