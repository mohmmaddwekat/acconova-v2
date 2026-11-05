import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { Input } from '../components/ui/Input';
import { SkeletonList } from '../components/ui/Skeleton';
import { StickyFooter } from '../components/ui/StickyFooter';
import { Text } from '../components/ui/Text';
import { TextInput } from '../components/ui/TextInput';
import { useToast } from '../components/ui/Toast';
import { Colors, Layout, Radius, StatusText } from '../constants/theme';
import { api } from '../lib/api';
import { apiErrorMessage } from '../lib/format';
import { t } from '../lib/i18n';
import { listOf } from '../lib/tasks';
import { useStyles } from '../lib/theme';

interface Person { id: number; name: string; email?: string; is_online?: boolean }

export default function NewChatScreen() {
  const styles = useStyles(createStyles);
  const router = useRouter();
  const toast = useToast();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/team-space/people')
      .then((res) => setPeople(listOf<Person>(res.data)))
      .catch(() => setPeople([]))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? people.filter((p) => `${p.name} ${p.email ?? ''}`.toLowerCase().includes(q)) : people;
  }, [people, query]);

  async function create(members: number[]) {
    if (group && !name.trim()) {
      toast('اكتب اسم المجموعة');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/team-space', { kind: group ? 'group' : 'direct', members, ...(group ? { name: name.trim() } : {}) });
      const id = res.data?.id ?? res.data?.data?.id;
      router.replace(id ? (`/chat/${id}` as never) : ('/team-space' as never));
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر إنشاء المحادثة'));
    } finally {
      setSaving(false);
    }
  }

  function pick(person: Person) {
    if (!group) {
      create([person.id]);
      return;
    }
    setSelected((cur) => (cur.includes(person.id) ? cur.filter((x) => x !== person.id) : [...cur, person.id]));
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: true, title: t('محادثة جديدة'), headerTitleAlign: 'center', headerShadowVisible: false }} />
      <View style={styles.seg}>
        {[{ k: false, l: 'رسالة مباشرة' }, { k: true, l: 'مجموعة' }].map((o) => (
          <Pressable key={String(o.k)} accessibilityRole="tab" accessibilityState={{ selected: group === o.k }} onPress={() => { setGroup(o.k); setSelected([]); }} style={[styles.segBtn, group === o.k && styles.segOn]}>
            <Text style={[styles.segText, group === o.k && { color: Colors.accentStrong }]}>{o.l}</Text>
          </Pressable>
        ))}
      </View>

      {group ? <View style={styles.pad}><Input label="اسم المجموعة" value={name} onChangeText={setName} placeholder="مثال: فريق المبيعات" /></View> : null}

      <View style={styles.searchWrap}>
        <Icon name="search" size={18} color={Colors.textMuted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="بحث عن زميل…" placeholderTextColor={Colors.textFaint} style={styles.search} accessibilityLabel="بحث عن زميل" />
      </View>

      {loading ? (
        <SkeletonList rows={6} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={<EmptyState icon="users" title="لا يوجد زملاء" compact />}
          renderItem={({ item }) => {
            const on = selected.includes(item.id);
            return (
              <Pressable accessibilityRole="button" disabled={saving} onPress={() => pick(item)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: Colors.bgSoft }]}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{item.name.trim().charAt(0).toUpperCase()}</Text>
                  {item.is_online ? <View style={styles.online} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  {item.email ? <Text style={styles.email}>{item.email}</Text> : null}
                </View>
                {group ? (
                  <View style={[styles.box, on && styles.boxOn]}>{on ? <Icon name="check" size={16} color="#fff" strokeWidth={3} /> : null}</View>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}

      {group ? (
        <StickyFooter safeBottom>
          <Button label={selected.length ? `إنشاء المجموعة (${selected.length})` : 'اختر الأعضاء'} onPress={() => selected.length && create(selected)} loading={saving} disabled={!selected.length} />
        </StickyFooter>
      ) : null}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  pad: { paddingHorizontal: 16, paddingTop: 8 },
  seg: { flexDirection: 'row', margin: 16, marginBottom: 8, padding: 4, gap: 4, borderRadius: 12, backgroundColor: Colors.bgSoft },
  segBtn: { flex: 1, minHeight: Layout.minTouch, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: Colors.surface },
  segText: { fontSize: 14, fontWeight: '800', color: Colors.textMuted },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, marginTop: 8, paddingHorizontal: 16, minHeight: 48, borderRadius: Radius.sm, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.line },
  search: { flex: 1, fontSize: 16, color: Colors.text, textAlign: 'auto', minHeight: 44 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: Layout.minTouch + 12, borderBottomWidth: 1, borderBottomColor: Colors.line },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '800', color: Colors.accentStrong },
  online: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: StatusText.success, borderWidth: 2, borderColor: Colors.bg },
  name: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  email: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  box: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: Colors.lineStrong, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
});
