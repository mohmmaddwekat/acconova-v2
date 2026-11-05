import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon, IconName } from '../components/ui/Icon';
import { SkeletonList } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { Colors, Layout, Radius, Shadow, StatusText, Tint } from '../constants/theme';
import { api } from '../lib/api';
import { apiErrorMessage, formatMoney } from '../lib/format';
import { useBottomInset } from '../lib/insets';
import { useNotifications } from '../lib/notifications';
import { useStyles } from '../lib/theme';
import { Text } from '../components/ui/Text';

interface FollowUp {
  party_id: number;
  party: string;
  phone: string | null;
  overdue_amount: string;
  outstanding: string;
  days_late: number;
  alerts: { id: number; kind: string; severity: string; days_late: number; reason: string | null }[];
  last_contact: { days_ago: number; channel: string } | null;
}

interface AppNotification {
  id: number;
  kind: string;
  category: string;
  url?: string | null;
  data: { name?: string; detail?: string | null; amount?: string | number } | null;
  read_at: string | null;
  created_at: string;
}

type Tab = 'general' | 'collection';

const TABS: { key: Tab; label: string }[] = [
  { key: 'general', label: 'الإشعارات' },
  { key: 'collection', label: 'متابعة الديون' },
];

type Category = 'all' | 'stock' | 'payments' | 'activity' | 'messages';

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'stock', label: 'المخزون' },
  { key: 'payments', label: 'المدفوعات' },
  { key: 'activity', label: 'النشاط' },
  { key: 'messages', label: 'الرسائل' },
];

function kindMeta(kind: string): { title: string; icon: IconName; fg: string; bg: string } {
  if (kind === 'low_stock') return { title: 'مخزون منخفض', icon: 'alertCircle', fg: StatusText.warning, bg: Tint.warningBg };
  if (kind === 'out_of_stock') return { title: 'نفاد مخزون', icon: 'alertCircle', fg: StatusText.danger, bg: Tint.dangerBg };
  if (kind.includes('stock')) return { title: 'تنبيه مخزون', icon: 'alertCircle', fg: StatusText.warning, bg: Tint.warningBg };
  switch (kind) {
    case 'mention':
      return { title: 'تم ذكرك في سجل داخلي', icon: 'chat', fg: Colors.info, bg: Tint.infoBg };
    case 'approval_required':
      return { title: 'موافقة مطلوبة', icon: 'checkSquare', fg: StatusText.warning, bg: Tint.warningBg };
    case 'approval_approved':
      return { title: 'تمت الموافقة', icon: 'check', fg: StatusText.success, bg: Tint.successBg };
    case 'approval_rejected':
      return { title: 'تم رفض الموافقة', icon: 'close', fg: StatusText.danger, bg: Tint.dangerBg };
    case 'approval_progress':
      return { title: 'تقدم في الموافقة', icon: 'clock', fg: Colors.info, bg: Tint.infoBg };
    case 'inventory_expiry':
      return { title: 'تنبيه صلاحية مخزون', icon: 'alertCircle', fg: StatusText.warning, bg: Tint.warningBg };
    case 'contract_expiry':
      return { title: 'تنبيه انتهاء عقد', icon: 'file', fg: StatusText.warning, bg: Tint.warningBg };
    case 'document_expiry':
      return { title: 'تنبيه انتهاء وثيقة', icon: 'file', fg: StatusText.warning, bg: Tint.warningBg };
    case 'scheduled_report_ready':
      return { title: 'تقرير مجدول جاهز', icon: 'barChart', fg: Colors.accent, bg: Colors.accentSoft };
    case 'message':
      return { title: 'رسالة جديدة', icon: 'chat', fg: Colors.info, bg: Tint.infoBg };
    case 'payment_recorded':
      return { title: 'تم تسجيل دفعة', icon: 'check', fg: StatusText.success, bg: Tint.successBg };
    case 'payment_due':
      return { title: 'دفعة مستحقة', icon: 'alertCircle', fg: StatusText.danger, bg: Tint.dangerBg };
    case 'payment_soon':
      return { title: 'دفعة قريبة الاستحقاق', icon: 'clock', fg: StatusText.warning, bg: Tint.warningBg };
    case 'follow_up_due':
      return { title: 'متابعة تحصيل مستحقة', icon: 'bell', fg: StatusText.danger, bg: Tint.dangerBg };
    case 'production':
      return { title: 'عملية إنتاج', icon: 'barChart', fg: Colors.accent, bg: Colors.accentSoft };
    case 'service':
      return { title: 'عملية خدمة', icon: 'file', fg: Tint.purple, bg: Tint.purpleBg };
    default:
      return { title: 'تنبيه', icon: 'bell', fg: Colors.info, bg: Tint.infoBg };
  }
}

/** Where a notification leads in the app; null when only the website has that screen. */
function routeFor(n: AppNotification): string | 'collection' | null {
  if (n.kind === 'follow_up_due') return 'collection';
  if (n.kind.startsWith('approval')) return '/(tabs)/approvals';
  const path = (n.url ?? '').replace(/^https?:\/\/[^/]+/, '');
  if (n.category === 'stock' || path.startsWith('/app/inventory') || path.startsWith('/app/products')) return '/inventory';
  if (n.category === 'payments' || path.startsWith('/app/payments')) return '/transactions';
  return null;
}

function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'أمس' : `منذ ${days} أيام`;
}

function plusDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function lateColor(days: number): string {
  if (days > 60) return StatusText.danger;
  if (days > 30) return StatusText.warning;
  return Colors.accentStrong;
}

export default function NotificationsScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const toast = useToast();
  const { refresh: refreshCount, unread: totalUnread } = useNotifications();
  const [tab, setTab] = useState<Tab>('general');
  const [category, setCategory] = useState<Category>('all');
  const [general, setGeneral] = useState<AppNotification[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [acting, setActing] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setFailed(false);
      const [n, f] = await Promise.all([
        api.get('/notifications', { params: { per_page: 50, ...(category === 'all' ? {} : { category }) } }),
        api.get('/collections/follow-ups').catch(() => null),
      ]);
      setGeneral(Array.isArray(n.data?.data) ? n.data.data : []);
      setFollowUps(Array.isArray(f?.data?.data) ? f!.data.data : []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category]);

  useEffect(() => { load(); }, [load]);

  const unread = general.filter((n) => !n.read_at).length;

  async function markAllRead() {
    try {
      await api.post('/notifications/read-all');
      setGeneral((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
      await refreshCount();
      toast('تم تحديد الكل كمقروء');
    } catch (err: any) {
      toast(apiErrorMessage(err, 'تعذّر التحديث'));
    }
  }

  async function markRead(item: AppNotification) {
    if (item.read_at) return;
    setGeneral((prev) => prev.map((n) => (n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n)));
    api.patch(`/notifications/${item.id}/read`).then(() => refreshCount()).catch(() => {});
  }

  /** Marks the notification read and opens the matching screen of the app. */
  function open(item: AppNotification) {
    void markRead(item);
    const target = routeFor(item);
    if (target === 'collection') setTab('collection');
    else if (target) router.push(target as any);
    else toast('هذا الإشعار يُفتح من الموقع');
  }

  async function act(item: FollowUp, kind: 'snooze' | 'resolve') {
    setActing(item.party_id);
    try {
      await Promise.all(
        item.alerts.map((a) =>
          api.post(`/collections/alerts/${a.id}/${kind}`, kind === 'snooze' ? { until: plusDaysISO(7) } : undefined),
        ),
      );
      setFollowUps((prev) => prev.filter((p) => p.party_id !== item.party_id));
      toast(kind === 'snooze' ? 'تم التأجيل 7 أيام' : 'تم إغلاق التنبيه');
    } catch (err: any) {
      toast(apiErrorMessage(err, 'تعذّر تنفيذ الإجراء'));
    } finally {
      setActing(null);
    }
  }

  return (
    <View style={styles.flex}>
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
            {t.key === 'general' && unread > 0 && <View style={styles.countBadge}><Text style={styles.countText}>{unread}</Text></View>}
            {t.key === 'collection' && followUps.length > 0 && <View style={[styles.countBadge, { backgroundColor: Colors.danger }]}><Text style={styles.countText}>{followUps.length}</Text></View>}
          </Pressable>
        ))}
      </View>

      {tab === 'general' && (
        <View style={styles.toolbar}>
          <View style={styles.chips}>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c.key}
                accessibilityRole="button"
                accessibilityState={{ selected: category === c.key }}
                onPress={() => { if (category !== c.key) { setCategory(c.key); setLoading(true); } }}
                style={[styles.chip, category === c.key && styles.chipOn]}
              >
                <Text style={[styles.chipText, category === c.key && { color: '#fff' }]}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
          {totalUnread > 0 && (
            <Pressable accessibilityRole="button" onPress={markAllRead} style={styles.readAll}>
              <Icon name="check" size={16} color="#fff" strokeWidth={2.5} />
              <Text style={styles.readAllText}>تحديد الكل كمقروء ({totalUnread})</Text>
            </Pressable>
          )}
        </View>
      )}
      {tab === 'collection' && (
        <Text style={styles.tabHint}>عملاء تأخروا عن السداد، لمتابعتهم بالاتصال أو التأجيل أو الإغلاق (من وحدة متابعة الديون في الموقع).</Text>
      )}

      {loading ? (
        <SkeletonList rows={4} />
      ) : failed ? (
        <EmptyState icon="wifiOff" title="تعذّر تحميل التنبيهات" message="تحقق من الاتصال ثم حاول مرة أخرى." actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: bottomInset }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
        >
          {tab === 'general' && (
            <>
              {general.length === 0 ? (
                <EmptyState icon="bell" title="لا توجد إشعارات" message="ستظهر هنا تنبيهات المخزون والدفعات والرسائل." />
              ) : (
                <View style={styles.listCard}>
                  {general.map((n, i) => {
                    const meta = kindMeta(n.kind);
                    const subject = n.data?.name ?? '';
                    const detail = [n.data?.detail, n.data?.amount != null ? formatMoney(n.data.amount) : null].filter(Boolean).join(' · ');
                    return (
                      <Pressable
                        key={n.id}
                        accessibilityRole="button"
                        onPress={() => open(n)}
                        style={[styles.notif, !n.read_at && styles.notifUnread, i === general.length - 1 && { borderBottomWidth: 0 }]}
                      >
                        <View style={[styles.dot, n.read_at ? styles.dotRead : styles.dotUnread]} />
                        <View style={[styles.notifIcon, { backgroundColor: meta.bg }]}>
                          <Icon name={meta.icon} size={18} color={meta.fg} />
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={styles.notifTitle}>{meta.title}</Text>
                          {subject ? <Text style={styles.notifSubject}>{subject}</Text> : null}
                          {detail ? <Text style={styles.notifDesc}>{detail}</Text> : null}
                          <Text style={styles.notifTime}>{timeAgo(n.created_at)}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </>
          )}

          {tab === 'collection' && (
            followUps.length === 0 ? (
              <EmptyState icon="bell" title="لا توجد تنبيهات تحصيل" message="لا يوجد عملاء متأخرون عن السداد حالياً." />
            ) : (
              followUps.map((item) => {
                const color = lateColor(item.days_late);
                const busy = acting === item.party_id;
                return (
                  <View key={item.party_id} style={styles.card}>
                    <View style={styles.row}>
                      <Text style={styles.party} numberOfLines={1}>{item.party}</Text>
                      <View style={[styles.late, { backgroundColor: Tint.dangerBg }]}>
                        <Text style={[styles.lateText, { color }]}>متأخر {item.days_late} يوم</Text>
                      </View>
                    </View>
                    <View style={styles.row}>
                      <Text style={styles.label}>المتأخر</Text>
                      <Text style={[styles.value, { color: StatusText.danger }]}>{formatMoney(item.overdue_amount)}</Text>
                    </View>
                    <View style={styles.row}>
                      <Text style={styles.label}>إجمالي المستحق</Text>
                      <Text style={styles.value}>{formatMoney(item.outstanding)}</Text>
                    </View>
                    <Text style={styles.meta}>
                      {item.last_contact ? `آخر تواصل قبل ${item.last_contact.days_ago} يوم` : 'لم يتم التواصل بعد'}
                    </Text>
                    <View style={styles.actions}>
                      {item.phone ? (
                        <Pressable accessibilityRole="button" onPress={() => Linking.openURL(`tel:${item.phone}`)} style={[styles.btn, styles.call]}>
                          <Text style={styles.callText}>اتصال</Text>
                        </Pressable>
                      ) : null}
                      <Pressable accessibilityRole="button" disabled={busy} onPress={() => act(item, 'snooze')} style={[styles.btn, styles.snooze, busy && { opacity: 0.6 }]}>
                        <Text style={styles.snoozeText}>تأجيل</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" disabled={busy} onPress={() => act(item, 'resolve')} style={[styles.btn, styles.resolve, busy && { opacity: 0.6 }]}>
                        <Text style={styles.resolveText}>إغلاق</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )
          )}
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  tabs: { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.line, paddingHorizontal: 8 },
  tab: { flex: 1, minHeight: Layout.minTouch, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: Colors.accent },
  tabText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  countBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  countText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  scroll: { padding: 14, gap: 12, flexGrow: 1 },
  toolbar: { paddingHorizontal: 14, paddingTop: 12, gap: 10 },
  tabHint: { fontSize: 13, color: Colors.textMuted, lineHeight: 20, paddingHorizontal: 14, paddingTop: 12, textAlign: 'auto' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line },
  chipOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { fontSize: 13, fontWeight: '700', color: Colors.textSoft },
  notifSubject: { fontSize: 14, fontWeight: '700', color: Colors.accentStrong, textAlign: 'auto' },
  readAll: { minHeight: Layout.minTouch, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, backgroundColor: Colors.accent },
  readAllText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  listCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, overflow: 'hidden', ...Shadow.soft },
  notif: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.line },
  notifUnread: { backgroundColor: Colors.accentSoft },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 16 },
  dotUnread: { backgroundColor: Colors.accent },
  dotRead: { backgroundColor: 'transparent' },
  notifIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  notifTitle: { fontSize: 14, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  notifDesc: { fontSize: 13, color: Colors.textSoft, lineHeight: 20, textAlign: 'auto' },
  notifTime: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 14, gap: 8, ...Shadow.soft },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  party: { flex: 1, fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  late: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  lateText: { fontSize: 12, fontWeight: '800' },
  label: { fontSize: 14, color: Colors.textMuted },
  value: { fontSize: 15, fontWeight: '800', color: Colors.text },
  meta: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btn: { flex: 1, minHeight: Layout.minTouch, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  call: { backgroundColor: Tint.infoBg },
  callText: { fontSize: 14, fontWeight: '800', color: Colors.accentStrong },
  snooze: { backgroundColor: Tint.warningBg },
  snoozeText: { fontSize: 14, fontWeight: '800', color: StatusText.warning },
  resolve: { backgroundColor: Tint.successBg },
  resolveText: { fontSize: 14, fontWeight: '800', color: StatusText.success },
});
