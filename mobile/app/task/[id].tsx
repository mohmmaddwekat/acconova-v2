import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { SkeletonList } from '../../components/ui/Skeleton';
import { Text } from '../../components/ui/Text';
import { TextInput } from '../../components/ui/TextInput';
import { useToast } from '../../components/ui/Toast';
import { Colors, Layout, Radius, Shadow, StatusText, Tint } from '../../constants/theme';
import { api } from '../../lib/api';
import { apiErrorMessage } from '../../lib/format';
import { useBottomInset } from '../../lib/insets';
import { t } from '../../lib/i18n';
import { isOverdue, listOf, priorityLabel, TASK_PRIORITIES, TASK_STATUSES, TaskItem } from '../../lib/tasks';
import { useStyles } from '../../lib/theme';

interface Comment { id: number; name?: string; body: string; created_at?: string }
interface Attachment { id: number; name: string; size?: number }
interface Detail { task: TaskItem; comments?: Comment[]; attachments?: Attachment[] }

const PROGRESS = [0, 25, 50, 75, 100];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fileSize(size?: number): string {
  if (!size) return '';
  return size > 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}

export default function TaskDetailScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState('');
  const [newItem, setNewItem] = useState('');
  const [due, setDue] = useState('');
  const [members, setMembers] = useState<{ id: number; name: string }[]>([]);
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);

  const load = useCallback(async () => {
    try {
      setFailed(false);
      const res = await api.get(`/task-management/tasks/${id}`);
      const body = (res.data?.data ?? res.data) as Detail;
      setDetail(body);
      setDue(body.task?.due_on?.slice(0, 10) ?? '');
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api
      .get('/task-management')
      .then((res) => {
        const rootData = res.data?.data ?? res.data;
        setMembers(listOf<{ id: number; name?: string }>(rootData, 'members').map((m) => ({ id: m.id, name: m.name ?? `#${m.id}` })));
        setProjects(listOf<{ id: number; name?: string }>(rootData, 'projects').map((p) => ({ id: p.id, name: p.name ?? `#${p.id}` })));
      })
      .catch(() => {});
  }, []);

  async function patch(body: Record<string, unknown>, message = 'تم الحفظ') {
    setSaving(true);
    try {
      await api.patch(`/task-management/tasks/${id}`, body);
      toast(message);
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر حفظ التعديل'));
    } finally {
      setSaving(false);
    }
  }

  async function addComment() {
    const body = comment.trim();
    if (!body) return;
    setSaving(true);
    try {
      await api.post(`/task-management/tasks/${id}/comments`, { body });
      setComment('');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر إرسال التعليق'));
    } finally {
      setSaving(false);
    }
  }

  const task = detail?.task;
  const checklist = task?.checklist ?? [];

  function toggleItem(index: number) {
    patch({ checklist: checklist.map((c, i) => (i === index ? { ...c, done: !c.done } : c)) }, 'تم تحديث القائمة');
  }

  function addItem() {
    const title = newItem.trim();
    if (!title) return;
    setNewItem('');
    patch({ checklist: [...checklist, { title, done: false }] }, 'تمت إضافة البند');
  }

  const header = <Stack.Screen options={{ headerShown: true, title: t('تفاصيل المهمة'), headerTitleAlign: 'center', headerShadowVisible: false }} />;

  if (loading) return <View style={styles.flex}>{header}<SkeletonList rows={5} /></View>;

  if (failed || !task) {
    return (
      <View style={styles.flex}>
        {header}
        <EmptyState icon="wifiOff" title="تعذّر تحميل المهمة" message="قد لا تملك صلاحية عرضها." actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      </View>
    );
  }

  const overdue = isOverdue(task);
  const dueChanged = DATE_RE.test(due) && due !== (task.due_on ?? '').slice(0, 10);
  const currentPriority = priorityLabel(task.priority);
  const assigned = task.assignees ?? [];
  const toggleAssignee = (memberId: number) =>
    patch({ assignees: assigned.includes(memberId) ? assigned.filter((x) => x !== memberId) : [...assigned, memberId] }, 'تم تحديث المسؤولين');

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {header}
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: 24 + bottomInset }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
      >
        <View style={styles.card}>
          <Text style={styles.title}>{task.title}</Text>
          {overdue ? (
            <View style={[styles.badge, { backgroundColor: Tint.dangerBg }]}>
              <Text style={[styles.badgeText, { color: StatusText.danger }]}>متأخرة عن موعدها</Text>
            </View>
          ) : null}
          {task.description ? <Text style={styles.desc}>{task.description}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>الحالة</Text>
          <View style={styles.chips}>
            {TASK_STATUSES.map((s) => (
              <Pressable key={s.key} disabled={saving} accessibilityRole="button" accessibilityState={{ selected: task.status === s.key }} onPress={() => task.status !== s.key && patch({ status: s.key })} style={[styles.chip, task.status === s.key && styles.chipOn]}>
                <Text style={[styles.chipText, task.status === s.key && { color: Colors.accent }]}>{s.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.section}>نسبة الإنجاز: {task.progress ?? 0}%</Text>
          <View style={styles.chips}>
            {PROGRESS.map((p) => (
              <Pressable key={p} disabled={saving} accessibilityRole="button" accessibilityState={{ selected: (task.progress ?? 0) === p }} onPress={() => patch({ progress: p })} style={[styles.chip, (task.progress ?? 0) === p && styles.chipOn]}>
                <Text style={[styles.chipText, (task.progress ?? 0) === p && { color: Colors.accent }]}>{p}%</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.section}>الأولوية</Text>
          <View style={styles.chips}>
            {TASK_PRIORITIES.map((p) => (
              <Pressable key={p.key} disabled={saving} accessibilityRole="button" accessibilityState={{ selected: currentPriority === p.label }} onPress={() => currentPriority !== p.label && patch({ priority: p.key })} style={[styles.chip, currentPriority === p.label && styles.chipOn]}>
                <Text style={[styles.chipText, currentPriority === p.label && { color: Colors.accent }]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>

          {projects.length > 0 ? (
            <>
              <Text style={styles.section}>المشروع</Text>
              <View style={styles.chips}>
                {projects.map((p) => (
                  <Pressable key={p.id} disabled={saving} accessibilityRole="button" accessibilityState={{ selected: task.project_id === p.id }} onPress={() => task.project_id !== p.id && patch({ project_id: p.id }, 'تم نقل المهمة')} style={[styles.chip, task.project_id === p.id && styles.chipOn]}>
                    <Text style={[styles.chipText, task.project_id === p.id && { color: Colors.accent }]}>{p.name}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {members.length > 0 ? (
            <>
              <Text style={styles.section}>المسؤولون ({assigned.length})</Text>
              <View style={styles.chips}>
                {members.map((m) => (
                  <Pressable key={m.id} disabled={saving} accessibilityRole="button" accessibilityState={{ selected: assigned.includes(m.id) }} onPress={() => toggleAssignee(m.id)} style={[styles.chip, assigned.includes(m.id) && styles.chipOn]}>
                    <Text style={[styles.chipText, assigned.includes(m.id) && { color: Colors.accent }]}>{m.name}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <Text style={styles.section}>تاريخ الاستحقاق</Text>
          <View style={styles.inline}>
            <TextInput value={due} onChangeText={setDue} placeholder="2026-12-31" placeholderTextColor={Colors.textFaint} keyboardType="numbers-and-punctuation" style={[styles.input, { flex: 1 }]} accessibilityLabel="تاريخ الاستحقاق" />
            <Pressable accessibilityRole="button" disabled={saving || !dueChanged} onPress={() => patch({ due_on: due })} style={[styles.save, (saving || !dueChanged) && { opacity: 0.4 }]}>
              <Text style={styles.saveText}>حفظ</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>قائمة المتابعة ({checklist.filter((c) => c.done).length}/{checklist.length})</Text>
          {checklist.map((c, i) => (
            <Pressable key={`${c.title}-${i}`} disabled={saving} accessibilityRole="checkbox" accessibilityState={{ checked: c.done }} onPress={() => toggleItem(i)} style={styles.checkRow}>
              <View style={[styles.box, c.done && styles.boxOn]}>{c.done ? <Icon name="check" size={16} color="#fff" strokeWidth={3} /> : null}</View>
              <Text style={[styles.checkText, c.done && { textDecorationLine: 'line-through', color: Colors.textMuted }]}>{c.title}</Text>
            </Pressable>
          ))}
          <View style={styles.inline}>
            <TextInput value={newItem} onChangeText={setNewItem} placeholder="أضف بنداً جديداً" placeholderTextColor={Colors.textFaint} style={[styles.input, { flex: 1 }]} onSubmitEditing={addItem} accessibilityLabel="بند جديد" />
            <Pressable accessibilityRole="button" disabled={saving || !newItem.trim()} onPress={addItem} style={[styles.save, (saving || !newItem.trim()) && { opacity: 0.4 }]}>
              <Text style={styles.saveText}>إضافة</Text>
            </Pressable>
          </View>
        </View>

        {(detail?.attachments?.length ?? 0) > 0 ? (
          <View style={styles.card}>
            <Text style={styles.section}>المرفقات</Text>
            {detail?.attachments?.map((a) => (
              <View key={a.id} style={styles.checkRow}>
                <Icon name="file" size={18} color={Colors.textMuted} />
                <Text style={[styles.checkText, { flex: 1 }]} numberOfLines={1}>{a.name}</Text>
                <Text style={styles.small}>{fileSize(a.size)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.section}>التعليقات ({detail?.comments?.length ?? 0})</Text>
          {(detail?.comments ?? []).map((c) => (
            <View key={c.id} style={styles.comment}>
              <Text style={styles.commentName}>{c.name ?? '—'}</Text>
              <Text style={styles.commentBody}>{c.body}</Text>
              {c.created_at ? <Text style={styles.small}>{c.created_at.slice(0, 16).replace('T', ' ')}</Text> : null}
            </View>
          ))}
          <View style={styles.inline}>
            <TextInput value={comment} onChangeText={setComment} placeholder="اكتب تعليقاً…" placeholderTextColor={Colors.textFaint} style={[styles.input, { flex: 1 }]} accessibilityLabel="تعليق جديد" />
            <Pressable accessibilityRole="button" disabled={saving || !comment.trim()} onPress={addComment} style={[styles.save, (saving || !comment.trim()) && { opacity: 0.4 }]}>
              <Text style={styles.saveText}>إرسال</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  body: { padding: 16, gap: 16 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 12, ...Shadow.soft },
  title: { fontSize: 20, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  desc: { fontSize: 14, color: Colors.textSoft, textAlign: 'auto', lineHeight: 22 },
  section: { fontSize: 14, fontWeight: '800', color: Colors.textSoft, textAlign: 'auto' },
  badge: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: Layout.minTouch, paddingHorizontal: 16, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.line },
  chipOn: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  chipText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  inline: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { minHeight: 48, borderRadius: Radius.sm, borderWidth: 1.5, borderColor: Colors.line, backgroundColor: Colors.bg, paddingHorizontal: 12, fontSize: 16, color: Colors.text, textAlign: 'auto' },
  save: { minHeight: 48, paddingHorizontal: 16, borderRadius: Radius.sm, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: Layout.minTouch },
  box: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: Colors.lineStrong, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  checkText: { fontSize: 16, color: Colors.text, textAlign: 'auto', flexShrink: 1 },
  comment: { gap: 4, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.line },
  commentName: { fontSize: 14, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  commentBody: { fontSize: 14, color: Colors.textSoft, textAlign: 'auto', lineHeight: 22 },
  small: { fontSize: 12, color: Colors.textMuted },
});
