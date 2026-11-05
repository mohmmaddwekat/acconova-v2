import { Stack, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { EmptyState } from '../components/ui/EmptyState';
import { Gradient } from '../components/ui/Gradient';
import { Icon } from '../components/ui/Icon';
import { SkeletonList } from '../components/ui/Skeleton';
import { Text } from '../components/ui/Text';
import { TextInput } from '../components/ui/TextInput';
import { Colors, Layout, Radius, Shadow, StatusText, Tint } from '../constants/theme';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { useBottomInset } from '../lib/insets';
import { t } from '../lib/i18n';
import { isOverdue, listOf, priorityColor, priorityLabel, statusLabel, statusTone, TASK_STATUSES, TaskItem } from '../lib/tasks';
import { useStyles } from '../lib/theme';

type Filter = 'all' | 'mine' | 'overdue' | 'idea' | 'in_progress' | 'review' | 'completed';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'mine', label: 'مهامي' },
  { key: 'overdue', label: 'متأخرة' },
  ...TASK_STATUSES.map((s) => ({ key: s.key as Filter, label: s.label })),
];

interface Named { id: number; name?: string }

export default function TasksScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [projects, setProjects] = useState<Record<number, string>>({});
  const [members, setMembers] = useState<Record<number, string>>({});
  const { user } = useAuth();
  const [myStaffId, setMyStaffId] = useState<number | null>(null);
  const [projectFilter, setProjectFilter] = useState<number | null>(null);
  const [canCreate, setCanCreate] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setFailed(null);
      const res = await api.get('/task-management');
      const root = (res.data?.data ?? res.data) as Record<string, unknown>;
      setTasks(listOf<TaskItem>(root, 'tasks'));
      const toMap = (rows: Named[]) => Object.fromEntries(rows.map((r) => [r.id, r.name ?? `#${r.id}`]));
      setProjects(toMap(listOf<Named>(root, 'projects')));
      setMembers(toMap(listOf<Named>(root, 'members')));
      const me = listOf<{ id: number; user_id?: number | null }>(root, 'members').find((m) => m.user_id === user?.id);
      setMyStaffId(me?.id ?? null);
      const caps = root.capabilities as { can_create?: boolean } | undefined;
      setCanCreate(caps?.can_create !== false);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setFailed(status === 403 ? 'ليست لديك صلاحية لعرض المهام.' : 'تعذّر تحميل المهام. تحقق من الاتصال ثم حاول مرة أخرى.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(
    () => ({
      open: tasks.filter((x) => x.status !== 'completed').length,
      overdue: tasks.filter(isOverdue).length,
      done: tasks.filter((x) => x.status === 'completed').length,
    }),
    [tasks],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks
      .filter((x) => (filter === 'all' ? true : filter === 'mine' ? myStaffId != null && (x.assignees ?? []).includes(myStaffId) : filter === 'overdue' ? isOverdue(x) : x.status === filter))
      .filter((x) => projectFilter == null || x.project_id === projectFilter)
      .filter((x) => !q || x.title.toLowerCase().includes(q))
      .sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999'));
  }, [tasks, filter, query, myStaffId, projectFilter]);

  const header = (
    <View style={styles.headerWrap}>
      <Gradient colors={[Colors.accent, Colors.accentStrong]} style={styles.hero}>
        <View style={styles.glow} />
        <Text style={styles.heroLabel}>المهام المفتوحة</Text>
        <Text style={styles.heroValue}>{counts.open}</Text>
        <View style={styles.heroSplit}>
          <View style={styles.heroCell}>
            <Text style={styles.heroCellValue}>{counts.overdue}</Text>
            <Text style={styles.heroCellLabel}>متأخرة</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroCell}>
            <Text style={styles.heroCellValue}>{counts.done}</Text>
            <Text style={styles.heroCellLabel}>مكتملة</Text>
          </View>
        </View>
      </Gradient>

      <View style={styles.linkRow}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/task-projects' as never)} style={styles.link}>
          <Icon name="file" size={18} color={Colors.accentStrong} />
          <Text style={styles.linkText}>المشاريع ({Object.keys(projects).length})</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/departments' as never)} style={styles.link}>
          <Icon name="users" size={18} color={Colors.accentStrong} />
          <Text style={styles.linkText}>الأقسام والفريق</Text>
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Icon name="search" size={18} color={Colors.textMuted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="بحث في المهام…" placeholderTextColor={Colors.textFaint} style={styles.search} accessibilityLabel="بحث في المهام" />
      </View>

      {Object.keys(projects).length > 0 ? (
        <FlatList
          horizontal
          data={Object.entries(projects)}
          keyExtractor={([id]) => id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pills}
          renderItem={({ item: [id, name] }) => (
            <Pressable accessibilityRole="button" accessibilityState={{ selected: projectFilter === Number(id) }} onPress={() => setProjectFilter(projectFilter === Number(id) ? null : Number(id))} style={[styles.pill, projectFilter === Number(id) && styles.pillOn]}>
              <Text style={[styles.pillText, projectFilter === Number(id) && { color: Colors.accent }]}>{name}</Text>
            </Pressable>
          )}
        />
      ) : null}

      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(f) => f.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pills}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === item.key }}
            onPress={() => setFilter(item.key)}
            style={[styles.pill, filter === item.key && styles.pillOn]}
          >
            <Text style={[styles.pillText, filter === item.key && { color: Colors.accent }]}>{item.label}</Text>
          </Pressable>
        )}
      />
    </View>
  );

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: true, title: t('إدارة المهام'), headerTitleAlign: 'center', headerShadowVisible: false }} />
      {loading ? (
        <SkeletonList rows={6} />
      ) : failed ? (
        <EmptyState icon="wifiOff" title="المهام" message={failed} actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(x) => String(x.id)}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
          ListEmptyComponent={<EmptyState icon="checkSquare" title="لا توجد مهام هنا" message="غيّر الفلتر أو أضف مهمة جديدة." compact />}
          renderItem={({ item }) => {
            const tone = statusTone(item.status);
            const overdue = isOverdue(item);
            const done = item.checklist?.filter((c) => c.done).length ?? 0;
            const total = item.checklist?.length ?? 0;
            const owners = (item.assignees ?? []).map((id) => members[id]).filter(Boolean);
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/task/${item.id}` as never)}
                style={({ pressed }) => [styles.card, pressed && { backgroundColor: Colors.bgSoft }]}
              >
                <View style={styles.cardTop}>
                  <View style={[styles.dot, { backgroundColor: priorityColor(item.priority) }]} />
                  <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
                </View>
                <Text style={styles.meta} numberOfLines={1}>
                  {[item.project_id ? projects[item.project_id] : null, owners.length ? owners.join('، ') : null].filter(Boolean).join(' • ') || ' '}
                </Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, item.progress ?? 0))}%` }]} />
                </View>
                <View style={styles.cardBottom}>
                  <View style={[styles.badge, { backgroundColor: overdue ? Tint.dangerBg : tone.bg }]}>
                    <Text style={[styles.badgeText, { color: overdue ? StatusText.danger : tone.fg }]}>
                      {overdue ? 'متأخرة' : statusLabel(item.status)}
                    </Text>
                  </View>
                  <Text style={styles.small}>{priorityLabel(item.priority)}</Text>
                  {item.due_on ? <Text style={styles.small}>{item.due_on.slice(0, 10)}</Text> : null}
                  {total > 0 ? <Text style={styles.small}>✓ {done}/{total}</Text> : null}
                  {(item.comments_count ?? 0) > 0 ? <Text style={styles.small}>💬 {item.comments_count}</Text> : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}
      {canCreate && !loading && !failed ? (
        <View style={[styles.createWrap, { paddingBottom: 16 + bottomInset }]}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/new-task' as never)} style={styles.create}>
            <Icon name="plus" size={20} color="#fff" strokeWidth={2.4} />
            <Text style={styles.createText}>مهمة جديدة</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  headerWrap: { gap: 16, marginBottom: 4 },
  hero: { borderRadius: Radius.lg, padding: 24, gap: 8, shadowColor: Colors.accentStrong, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 24, elevation: 6 },
  glow: { position: 'absolute', top: -48, right: -48, width: 160, height: 160, borderRadius: 80, backgroundColor: '#fff', opacity: 0.12 },
  heroLabel: { fontSize: 14, fontWeight: '600', color: '#fff', opacity: 0.85, textAlign: 'auto' },
  heroValue: { fontSize: 40, fontWeight: '800', color: '#fff', textAlign: 'auto' },
  heroSplit: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)' },
  heroCell: { flex: 1, gap: 4 },
  heroCellValue: { fontSize: 20, fontWeight: '800', color: '#fff', textAlign: 'auto' },
  heroCellLabel: { fontSize: 12, fontWeight: '600', color: '#fff', opacity: 0.8, textAlign: 'auto' },
  heroDivider: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 16 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, minHeight: 48, borderRadius: Radius.sm, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.line },
  search: { flex: 1, fontSize: 16, color: Colors.text, textAlign: 'auto', minHeight: 44 },
  pills: { gap: 8 },
  linkRow: { flexDirection: 'row', gap: 12 },
  link: { flex: 1, minHeight: Layout.minTouch, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.sm, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line },
  linkText: { fontSize: 14, fontWeight: '800', color: Colors.accentStrong },
  pill: { minHeight: Layout.minTouch, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line },
  pillOn: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  pillText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 8, ...Shadow.soft },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { flex: 1, fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  meta: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  track: { height: 6, borderRadius: 3, backgroundColor: Colors.bgSoft, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: Colors.accent },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  badge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  small: { fontSize: 12, color: Colors.textMuted },
  createWrap: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: Colors.bg, borderTopWidth: 1, borderTopColor: Colors.line },
  create: { minHeight: 52, borderRadius: Radius.sm, backgroundColor: Colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  createText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
