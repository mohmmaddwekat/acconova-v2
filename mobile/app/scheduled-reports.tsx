import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Switch, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { SkeletonList } from '../components/ui/Skeleton';
import { Text } from '../components/ui/Text';
import { useToast } from '../components/ui/Toast';
import { Colors, Layout, Radius, Shadow, StatusText, Tint } from '../constants/theme';
import { api } from '../lib/api';
import { apiErrorMessage, formatMoney } from '../lib/format';
import { t } from '../lib/i18n';
import { useBottomInset } from '../lib/insets';
import { useStyles } from '../lib/theme';

type Obj = Record<string, unknown>;
interface Schedule {
  id: number; name: string; report_type: string; cadence: 'daily' | 'weekly' | 'monthly'; run_hour: number;
  day_of_week?: number | null; day_of_month?: number | null; active: boolean | number; last_run_at?: string | null;
  next_run_at?: string | null; recipient_user_ids?: number[];
}
interface Run { id: number; scheduled_report_id: number; report_type: string; schedule_name?: string | null; generated_at: string; snapshot: Obj }
interface Member { id: number; name: string }

const REPORTS: Record<string, { label: string; about: string }> = {
  sales_summary: { label: 'ملخص المبيعات', about: 'إجمالي المبيعات والمحصّل والمتبقي لهذا الشهر' },
  ar_aging: { label: 'أعمار الذمم المدينة', about: 'كم يستحق لك عند العملاء، وكم من ذلك تأخر' },
  ap_aging: { label: 'أعمار الذمم الدائنة', about: 'كم عليك للموردين، وكم من ذلك تأخر' },
  collections: { label: 'المتأخرات للتحصيل', about: 'الفواتير المتأخرة التي تحتاج متابعة' },
  budget_vs_actual: { label: 'الميزانية مقابل الفعلي', about: 'ما صُرف فعلاً مقارنة بميزانية كل قسم' },
};
const CADENCE: Record<string, string> = { daily: 'كل يوم', weekly: 'كل أسبوع', monthly: 'كل شهر' };
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const KEY_LABEL: Record<string, string> = {
  invoice_count: 'عدد الفواتير', sales_total: 'إجمالي المبيعات', collected: 'المحصّل', outstanding: 'المتبقي', overdue_invoices: 'عدد الفواتير المتأخرة',
  overdue_amount: 'مبلغ المتأخرات', current: 'غير مستحق بعد', budget: 'الميزانية', actual: 'الفعلي', variance: 'الفرق', total: 'الإجمالي', amount: 'المبلغ',
};
const MONEY = new Set(['sales_total', 'collected', 'outstanding', 'overdue_amount', 'current', 'budget', 'actual', 'variance', 'total', 'amount']);

function keyLabel(key: string): string | null {
  if (KEY_LABEL[key]) return KEY_LABEL[key];
  const range = key.match(/(\d+)\D+(\d+)/);
  if (range) return `متأخر ${range[1]} إلى ${range[2]} يوم`;
  const over = key.match(/(\d+)/);
  if (over && /(plus|over|more|\+)/.test(key)) return `متأخر أكثر من ${over[1]} يوماً`;
  return null;
}

const when = (iso?: string | null) => (iso ? iso.slice(0, 16).replace('T', ' ') : '—');
const hour = (h: number) => `${String(h).padStart(2, '0')}:00`;

function sentence(s: Schedule): string {
  const day = s.cadence === 'weekly' ? ` يوم ${DAYS[s.day_of_week ?? 0]}` : s.cadence === 'monthly' ? ` يوم ${s.day_of_month ?? 1}` : '';
  return `${CADENCE[s.cadence]}${day} الساعة ${hour(s.run_hour)}`;
}

type Tab = 'schedules' | 'results';

export default function ScheduledReportsScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('schedules');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [openRun, setOpenRun] = useState<number | null>(null);
  const [type, setType] = useState('sales_summary');
  const [cadence, setCadence] = useState('weekly');
  const [hourValue, setHourValue] = useState('8');
  const [weekday, setWeekday] = useState(0);
  const [monthDay, setMonthDay] = useState('1');
  const [recipients, setRecipients] = useState<number[]>([]);

  const load = useCallback(async () => {
    try {
      setFailed(null);
      const res = await api.get('/scheduled-reports');
      const body = (res.data?.data ?? res.data ?? {}) as Obj;
      setSchedules(Array.isArray(body.schedules) ? (body.schedules as Schedule[]) : []);
      setRuns(Array.isArray(body.runs) ? (body.runs as Run[]) : []);
      setMembers(Array.isArray(body.members) ? (body.members as Member[]) : []);
      setCanManage(!!body.can_manage);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setFailed(status === 403 ? 'ليست لديك صلاحية للتقارير المجدولة.' : 'تعذّر التحميل. تحقق من الاتصال.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    const h = Number(hourValue);
    const d = Number(monthDay);
    if (!Number.isInteger(h) || h < 0 || h > 23) { toast('الساعة من 0 إلى 23'); return; }
    if (cadence === 'monthly' && (!Number.isInteger(d) || d < 1 || d > 28)) { toast('اليوم من 1 إلى 28'); return; }
    setSaving(true);
    try {
      await api.post('/scheduled-reports', {
        name: REPORTS[type].label, report_type: type, cadence, run_hour: h, recipient_user_ids: recipients,
        ...(cadence === 'weekly' ? { day_of_week: weekday } : {}), ...(cadence === 'monthly' ? { day_of_month: d } : {}),
      });
      toast('تمت الجدولة. سيُجهَّز التقرير تلقائياً في الموعد');
      setAdding(false);
      setRecipients([]);
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّرت الجدولة'));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(s: Schedule, active: boolean) {
    setSchedules((cur) => cur.map((x) => (x.id === s.id ? { ...x, active } : x)));
    try {
      await api.patch(`/scheduled-reports/${s.id}`, { active });
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر تحديث الجدولة'));
      await load();
    }
  }

  async function runNow(s: Schedule) {
    setBusyId(s.id);
    try {
      const res = await api.post(`/scheduled-reports/${s.id}/run`, {});
      toast('تم تجهيز التقرير، هذه نتيجته');
      await load();
      setTab('results');
      setOpenRun(res.data?.data?.run_id ?? null);
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر تجهيز التقرير'));
    } finally {
      setBusyId(null);
    }
  }

  const chips = (options: [string, string][], value: string, onChange: (k: string) => void) => (
    <View style={styles.chips}>
      {options.map(([k, l]) => (
        <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: value === k }} onPress={() => onChange(k)} style={[styles.chip, value === k && styles.chipOn]}>
          <Text style={[styles.chipText, value === k && { color: Colors.accent }]}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );

  const memberName = (id: number) => members.find((m) => m.id === id)?.name;

  const header = (
    <View style={{ gap: 16 }}>
      <View style={styles.explain}>
        <Text style={styles.explainTitle}>كيف تعمل هذه الصفحة؟</Text>
        <Text style={styles.explainText}>١. تختار تقريراً وموعداً (مثلاً: كل أحد الساعة 8).</Text>
        <Text style={styles.explainText}>٢. النظام يجهّز التقرير تلقائياً في الموعد.</Text>
        <Text style={styles.explainText}>٣. تجد كل التقارير الجاهزة في تبويب «النتائج».</Text>
      </View>

      <View style={styles.seg}>
        {([['schedules', `الجدولات (${schedules.length})`], ['results', `النتائج (${runs.length})`]] as [Tab, string][]).map(([k, l]) => (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} onPress={() => setTab(k)} style={[styles.segBtn, tab === k && styles.segOn]}>
            <Text style={[styles.segText, tab === k && { color: Colors.accentStrong }]}>{l}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'schedules' && canManage ? (
        adding ? (
          <View style={styles.card}>
            <Text style={styles.name}>جدولة تقرير جديد</Text>
            <Text style={styles.label}>أي تقرير تريد؟</Text>
            <View style={{ gap: 8 }}>
              {Object.entries(REPORTS).map(([k, r]) => (
                <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: type === k }} onPress={() => setType(k)} style={[styles.option, type === k && styles.chipOn]}>
                  <Text style={[styles.optionTitle, type === k && { color: Colors.accent }]}>{r.label}</Text>
                  <Text style={styles.small}>{r.about}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>كم مرة؟</Text>
            {chips(Object.entries(CADENCE), cadence, setCadence)}
            {cadence === 'weekly' ? (
              <>
                <Text style={styles.label}>في أي يوم؟</Text>
                {chips(DAYS.map((d, i) => [String(i), d]), String(weekday), (k) => setWeekday(Number(k)))}
              </>
            ) : null}
            {cadence === 'monthly' ? <Input label="في أي يوم من الشهر؟ (1 إلى 28)" value={monthDay} onChangeText={setMonthDay} keyboardType="number-pad" /> : null}
            <Input label="في أي ساعة؟ (0 إلى 23)" value={hourValue} onChangeText={setHourValue} keyboardType="number-pad" />
            {members.length > 0 ? (
              <>
                <Text style={styles.label}>من يصله إشعار بالتقرير؟ (اختياري)</Text>
                <View style={styles.chips}>
                  {members.map((m) => {
                    const on = recipients.includes(m.id);
                    return (
                      <Pressable key={m.id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setRecipients((cur) => (on ? cur.filter((x) => x !== m.id) : [...cur, m.id]))} style={[styles.chip, on && styles.chipOn]}>
                        <Text style={[styles.chipText, on && { color: Colors.accent }]}>{m.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Button label="حفظ الجدولة" onPress={create} loading={saving} /></View>
              <View style={{ flex: 1 }}><Button label="إلغاء" variant="ghost" onPress={() => setAdding(false)} /></View>
            </View>
          </View>
        ) : (
          <Button label="+ جدولة تقرير" onPress={() => setAdding(true)} />
        )
      ) : null}
    </View>
  );

  const data: (Schedule | Run)[] = tab === 'schedules' ? schedules : runs;

  function renderRun(run: Run) {
    const info = REPORTS[run.report_type];
    const rows = Array.isArray(run.snapshot?.rows) ? (run.snapshot.rows as Obj[]) : [];
    const period = run.snapshot?.period as { from?: string; to?: string } | undefined;
    const expanded = openRun === run.id;
    return (
      <Pressable accessibilityRole="button" onPress={() => setOpenRun(expanded ? null : run.id)} style={styles.card}>
        <View style={styles.top}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.name}>{info?.label ?? 'تقرير'}</Text>
            <Text style={styles.small}>{[run.schedule_name && run.schedule_name !== info?.label ? run.schedule_name : null, `جُهّز ${when(run.generated_at)}`].filter(Boolean).join(' • ')}</Text>
          </View>
          <Text style={styles.link}>{expanded ? 'إخفاء' : 'عرض'}</Text>
        </View>
        {expanded ? (
          <View style={{ gap: 12 }}>
            {period?.from ? <Text style={styles.small}>الفترة: من {period.from} إلى {period.to}</Text> : null}
            {rows.length === 0 ? <Text style={styles.small}>لا توجد بيانات في هذا التقرير.</Text> : null}
            {rows.map((row, i) => {
              const entries = Object.entries(row).filter(([k, v]) => k !== 'currency' && keyLabel(k) && (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)))));
              const dept = typeof row.department === 'string' ? row.department : typeof row.name === 'string' ? row.name : null;
              return (
                <View key={i} style={styles.resultBox}>
                  {dept ? <Text style={styles.optionTitle}>{dept}</Text> : null}
                  {typeof row.currency === 'string' ? <Text style={styles.small}>العملة: {row.currency}</Text> : null}
                  {entries.map(([k, v]) => (
                    <View key={k} style={styles.kv}>
                      <Text style={styles.kvKey}>{keyLabel(k)}</Text>
                      <Text style={styles.kvVal}>{MONEY.has(k) ? formatMoney(v as string | number) : String(Number(v))}</Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        ) : null}
      </Pressable>
    );
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: true, title: t('التقارير المجدولة'), headerTitleAlign: 'center', headerShadowVisible: false }} />
      {loading ? (
        <SkeletonList rows={4} />
      ) : failed ? (
        <EmptyState icon="clock" title="التقارير المجدولة" message={failed} actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(x) => `${tab}-${x.id}`}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + bottomInset }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
          ListEmptyComponent={
            <EmptyState
              icon="clock"
              title={tab === 'schedules' ? 'لا توجد جدولات بعد' : 'لا توجد نتائج بعد'}
              message={tab === 'schedules' ? 'أضف جدولة ليجهّز لك النظام تقريراً بشكل دوري.' : 'تظهر هنا التقارير بعد تجهيزها في موعدها، أو عند الضغط على «جهّز الآن».'}
              compact
            />
          }
          renderItem={({ item }) => {
            if (tab === 'results') return renderRun(item as Run);
            const s = item as Schedule;
            const on = !!s.active;
            const info = REPORTS[s.report_type];
            const names = (s.recipient_user_ids ?? []).map(memberName).filter(Boolean);
            return (
              <View style={styles.card}>
                <View style={styles.top}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.name}>{info?.label ?? s.name}</Text>
                    <Text style={styles.sentence}>{sentence(s)}</Text>
                  </View>
                  {canManage ? (
                    <Switch value={on} onValueChange={(v) => toggle(s, v)} trackColor={{ true: Colors.accent, false: Colors.lineStrong }} accessibilityLabel={`تفعيل ${info?.label ?? s.name}`} />
                  ) : (
                    <View style={[styles.badge, { backgroundColor: on ? Tint.successBg : Colors.bgSoft }]}><Text style={[styles.badgeText, { color: on ? StatusText.success : Colors.textMuted }]}>{on ? 'مفعّلة' : 'متوقفة'}</Text></View>
                  )}
                </View>
                {info ? <Text style={styles.small}>{info.about}</Text> : null}
                <View style={styles.split}>
                  <View style={styles.cell}><Text style={styles.small}>آخر تجهيز</Text><Text style={styles.val}>{when(s.last_run_at)}</Text></View>
                  <View style={styles.cell}><Text style={styles.small}>التجهيز القادم</Text><Text style={styles.val}>{on ? when(s.next_run_at) : 'متوقفة'}</Text></View>
                </View>
                {names.length > 0 ? <Text style={styles.small}>يُشعَر: {names.join('، ')}</Text> : null}
                {canManage ? <Button label="جهّز الآن وأرني النتيجة" variant="ghost" onPress={() => runNow(s)} loading={busyId === s.id} /> : null}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  explain: { gap: 6, padding: 16, borderRadius: Radius.md, backgroundColor: Colors.accentSoft },
  explainTitle: { fontSize: 14, fontWeight: '800', color: Colors.accentStrong, textAlign: 'auto' },
  explainText: { fontSize: 14, color: Colors.textSoft, textAlign: 'auto', lineHeight: 22 },
  seg: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: 12, backgroundColor: Colors.bgSoft },
  segBtn: { flex: 1, minHeight: Layout.minTouch, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: Colors.surface },
  segText: { fontSize: 14, fontWeight: '800', color: Colors.textMuted },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 12, ...Shadow.soft },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  sentence: { fontSize: 14, fontWeight: '700', color: Colors.accentStrong, textAlign: 'auto' },
  small: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto', lineHeight: 18 },
  val: { fontSize: 14, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  link: { fontSize: 14, fontWeight: '800', color: Colors.accent },
  split: { flexDirection: 'row', gap: 12 },
  cell: { flex: 1, gap: 4 },
  badge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  label: { fontSize: 14, fontWeight: '700', color: Colors.textSoft, textAlign: 'auto' },
  option: { gap: 4, padding: 12, borderRadius: Radius.sm, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.line },
  optionTitle: { fontSize: 14, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: Layout.minTouch, paddingHorizontal: 12, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.line },
  chipOn: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  chipText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  resultBox: { gap: 8, padding: 12, borderRadius: Radius.sm, backgroundColor: Colors.bg },
  kv: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kvKey: { flex: 1, fontSize: 14, color: Colors.textSoft, textAlign: 'auto' },
  kvVal: { fontSize: 14, fontWeight: '800', color: Colors.text },
});
