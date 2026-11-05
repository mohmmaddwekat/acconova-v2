import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { EmptyState } from '../components/ui/EmptyState';
import { Gradient } from '../components/ui/Gradient';
import { SkeletonList } from '../components/ui/Skeleton';
import { Text } from '../components/ui/Text';
import { useToast } from '../components/ui/Toast';
import { Colors, Layout, Radius, Shadow, StatusText, Tint } from '../constants/theme';
import { api } from '../lib/api';
import { apiErrorMessage, formatMoney, todayISO } from '../lib/format';
import { useBottomInset } from '../lib/insets';
import { Movement } from '../lib/movements';
import { useStyles } from '../lib/theme';

interface Cheque extends Movement {
  check_number: string | null;
  check_due_date: string | null;
  check_status: 'pending' | 'cleared' | 'bounced' | 'cancelled' | null;
}

type Side = 'incoming' | 'outgoing';
type StatusFilter = 'pending' | 'cleared' | 'bounced';

const SIDES: { key: Side; label: string }[] = [
  { key: 'incoming', label: 'شيكات واردة' },
  { key: 'outgoing', label: 'شيكات صادرة' },
];

const STATUSES: { key: StatusFilter; label: string }[] = [
  { key: 'pending', label: 'معلّقة' },
  { key: 'cleared', label: 'محصّلة' },
  { key: 'bounced', label: 'مرتجعة' },
];

const dayMs = 86400000;
const daysUntil = (iso: string) => Math.round((new Date(`${iso}T00:00:00`).getTime() - new Date(`${todayISO()}T00:00:00`).getTime()) / dayMs);

function dueLabel(iso: string | null, status: Cheque['check_status']): { text: string; fg: string; bg: string } {
  if (status === 'cleared') return { text: 'تم التحصيل', fg: StatusText.success, bg: Tint.successBg };
  if (status === 'bounced') return { text: 'مرتجع', fg: StatusText.danger, bg: Tint.dangerBg };
  if (status === 'cancelled') return { text: 'ملغى', fg: Colors.textMuted, bg: Colors.bgSoft };
  if (!iso) return { text: 'بدون تاريخ', fg: Colors.textMuted, bg: Colors.bgSoft };
  const d = daysUntil(iso);
  if (d < 0) return { text: `متأخر ${Math.abs(d)} يوم`, fg: StatusText.danger, bg: Tint.dangerBg };
  if (d === 0) return { text: 'يستحق اليوم', fg: StatusText.warning, bg: Tint.warningBg };
  if (d <= 7) return { text: `بعد ${d} أيام`, fg: StatusText.warning, bg: Tint.warningBg };
  return { text: `بعد ${d} يوماً`, fg: Colors.accentStrong, bg: Tint.infoBg };
}

export default function ChequesScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const toast = useToast();
  const [side, setSide] = useState<Side>('incoming');
  const [status, setStatus] = useState<StatusFilter>('pending');
  const [rows, setRows] = useState<Cheque[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setFailed(false);
      const res = await api.get('/finance/cash-movements', {
        params: { method: 'check', status: 'posted', direction: side, per_page: 100, sort: 'date', sort_direction: 'desc' },
      });
      setRows(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [side]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const visible = useMemo(
    () =>
      rows
        .filter((r) => (r.check_status ?? 'pending') === status)
        .sort((a, b) => (a.check_due_date ?? '9999').localeCompare(b.check_due_date ?? '9999')),
    [rows, status],
  );

  const pending = useMemo(() => rows.filter((r) => (r.check_status ?? 'pending') === 'pending'), [rows]);
  const pendingTotal = pending.reduce((sum, r) => sum + Number(r.amount), 0);
  const dueSoon = pending.filter((r) => r.check_due_date && daysUntil(r.check_due_date) <= 7).length;
  const overdue = pending.filter((r) => r.check_due_date && daysUntil(r.check_due_date) < 0).length;

  async function setCheckStatus(id: number, next: 'cleared' | 'bounced') {
    setBusyId(id);
    try {
      await api.patch(`/finance/cash-movements/${id}/check-status`, { status: next });
      toast(next === 'cleared' ? 'تم تسجيل التحصيل' : 'تم تسجيل الشيك كمرتجع');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر تحديث حالة الشيك'));
    } finally {
      setBusyId(null);
    }
  }

  const header = (
    <View style={styles.headerWrap}>
      <View style={styles.seg}>
        {SIDES.map((s) => (
          <Pressable
            key={s.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: side === s.key }}
            onPress={() => setSide(s.key)}
            style={[styles.segBtn, side === s.key && styles.segOn]}
          >
            <Text style={[styles.segText, side === s.key && { color: Colors.accentStrong }]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      <Gradient colors={[Colors.accent, Colors.accentStrong]} style={styles.hero}>
        <View style={styles.glow} />
        <Text style={styles.heroLabel}>{side === 'incoming' ? 'شيكات بانتظار التحصيل' : 'شيكات بانتظار الصرف'}</Text>
        <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(pendingTotal)}</Text>
        <Text style={styles.heroSub}>{pending.length} شيك معلّق</Text>
      </Gradient>

      <View style={styles.statRow}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: StatusText.warning }]}>{dueSoon}</Text>
          <Text style={styles.statLabel}>تستحق خلال 7 أيام</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: StatusText.danger }]}>{overdue}</Text>
          <Text style={styles.statLabel}>تجاوزت الاستحقاق</Text>
        </View>
      </View>

      <View style={styles.pills}>
        {STATUSES.map((s) => (
          <Pressable
            key={s.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: status === s.key }}
            onPress={() => setStatus(s.key)}
            style={[styles.pill, status === s.key && styles.pillOn]}
          >
            <Text style={[styles.pillText, status === s.key && { color: Colors.accent }]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  if (loading) return <View style={styles.flex}><SkeletonList rows={5} /></View>;

  if (failed) {
    return (
      <View style={styles.flex}>
        <EmptyState icon="wifiOff" title="تعذّر تحميل الشيكات" message="تحقق من الاتصال أو الصلاحيات ثم حاول مرة أخرى." actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.flex}
      data={visible}
      keyExtractor={(c) => String(c.id)}
      ListHeaderComponent={header}
      contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
      ListEmptyComponent={<EmptyState icon="file" title="لا توجد شيكات هنا" message="ستظهر الشيكات المرحّلة حسب حالتها." compact />}
      renderItem={({ item }) => {
        const due = dueLabel(item.check_due_date, item.check_status ?? 'pending');
        const isPending = (item.check_status ?? 'pending') === 'pending';
        const busy = busyId === item.id;
        return (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.party} numberOfLines={1}>{item.party?.name ?? 'بدون طرف'}</Text>
                <Text style={styles.meta}>شيك رقم {item.check_number ?? '—'}{item.check_due_date ? ` • ${item.check_due_date}` : ''}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 8 }}>
                <Text style={styles.amount}>{formatMoney(item.amount)}</Text>
                <View style={[styles.badge, { backgroundColor: due.bg }]}>
                  <Text style={[styles.badgeText, { color: due.fg }]}>{due.text}</Text>
                </View>
              </View>
            </View>
            {isPending && (
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => setCheckStatus(item.id, 'cleared')}
                  style={[styles.action, { backgroundColor: Tint.successBg, opacity: busy ? 0.5 : 1 }]}
                >
                  <Text style={[styles.actionText, { color: StatusText.success }]}>{side === 'incoming' ? 'تم التحصيل' : 'تم الصرف'}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => setCheckStatus(item.id, 'bounced')}
                  style={[styles.action, { backgroundColor: Tint.dangerBg, opacity: busy ? 0.5 : 1 }]}
                >
                  <Text style={[styles.actionText, { color: StatusText.danger }]}>مرتجع</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      }}
    />
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  headerWrap: { gap: 16, marginBottom: 4 },
  seg: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: 12, backgroundColor: Colors.bgSoft },
  segBtn: { flex: 1, minHeight: Layout.minTouch, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: Colors.surface },
  segText: { fontSize: 14, fontWeight: '800', color: Colors.textMuted },
  hero: { borderRadius: Radius.lg, padding: 24, gap: 8, shadowColor: Colors.accentStrong, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 24, elevation: 6 },
  glow: { position: 'absolute', top: -48, right: -48, width: 160, height: 160, borderRadius: 80, backgroundColor: '#fff', opacity: 0.12 },
  heroLabel: { fontSize: 14, fontWeight: '600', color: '#fff', opacity: 0.85, textAlign: 'auto' },
  heroValue: { fontSize: 32, fontWeight: '800', color: '#fff', textAlign: 'auto' },
  heroSub: { fontSize: 14, color: '#fff', opacity: 0.85, textAlign: 'auto' },
  statRow: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 4, ...Shadow.soft },
  statValue: { fontSize: 24, fontWeight: '800', textAlign: 'auto' },
  statLabel: { fontSize: 14, color: Colors.textMuted, textAlign: 'auto' },
  pills: { flexDirection: 'row', gap: 8 },
  pill: { flex: 1, minHeight: Layout.minTouch, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line },
  pillOn: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  pillText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 16, ...Shadow.soft },
  cardTop: { flexDirection: 'row', gap: 12 },
  party: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  meta: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  amount: { fontSize: 18, fontWeight: '800', color: Colors.text },
  badge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1, minHeight: Layout.minTouch, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14, fontWeight: '800' },
});
