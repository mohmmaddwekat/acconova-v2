import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { SkeletonList } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { Colors, Layout, Radius, StatusText, Tint } from '../../constants/theme';
import { api } from '../../lib/api';
import { apiErrorMessage, formatMoney, todayISO, uuidv4 } from '../../lib/format';

interface StaffRow {
  id: number;
  name: string;
  job_title?: string | null;
  basis?: string;
  rate: string;
  currency?: string;
  attendance: { status: 'present' | 'absent' } | null;
}

type Tab = 'all' | 'attend' | 'salary';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'الموظفون' },
  { key: 'attend', label: 'الحضور' },
  { key: 'salary', label: 'الرواتب' },
];

function StatusBadge({ status }: { status?: 'present' | 'absent' }) {
  const map = {
    present: { text: 'حاضر', fg: StatusText.success, bg: Tint.successBg },
    absent: { text: 'غائب', fg: StatusText.danger, bg: Tint.dangerBg },
    none: { text: 'غير مسجّل', fg: Colors.textMuted, bg: Colors.bgSoft },
  }[status ?? 'none'];
  return (
    <View style={[styles.badge, { backgroundColor: map.bg }]}>
      <Text style={[styles.badgeText, { color: map.fg }]}>{map.text}</Text>
    </View>
  );
}

export default function EmployeesScreen() {
  const toast = useToast();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.key === tabParam) ? (tabParam as Tab) : 'all');
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paying, setPaying] = useState<StaffRow | null>(null);
  const [paySaving, setPaySaving] = useState(false);
  const [paidIds, setPaidIds] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    try {
      setFailed(false);
      const { data } = await api.get('/staff-attendance/bulk', { params: { date: todayISO(), per_page: 100 } });
      setRows(Array.isArray(data?.data) ? data.data : []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (TABS.some((t) => t.key === tabParam)) setTab(tabParam as Tab);
  }, [tabParam]);

  const counts = useMemo(() => {
    const present = rows.filter((r) => r.attendance?.status === 'present').length;
    const absent = rows.filter((r) => r.attendance?.status === 'absent').length;
    return { total: rows.length, present, absent };
  }, [rows]);

  async function mark(row: StaffRow, status: 'present' | 'absent') {
    const previous = row.attendance;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, attendance: { status } } : r)));
    try {
      await api.post(`/staff/${row.id}/attendance`, {
        occurred_on: todayISO(),
        status,
        overtime_hours: 0,
        overtime_rate: 0,
      });
    } catch (err: any) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, attendance: previous } : r)));
      toast(apiErrorMessage(err, 'تعذّر تسجيل الحضور'));
    }
  }

  async function paySalary(row: StaffRow, amount?: string) {
    const value = Number(amount);
    if (!value || value <= 0) {
      toast('أدخل مبلغاً صحيحاً');
      return;
    }
    setPaySaving(true);
    try {
      await api.post(`/staff/${row.id}/entries`, {
        request_id: uuidv4(),
        kind: 'payment',
        occurred_on: todayISO(),
        amount: value,
      });
      setPaidIds((prev) => new Set(prev).add(row.id));
      setPaying(null);
      toast(`تم صرف راتب ${row.name}`);
    } catch (err: any) {
      toast(apiErrorMessage(err, 'تعذّر صرف الراتب'));
    } finally {
      setPaySaving(false);
    }
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader title="الموظفون" />

      <View style={styles.stats}>
        <View style={styles.stat}><Text style={styles.statNum}>{counts.total}</Text><Text style={styles.statLabel}>إجمالي</Text></View>
        <View style={[styles.stat, styles.statMid]}><Text style={[styles.statNum, { color: StatusText.success }]}>{counts.present}</Text><Text style={styles.statLabel}>حاضر اليوم</Text></View>
        <View style={styles.stat}><Text style={[styles.statNum, { color: StatusText.danger }]}>{counts.absent}</Text><Text style={styles.statLabel}>غائب</Text></View>
      </View>

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
        <EmptyState icon="wifiOff" title="تعذّر تحميل الموظفين" message="تحقق من الاتصال ثم حاول مرة أخرى." actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : rows.length === 0 ? (
        <EmptyState icon="users" title="لا يوجد موظفون" message="أضف موظفين من لوحة التحكم لتظهر هنا." />
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
        >
          {tab === 'all' && (
            <View style={styles.card}>
              {rows.map((r, i) => (
                <View key={r.id} style={[styles.rowItem, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{r.name.charAt(0)}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{r.name}</Text>
                    {r.job_title ? <Text style={styles.sub}>{r.job_title}</Text> : null}
                  </View>
                  <Text style={styles.amount}>{formatMoney(r.rate)}</Text>
                </View>
              ))}
            </View>
          )}

          {tab === 'attend' && (
            <View style={styles.card}>
              {rows.map((r, i) => (
                <View key={r.id} style={[styles.attItem, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={styles.attTop}>
                    <Text style={styles.name}>{r.name}</Text>
                    <StatusBadge status={r.attendance?.status} />
                  </View>
                  <View style={styles.attActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`تسجيل حضور ${r.name}`}
                      onPress={() => mark(r, 'present')}
                      style={[styles.attBtn, { backgroundColor: r.attendance?.status === 'present' ? StatusText.success : Tint.successBg }]}
                    >
                      <Text style={[styles.attBtnText, { color: r.attendance?.status === 'present' ? '#fff' : StatusText.success }]}>حضور</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`تسجيل غياب ${r.name}`}
                      onPress={() => mark(r, 'absent')}
                      style={[styles.attBtn, { backgroundColor: r.attendance?.status === 'absent' ? StatusText.danger : Tint.dangerBg }]}
                    >
                      <Text style={[styles.attBtnText, { color: r.attendance?.status === 'absent' ? '#fff' : StatusText.danger }]}>غياب</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          {tab === 'salary' && (
            <>
              <View style={styles.summary}>
                <Text style={styles.summaryLabel}>إجمالي الرواتب الأساسية</Text>
                <Text style={styles.summaryValue}>{formatMoney(rows.reduce((s, r) => s + (Number(r.rate) || 0), 0))}</Text>
              </View>
              <View style={styles.card}>
                {rows.map((r, i) => (
                  <View key={r.id} style={[styles.rowItem, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{r.name}</Text>
                      <Text style={styles.sub}>{formatMoney(r.rate)}</Text>
                    </View>
                    {paidIds.has(r.id) ? (
                      <View style={[styles.badge, { backgroundColor: Tint.successBg }]}>
                        <Text style={[styles.badgeText, { color: StatusText.success }]}>تم الصرف</Text>
                      </View>
                    ) : (
                      <Pressable accessibilityRole="button" accessibilityLabel={`صرف راتب ${r.name}`} onPress={() => setPaying(r)} style={styles.payBtn}>
                        <Text style={styles.payText}>صرف</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}

      <ConfirmDialog
        visible={!!paying}
        title="تأكيد صرف الراتب"
        description="سيتم تسجيل قيد صرف للموظف في سجل الرواتب."
        rows={paying ? [{ label: 'الموظف', value: paying.name }, { label: 'الشهر', value: new Date().toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' }) }] : []}
        amountInput={paying ? { label: 'المبلغ', initial: String(Number(paying.rate) || '') } : undefined}
        confirmLabel="صرف الآن"
        loading={paySaving}
        onConfirm={(amount) => paying && paySalary(paying, amount)}
        onCancel={() => setPaying(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  stats: { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.line },
  stat: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  statMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.line },
  statNum: { fontSize: 20, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  tabs: { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.line },
  tab: { flex: 1, minHeight: Layout.minTouch, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: Colors.accent },
  tabText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  body: { padding: 14, gap: 12 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, overflow: 'hidden' },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.line, minHeight: 64 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  name: { fontSize: 15, fontWeight: '700', color: Colors.text, textAlign: 'right' },
  sub: { fontSize: 13, color: Colors.textMuted, textAlign: 'right', marginTop: 2 },
  amount: { fontSize: 14, fontWeight: '800', color: Colors.text },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  attItem: { padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: Colors.line },
  attTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  attActions: { flexDirection: 'row', gap: 8 },
  attBtn: { flex: 1, minHeight: Layout.minTouch, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  attBtnText: { fontSize: 14, fontWeight: '800' },
  summary: { backgroundColor: Colors.accent, borderRadius: Radius.md, padding: 16, gap: 4 },
  summaryLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600', textAlign: 'right' },
  summaryValue: { color: '#fff', fontSize: 26, fontWeight: '800', textAlign: 'right' },
  payBtn: { minHeight: Layout.minTouch, minWidth: 72, borderRadius: 12, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  payText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
