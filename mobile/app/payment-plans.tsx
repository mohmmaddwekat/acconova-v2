import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Gradient } from '../components/ui/Gradient';
import { Input } from '../components/ui/Input';
import { SkeletonList } from '../components/ui/Skeleton';
import { Text } from '../components/ui/Text';
import { useToast } from '../components/ui/Toast';
import { Colors, Layout, Radius, Shadow, StatusText, Tint } from '../constants/theme';
import { api } from '../lib/api';
import { apiErrorMessage, formatMoney, todayISO } from '../lib/format';
import { t } from '../lib/i18n';
import { useBottomInset } from '../lib/insets';
import { listOf } from '../lib/tasks';
import { useStyles } from '../lib/theme';

interface Plan {
  id: number; title: string; direction: 'incoming' | 'outgoing'; amount: string; currency: string; frequency: string;
  interval_count?: number; next_due_on: string; counterparty?: string | null; reminder_days: number; active: boolean;
  completed?: boolean; due?: boolean; reminder?: boolean;
}
interface PaymentRecord { id: number; title?: string; direction?: string; amount: string; paid_on?: string; due_on?: string; method?: string; counterparty?: string | null }

type Tab = 'active' | 'inactive' | 'history';

const FREQUENCY: Record<string, string> = { once: 'مرة واحدة', daily: 'يومي', weekly: 'أسبوعي', monthly: 'شهري', yearly: 'سنوي' };
const METHOD: Record<string, string> = { cash: 'نقداً', bank: 'بنك', electronic: 'إلكتروني' };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const days = (iso: string) => Math.round((new Date(`${iso}T00:00:00`).getTime() - new Date(`${todayISO()}T00:00:00`).getTime()) / 86400000);

function dueBadge(plan: Plan): { text: string; fg: string; bg: string } {
  if (plan.completed) return { text: 'مكتملة', fg: StatusText.success, bg: Tint.successBg };
  const d = days(plan.next_due_on);
  if (d < 0) return { text: `متأخرة ${Math.abs(d)} يوم`, fg: StatusText.danger, bg: Tint.dangerBg };
  if (d === 0) return { text: 'تستحق اليوم', fg: StatusText.warning, bg: Tint.warningBg };
  if (plan.reminder) return { text: `بعد ${d} يوم`, fg: StatusText.warning, bg: Tint.warningBg };
  return { text: `بعد ${d} يوم`, fg: Colors.accentStrong, bg: Tint.infoBg };
}

export default function PaymentPlansScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('active');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [recording, setRecording] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);

  // new plan form
  const [title, setTitle] = useState('');
  const [direction, setDirection] = useState<'incoming' | 'outgoing'>('outgoing');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [nextDue, setNextDue] = useState(todayISO());
  const [reminder, setReminder] = useState('3');
  const [counterparty, setCounterparty] = useState('');

  // record form
  const [paidAmount, setPaidAmount] = useState('');
  const [paidOn, setPaidOn] = useState(todayISO());
  const [method, setMethod] = useState('cash');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    try {
      setFailed(null);
      if (tab === 'history') {
        const res = await api.get('/payment-records', { params: { per_page: 50 } });
        setRecords(listOf<PaymentRecord>(res.data));
      } else {
        const res = await api.get('/payment-plans', { params: { status: tab, per_page: 100 } });
        setPlans(listOf<Plan>(res.data));
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setFailed(status === 403 ? 'ليست لديك صلاحية لعرض خطط الدفع.' : 'تعذّر تحميل البيانات. تحقق من الاتصال.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  async function create() {
    if (!title.trim() || !/^\d{1,10}(\.\d{1,4})?$/.test(amount) || Number(amount) <= 0) { toast('اكتب العنوان ومبلغاً صحيحاً'); return; }
    if (!DATE.test(nextDue)) { toast('التاريخ بصيغة 2026-12-31'); return; }
    setBusy(true);
    try {
      await api.post('/payment-plans', {
        title: title.trim(), direction, amount, frequency, next_due_on: nextDue, reminder_days: Number(reminder) || 0,
        ...(frequency === 'once' ? {} : { interval_count: 1 }),
        ...(counterparty.trim() ? { counterparty: counterparty.trim() } : {}),
      });
      toast('تمت إضافة الخطة');
      setAdding(false);
      setTitle(''); setAmount(''); setCounterparty('');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّرت إضافة الخطة'));
    } finally {
      setBusy(false);
    }
  }

  function startRecord(plan: Plan) {
    setRecording(plan);
    setPaidAmount(String(Number(plan.amount)));
    setPaidOn(todayISO());
    setMethod('cash');
    setNotes('');
  }

  async function record() {
    if (!recording) return;
    if (!/^\d{1,10}(\.\d{1,4})?$/.test(paidAmount) || Number(paidAmount) <= 0 || !DATE.test(paidOn)) { toast('تحقق من المبلغ والتاريخ'); return; }
    setBusy(true);
    try {
      await api.post(`/payment-plans/${recording.id}/record`, {
        due_on: recording.next_due_on, paid_on: paidOn, amount: paidAmount, method,
        ...(recording.counterparty ? { counterparty: recording.counterparty } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      toast('تم تسجيل الدفعة');
      setRecording(null);
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر تسجيل الدفعة'));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(plan: Plan) {
    try {
      await api.patch(`/payment-plans/${plan.id}`, { active: !plan.active });
      toast(plan.active ? 'تم إيقاف الخطة' : 'تم تفعيل الخطة');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر تحديث الخطة'));
    }
  }

  const dueSoon = plans.filter((p) => p.active && !p.completed && days(p.next_due_on) <= 7);
  const dueTotal = dueSoon.reduce((s, p) => s + Number(p.amount), 0);

  const chipRow = (options: Record<string, string>, value: string, onChange: (k: string) => void) => (
    <View style={styles.chips}>
      {Object.entries(options).map(([k, l]) => (
        <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: value === k }} onPress={() => onChange(k)} style={[styles.chip, value === k && styles.chipOn]}>
          <Text style={[styles.chipText, value === k && { color: Colors.accent }]}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );

  const header = (
    <View style={{ gap: 16 }}>
      {tab !== 'history' ? (
        <Gradient colors={[Colors.accent, Colors.accentStrong]} style={styles.hero}>
          <View style={styles.glow} />
          <Text style={styles.heroLabel}>مستحق خلال 7 أيام</Text>
          <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(dueTotal)}</Text>
          <Text style={styles.heroSub}>{dueSoon.length} دفعة قريبة من خطط الدفع</Text>
        </Gradient>
      ) : null}

      <View style={styles.seg}>
        {([['active', 'النشطة'], ['inactive', 'المتوقفة'], ['history', 'سجل الدفعات']] as [Tab, string][]).map(([k, l]) => (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} onPress={() => setTab(k)} style={[styles.segBtn, tab === k && styles.segOn]}>
            <Text style={[styles.segText, tab === k && { color: Colors.accentStrong }]}>{l}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'active' ? (
        adding ? (
          <View style={styles.card}>
            <Text style={styles.name}>خطة دفع جديدة</Text>
            <Input label="العنوان" value={title} onChangeText={setTitle} placeholder="مثال: إيجار المكتب" />
            <Text style={styles.label}>النوع</Text>
            {chipRow({ outgoing: 'دفع (علينا)', incoming: 'قبض (لنا)' }, direction, (k) => setDirection(k as 'incoming' | 'outgoing'))}
            <Input label="المبلغ" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
            <Text style={styles.label}>التكرار</Text>
            {chipRow(FREQUENCY, frequency, setFrequency)}
            <Input label="الاستحقاق القادم" value={nextDue} onChangeText={setNextDue} keyboardType="numbers-and-punctuation" />
            <Input label="تذكير قبل (أيام)" value={reminder} onChangeText={setReminder} keyboardType="number-pad" />
            <Input label="الطرف (اختياري)" value={counterparty} onChangeText={setCounterparty} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Button label="حفظ الخطة" onPress={create} loading={busy} /></View>
              <View style={{ flex: 1 }}><Button label="إلغاء" variant="ghost" onPress={() => setAdding(false)} /></View>
            </View>
          </View>
        ) : (
          <Button label="+ خطة دفع جديدة" onPress={() => setAdding(true)} />
        )
      ) : null}
    </View>
  );

  const data: (Plan | PaymentRecord)[] = tab === 'history' ? records : plans;

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: true, title: t('خطط الدفع'), headerTitleAlign: 'center', headerShadowVisible: false }} />
      {loading ? (
        <SkeletonList rows={5} />
      ) : failed ? (
        <EmptyState icon="calendar" title="خطط الدفع" message={failed} actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(x) => `${tab}-${x.id}`}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + bottomInset }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
          ListEmptyComponent={<EmptyState icon="calendar" title={tab === 'history' ? 'لا توجد دفعات مسجلة' : 'لا توجد خطط هنا'} message={tab === 'active' ? 'أضف خطة للإيجار أو الأقساط أو أي دفعة متكررة.' : undefined} compact />}
          renderItem={({ item }) => {
            if (tab === 'history') {
              const r = item as PaymentRecord;
              return (
                <View style={[styles.card, styles.row]}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.name}>{r.title ?? 'دفعة'}</Text>
                    <Text style={styles.small}>{[r.counterparty, r.paid_on, r.method ? METHOD[r.method] ?? null : null].filter(Boolean).join(' • ')}</Text>
                  </View>
                  <Text style={[styles.amount, { color: r.direction === 'incoming' ? StatusText.success : StatusText.danger }]}>{r.direction === 'incoming' ? '+' : '-'}{formatMoney(r.amount)}</Text>
                </View>
              );
            }
            const p = item as Plan;
            const badge = dueBadge(p);
            const isRecording = recording?.id === p.id;
            return (
              <View style={styles.card}>
                <View style={styles.row}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.name}>{p.title}</Text>
                    <Text style={styles.small}>{[p.direction === 'incoming' ? 'قبض' : 'دفع', FREQUENCY[p.frequency], p.counterparty, `الاستحقاق ${p.next_due_on}`].filter(Boolean).join(' • ')}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 8 }}>
                    <Text style={styles.amount}>{formatMoney(p.amount)}</Text>
                    {p.active ? <View style={[styles.badge, { backgroundColor: badge.bg }]}><Text style={[styles.badgeText, { color: badge.fg }]}>{badge.text}</Text></View> : null}
                  </View>
                </View>

                {isRecording ? (
                  <View style={{ gap: 12 }}>
                    <Input label="المبلغ المدفوع" value={paidAmount} onChangeText={setPaidAmount} keyboardType="decimal-pad" />
                    <Input label="تاريخ الدفع" value={paidOn} onChangeText={setPaidOn} keyboardType="numbers-and-punctuation" />
                    <Text style={styles.label}>طريقة الدفع</Text>
                    {chipRow(METHOD, method, setMethod)}
                    <Input label="ملاحظات (اختياري)" value={notes} onChangeText={setNotes} />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1 }}><Button label="تسجيل الدفعة" onPress={record} loading={busy} /></View>
                      <View style={{ flex: 1 }}><Button label="إلغاء" variant="ghost" onPress={() => setRecording(null)} /></View>
                    </View>
                  </View>
                ) : (
                  <View style={styles.actions}>
                    {p.active && !p.completed ? (
                      <Pressable accessibilityRole="button" onPress={() => startRecord(p)} style={[styles.action, { backgroundColor: Tint.successBg }]}><Text style={[styles.actionText, { color: StatusText.success }]}>تسجيل دفعة</Text></Pressable>
                    ) : null}
                    {!p.completed ? (
                      <Pressable accessibilityRole="button" onPress={() => toggle(p)} style={styles.action}><Text style={styles.actionText}>{p.active ? 'إيقاف' : 'تفعيل'}</Text></Pressable>
                    ) : null}
                  </View>
                )}
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
  hero: { borderRadius: Radius.lg, padding: 24, gap: 8, shadowColor: Colors.accentStrong, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 24, elevation: 6 },
  glow: { position: 'absolute', top: -48, right: -48, width: 160, height: 160, borderRadius: 80, backgroundColor: '#fff', opacity: 0.12 },
  heroLabel: { fontSize: 14, fontWeight: '600', color: '#fff', opacity: 0.85, textAlign: 'auto' },
  heroValue: { fontSize: 32, fontWeight: '800', color: '#fff', textAlign: 'auto' },
  heroSub: { fontSize: 14, color: '#fff', opacity: 0.9, textAlign: 'auto' },
  seg: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: 12, backgroundColor: Colors.bgSoft },
  segBtn: { flex: 1, minHeight: Layout.minTouch, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: Colors.surface },
  segText: { fontSize: 13, fontWeight: '800', color: Colors.textMuted },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 12, ...Shadow.soft },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  small: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  amount: { fontSize: 16, fontWeight: '800', color: Colors.text },
  badge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  label: { fontSize: 14, fontWeight: '700', color: Colors.textSoft, textAlign: 'auto' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: Layout.minTouch, paddingHorizontal: 16, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.line },
  chipOn: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  chipText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, minHeight: Layout.minTouch, borderRadius: Radius.sm, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14, fontWeight: '800', color: Colors.accentStrong },
});
