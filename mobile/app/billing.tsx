import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { EmptyState } from '../components/ui/EmptyState';
import { Gradient } from '../components/ui/Gradient';
import { SkeletonList } from '../components/ui/Skeleton';
import { Text } from '../components/ui/Text';
import { Colors, Radius, Shadow, StatusText, Tint } from '../constants/theme';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { useBottomInset } from '../lib/insets';
import { useStyles } from '../lib/theme';

type Obj = Record<string, unknown>;
const text = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
const num = (v: unknown) => Number(v ?? 0);
const money = (minor: unknown, currency: unknown) => `${(num(minor) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${text(currency).toUpperCase() || ''}`.trim();

const STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'info' }> = {
  active: { label: 'فعّال', tone: 'ok' }, trialing: { label: 'فترة تجريبية', tone: 'info' }, past_due: { label: 'متأخر السداد', tone: 'bad' },
  canceled: { label: 'ملغى', tone: 'bad' }, cancelled: { label: 'ملغى', tone: 'bad' }, paused: { label: 'متوقف', tone: 'warn' },
  paid: { label: 'مدفوعة', tone: 'ok' }, open: { label: 'مستحقة', tone: 'warn' }, unpaid: { label: 'غير مدفوعة', tone: 'bad' }, draft: { label: 'مسودة', tone: 'info' },
  void: { label: 'ملغاة', tone: 'bad' }, uncollectible: { label: 'غير قابلة للتحصيل', tone: 'bad' },
};
const TONE = { ok: [Tint.successBg, StatusText.success], warn: [Tint.warningBg, StatusText.warning], bad: [Tint.dangerBg, StatusText.danger], info: [Tint.infoBg, Colors.accentStrong] };

function Meter({ label, used, limit, unit, styles }: { label: string; used: number; limit: number; unit: string; styles: ReturnType<typeof createStyles> }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const hot = pct >= 90;
  return (
    <View style={styles.meter}>
      <View style={styles.meterTop}>
        <Text style={styles.name}>{label}</Text>
        <Text style={styles.small}>{used.toLocaleString('en-US')} / {limit > 0 ? limit.toLocaleString('en-US') : '∞'} {unit}</Text>
      </View>
      <View style={styles.track}><View style={[styles.fill, { width: `${pct}%`, backgroundColor: hot ? StatusText.danger : Colors.accent }]} /></View>
    </View>
  );
}

export default function BillingScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const [data, setData] = useState<Obj | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setFailed(null);
      const res = await api.get('/billing/overview');
      setData((res.data?.data ?? res.data) as Obj);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setFailed(status === 403 ? 'عرض الاشتراك متاح لمن يملك صلاحية إعدادات المؤسسة.' : 'تعذّر تحميل بيانات الاشتراك.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sub = (data?.subscription ?? {}) as Obj;
  const plan = (sub.plan ?? {}) as Obj;
  const usage = (data?.usage ?? {}) as Obj;
  const invoices = (Array.isArray(data?.invoices) ? data?.invoices : []) as Obj[];
  const status = STATUS[text(sub.status)] ?? { label: text(sub.status) || 'غير محدد', tone: 'info' as const };
  const planName = text(plan.name_ar) || text(sub.plan_name_ar) || text(sub.plan_key) || text(plan.name_en) || 'الخطة الحالية';
  const seats = (usage.seats ?? {}) as Obj;
  const storage = (usage.storage ?? {}) as Obj;
  const ai = (usage.ai_credits ?? usage.ai_tokens ?? {}) as Obj;
  const renews = text(sub.renews_at) || text(sub.trial_ends_at);

  const header = data ? (
    <View style={{ gap: 16 }}>
      <Gradient colors={[Colors.accent, Colors.accentStrong]} style={styles.hero}>
        <View style={styles.glow} />
        <Text style={styles.heroLabel}>خطتك الحالية</Text>
        <Text style={styles.heroValue}>{planName}</Text>
        <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}><Text style={[styles.badgeText, { color: '#fff' }]}>{status.label}</Text></View>
        {renews ? <Text style={styles.heroSub}>{text(sub.trial_ends_at) && !text(sub.renews_at) ? 'تنتهي التجربة' : 'التجديد'}: {renews.slice(0, 10)}</Text> : null}
        {sub.cancel_at_period_end ? <Text style={styles.heroSub}>سيتوقف الاشتراك في نهاية الفترة الحالية.</Text> : null}
      </Gradient>

      {(num(seats.limit) > 0 || num(storage.limit_bytes) > 0 || num(ai.limit) > 0) ? (
        <View style={styles.card}>
          <Text style={styles.section}>الاستخدام</Text>
          {num(seats.limit) > 0 ? <Meter label="المستخدمون" used={num(seats.used)} limit={num(seats.limit)} unit="" styles={styles} /> : null}
          {num(storage.limit_bytes) > 0 ? <Meter label="التخزين" used={Math.round(num(storage.used_bytes) / 1048576)} limit={Math.round(num(storage.limit_bytes) / 1048576)} unit="MB" styles={styles} /> : null}
          {num(ai.limit) > 0 ? <Meter label="رصيد الذكاء الاصطناعي" used={num(ai.used)} limit={num(ai.limit)} unit="" styles={styles} /> : null}
        </View>
      ) : null}

      <Text style={styles.note}>لتغيير الخطة أو الدفع أو شراء إضافات، افتح صفحة الاشتراك من الموقع. الدفع بالبطاقة يتم هناك بأمان.</Text>
      <Text style={styles.section}>الفواتير</Text>
    </View>
  ) : null;

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: true, title: t('الاشتراك والفوترة'), headerTitleAlign: 'center', headerShadowVisible: false }} />
      {loading ? (
        <SkeletonList rows={4} />
      ) : failed ? (
        <EmptyState icon="card" title="الاشتراك والفوترة" message={failed} actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={invoices}
          keyExtractor={(i, idx) => text(i.id) || String(idx)}
          ListHeaderComponent={header ?? undefined}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + bottomInset }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
          ListEmptyComponent={<EmptyState icon="file" title="لا توجد فواتير بعد" compact />}
          renderItem={({ item }) => {
            const st = STATUS[text(item.status)] ?? { label: text(item.status), tone: 'info' as const };
            const tone = TONE[st.tone];
            return (
              <View style={styles.card}>
                <View style={styles.meterTop}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.name}>{text(item.number) || 'فاتورة اشتراك'}</Text>
                    <Text style={styles.small}>{text(item.issued_at).slice(0, 10)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={styles.name}>{money(item.amount_due_minor ?? item.amount_minor, item.currency)}</Text>
                    <View style={[styles.badge, { backgroundColor: tone[0] }]}><Text style={[styles.badgeText, { color: tone[1] }]}>{st.label}</Text></View>
                  </View>
                </View>
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
  heroValue: { fontSize: 28, fontWeight: '800', color: '#fff', textAlign: 'auto' },
  heroSub: { fontSize: 14, color: '#fff', opacity: 0.9, textAlign: 'auto' },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 12, ...Shadow.soft },
  section: { fontSize: 14, fontWeight: '800', color: Colors.textSoft, textAlign: 'auto' },
  note: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto', lineHeight: 20 },
  name: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  small: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  badge: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  meter: { gap: 8 },
  meterTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  track: { height: 8, borderRadius: 4, backgroundColor: Colors.bgSoft, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
