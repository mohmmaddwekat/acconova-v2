import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { DateField } from '../../components/ui/DateField';
import { EmptyState } from '../../components/ui/EmptyState';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { SkeletonList } from '../../components/ui/Skeleton';
import { StickyFooter } from '../../components/ui/StickyFooter';
import { useToast } from '../../components/ui/Toast';
import { Colors, Layout, Radius, Shadow, StatusText, Tint } from '../../constants/theme';
import { api } from '../../lib/api';
import { statusBadge } from '../../lib/documents';
import { apiErrorMessage, formatMoney, todayISO } from '../../lib/format';
import { useStyles } from '../../lib/theme';
import { Text } from '../../components/ui/Text';
import { TextInput } from '../../components/ui/TextInput';

interface Line {
  description: string;
  quantity: string;
  unit_price: string;
  line_total: string;
}

interface Allocation {
  id: number;
  cash_number: string | null;
  amount: string;
  movement_date: string | null;
  method: string | null;
  check_number?: string | null;
  check_due_date?: string | null;
  check_status?: string | null;
}

interface Detail {
  id: number;
  number: string;
  kind: 'sale_invoice' | 'purchase_invoice';
  status: string;
  issue_date: string;
  due_date: string | null;
  currency: string;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  total: string;
  paid_total: string;
  balance_due: string;
  party: { id: number; name: string | null } | null;
  party_detail: { name: string | null; phone: string | null } | null;
  lines: Line[];
  allocations: Allocation[];
}

type Method = 'cash' | 'bank_transfer' | 'check';

const METHOD_LABEL: Record<string, string> = { cash: 'نقدي', bank_transfer: 'تحويل بنكي', check: 'شيك' };
const CHECK_STATUS_LABEL: Record<string, string> = { pending: 'معلّق', cleared: 'محصّل', bounced: 'مرتجع', cancelled: 'ملغى' };

export default function InvoiceDetailScreen() {
  const styles = useStyles(createStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const [doc, setDoc] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paying, setPaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [method, setMethod] = useState<Method>('cash');
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(todayISO());
  const [checkNumber, setCheckNumber] = useState('');
  const [checkBank, setCheckBank] = useState('');
  const [checkDue, setCheckDue] = useState('');
  const insets = useSafeAreaInsets();

  function openPay() {
    if (!doc) return;
    setMethod('cash');
    setPayAmount(String(Number(doc.balance_due)));
    setPayDate(todayISO());
    setCheckNumber('');
    setCheckBank('');
    setCheckDue('');
    setPaying(true);
  }

  const load = useCallback(async () => {
    try {
      setFailed(false);
      const { data } = await api.get(`/finance/documents/${id}`);
      setDoc(data.data);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function pay() {
    if (!doc) return;
    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      toast('أدخل مبلغاً صحيحاً');
      return;
    }
    if (amount > Number(doc.balance_due) + 0.0001) {
      toast('المبلغ أكبر من المتبقي على الفاتورة');
      return;
    }
    if (method === 'check') {
      if (!checkNumber.trim() || !checkBank.trim()) {
        toast('أدخل رقم الشيك واسم البنك');
        return;
      }
      if (!checkDue) {
        toast('اختر تاريخ استحقاق الشيك');
        return;
      }
      if (checkDue < payDate) {
        toast('تاريخ استحقاق الشيك لا يمكن أن يسبق تاريخ الدفعة');
        return;
      }
    }
    const sale = doc.kind === 'sale_invoice';
    setSaving(true);
    try {
      const { data } = await api.post('/finance/cash-movements', {
        direction: sale ? 'incoming' : 'outgoing',
        party_id: doc.party?.id,
        category: sale ? 'customer_receipt' : 'supplier_payment',
        amount,
        currency: doc.currency,
        movement_date: payDate,
        method,
        ...(method === 'check' ? { check_number: checkNumber.trim(), check_bank: checkBank.trim(), check_due_date: checkDue } : {}),
        reference: doc.number,
        allocations: [{ financial_document_id: doc.id, amount }],
      });
      await api.post(`/finance/cash-movements/${data.data.id}/post`);
      setPaying(false);
      toast(sale ? 'تم تسجيل الدفعة المقبوضة' : 'تم تسجيل الدفعة المدفوعة');
      await load();
    } catch (err: any) {
      toast(apiErrorMessage(err, 'تعذّر تسجيل الدفعة'));
    } finally {
      setSaving(false);
    }
  }

  const badge = doc ? statusBadge(doc) : null;
  const canPay = !!doc && Number(doc.balance_due) > 0 && ['issued', 'partially_paid', 'overpaid'].includes(doc.status);

  return (
    <View style={styles.flex}>
      <ScreenHeader title={doc?.number ?? 'تفاصيل الفاتورة'} />

      {loading ? (
        <SkeletonList rows={4} />
      ) : failed || !doc ? (
        <EmptyState icon="wifiOff" title="تعذّر تحميل الفاتورة" message="تحقق من الاتصال ثم حاول مرة أخرى." actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.body}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
          >
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.party}>{doc.party_detail?.name ?? doc.party?.name ?? '—'}</Text>
                {badge && (
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.badgeText, { color: badge.fg }]}>{badge.label}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.meta}>تاريخ الإصدار: {doc.issue_date}</Text>
              {doc.due_date ? <Text style={styles.meta}>تاريخ الاستحقاق: {doc.due_date}</Text> : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>البنود</Text>
              {doc.lines.map((l, i) => (
                <View key={i} style={[styles.line, i === doc.lines.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lineName}>{l.description}</Text>
                    <Text style={styles.meta}>{Number(l.quantity)} × {formatMoney(l.unit_price)}</Text>
                  </View>
                  <Text style={styles.lineTotal}>{formatMoney(l.line_total)}</Text>
                </View>
              ))}
            </View>

            <View style={styles.card}>
              <View style={styles.row}><Text style={styles.meta}>المجموع الفرعي</Text><Text style={styles.value}>{formatMoney(doc.subtotal)}</Text></View>
              {Number(doc.discount_total) > 0 && <View style={styles.row}><Text style={styles.meta}>الخصم</Text><Text style={styles.value}>- {formatMoney(doc.discount_total)}</Text></View>}
              <View style={styles.row}><Text style={styles.meta}>الضريبة</Text><Text style={styles.value}>{formatMoney(doc.tax_total)}</Text></View>
              <View style={styles.sep} />
              <View style={styles.row}><Text style={styles.grand}>الإجمالي</Text><Text style={styles.grand}>{formatMoney(doc.total)}</Text></View>
              <View style={styles.row}><Text style={styles.meta}>المدفوع</Text><Text style={[styles.value, { color: StatusText.success }]}>{formatMoney(doc.paid_total)}</Text></View>
              <View style={styles.row}><Text style={styles.meta}>المتبقي</Text><Text style={[styles.value, { color: Number(doc.balance_due) > 0 ? StatusText.warning : Colors.text }]}>{formatMoney(doc.balance_due)}</Text></View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>الدفعات</Text>
              {doc.allocations.length === 0 ? (
                <Text style={styles.meta}>لا توجد دفعات على هذه الفاتورة بعد.</Text>
              ) : (
                doc.allocations.map((a, i) => (
                  <View key={a.id} style={[styles.line, i === doc.allocations.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lineName}>{a.cash_number ?? `#${a.id}`}</Text>
                      <Text style={styles.meta}>{a.movement_date ?? ''} · {METHOD_LABEL[a.method ?? ''] ?? a.method ?? ''}</Text>
                      {a.method === 'check' ? (
                        <Text style={styles.meta}>
                          شيك رقم {a.check_number ?? '—'}{a.check_due_date ? ` · يستحق ${a.check_due_date}` : ''}
                          {a.check_status ? ` · ${CHECK_STATUS_LABEL[a.check_status] ?? a.check_status}` : ''}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.lineTotal}>{formatMoney(a.amount)}</Text>
                  </View>
                ))
              )}
              {canPay && <Button label={doc.kind === 'sale_invoice' ? 'إضافة دفعة مقبوضة' : 'إضافة دفعة مدفوعة'} variant="ghost" onPress={openPay} />}
            </View>
          </ScrollView>

          {canPay && (
            <StickyFooter safeBottom totalLabel="المتبقي" totalValue={formatMoney(doc.balance_due)}>
              <Button label={doc.kind === 'sale_invoice' ? 'تسجيل قبض' : 'تسجيل دفع'} onPress={openPay} style={{ flex: 1 }} />
            </StickyFooter>
          )}
        </>
      )}

      <Modal visible={paying} transparent animationType="slide" onRequestClose={() => setPaying(false)} statusBarTranslucent>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !saving && setPaying(false)} accessibilityLabel="إغلاق" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]} accessibilityViewIsModal>
            <View style={styles.grab} />
            <Text style={styles.sheetTitle}>{doc?.kind === 'sale_invoice' ? 'تسجيل دفعة مقبوضة' : 'تسجيل دفعة مدفوعة'}</Text>
            <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {doc ? (
                <View style={styles.sheetRows}>
                  <View style={styles.row}><Text style={styles.meta}>الفاتورة</Text><Text style={styles.value}>{doc.number}</Text></View>
                  <View style={styles.row}><Text style={styles.meta}>المتبقي</Text><Text style={styles.value}>{formatMoney(doc.balance_due)}</Text></View>
                </View>
              ) : null}

              <View style={{ gap: 6 }}>
                <Text style={styles.meta}>المبلغ</Text>
                <TextInput
                  value={payAmount}
                  onChangeText={(t) => setPayAmount(t.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                  style={styles.input}
                  accessibilityLabel="المبلغ"
                />
              </View>

              <DateField label="تاريخ الدفعة" value={payDate} onChange={setPayDate} max={todayISO()} />

              <View style={{ gap: 6 }}>
                <Text style={styles.meta}>طريقة الدفع</Text>
                <View style={styles.methods}>
                  <Chip label="نقدي" selected={method === 'cash'} onPress={() => setMethod('cash')} />
                  <Chip label="تحويل بنكي" selected={method === 'bank_transfer'} onPress={() => setMethod('bank_transfer')} />
                  <Chip label="شيك" selected={method === 'check'} onPress={() => setMethod('check')} />
                </View>
              </View>

              {method === 'check' && (
                <View style={{ gap: 12 }}>
                  <TextInput
                    value={checkNumber}
                    onChangeText={setCheckNumber}
                    placeholder="رقم الشيك"
                    style={styles.input}
                    maxLength={120}
                    accessibilityLabel="رقم الشيك"
                  />
                  <TextInput
                    value={checkBank}
                    onChangeText={setCheckBank}
                    placeholder="اسم البنك"
                    style={styles.input}
                    maxLength={160}
                    accessibilityLabel="اسم البنك"
                  />
                  <DateField label="تاريخ استحقاق الشيك" value={checkDue} onChange={setCheckDue} min={payDate} />
                </View>
              )}
            </ScrollView>
            <View style={styles.sheetActions}>
              <Button label="إلغاء" variant="ghost" onPress={() => setPaying(false)} disabled={saving} style={{ flex: 1 }} />
              <Button label="تأكيد" onPress={pay} loading={saving} style={{ flex: 1 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  body: { padding: 14, gap: 12 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 14, gap: 8, ...Shadow.soft },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  party: { fontSize: 17, fontWeight: '800', color: Colors.text, flex: 1, textAlign: 'auto' },
  meta: { fontSize: 13, color: Colors.textMuted, textAlign: 'auto' },
  value: { fontSize: 14, fontWeight: '700', color: Colors.text },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.line },
  lineName: { fontSize: 14, fontWeight: '700', color: Colors.text, textAlign: 'auto' },
  lineTotal: { fontSize: 14, fontWeight: '800', color: Colors.text },
  sep: { height: 1, backgroundColor: Colors.line },
  grand: { fontSize: 16, fontWeight: '800', color: Colors.text },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  methods: { flexDirection: 'row', gap: 8 },
  backdrop: { flex: 1, backgroundColor: Tint.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8, gap: 12, maxHeight: '90%' },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.line },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  sheetRows: { backgroundColor: Colors.bg, borderRadius: 12, padding: 12, gap: 8 },
  sheetActions: { flexDirection: 'row', gap: 10 },
  input: {
    height: 52, borderRadius: Radius.xs, borderWidth: 1.5, borderColor: Colors.line, backgroundColor: Colors.surface,
    paddingHorizontal: 14, fontSize: 16, fontWeight: '700', color: Colors.text, textAlign: 'auto', minHeight: Layout.minTouch,
  },
});
