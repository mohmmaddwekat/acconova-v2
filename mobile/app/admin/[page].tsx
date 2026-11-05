import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { EmptyState } from '../../components/ui/EmptyState';
import { Gradient } from '../../components/ui/Gradient';
import { SkeletonList } from '../../components/ui/Skeleton';
import { Text } from '../../components/ui/Text';
import { useToast } from '../../components/ui/Toast';
import { Colors, Layout, Radius, Shadow, StatusText, Tint } from '../../constants/theme';
import { api } from '../../lib/api';
import { apiErrorMessage } from '../../lib/format';
import { t } from '../../lib/i18n';
import { useBottomInset } from '../../lib/insets';
import { useStyles } from '../../lib/theme';

type Obj = Record<string, unknown>;
type Tone = 'ok' | 'warn' | 'bad' | 'info';
interface Item { id: string; title: string; subtitle?: string; detail?: string; badge?: { text: string; tone: Tone }; filter?: string; open?: string; restore?: { type: string; id: string } }
interface View_ { hero: { label: string; value: string; sub?: string; tone?: Tone }; filters?: { key: string; label: string }[]; items: Item[]; empty: string }

const asArray = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);
const text = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
const when = (iso: unknown) => text(iso).slice(0, 16).replace('T', ' ');
const isLatin = (s: string) => /^[\x00-\x7F]+$/.test(s) && /[A-Za-z]{3}/.test(s);

const ACTIONS: Record<string, string> = {
  created: 'إنشاء', updated: 'تعديل', deleted: 'حذف', restored: 'استرجاع', posted: 'ترحيل', reversed: 'عكس', voided: 'إلغاء', approved: 'اعتماد',
  rejected: 'رفض', login: 'تسجيل دخول', status_changed: 'تغيير حالة', check_status_changed: 'تغيير حالة شيك', payment_recorded: 'تسجيل دفعة',
};
const TYPES: Record<string, string> = {
  FinancialDocument: 'مستند مالي', CashMovement: 'حركة نقدية', Party: 'طرف', Product: 'منتج', StaffMember: 'موظف', Warehouse: 'مستودع',
  Department: 'قسم', Task: 'مهمة', ProductionRun: 'أمر إنتاج', User: 'مستخدم', Membership: 'عضوية',
};
const ENTITY: Record<string, string> = { party: 'طرف', product: 'منتج', warehouse: 'مستودع', document: 'مستند', staff: 'موظف' };

const typeLabel = (raw: unknown) => TYPES[text(raw).split('\\').pop() ?? ''] ?? 'سجل';
const actionLabel = (raw: unknown) => ACTIONS[text(raw)] ?? (isLatin(text(raw)) ? 'تغيير' : text(raw) || 'تغيير');

const ISSUE: Record<string, string> = {
  duplicate: 'بيانات مكررة', missing_phone: 'رقم الهاتف ناقص', missing_email: 'البريد ناقص', missing_cost: 'سعر التكلفة ناقص',
  missing_price: 'سعر البيع ناقص', missing_sku: 'رمز الصنف ناقص', negative_stock: 'رصيد مخزون بالسالب', invalid: 'بيانات غير صحيحة',
};

function route(type: string, id: string): string | undefined {
  if (type === 'party') return `/party/${id}`;
  if (type === 'product') return `/stock/${id}`;
  if (type === 'document' || type === 'financial_document') return `/invoice/${id}`;
  if (type === 'staff' || type === 'staff_member') return `/employee/${id}`;
  return undefined;
}

const PAGES: Record<string, { title: string; endpoint: string; build: (body: Obj) => View_ }> = {
  audit: {
    title: 'مركز التدقيق',
    endpoint: '/audit-center',
    build: (body) => {
      const rows = asArray(body.data);
      const actions = [...new Set(rows.map((r) => text(r.action)).filter(Boolean))];
      return {
        hero: { label: 'أحداث مسجّلة', value: String(rows.length), sub: 'من فعل ماذا ومتى، لا يمكن تعديلها' },
        filters: [{ key: 'all', label: 'الكل' }, ...actions.map((a) => ({ key: a, label: actionLabel(a) }))],
        empty: 'لا توجد أحداث مطابقة.',
        items: rows.map((r, i) => ({
          id: text(r.id) || String(i),
          title: `${actionLabel(r.action)} ${typeLabel(r.auditable_type)}${text(r.record_label) && !isLatin(text(r.record_label)) ? ` ${text(r.record_label)}` : text(r.record_label) ? ` ${text(r.record_label)}` : ''}`,
          subtitle: [text(r.created_by_name) || 'النظام', when(r.created_at)].filter(Boolean).join(' • '),
          detail: text(r.reason) && !isLatin(text(r.reason)) ? text(r.reason) : undefined,
          badge: text(r.action) === 'deleted' ? { text: 'حذف', tone: 'bad' as Tone } : undefined,
          filter: text(r.action),
        })),
      };
    },
  },
  restore: {
    title: 'مركز الاسترجاع',
    endpoint: '/restore-center',
    build: (body) => {
      const rows = asArray(body.data);
      return {
        hero: { label: 'عناصر محذوفة يمكن استرجاعها', value: String(rows.length), sub: 'اختر العنصر ثم اضغط استرجاع' },
        empty: 'لا توجد عناصر محذوفة.',
        items: rows.map((r, i) => {
          const type = text(r.type);
          const name = text(r.name) || text((r.party as Obj | undefined)?.name) || text((r.product as Obj | undefined)?.name) || text((r.warehouse as Obj | undefined)?.name) || `#${text(r.id)}`;
          return {
            id: `${type}-${text(r.id)}-${i}`,
            title: name,
            subtitle: [ENTITY[type] ?? 'عنصر', text(r.deleted_at) ? `حُذف ${when(r.deleted_at)}` : ''].filter(Boolean).join(' • '),
            restore: { type, id: text(r.id) },
          };
        }),
      };
    },
  },
  bulk: {
    title: 'العمليات الجماعية',
    endpoint: '/bulk-action-history',
    build: (body) => {
      const rows = asArray(body.data);
      return {
        hero: { label: 'عمليات جماعية مسجّلة', value: String(rows.length), sub: 'تعديلات واستيرادات طالت عدة سجلات دفعة واحدة' },
        empty: 'لا توجد عمليات جماعية بعد.',
        items: rows.map((r, i) => {
          const count = Array.isArray(r.record_ids) ? (r.record_ids as unknown[]).length : undefined;
          const by = text(r.user_name) || text(r.created_by_name) || text((r.user as Obj | undefined)?.name);
          return {
            id: text(r.id) || String(i),
            title: `${actionLabel(r.action)} ${ENTITY[text(r.entity_type)] ?? typeLabel(r.entity_type)}${count ? ` (${count} سجل)` : ''}`,
            subtitle: [by, when(r.created_at)].filter(Boolean).join(' • '),
          };
        }),
      };
    },
  },
  checks: {
    title: 'فحوصات النظام',
    endpoint: '/system-checks',
    build: (body) => {
      const root = ((body.data as Obj | undefined) ?? body) as Obj;
      const checks = asArray(root.checks);
      const summary = (root.summary ?? {}) as Obj;
      const failed = checks.filter((c) => c.passed === false);
      const passed = Number(summary.passed ?? checks.length - failed.length);
      return {
        hero: failed.length === 0
          ? { label: 'حالة النظام', value: 'سليم', sub: `نجحت كل الفحوصات (${passed})`, tone: 'ok' }
          : { label: 'حالة النظام', value: 'يحتاج انتباه', sub: `${failed.length} فحص فشل من ${checks.length}`, tone: 'bad' },
        empty: 'كل الفحوصات ناجحة. لا توجد مشاكل.',
        items: failed.map((c, i) => {
          const label = text(c.label);
          const arabic = label.startsWith('Table ') ? `جدول بيانات ناقص: ${label.slice(6)}` : label.startsWith('Route ') ? `مسار غير مسجّل: ${label.slice(6)}` : label.startsWith('API ') ? `خدمة غير متاحة: ${label.slice(4)}` : label.includes('storage') ? 'مجلد التخزين غير قابل للكتابة' : 'فحص فاشل';
          return { id: text(c.key) || String(i), title: arabic, subtitle: 'أخبر مدير النظام أو الدعم الفني بهذه المشكلة', badge: { text: 'فشل', tone: 'bad' as Tone } };
        }),
      };
    },
  },
  security: {
    title: 'مركز الأمان',
    endpoint: '/security/overview',
    build: (body) => {
      const root = ((body.data as Obj | undefined) ?? body) as Obj;
      const members = asArray(root.members);
      const events = asArray(root.events);
      const mustChange = members.filter((m) => m.must_change_password).length;
      const ROLE: Record<string, string> = { owner: 'المالك', admin: 'مسؤول', manager: 'مدير', accountant: 'محاسب', employee: 'موظف' };
      return {
        hero: { label: 'أعضاء المؤسسة', value: String(members.length), sub: mustChange ? `${mustChange} عضو مطلوب منه تغيير كلمة المرور` : 'لا توجد كلمات مرور مؤقتة معلّقة', tone: mustChange ? 'warn' : 'ok' },
        filters: [{ key: 'all', label: 'الكل' }, { key: 'members', label: 'الأعضاء' }, { key: 'events', label: 'أحداث الأمان' }],
        empty: 'لا توجد بيانات.',
        items: [
          ...members.map((m, i) => ({
            id: `m-${text(m.id) || i}`,
            title: text(m.name) || text(m.email),
            subtitle: [text(m.email), ROLE[text(m.role)] ?? text(m.role)].filter(Boolean).join(' • '),
            badge: m.must_change_password ? { text: 'كلمة مرور مؤقتة', tone: 'warn' as Tone } : m.verified === false ? { text: 'غير مفعّل', tone: 'bad' as Tone } : { text: 'نشط', tone: 'ok' as Tone },
            filter: 'members',
          })),
          ...events.map((e, i) => ({
            id: `e-${text(e.id) || i}`,
            title: `${actionLabel(e.event)}${text(e.name) ? `: ${text(e.name)}` : ''}`,
            subtitle: [when(e.created_at), text(e.ip_address)].filter(Boolean).join(' • '),
            filter: 'events',
          })),
        ],
      };
    },
  },
  quality: {
    title: 'جودة البيانات',
    endpoint: '/control/data-quality',
    build: (body) => {
      const root = ((body.data as Obj | undefined) ?? body) as Obj;
      const rows = Array.isArray(root) ? (root as unknown as Obj[]) : asArray(root.items ?? root.issues ?? root.data);
      return {
        hero: rows.length === 0 ? { label: 'جودة البيانات', value: 'ممتازة', sub: 'لا توجد مشاكل تحتاج مراجعة', tone: 'ok' } : { label: 'مشاكل تحتاج مراجعة', value: String(rows.length), sub: 'اضغط على أي بند لفتح السجل وتصحيحه', tone: 'warn' },
        empty: 'بياناتك سليمة.',
        items: rows.map((r, i) => {
          const type = text(r.entity_type);
          const id = text(r.entity_id);
          const issue = text(r.issue);
          return {
            id: text(r.id) || String(i),
            title: ISSUE[issue] ?? (isLatin(issue) ? 'ملاحظة على البيانات' : issue || 'ملاحظة على البيانات'),
            subtitle: [ENTITY[type] ?? '', isLatin(text(r.entity)) ? '' : text(r.entity)].filter(Boolean).join(': '),
            badge: { text: text(r.severity) === 'high' || text(r.severity) === 'critical' ? 'مهم' : 'للمراجعة', tone: (text(r.severity) === 'high' || text(r.severity) === 'critical' ? 'bad' : 'warn') as Tone },
            open: route(type, id),
          };
        }),
      };
    },
  },
};

const TONE = { ok: [Tint.successBg, StatusText.success], warn: [Tint.warningBg, StatusText.warning], bad: [Tint.dangerBg, StatusText.danger], info: [Tint.infoBg, Colors.accentStrong] };

export default function AdminPage() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const toast = useToast();
  const { page } = useLocalSearchParams<{ page: string }>();
  const config = PAGES[page];
  const [view, setView] = useState<View_ | null>(null);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!config) return;
    try {
      setFailed(null);
      const res = await api.get(config.endpoint);
      setView(config.build((res.data ?? {}) as Obj));
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setFailed(status === 403 ? 'ليست لديك صلاحية لعرض هذه الصفحة.' : 'تعذّر التحميل. تحقق من الاتصال.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [config]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => (view?.items ?? []).filter((i) => filter === 'all' || !i.filter || i.filter === filter), [view, filter]);

  async function restore(item: Item) {
    if (!item.restore) return;
    setBusy(item.id);
    try {
      await api.post(`/restore-center/${item.restore.type}/${item.restore.id}`, {});
      toast('تم الاسترجاع');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر الاسترجاع'));
    } finally {
      setBusy(null);
    }
  }

  if (!config) return <EmptyState icon="alertCircle" title="الصفحة غير موجودة" />;

  const heroTone = view?.hero.tone ? TONE[view.hero.tone][1] : Colors.accentStrong;

  const header = view ? (
    <View style={{ gap: 16 }}>
      <Gradient colors={[view.hero.tone === 'bad' ? StatusText.danger : view.hero.tone === 'warn' ? StatusText.warning : Colors.accent, Colors.accentStrong]} style={styles.hero}>
        <View style={styles.glow} />
        <Text style={styles.heroLabel}>{view.hero.label}</Text>
        <Text style={styles.heroValue}>{view.hero.value}</Text>
        {view.hero.sub ? <Text style={styles.heroSub}>{view.hero.sub}</Text> : null}
      </Gradient>
      {view.filters && view.filters.length > 1 ? (
        <FlatList
          horizontal
          data={view.filters}
          keyExtractor={(f) => f.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: filter === item.key }} onPress={() => setFilter(item.key)} style={[styles.pill, filter === item.key && styles.pillOn]}>
              <Text style={[styles.pillText, filter === item.key && { color: Colors.accent }]}>{item.label}</Text>
            </Pressable>
          )}
        />
      ) : null}
    </View>
  ) : null;

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: true, title: t(config.title), headerTitleAlign: 'center', headerShadowVisible: false }} />
      {loading ? (
        <SkeletonList rows={5} />
      ) : failed ? (
        <EmptyState icon="lock" title={config.title} message={failed} actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(i) => i.id}
          ListHeaderComponent={header ?? undefined}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + bottomInset }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
          ListEmptyComponent={<EmptyState icon="checkSquare" title={view?.empty ?? 'لا توجد بيانات'} compact />}
          renderItem={({ item }) => {
            const tone = item.badge ? TONE[item.badge.tone] : null;
            return (
              <Pressable accessibilityRole={item.open ? 'button' : undefined} disabled={!item.open} onPress={() => item.open && router.push(item.open as never)} style={({ pressed }) => [styles.card, pressed && { backgroundColor: Colors.bgSoft }]}>
                <View style={styles.top}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.name} numberOfLines={3}>{item.title}</Text>
                    {item.subtitle ? <Text style={styles.small}>{item.subtitle}</Text> : null}
                    {item.detail ? <Text style={styles.small}>{item.detail}</Text> : null}
                  </View>
                  {item.badge && tone ? <View style={[styles.badge, { backgroundColor: tone[0] }]}><Text style={[styles.badgeText, { color: tone[1] }]}>{item.badge.text}</Text></View> : null}
                </View>
                {item.restore ? (
                  <Pressable accessibilityRole="button" disabled={busy === item.id} onPress={() => restore(item)} style={[styles.action, { opacity: busy === item.id ? 0.5 : 1 }]}>
                    <Text style={styles.actionText}>استرجاع</Text>
                  </Pressable>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
      {heroTone ? null : null}
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
  pill: { minHeight: Layout.minTouch, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line },
  pillOn: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  pillText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 12, ...Shadow.soft },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  small: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto', lineHeight: 18 },
  badge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  action: { minHeight: Layout.minTouch, borderRadius: Radius.sm, backgroundColor: Tint.successBg, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14, fontWeight: '800', color: StatusText.success },
});
