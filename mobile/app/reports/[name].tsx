import { router, useLocalSearchParams } from 'expo-router';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { BarChart } from '../../components/BarChart';
import { EmptyState } from '../../components/ui/EmptyState';
import { Gradient } from '../../components/ui/Gradient';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { SkeletonList } from '../../components/ui/Skeleton';
import { Text } from '../../components/ui/Text';
import { Colors, Radius, Shadow, StatusText, Tint } from '../../constants/theme';
import { api } from '../../lib/api';
import { fetchMonthlyTotals, fetchSummary } from '../../lib/documents';
import { formatMoney } from '../../lib/format';
import { useBottomInset } from '../../lib/insets';
import { useStyles } from '../../lib/theme';

type State = 'loading' | 'ok' | 'forbidden' | 'failed';

function useReport<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<State>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await loader());
      setState('ok');
    } catch (err: any) {
      setState(err?.response?.status === 403 ? 'forbidden' : 'failed');
    } finally {
      setRefreshing(false);
    }
  }, [loader]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    data,
    state,
    refreshing,
    retry: () => {
      setState('loading');
      void load();
    },
    refresh: () => {
      setRefreshing(true);
      void load();
    },
  };
}

interface ShellProps {
  title: string;
  state: State;
  refreshing: boolean;
  retry: () => void;
  refresh: () => void;
  children: ReactNode;
}

function ReportShell({ title, state, refreshing, retry, refresh, children }: ShellProps) {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  return (
    <View style={styles.flex}>
      <ScreenHeader title={title} />
      {state === 'loading' ? (
        <SkeletonList rows={4} />
      ) : state === 'forbidden' ? (
        <EmptyState icon="lock" title="لا تملك صلاحية عرض هذا التقرير" message="اطلب من مدير المؤسسة منحك الصلاحية." />
      ) : state === 'failed' ? (
        <EmptyState icon="wifiOff" title="تعذّر تحميل التقرير" message="تحقق من الاتصال ثم حاول مرة أخرى." actionLabel="إعادة المحاولة" onAction={retry} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: bottomInset }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accent} />}
        >
          {children}
        </ScrollView>
      )}
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  const styles = useStyles(createStyles);
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={[styles.lineValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function Hero({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const styles = useStyles(createStyles);
  return (
    <Gradient colors={[Colors.accent, Colors.accentHover]} style={styles.hero}>
      <Text style={styles.heroLabel}>{label}</Text>
      <Text style={styles.heroValue}>{value}</Text>
      {sub ? <Text style={styles.heroSub}>{sub}</Text> : null}
    </Gradient>
  );
}

// ── Sales & purchases ─────────────────────────────────────────────────────────

async function loadSalesPurchases() {
  const [months, sales, purchases] = await Promise.all([
    fetchMonthlyTotals(6),
    fetchSummary('sale_invoice'),
    fetchSummary('purchase_invoice'),
  ]);
  return { months, sales, purchases };
}

function SalesPurchasesReport() {
  const styles = useStyles(createStyles);
  const r = useReport(loadSalesPurchases);
  const d = r.data;
  const total = d?.months.reduce((a, m) => ({ revenue: a.revenue + m.revenue, expenses: a.expenses + m.expenses }), { revenue: 0, expenses: 0 });
  return (
    <ReportShell title="المبيعات والمشتريات" {...r}>
      {d && total ? (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>آخر 6 أشهر</Text>
            <BarChart bars={d.months.map((m) => ({ ...m, label: m.label.slice(0, 3) }))} />
            <View style={styles.legend}>
              <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: Colors.accent }]} /><Text style={styles.sub}>المبيعات</Text></View>
              <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: Colors.danger }]} /><Text style={styles.sub}>المشتريات</Text></View>
            </View>
          </View>
          <View style={styles.card}>
            <Stat label="إجمالي المبيعات (6 أشهر)" value={formatMoney(total.revenue)} color={StatusText.success} />
            <Stat label="إجمالي المشتريات (6 أشهر)" value={formatMoney(total.expenses)} color={StatusText.danger} />
            <View style={styles.sep} />
            <Stat label="مستحق التحصيل من العملاء" value={formatMoney(d.sales.outstanding)} />
            <Stat label="مستحق الدفع للموردين" value={formatMoney(d.purchases.outstanding)} />
            <Stat label="متأخر عند العملاء" value={formatMoney(d.sales.overdue_amount)} color={StatusText.danger} />
            <Stat label="متأخر علينا" value={formatMoney(d.purchases.overdue_amount)} color={StatusText.warning} />
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>تفصيل شهري</Text>
            {[...d.months].reverse().map((m) => (
              <View key={m.label} style={styles.line}>
                <Text style={styles.lineLabel}>{m.label}</Text>
                <Text style={styles.lineValue}>{formatMoney(m.revenue, false)} / {formatMoney(m.expenses, false)}</Text>
              </View>
            ))}
            <Text style={styles.sub}>المبيعات / المشتريات</Text>
          </View>
        </>
      ) : null}
    </ReportShell>
  );
}

// ── Profitability ─────────────────────────────────────────────────────────────

interface Ranked {
  id: number;
  name: string;
  revenue: string;
  gross_profit: string;
}

interface ProfitData {
  profitability: {
    visible: boolean;
    period: string;
    revenue: string;
    cogs: string;
    gross_profit: string;
    margin_percent: string;
    top_customers: Ranked[];
    top_products: Ranked[];
  };
  trends: { metric: string; current: string; previous_month: string; vs_previous_month_percent: number | null }[];
}

const TREND_LABEL: Record<string, string> = {
  sales_revenue: 'إيرادات المبيعات',
  collections: 'التحصيلات',
  gross_profit: 'الربح الإجمالي',
};

async function loadProfitability(): Promise<ProfitData> {
  const { data } = await api.get('/dashboard-intelligence');
  if (!data?.data?.profitability?.visible) throw Object.assign(new Error('forbidden'), { response: { status: 403 } });
  return { profitability: data.data.profitability, trends: data.data.trends ?? [] };
}

function RankedList({ title, rows, linkParty }: { title: string; rows: Ranked[]; linkParty?: boolean }) {
  const styles = useStyles(createStyles);
  if (rows.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {rows.map((c, i) => (
        <Pressable key={c.id} accessibilityRole="button" disabled={!linkParty} onPress={() => router.push(`/party/${c.id}` as any)} style={styles.line}>
          <Text style={styles.lineLabelStrong}>{i + 1}. {c.name}</Text>
          <View style={{ alignItems: 'flex-start' }}>
            <Text style={styles.lineValue}>{formatMoney(c.revenue)}</Text>
            <Text style={styles.sub}>ربح {formatMoney(c.gross_profit, false)}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function ProfitabilityReport() {
  const styles = useStyles(createStyles);
  const r = useReport(loadProfitability);
  const d = r.data;
  const p = d?.profitability;
  return (
    <ReportShell title="الربحية" {...r}>
      {d && p ? (
        <>
          <Hero label={`الربح الإجمالي · ${p.period}`} value={formatMoney(p.gross_profit)} sub={`هامش ${Number(p.margin_percent)}%`} />
          <View style={styles.card}>
            <Stat label="الإيرادات" value={formatMoney(p.revenue)} color={StatusText.success} />
            <Stat label="تكلفة البضاعة المباعة" value={formatMoney(p.cogs)} color={StatusText.danger} />
            <View style={styles.sep} />
            <Stat label="الربح الإجمالي" value={formatMoney(p.gross_profit)} />
          </View>
          {d.trends.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>مقارنة بالشهر السابق</Text>
              {d.trends.map((t) => (
                <View key={t.metric} style={styles.line}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lineLabelStrong}>{TREND_LABEL[t.metric] ?? t.metric.replace(/_/g, ' ')}</Text>
                    <Text style={styles.sub}>الحالي {formatMoney(t.current, false)} · السابق {formatMoney(t.previous_month, false)}</Text>
                  </View>
                  {t.vs_previous_month_percent != null ? (
                    <Text style={[styles.lineValue, { color: t.vs_previous_month_percent >= 0 ? StatusText.success : StatusText.danger }]}>
                      {t.vs_previous_month_percent >= 0 ? '+' : ''}{t.vs_previous_month_percent}%
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}
          <RankedList title="أفضل العملاء" rows={p.top_customers ?? []} linkParty />
          <RankedList title="أفضل المنتجات" rows={p.top_products ?? []} />
        </>
      ) : null}
    </ReportShell>
  );
}

// ── Aging ─────────────────────────────────────────────────────────────────────

const BUCKETS: [string, string][] = [
  ['current', 'غير مستحق'],
  ['0_30', '1–30 يوم'],
  ['31_60', '31–60 يوم'],
  ['61_90', '61–90 يوم'],
  ['90_plus', 'أكثر من 90 يوماً'],
];

type AgingRow = Record<string, string>;

function makeAgingLoader(kind: 'ar-aging' | 'ap-aging') {
  return async (): Promise<AgingRow[]> => {
    const { data } = await api.get(`/operations/${kind}`);
    return Array.isArray(data?.data) ? data.data : [];
  };
}

const loadArAging = makeAgingLoader('ar-aging');
const loadApAging = makeAgingLoader('ap-aging');

function AgingView({ title, label, rows, state, refreshing, retry, refresh }: { title: string; label: string; rows: AgingRow[] | null } & Omit<ShellProps, 'children' | 'title'>) {
  const styles = useStyles(createStyles);
  const list = rows ?? [];
  const sums = BUCKETS.map(([key]) => list.reduce((s, r) => s + Number(r[key] ?? 0), 0));
  const total = list.reduce((s, r) => s + Number(r.total ?? 0), 0);
  const late = sums.slice(1).reduce((a, b) => a + b, 0);
  return (
    <ReportShell title={title} state={state} refreshing={refreshing} retry={retry} refresh={refresh}>
      <Hero label={label} value={formatMoney(total)} sub={`منه متأخر ${formatMoney(late)}`} />
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>حسب عمر الدين</Text>
        {BUCKETS.map(([key, name], i) => (
          <View key={key} style={styles.bucket}>
            <View style={styles.line}>
              <Text style={styles.lineLabel}>{name}</Text>
              <Text style={[styles.lineValue, i > 0 && sums[i] > 0 ? { color: StatusText.warning } : null]}>{formatMoney(sums[i])}</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${total > 0 ? Math.round((sums[i] / total) * 100) : 0}%`, backgroundColor: i === 0 ? Colors.accent : i < 3 ? Colors.warning : Colors.danger }]} />
            </View>
          </View>
        ))}
      </View>
      {list.length === 0 ? (
        <EmptyState icon="users" title="لا توجد ذمم مفتوحة" message="كل الفواتير مسدّدة." compact />
      ) : (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>حسب الطرف</Text>
          {[...list].sort((a, b) => Number(b.total) - Number(a.total)).map((r) => (
            <Pressable key={`${r.party_id}-${r.currency}`} accessibilityRole="button" onPress={() => router.push(`/party/${r.party_id}` as any)} style={styles.partyRow}>
              <View style={styles.line}>
                <Text style={styles.lineLabelStrong}>{r.party}</Text>
                <Text style={styles.lineValue}>{formatMoney(r.total)}</Text>
              </View>
              <Text style={styles.sub}>
                {BUCKETS.filter(([k]) => Number(r[k]) > 0).map(([k, n]) => `${n}: ${formatMoney(r[k], false)}`).join(' · ')}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </ReportShell>
  );
}

function ArAgingReport() {
  const r = useReport(loadArAging);
  return <AgingView title="أعمار الذمم المدينة" label="إجمالي المستحق على العملاء" rows={r.data} state={r.state} refreshing={r.refreshing} retry={r.retry} refresh={r.refresh} />;
}

function ApAgingReport() {
  const r = useReport(loadApAging);
  return <AgingView title="أعمار الذمم الدائنة" label="إجمالي المستحق للموردين" rows={r.data} state={r.state} refreshing={r.refreshing} retry={r.retry} refresh={r.refresh} />;
}

// ── Cash flow ─────────────────────────────────────────────────────────────────

interface CashFlowData {
  forecast: {
    horizon_days: number;
    opening: { confirmed_cash: string };
    totals: {
      confirmed: { outflows: string };
      expected: { gross_receipts: string; weighted_receipts: string };
      pending_cheques: { receivable_gross: string; payable: string };
    };
    timeline: { from: string; to: string; expected_receipts: string; confirmed_outflows: string; expected_balance: string }[];
  };
  days: { date: string; incoming: string; outgoing: string }[];
}

async function loadCashFlow(): Promise<CashFlowData> {
  const [f, c] = await Promise.all([api.get('/finance/cash-flow-forecast'), api.get('/business-pulse/cashflow')]);
  return { forecast: f.data.data, days: c.data?.data?.days ?? [] };
}

function CashFlowReport() {
  const styles = useStyles(createStyles);
  const r = useReport(loadCashFlow);
  const d = r.data;
  const t = d?.forecast.totals;
  return (
    <ReportShell title="التدفق النقدي" {...r}>
      {d && t ? (
        <>
          <Hero label="السيولة المؤكدة اليوم" value={formatMoney(d.forecast.opening.confirmed_cash)} sub={`توقعات ${d.forecast.horizon_days} يوماً القادمة`} />
          <View style={styles.card}>
            <Stat label="مقبوضات متوقعة (مرجّحة)" value={formatMoney(t.expected.weighted_receipts)} color={StatusText.success} />
            <Stat label="مقبوضات متوقعة (إجمالي)" value={formatMoney(t.expected.gross_receipts)} />
            <Stat label="مدفوعات مؤكدة" value={formatMoney(t.confirmed.outflows)} color={StatusText.danger} />
            <Stat label="شيكات قيد التحصيل" value={formatMoney(t.pending_cheques.receivable_gross)} />
            <Stat label="شيكات مستحقة الدفع" value={formatMoney(t.pending_cheques.payable)} />
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>التوقع الأسبوعي</Text>
            {d.forecast.timeline.map((w) => (
              <View key={w.from} style={styles.line}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineLabelStrong}>{w.from} → {w.to}</Text>
                  <Text style={styles.sub}>مقبوضات {formatMoney(w.expected_receipts, false)} · مدفوعات {formatMoney(w.confirmed_outflows, false)}</Text>
                </View>
                <Text style={styles.lineValue}>{formatMoney(w.expected_balance, false)}</Text>
              </View>
            ))}
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>استحقاقات هذا الشهر</Text>
            {d.days.length === 0 ? (
              <Text style={styles.sub}>لا توجد استحقاقات.</Text>
            ) : (
              d.days.map((day) => (
                <View key={day.date} style={styles.line}>
                  <Text style={styles.lineLabelStrong}>{day.date}</Text>
                  <Text style={[styles.lineValue, { color: Number(day.incoming) > 0 ? StatusText.success : StatusText.danger }]}>
                    {Number(day.incoming) > 0 ? `+${formatMoney(day.incoming, false)}` : `-${formatMoney(day.outgoing, false)}`}
                  </Text>
                </View>
              ))
            )}
          </View>
        </>
      ) : null}
    </ReportShell>
  );
}

// ── Inventory ─────────────────────────────────────────────────────────────────

interface InventoryMetrics {
  active_warehouses: number;
  tracked_products: number;
  low_stock_products: number;
  out_of_stock_products: number;
  inventory_value: string;
}

async function loadInventory(): Promise<InventoryMetrics> {
  const { data } = await api.get('/inventory/overview');
  return data.data.metrics;
}

function InventoryReport() {
  const styles = useStyles(createStyles);
  const r = useReport(loadInventory);
  const m = r.data;
  return (
    <ReportShell title="المخزون" {...r}>
      {m ? (
        <>
          <Hero label="قيمة المخزون" value={formatMoney(m.inventory_value)} sub={`${m.tracked_products} منتج متتبَّع · ${m.active_warehouses} مستودع`} />
          <View style={styles.grid}>
            <View style={[styles.tile, { backgroundColor: Tint.warningBg }]}><Text style={[styles.tileValue, { color: StatusText.warning }]}>{m.low_stock_products}</Text><Text style={styles.sub}>منتجات منخفضة</Text></View>
            <View style={[styles.tile, { backgroundColor: Tint.dangerBg }]}><Text style={[styles.tileValue, { color: StatusText.danger }]}>{m.out_of_stock_products}</Text><Text style={styles.sub}>منتجات نافدة</Text></View>
          </View>
        </>
      ) : null}
    </ReportShell>
  );
}

// ── Router ────────────────────────────────────────────────────────────────────

export default function ReportScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  switch (name) {
    case 'sales-purchases':
      return <SalesPurchasesReport />;
    case 'profitability':
      return <ProfitabilityReport />;
    case 'ar-aging':
      return <ArAgingReport />;
    case 'ap-aging':
      return <ApAgingReport />;
    case 'cashflow':
      return <CashFlowReport />;
    case 'inventory':
      return <InventoryReport />;
    default:
      return <EmptyState icon="file" title="التقرير غير متوفر" />;
  }
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  body: { padding: 14, gap: 12 },
  hero: { borderRadius: Radius.md, padding: 18, gap: 4 },
  heroLabel: { fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '600', textAlign: 'auto' },
  heroValue: { fontSize: 30, fontWeight: '800', color: '#fff', textAlign: 'auto' },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.9)', textAlign: 'auto' },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 14, gap: 8, ...Shadow.soft },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 28 },
  lineLabel: { fontSize: 14, color: Colors.textMuted, flexShrink: 1 },
  lineLabelStrong: { fontSize: 14, fontWeight: '700', color: Colors.text, textAlign: 'auto', flexShrink: 1 },
  lineValue: { fontSize: 14, fontWeight: '800', color: Colors.text },
  sub: { fontSize: 13, color: Colors.textMuted, textAlign: 'auto' },
  sep: { height: 1, backgroundColor: Colors.line },
  legend: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 3 },
  bucket: { gap: 6 },
  track: { height: 6, borderRadius: 3, backgroundColor: Colors.bgSoft, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  partyRow: { gap: 4, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.line },
  grid: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, borderRadius: Radius.md, padding: 16, alignItems: 'center', gap: 4 },
  tileValue: { fontSize: 28, fontWeight: '800' },
});
