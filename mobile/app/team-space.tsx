import { Stack, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { SkeletonList } from '../components/ui/Skeleton';
import { Text } from '../components/ui/Text';
import { TextInput } from '../components/ui/TextInput';
import { Colors, Layout, Radius, StatusText } from '../constants/theme';
import { api } from '../lib/api';
import { apiErrorMessage } from '../lib/format';
import { t } from '../lib/i18n';
import { useBottomInset } from '../lib/insets';
import { listOf } from '../lib/tasks';
import { useStyles } from '../lib/theme';

interface Conversation {
  id: number;
  kind: 'direct' | 'group';
  display_name: string;
  unread_count: number;
  latest_preview: string | null;
  latest_sender_name: string | null;
  latest_at: string | null;
  latest_has_attachments?: boolean;
  is_online?: boolean;
}

export function formatChatTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days < 7) return days <= 1 ? 'أمس' : `منذ ${days} أيام`;
  return iso.slice(0, 10);
}

export default function TeamSpaceScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const [items, setItems] = useState<Conversation[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setFailed(null);
      const res = await api.get('/team-space', { params: { limit: 50 } });
      setItems(listOf<Conversation>(res.data));
    } catch (err) {
      setFailed(apiErrorMessage(err, 'تحقق من الاتصال أو الصلاحيات.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Messages arrive while the screen is open, so the list refreshes quietly in the background.
  useEffect(() => {
    const timer = setInterval(() => { load(); }, 8000);
    return () => clearInterval(timer);
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((c) => c.display_name?.toLowerCase().includes(q)) : items;
  }, [items, query]);

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: true, title: t('مساحة الفريق'), headerTitleAlign: 'center', headerShadowVisible: false }} />
      <View style={styles.searchWrap}>
        <Icon name="search" size={18} color={Colors.textMuted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="بحث في المحادثات…" placeholderTextColor={Colors.textFaint} style={styles.search} accessibilityLabel="بحث في المحادثات" />
      </View>

      {loading ? (
        <SkeletonList rows={6} />
      ) : failed ? (
        <EmptyState icon="wifiOff" title="تعذّر تحميل المحادثات" message={failed} actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={[styles.list, { paddingBottom: 96 + bottomInset }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
          ListEmptyComponent={<EmptyState icon="chat" title="لا توجد محادثات بعد" message="ابدأ محادثة مع أحد زملائك." compact />}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/chat/${item.id}` as never)}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: Colors.bgSoft }]}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(item.display_name ?? '؟').trim().charAt(0).toUpperCase()}</Text>
                {item.kind === 'direct' && item.is_online ? <View style={styles.online} /> : null}
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={styles.topLine}>
                  <Text style={styles.name} numberOfLines={1}>{item.display_name}</Text>
                  <Text style={styles.time}>{formatChatTime(item.latest_at)}</Text>
                </View>
                <View style={styles.topLine}>
                  <Text style={[styles.preview, item.unread_count > 0 && { color: Colors.text, fontWeight: '700' }]} numberOfLines={1}>
                    {item.latest_preview
                      ? `${item.kind === 'group' && item.latest_sender_name ? `${item.latest_sender_name}: ` : ''}${item.latest_preview}`
                      : item.latest_has_attachments ? '📎 مرفق' : 'لا توجد رسائل بعد'}
                  </Text>
                  {item.unread_count > 0 ? (
                    <View style={styles.badge}><Text style={styles.badgeText}>{item.unread_count > 99 ? '99+' : item.unread_count}</Text></View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          )}
        />
      )}

      <View style={[styles.fabWrap, { bottom: 16 + bottomInset }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="محادثة جديدة" onPress={() => router.push('/new-chat' as never)} style={styles.fab}>
          <Icon name="plus" size={24} color="#fff" strokeWidth={2.4} />
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, marginBottom: 8, paddingHorizontal: 16, minHeight: 48, borderRadius: Radius.sm, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.line },
  search: { flex: 1, fontSize: 16, color: Colors.text, textAlign: 'auto', minHeight: 44 },
  list: { flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: Layout.minTouch + 24, borderBottomWidth: 1, borderBottomColor: Colors.line },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '800', color: Colors.accentStrong },
  online: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: StatusText.success, borderWidth: 2, borderColor: Colors.bg },
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  time: { fontSize: 12, color: Colors.textMuted },
  preview: { flex: 1, fontSize: 14, color: Colors.textMuted, textAlign: 'auto' },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  fabWrap: { position: 'absolute', end: 16 },
  fab: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', shadowColor: Colors.accent, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
});
