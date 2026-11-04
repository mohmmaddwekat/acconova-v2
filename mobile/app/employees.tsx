import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Gradient } from '../components/ui/Gradient';
import { Icon } from '../components/ui/Icon';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { SkeletonList } from '../components/ui/Skeleton';
import { Text } from '../components/ui/Text';
import { TextInput } from '../components/ui/TextInput';
import { useToast } from '../components/ui/Toast';
import { Colors, Layout, Radius, Shadow, StatusText, Tint } from '../constants/theme';
import { api } from '../lib/api';
import { apiErrorMessage, formatMoney } from '../lib/format';
import { useBottomInset } from '../lib/insets';
import { BASIS_LABEL, bulkEntries, dayISO, fetchStaff, recordAttendance, StaffRow } from '../lib/staff';
import { useStyles } from '../lib/theme';

interface AttendanceRow {
  id: number;
  name: string;
  job_title: string | null;
  basis: string;
  attendance: { status: 'present' | 'absent' } | null;
}

interface Overview {
  totals: { employees: number; active: number };
  attendance: { present_today: number; absent_today: number; missing_today: number };
  payroll: { currency: string; monthly_commitment: number; balance: number }[];
}

type Tab = 'all' | 'attend' | 'salary';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'الموظفون' },
  { key: 'attend', label: 'الحضور' },
  { key: 'salary', label: 'الرواتب' },
];

function initials(name: string): string {
  return name.trim().slice(0, 1);
}

export default function EmployeesScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const toast = useToast();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.key === tabParam) ? (tabParam as Tab) : 'all');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [dayOffset, setDayOffset] = useState(0);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [payAll, setPayAll] = useState(false);
  const [saving, setSaving] = useState(false);

  const date = dayISO(dayOffset);

  const load = useCallback(async () => {
    try {
      setFailed(false);
      const [o, s, a] = await Promise.all([
        api.get('/staff-overview'),
        fetchStaff(),
        api.get('/staff-attendance/bulk', { params: { date: dayISO(dayOffset), per_page: 100 } }),
      ]);
      setOverview(o.data);
      setStaff(s);
      setAttendance(Array.isArray(a.data?.data) ? a.data.data : []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dayOffset]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const due = useMemo(() => staff.filter((s) => Number(s.balance ?? 0) > 0), [staff]);
  const totalDue = due.reduce((sum, s) => sum + Number(s.balance ?? 0), 0);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return staff.filter((s) => !q || `${s.name} ${s.job_title ?? ''}`.toLowerCase().includes(q));
  }, [staff, query]);

  const present = attendance.filter((r) => r.attendance?.status === 'present').length;
  const absent = attendance.filter((r) => r.attendance?.status === 'absent').length;

  async function mark(row: AttendanceRow, status: 'present' | 'absent') {
    const previous = row.attendance;
    setBusyId(row.id);
    setAttendance((prev) => prev.map((r) => (r.id === row.id ? { ...r, attendance: { status } } : r)));
    try {
      await recordAttendance(row.id, date, status);
    } catch (err: any) {
      setAttendance((prev) => prev.map((r) => (r.id === row.id ? { ...r, attendance: previous } : r)));
      toast(apiErrorMessage(err, 'تعذّر تسجيل الحضور'));
    } finally {
      setBusyId(null);
    }
  }

  async function markAllPresent() {
    const targets = attendance.filter((r) => r.attendance?.status !== 'present');
    if (targets.length === 0) return;
    setSaving(true);
    const results = await Promise.allSettled(targets.map((r) => recordAttendance(r.id, date, 'present')));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    toast(ok === targets.length ? 'تم تسجيل حضور الجميع' : `تم تسجيل ${ok} من ${targets.length}`);
    setSaving(false);
    await load();
  }

  async function paySelected() {
    setSaving(true);
    try {
      await bulkEntries('payment', due.map((s) => ({ staff_id: s.id, amount: Number(s.balance) })));
      toast('تم صرف المستحقات للجميع');
      setPayAll(false);
      await load();
    } catch (err: any) {
      toast(apiErrorMessage(err, 'تعذّر صرف المستحقات'));
      setPayAll(false);
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <Gradient colors={[Colors.accent, Colors.accentHover]} style={styles.summary}>
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{overview?.totals.active ?? staff.length}</Text>
          <Text style={styles.summaryLabel}>موظف نشط</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{overview?.attendance.present_today ?? 0}</Text>
          <Text style={styles.summaryLabel}>حاضر اليوم</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{overview?.attendance.missing_today ?? 0}</Text>
          <Text style={styles.summaryLabel}>لم يُسجَّل</Text>
        </View>
      </View>
    </Gradient>
  );

  return (
    <View style={styles.flex}>
      <ScreenHeader title="الموظفون" />

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.key }}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && styles.tabOn]}
          >
            <Text style={[styles.tabText, tab === t.key && { color: Colors.accent }]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <SkeletonList rows={5} />
      ) : failed ? (
        <EmptyState icon="wifiOff" title="تعذّر تحميل الموظفين" message="تحقق من الاتصال أو من صلاحياتك ثم حاول مرة أخرى." actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); void load(); }} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: bottomInset + 70 }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={Colors.accent} />}
        >
          {header}

          {tab === 'all' && (
            <>
              <View style={styles.searchWrap}>
                <Icon name="search" size={18} color={Colors.textMuted} />
                <TextInput value={query} onChangeText={setQuery} placeholder="بحث بالاسم أو المسمى..." style={styles.search} accessibilityLabel="بحث في الموظفين" />
              </View>
              {filtered.length === 0 ? (
                <EmptyState icon="users" title="لا يوجد موظفون" message="أضف الموظفين من الموقع لتظهر هنا." compact />
              ) : (
                <View style={styles.card}>
                  {filtered.map((s, i) => {
                    const balance = Number(s.balance ?? 0);
                    return (
                      <Pressable
                        key={s.id}
                        accessibilityRole="button"
                        onPress={() => router.push(`/employee/${s.id}` as any)}
                        style={({ pressed }) => [styles.rowItem, i === filtered.length - 1 && { borderBottomWidth: 0 }, pressed && { backgroundColor: Colors.bgSoft }]}
                      >
                        <View style={styles.avatar}><Text style={styles.avatarText}>{initials(s.name)}</Text></View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={styles.name}>{s.name}</Text>
                          <Text style={styles.sub}>
                            {[s.job_title, BASIS_LABEL[s.basis] ?? s.basis].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-start' }}>
                          <Text style={[styles.amount, { color: balance > 0 ? StatusText.warning : balance < 0 ? StatusText.danger : Colors.text }]}>{formatMoney(balance)}</Text>
                          <Text style={styles.sub}>{balance > 0 ? 'مستحق له' : balance < 0 ? 'عليه' : 'لا رصيد'}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </>
          )}

          {tab === 'attend' && (
            <>
              <View style={styles.dateRow}>
                <Pressable accessibilityRole="button" accessibilityLabel="اليوم السابق" onPress={() => { setLoading(true); setDayOffset((d) => d - 1); }} style={styles.dateBtn}>
                  <Icon name="chevronRight" size={20} color={Colors.text} />
                </Pressable>
                <View style={styles.dateBox}>
                  <Icon name="calendar" size={18} color={Colors.textMuted} />
                  <Text style={styles.dateText}>{date}{dayOffset === 0 ? ' · اليوم' : ''}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="اليوم التالي"
                  disabled={dayOffset >= 0}
                  onPress={() => { setLoading(true); setDayOffset((d) => Math.min(0, d + 1)); }}
                  style={[styles.dateBtn, dayOffset >= 0 && { opacity: 0.4 }]}
                >
                  <Icon name="chevronLeft" size={20} color={Colors.text} />
                </Pressable>
              </View>

              <View style={styles.statRow}>
                <View style={[styles.stat, { backgroundColor: Tint.successBg }]}><Text style={[styles.statNum, { color: StatusText.success }]}>{present}</Text><Text style={styles.statLabel}>حاضر</Text></View>
                <View style={[styles.stat, { backgroundColor: Tint.dangerBg }]}><Text style={[styles.statNum, { color: StatusText.danger }]}>{absent}</Text><Text style={styles.statLabel}>غائب</Text></View>
                <View style={[styles.stat, { backgroundColor: Colors.bgSoft }]}><Text style={styles.statNum}>{attendance.length - present - absent}</Text><Text style={styles.statLabel}>لم يُسجَّل</Text></View>
              </View>

              {attendance.length === 0 ? (
                <EmptyState icon="users" title="لا يوجد موظفون" compact />
              ) : (
                <>
                  <Button label="تسجيل حضور الجميع" variant="ghost" onPress={markAllPresent} loading={saving} />
                  <View style={styles.card}>
                    {attendance.map((r, i) => {
                      const status = r.attendance?.status;
                      return (
                        <View key={r.id} style={[styles.attItem, i === attendance.length - 1 && { borderBottomWidth: 0 }]}>
                          <Pressable accessibilityRole="button" onPress={() => router.push(`/employee/${r.id}` as any)} style={styles.attTop}>
                            <Text style={styles.name}>{r.name}</Text>
                            <Text style={styles.sub}>{r.job_title ?? ''}</Text>
                          </Pressable>
                          <View style={styles.attActions}>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{ selected: status === 'present' }}
                              disabled={busyId === r.id}
                              onPress={() => mark(r, 'present')}
                              style={[styles.attBtn, { backgroundColor: status === 'present' ? Colors.success : Tint.successBg }]}
                            >
                              <Text style={[styles.attBtnText, { color: status === 'present' ? '#fff' : StatusText.success }]}>حاضر</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{ selected: status === 'absent' }}
                              disabled={busyId === r.id}
                              onPress={() => mark(r, 'absent')}
                              style={[styles.attBtn, { backgroundColor: status === 'absent' ? Colors.danger : Tint.dangerBg }]}
                            >
                              <Text style={[styles.attBtnText, { color: status === 'absent' ? '#fff' : StatusText.danger }]}>غائب</Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}
            </>
          )}

          {tab === 'salary' && (
            <>
              <View style={styles.dueCard}>
                <Text style={styles.sub}>إجمالي المستحق للموظفين</Text>
                <Text style={styles.dueValue}>{formatMoney(totalDue)}</Text>
                <Text style={styles.sub}>
                  {due.length} موظف لهم مستحقات
                  {overview?.payroll[0] ? ` · الالتزام الشهري ${formatMoney(overview.payroll[0].monthly_commitment)}` : ''}
                </Text>
              </View>

              {due.length > 0 && <Button label="صرف المستحقات للجميع" onPress={() => setPayAll(true)} />}

              {staff.length === 0 ? (
                <EmptyState icon="users" title="لا يوجد موظفون" compact />
              ) : (
                <View style={styles.card}>
                  {staff.map((s, i) => {
                    const balance = Number(s.balance ?? 0);
                    return (
                      <View key={s.id} style={[styles.rowItem, i === staff.length - 1 && { borderBottomWidth: 0 }]}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={styles.name}>{s.name}</Text>
                          <Text style={[styles.amount, { color: balance > 0 ? StatusText.warning : balance < 0 ? StatusText.danger : Colors.textMuted }]}>
                            {balance > 0 ? `مستحق ${formatMoney(balance)}` : balance < 0 ? `عليه ${formatMoney(Math.abs(balance))}` : 'لا مستحقات'}
                          </Text>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`صرف راتب ${s.name}`}
                          onPress={() => router.push({ pathname: '/staff-action', params: { kind: 'payment', staffId: String(s.id) } })}
                          style={styles.payBtn}
                        >
                          <Text style={styles.payText}>صرف</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      <ConfirmDialog
        visible={payAll}
        title="صرف المستحقات للجميع"
        description="سيُسجَّل لكل موظف دفعة بكامل مستحقاته الحالية."
        rows={[{ label: 'عدد الموظفين', value: String(due.length) }, { label: 'الإجمالي', value: formatMoney(totalDue) }]}
        confirmLabel="صرف الآن"
        loading={saving}
        onConfirm={paySelected}
        onCancel={() => setPayAll(false)}
      />
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  tabs: { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.line },
  tab: { flex: 1, minHeight: Layout.minTouch, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: Colors.accent },
  tabText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  body: { padding: 14, gap: 12 },
  summary: { borderRadius: Radius.md, padding: 16 },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 22, fontWeight: '800', color: '#fff' },
  summaryLabel: { fontSize: 12, color: 'rgba(255,255,255,0.88)', marginTop: 2 },
  summaryDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.25)' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, minHeight: 48, borderRadius: Radius.sm,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.line,
  },
  search: { flex: 1, fontSize: 15, minHeight: 44 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, overflow: 'hidden', ...Shadow.soft },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.line, minHeight: 68 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  name: { fontSize: 15, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  sub: { fontSize: 13, color: Colors.textMuted, textAlign: 'auto' },
  amount: { fontSize: 14, fontWeight: '800' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateBtn: { width: Layout.minTouch, height: Layout.minTouch, borderRadius: 12, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center' },
  dateBox: {
    flex: 1, minHeight: Layout.minTouch, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: Radius.xs, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.line,
  },
  dateText: { fontSize: 14, fontWeight: '700', color: Colors.textSoft },
  statRow: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: 12, color: Colors.textMuted },
  attItem: { padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: Colors.line },
  attTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  attActions: { flexDirection: 'row', gap: 8 },
  attBtn: { flex: 1, minHeight: Layout.minTouch, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  attBtnText: { fontSize: 14, fontWeight: '800' },
  dueCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 4, ...Shadow.soft },
  dueValue: { fontSize: 28, fontWeight: '800', color: StatusText.warning, textAlign: 'auto' },
  payBtn: { minHeight: Layout.minTouch, minWidth: 72, borderRadius: 12, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  payText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
