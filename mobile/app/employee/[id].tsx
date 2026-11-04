import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { EmptyState } from '../../components/ui/EmptyState';
import { Gradient } from '../../components/ui/Gradient';
import { Icon, IconName } from '../../components/ui/Icon';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { SkeletonList } from '../../components/ui/Skeleton';
import { Text } from '../../components/ui/Text';
import { Colors, Layout, Radius, Shadow, StatusText, Tint } from '../../constants/theme';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { useBottomInset } from '../../lib/insets';
import { BASIS_LABEL } from '../../lib/staff';
import { useStyles } from '../../lib/theme';

interface Entry {
  id: number;
  kind: string;
  occurred_on: string;
  amount: string;
  notes: string | null;
}

interface Summary {
  work_earned: string;
  bonus: string;
  allowances: string;
  overtime: string;
  gross_earned: string;
  deductions: string;
  advances: string;
  net_entitlement: string;
  paid: string;
  remaining_due: string;
}

interface Ledger {
  member: { id: number; name: string; job_title: string | null; basis: string; rate: string; currency: string; payroll_summary: Summary };
  balance: string;
  entries: { data: Entry[] };
}

interface AttendanceRecord {
  id: number;
  occurred_on: string;
  status: 'present' | 'absent';
  overtime_hours: string;
  earned: string;
}

interface PayrollRow {
  period: string;
  present: number;
  absent: number;
  gross_earnings: string;
  deductions: string;
  advances: string;
  net_entitlement: string;
  payments: string;
  remaining: string;
  status: string;
}

interface Workforce {
  attendance: { data: AttendanceRecord[] };
  summary: { present: number; absent: number; overtime: string };
  payroll: { rows: PayrollRow[] };
}

type Tab = 'payroll' | 'entries' | 'attendance';

const TABS: { key: Tab; label: string }[] = [
  { key: 'payroll', label: 'الرواتب' },
  { key: 'entries', label: 'الحركات' },
  { key: 'attendance', label: 'الحضور' },
];

const ENTRY_LABEL: Record<string, { label: string; sign: '+' | '-'; tone: 'good' | 'bad' | 'paid' }> = {
  work: { label: 'أجر عمل', sign: '+', tone: 'good' },
  monthly_allowance: { label: 'بدل شهري', sign: '+', tone: 'good' },
  allowance: { label: 'بدل', sign: '+', tone: 'good' },
  bonus: { label: 'مكافأة', sign: '+', tone: 'good' },
  deduction: { label: 'خصم', sign: '-', tone: 'bad' },
  advance: { label: 'سلفة', sign: '-', tone: 'bad' },
  payment: { label: 'دفعة', sign: '-', tone: 'paid' },
};

const PERIOD_STATUS: Record<string, { label: string; fg: string; bg: string }> = {
  paid: { label: 'مدفوع', fg: StatusText.success, bg: Tint.successBg },
  partial: { label: 'جزئي', fg: StatusText.warning, bg: Tint.warningBg },
  unpaid: { label: 'غير مدفوع', fg: StatusText.danger, bg: Tint.dangerBg },
};

export default function EmployeeScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [work, setWork] = useState<Workforce | null>(null);
  const [tab, setTab] = useState<Tab>('payroll');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setFailed(false);
      const [l, w] = await Promise.all([api.get(`/staff/${id}/ledger`), api.get(`/staff/${id}/workforce`)]);
      setLedger(l.data);
      setWork(w.data);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const go = (kind: string) => router.push({ pathname: '/staff-action', params: { kind, staffId: String(id) } });
  const actions: { kind: string; label: string; icon: IconName }[] = [
    { kind: 'attendance', label: 'حضور', icon: 'calendar' },
    { kind: 'payment', label: 'دفعة', icon: 'banknote' },
    { kind: 'advance', label: 'سلفة', icon: 'card' },
    { kind: 'bonus', label: 'مكافأة', icon: 'plus' },
    { kind: 'deduction', label: 'خصم', icon: 'close' },
  ];

  const s = ledger?.member.payroll_summary;
  const remaining = Number(ledger?.balance ?? s?.remaining_due ?? 0);

  return (
    <View style={styles.flex}>
      <ScreenHeader title={ledger?.member.name ?? 'الموظف'} />

      {loading ? (
        <SkeletonList rows={4} />
      ) : failed || !ledger || !s ? (
        <EmptyState icon="wifiOff" title="تعذّر تحميل بيانات الموظف" message="تحقق من الاتصال أو من صلاحياتك ثم حاول مرة أخرى." actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); void load(); }} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: bottomInset }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={Colors.accent} />}
        >
          <Gradient colors={[Colors.accent, Colors.accentHover]} style={styles.hero}>
            <Text style={styles.heroLabel}>
              {remaining >= 0 ? 'المستحق للموظف' : 'مستحق على الموظف'}
            </Text>
            <Text style={styles.heroValue}>{formatMoney(Math.abs(remaining))}</Text>
            <Text style={styles.heroSub}>
              {[ledger.member.job_title, BASIS_LABEL[ledger.member.basis] ?? ledger.member.basis, `الأساس ${formatMoney(ledger.member.rate)}`].filter(Boolean).join(' · ')}
            </Text>
          </Gradient>

          <View style={styles.actions}>
            {actions.map((a) => (
              <Pressable key={a.kind} accessibilityRole="button" accessibilityLabel={a.label} onPress={() => go(a.kind)} style={styles.action}>
                <View style={styles.actionIcon}><Icon name={a.icon} size={20} color={Colors.accentStrong} /></View>
                <Text style={styles.actionText}>{a.label}</Text>
              </Pressable>
            ))}
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

          {tab === 'payroll' && (
            <>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>ملخص المستحقات</Text>
                {[
                  ['أجر العمل', s.work_earned, 'good'],
                  ['ساعات إضافية', s.overtime, 'good'],
                  ['مكافآت', s.bonus, 'good'],
                  ['بدلات', s.allowances, 'good'],
                  ['خصومات', s.deductions, 'bad'],
                  ['سلف', s.advances, 'bad'],
                ].map(([label, value, tone]) => (
                  Number(value) !== 0 ? (
                    <View key={label} style={styles.line}>
                      <Text style={styles.lineLabel}>{label}</Text>
                      <Text style={[styles.lineValue, { color: tone === 'bad' ? StatusText.danger : StatusText.success }]}>
                        {tone === 'bad' ? '-' : '+'}{formatMoney(Math.abs(Number(value)))}
                      </Text>
                    </View>
                  ) : null
                ))}
                <View style={styles.sep} />
                <View style={styles.line}><Text style={styles.total}>صافي المستحق</Text><Text style={styles.total}>{formatMoney(s.net_entitlement)}</Text></View>
                <View style={styles.line}><Text style={styles.lineLabel}>المدفوع</Text><Text style={styles.lineValue}>{formatMoney(s.paid)}</Text></View>
                <View style={styles.line}><Text style={styles.total}>المتبقي</Text><Text style={[styles.total, { color: StatusText.warning }]}>{formatMoney(s.remaining_due)}</Text></View>
              </View>

              {(work?.payroll.rows ?? []).map((row) => {
                const st = PERIOD_STATUS[row.status] ?? PERIOD_STATUS.unpaid;
                return (
                  <View key={row.period} style={styles.card}>
                    <View style={styles.line}>
                      <Text style={styles.sectionTitle}>{row.period}</Text>
                      <View style={[styles.badge, { backgroundColor: st.bg }]}><Text style={[styles.badgeText, { color: st.fg }]}>{st.label}</Text></View>
                    </View>
                    <Text style={styles.sub}>حضور {row.present} · غياب {row.absent}</Text>
                    <View style={styles.line}><Text style={styles.lineLabel}>الإجمالي</Text><Text style={styles.lineValue}>{formatMoney(row.gross_earnings)}</Text></View>
                    <View style={styles.line}><Text style={styles.lineLabel}>المدفوع</Text><Text style={styles.lineValue}>{formatMoney(row.payments)}</Text></View>
                    <View style={styles.line}><Text style={styles.lineLabel}>المتبقي</Text><Text style={[styles.lineValue, { color: Number(row.remaining) > 0 ? StatusText.warning : Colors.text }]}>{formatMoney(row.remaining)}</Text></View>
                  </View>
                );
              })}
            </>
          )}

          {tab === 'entries' && (
            ledger.entries.data.length === 0 ? (
              <EmptyState icon="file" title="لا توجد حركات بعد" compact />
            ) : (
              <View style={styles.card}>
                {ledger.entries.data.map((e, i) => {
                  const meta = ENTRY_LABEL[e.kind] ?? { label: e.kind, sign: '+' as const, tone: 'good' as const };
                  const color = meta.tone === 'good' ? StatusText.success : meta.tone === 'bad' ? StatusText.danger : Colors.accentStrong;
                  return (
                    <View key={e.id} style={[styles.entry, i === ledger.entries.data.length - 1 && { borderBottomWidth: 0 }]}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.lineLabelStrong}>{meta.label}</Text>
                        <Text style={styles.sub}>{e.occurred_on}{e.notes ? ` · ${e.notes}` : ''}</Text>
                      </View>
                      <Text style={[styles.lineValue, { color }]}>{meta.sign}{formatMoney(Math.abs(Number(e.amount)))}</Text>
                    </View>
                  );
                })}
              </View>
            )
          )}

          {tab === 'attendance' && (
            <>
              <View style={styles.statRow}>
                <View style={[styles.stat, { backgroundColor: Tint.successBg }]}><Text style={[styles.statNum, { color: StatusText.success }]}>{work?.summary.present ?? 0}</Text><Text style={styles.sub}>حضور</Text></View>
                <View style={[styles.stat, { backgroundColor: Tint.dangerBg }]}><Text style={[styles.statNum, { color: StatusText.danger }]}>{work?.summary.absent ?? 0}</Text><Text style={styles.sub}>غياب</Text></View>
                <View style={[styles.stat, { backgroundColor: Colors.bgSoft }]}><Text style={styles.statNum}>{Number(work?.summary.overtime ?? 0)}</Text><Text style={styles.sub}>ساعات إضافية</Text></View>
              </View>
              {(work?.attendance.data ?? []).length === 0 ? (
                <EmptyState icon="calendar" title="لا يوجد سجل حضور" compact />
              ) : (
                <View style={styles.card}>
                  {work!.attendance.data.map((a, i, all) => (
                    <View key={a.id} style={[styles.entry, i === all.length - 1 && { borderBottomWidth: 0 }]}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.lineLabelStrong}>{a.occurred_on}</Text>
                        {Number(a.overtime_hours) > 0 ? <Text style={styles.sub}>إضافي {Number(a.overtime_hours)} ساعة</Text> : null}
                      </View>
                      <View style={[styles.badge, { backgroundColor: a.status === 'present' ? Tint.successBg : Tint.dangerBg }]}>
                        <Text style={[styles.badgeText, { color: a.status === 'present' ? StatusText.success : StatusText.danger }]}>{a.status === 'present' ? 'حاضر' : 'غائب'}</Text>
                      </View>
                      <Text style={styles.lineValue}>{formatMoney(a.earned)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  body: { padding: 14, gap: 12 },
  hero: { borderRadius: Radius.md, padding: 18, gap: 4 },
  heroLabel: { fontSize: 13, color: 'rgba(255,255,255,0.88)', fontWeight: '600', textAlign: 'auto' },
  heroValue: { fontSize: 32, fontWeight: '800', color: '#fff', textAlign: 'auto' },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.88)', textAlign: 'auto' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  action: { flex: 1, minHeight: 72, borderRadius: Radius.sm, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line, alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 12, fontWeight: '700', color: Colors.textSoft },
  tabs: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.line, padding: 3, gap: 3 },
  tab: { flex: 1, minHeight: Layout.minTouch - 4, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: Colors.accentSoft },
  tabText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 14, gap: 8, ...Shadow.soft },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 28 },
  lineLabel: { fontSize: 14, color: Colors.textMuted },
  lineLabelStrong: { fontSize: 14, fontWeight: '700', color: Colors.text, textAlign: 'auto' },
  lineValue: { fontSize: 14, fontWeight: '800', color: Colors.text },
  total: { fontSize: 15, fontWeight: '800', color: Colors.text },
  sep: { height: 1, backgroundColor: Colors.line },
  sub: { fontSize: 13, color: Colors.textMuted, textAlign: 'auto' },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.line },
  statRow: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: '800', color: Colors.text },
});
