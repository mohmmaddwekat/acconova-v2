import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { SkeletonList } from '../../components/ui/Skeleton';
import { StickyFooter } from '../../components/ui/StickyFooter';
import { useToast } from '../../components/ui/Toast';
import { Colors, Radius, Shadow, StatusText } from '../../constants/theme';
import { api } from '../../lib/api';
import { statusBadge } from '../../lib/documents';
import { apiErrorMessage, formatMoney, todayISO } from '../../lib/format';
import { useStyles } from '../../lib/theme';
import { Text } from '../../components/ui/Text';

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

type Method = 'cash' | 'bank_transfer';

const METHOD_LABEL: Record<string, string> = { cash: 'نقدي', bank_transfer: 'تحويل بنكي', check: 'شيك' };

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

  async function pay(amountText?: string) {
    if (!doc) return;
    const amount = Number(amountText);
    if (!amount || amount <= 0) {
      toast('أدخل مبلغاً صحيحاً');
      return;
    }
    if (amount > Number(doc.balance_due) + 0.0001) {
      toast('المبلغ أكبر من المتبقي على الفاتورة');
      return;
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
        movement_date: todayISO(),
        method,
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

            {doc.allocations.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>الدفعات</Text>
                {doc.allocations.map((a, i) => (
                  <View key={a.id} style={[styles.line, i === doc.allocations.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lineName}>{a.cash_number ?? `#${a.id}`}</Text>
                      <Text style={styles.meta}>{a.movement_date ?? ''} · {METHOD_LABEL[a.method ?? ''] ?? a.method ?? ''}</Text>
                    </View>
                    <Text style={styles.lineTotal}>{formatMoney(a.amount)}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {canPay && (
            <StickyFooter safeBottom totalLabel="المتبقي" totalValue={formatMoney(doc.balance_due)}>
              <Button label={doc.kind === 'sale_invoice' ? 'تسجيل قبض' : 'تسجيل دفع'} onPress={() => setPaying(true)} style={{ flex: 1 }} />
            </StickyFooter>
          )}
        </>
      )}

      <ConfirmDialog
        visible={paying}
        title={doc?.kind === 'sale_invoice' ? 'تسجيل دفعة مقبوضة' : 'تسجيل دفعة مدفوعة'}
        description="ستُسجَّل الدفعة وتُخصم من رصيد هذه الفاتورة."
        rows={doc ? [{ label: 'الفاتورة', value: doc.number }, { label: 'المتبقي', value: formatMoney(doc.balance_due) }] : []}
        amountInput={doc ? { label: 'المبلغ', initial: String(Number(doc.balance_due)) } : undefined}
        confirmLabel="تأكيد"
        loading={saving}
        onConfirm={pay}
        onCancel={() => setPaying(false)}
      >
        <View style={styles.methods}>
          <Chip label="نقدي" selected={method === 'cash'} onPress={() => setMethod('cash')} />
          <Chip label="تحويل بنكي" selected={method === 'bank_transfer'} onPress={() => setMethod('bank_transfer')} />
        </View>
      </ConfirmDialog>
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
});
