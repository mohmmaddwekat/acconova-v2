import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Icon } from '../../components/ui/Icon';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { SkeletonList } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { Colors, Layout, Radius, Shadow, StatusText, Tint } from '../../constants/theme';
import { api } from '../../lib/api';
import { apiErrorMessage } from '../../lib/format';
import { useStyles } from '../../lib/theme';
import { Text } from '../../components/ui/Text';

interface Approval {
  id: number;
  category: string;
  reason: string | null;
  status: string;
  required_approvals: number;
  approved_count: number;
  remaining_approvals: number;
  requested_by_name: string | null;
  reviewed_by_name: string | null;
  created_at: string;
  snapshot: Record<string, unknown> | null;
}

type Decision = 'approved' | 'rejected';
type Tab = 'pending' | 'approved' | 'rejected';

const TABS: { key: Tab; label: string }[] = [
  { key: 'pending', label: 'قيد المراجعة' },
  { key: 'approved', label: 'مقبولة' },
  { key: 'rejected', label: 'مرفوضة' },
];

function snapshotRows(snapshot: Approval['snapshot']): [string, string][] {
  if (!snapshot) return [];
  return Object.entries(snapshot)
    .filter(([, v]) => ['string', 'number'].includes(typeof v) && String(v) !== '')
    .slice(0, 5)
    .map(([k, v]) => [k.replace(/_/g, ' '), String(v)]);
}

export default function ApprovalsScreen() {
  const styles = useStyles(createStyles);
  const toast = useToast();
  const [items, setItems] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<'none' | 'forbidden' | 'failed'>('none');
  const [tab, setTab] = useState<Tab>('pending');
  const [pending, setPending] = useState<{ item: Approval; decision: Decision } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('none');
      const { data } = await api.get('/approval-requests', { params: { status: tab } });
      setItems(Array.isArray(data?.data) ? data.data : []);
    } catch (err: any) {
      setError(err?.response?.status === 403 ? 'forbidden' : 'failed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  async function submit() {
    if (!pending) return;
    setSaving(true);
    try {
      await api.patch(`/approval-requests/${pending.item.id}`, { decision: pending.decision });
      toast(pending.decision === 'approved' ? 'تمت الموافقة' : 'تم الرفض');
      setPending(null);
      await load();
    } catch (err: any) {
      toast(apiErrorMessage(err, 'تعذّر تنفيذ الإجراء'));
      setPending(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader title="الموافقات" showBack={false} />

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
            {tab === t.key && t.key === 'pending' && items.length > 0 && (
              <View style={styles.countBadge}><Text style={styles.countText}>{items.length}</Text></View>
            )}
          </Pressable>
        ))}
      </View>

      {tab === 'pending' && items.length > 0 && !loading && error === 'none' && (
        <View style={styles.strip}>
          <Icon name="alertCircle" size={18} color={StatusText.warning} />
          <Text style={styles.stripText}>{items.length} طلبات بانتظار موافقتك</Text>
        </View>
      )}

      {loading ? (
        <SkeletonList rows={3} />
      ) : error === 'forbidden' ? (
        <EmptyState icon="checkSquare" title="لا تملك صلاحية مراجعة الموافقات" message="اطلب من مدير المؤسسة منحك صلاحية مراجعة الموافقات." />
      ) : error === 'failed' ? (
        <EmptyState icon="wifiOff" title="تعذّر تحميل الموافقات" message="تحقق من الاتصال ثم حاول مرة أخرى." actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
        >
          {items.length === 0 ? (
            <EmptyState icon="checkSquare" title={tab === 'pending' ? 'لا توجد موافقات معلّقة' : 'لا توجد طلبات في هذا التصنيف'} message={tab === 'pending' ? 'كل الطلبات تمت مراجعتها.' : undefined} />
          ) : (
            items.map((item) => (
              <View key={item.id} style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.category}>{item.category.replace(/_/g, ' ')}</Text>
                  <View style={styles.progress}>
                    <Text style={styles.progressText}>{item.approved_count}/{item.required_approvals}</Text>
                  </View>
                </View>
                {item.reason ? <Text style={styles.reason}>{item.reason}</Text> : null}
                {snapshotRows(item.snapshot).map(([k, v]) => (
                  <View key={k} style={styles.row}>
                    <Text style={styles.metaLabel}>{k}</Text>
                    <Text style={styles.metaValue}>{v}</Text>
                  </View>
                ))}
                <Text style={styles.meta}>
                  {item.requested_by_name ? `طلب بواسطة: ${item.requested_by_name} · ` : ''}
                  {item.created_at?.slice(0, 10)}
                </Text>
                {tab === 'pending' ? (
                  <View style={styles.actions}>
                    <Button label="موافقة" onPress={() => setPending({ item, decision: 'approved' })} style={{ flex: 1 }} />
                    <Button label="رفض" variant="ghost" onPress={() => setPending({ item, decision: 'rejected' })} style={{ flex: 1 }} />
                  </View>
                ) : (
                  <Text style={[styles.meta, { color: tab === 'approved' ? StatusText.success : StatusText.danger, fontWeight: '700' }]}>
                    {tab === 'approved' ? 'تمت الموافقة' : 'تم الرفض'}{item.reviewed_by_name ? ` بواسطة ${item.reviewed_by_name}` : ''}
                  </Text>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}

      <ConfirmDialog
        visible={!!pending}
        title={pending?.decision === 'approved' ? 'تأكيد الموافقة' : 'تأكيد الرفض'}
        description="لا يمكن التراجع عن القرار بعد تسجيله."
        rows={pending ? [{ label: 'الطلب', value: `#${pending.item.id}` }, { label: 'النوع', value: pending.item.category.replace(/_/g, ' ') }] : []}
        confirmLabel={pending?.decision === 'approved' ? 'موافقة' : 'رفض'}
        loading={saving}
        onConfirm={submit}
        onCancel={() => setPending(null)}
      />
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
  strip: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Tint.warningBg },
  stripText: { fontSize: 13, fontWeight: '700', color: StatusText.warning },
  scroll: { padding: 14, gap: 12, flexGrow: 1 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 14, gap: 8, ...Shadow.soft },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  category: { fontSize: 16, fontWeight: '800', color: Colors.text, flex: 1, textAlign: 'auto' },
  progress: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, backgroundColor: Tint.warningBg },
  progressText: { fontSize: 12, fontWeight: '800', color: StatusText.warning },
  reason: { fontSize: 14, color: Colors.textSoft, lineHeight: 22, textAlign: 'auto' },
  metaLabel: { fontSize: 13, color: Colors.textMuted },
  metaValue: { fontSize: 13, fontWeight: '700', color: Colors.text, flexShrink: 1 },
  meta: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
});
