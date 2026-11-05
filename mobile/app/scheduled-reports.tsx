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
import { apiErrorMessage } from '../lib/format';
import { t } from '../lib/i18n';
import { useBottomInset } from '../lib/insets';
import { useStyles } from '../lib/theme';

interface Schedule {
  id: number; name: string; report_type: string; cadence: 'daily' | 'weekly' | 'monthly'; run_hour: number;
  day_of_week?: number | null; day_of_month?: number | null; active: boolean | number; last_run_at?: string | null; next_run_at?: string | null;
}

const REPORTS: Record<string, string> = { sales_summary: 'ملخص المبيعات', ar_aging: 'أعمار الذمم المدينة', ap_aging: 'أعمار الذمم الدائنة', collections: 'التحصيل', budget_vs_actual: 'الميزانية مقابل الفعلي' };
const CADENCE: Record<string, string> = { daily: 'يومياً', weekly: 'أسبوعياً', monthly: 'شهرياً' };
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const when = (iso?: string | null) => (iso ? iso.slice(0, 16).replace('T', ' ') : '—');
const hour = (h: number) => `${String(h).padStart(2, '0')}:00`;

export default function ScheduledReportsScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const toast = useToast();
  const [items, setItems] = useState<Schedule[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('sales_summary');
  const [cadence, setCadence] = useState('weekly');
  const [hourValue, setHourValue] = useState('8');
  const [weekday, setWeekday] = useState(0);
  const [monthDay, setMonthDay] = useState('1');

  const load = useCallback(async () => {
    try {
      setFailed(null);
      const res = await api.get('/scheduled-reports');
      const body = (res.data ?? {}) as { data?: unknown; schedules?: unknown; can_manage?: boolean };
      const list = Array.isArray(body.schedules) ? body.schedules : Array.isArray(body.data) ? body.data : (body.data as { schedules?: unknown } | undefined)?.schedules;
      setItems(Array.isArray(list) ? (list as Schedule[]) : []);
      setCanManage(body.can_manage ?? (body.data as { can_manage?: boolean } | undefined)?.can_manage ?? false);
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
    if (!name.trim()) { toast('اكتب اسم التقرير'); return; }
    if (!Number.isInteger(h) || h < 0 || h > 23) { toast('الساعة من 0 إلى 23'); return; }
    if (cadence === 'monthly' && (!Number.isInteger(d) || d < 1 || d > 28)) { toast('اليوم من 1 إلى 28'); return; }
    setSaving(true);
    try {
      await api.post('/scheduled-reports', {
        name: name.trim(), report_type: type, cadence, run_hour: h,
        ...(cadence === 'weekly' ? { day_of_week: weekday } : {}), ...(cadence === 'monthly' ? { day_of_month: d } : {}),
      });
      toast('تمت جدولة التقرير');
      setAdding(false);
      setName('');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّرت الجدولة'));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(s: Schedule, active: boolean) {
    setItems((cur) => cur.map((x) => (x.id === s.id ? { ...x, active } : x)));
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
      await api.post(`/scheduled-reports/${s.id}/run`, {});
      toast('تم تشغيل التقرير الآن');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر تشغيل التقرير'));
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

  const header = (
    <View style={{ gap: 16 }}>
      <Text style={styles.note}>يُجهّز النظام التقرير تلقائياً في الموعد الذي تحدده، وترجع إليه من مركز التقارير.</Text>
      {canManage ? (
        adding ? (
          <View style={styles.card}>
            <Text style={styles.name}>جدولة تقرير</Text>
            <Input label="اسم الجدولة" value={name} onChangeText={setName} placeholder="مثال: ملخص المبيعات الأسبوعي" />
            <Text style={styles.label}>التقرير</Text>
            {chips(Object.entries(REPORTS), type, setType)}
            <Text style={styles.label}>التكرار</Text>
            {chips(Object.entries(CADENCE), cadence, setCadence)}
            {cadence === 'weekly' ? (
              <>
                <Text style={styles.label}>اليوم</Text>
                {chips(DAYS.map((d, i) => [String(i), d]), String(weekday), (k) => setWeekday(Number(k)))}
              </>
            ) : null}
            {cadence === 'monthly' ? <Input label="يوم الشهر (1 إلى 28)" value={monthDay} onChangeText={setMonthDay} keyboardType="number-pad" /> : null}
            <Input label="الساعة (0 إلى 23)" value={hourValue} onChangeText={setHourValue} keyboardType="number-pad" />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Button label="حفظ" onPress={create} loading={saving} /></View>
              <View style={{ flex: 1 }}><Button label="إلغاء" variant="ghost" onPress={() => setAdding(false)} /></View>
            </View>
          </View>
        ) : (
          <Button label="+ جدولة تقرير" onPress={() => setAdding(true)} />
        )
      ) : null}
    </View>
  );

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: true, title: t('التقارير المجدولة'), headerTitleAlign: 'center', headerShadowVisible: false }} />
      {loading ? (
        <SkeletonList rows={4} />
      ) : failed ? (
        <EmptyState icon="clock" title="التقارير المجدولة" message={failed} actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(s) => String(s.id)}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + bottomInset }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
          ListEmptyComponent={<EmptyState icon="clock" title="لا توجد تقارير مجدولة" message="اجعل النظام يجهّز لك تقريراً بشكل دوري." compact />}
          renderItem={({ item }) => {
            const on = !!item.active;
            const when_ = item.cadence === 'weekly' ? `كل ${DAYS[item.day_of_week ?? 0]}` : item.cadence === 'monthly' ? `يوم ${item.day_of_month ?? 1} من كل شهر` : 'كل يوم';
            return (
              <View style={styles.card}>
                <View style={styles.top}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.small}>{REPORTS[item.report_type] ?? 'تقرير'} • {when_} الساعة {hour(item.run_hour)}</Text>
                  </View>
                  {canManage ? <Switch value={on} onValueChange={(v) => toggle(item, v)} trackColor={{ true: Colors.accent, false: Colors.lineStrong }} accessibilityLabel={`تفعيل ${item.name}`} /> : (
                    <View style={[styles.badge, { backgroundColor: on ? Tint.successBg : Colors.bgSoft }]}><Text style={[styles.badgeText, { color: on ? StatusText.success : Colors.textMuted }]}>{on ? 'مفعّل' : 'متوقف'}</Text></View>
                  )}
                </View>
                <View style={styles.split}>
                  <View style={styles.cell}><Text style={styles.small}>آخر تشغيل</Text><Text style={styles.val}>{when(item.last_run_at)}</Text></View>
                  <View style={styles.cell}><Text style={styles.small}>التشغيل القادم</Text><Text style={styles.val}>{on ? when(item.next_run_at) : '—'}</Text></View>
                </View>
                {canManage ? <Button label="تشغيل الآن" variant="ghost" onPress={() => runNow(item)} loading={busyId === item.id} /> : null}
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
  note: { fontSize: 14, color: Colors.textMuted, textAlign: 'auto', lineHeight: 22 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 12, ...Shadow.soft },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  small: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  val: { fontSize: 14, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  split: { flexDirection: 'row', gap: 12 },
  cell: { flex: 1, gap: 4 },
  badge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  label: { fontSize: 14, fontWeight: '700', color: Colors.textSoft, textAlign: 'auto' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: Layout.minTouch, paddingHorizontal: 12, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.line },
  chipOn: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  chipText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
});
