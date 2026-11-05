import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { SkeletonList } from '../../components/ui/Skeleton';
import { Text } from '../../components/ui/Text';
import { TextInput } from '../../components/ui/TextInput';
import { useToast } from '../../components/ui/Toast';
import { Colors, Radius } from '../../constants/theme';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';
import { apiErrorMessage, uuidv4 } from '../../lib/format';
import { useBottomInset } from '../../lib/insets';
import { useStyles } from '../../lib/theme';

interface Message {
  id: number;
  user_id: number;
  name?: string;
  body: string | null;
  created_at: string;
  deleted_at?: string | null;
  attachments?: { id: number; name: string }[];
}

interface ConversationInfo { id: number; kind?: string; display_name?: string }

const clock = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  return days === 0 ? 'اليوم' : days === 1 ? 'أمس' : iso.slice(0, 10);
};

export default function ChatScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const toast = useToast();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [info, setInfo] = useState<ConversationInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/team-space/${id}/messages`, { params: { mark_read: 1 } });
      const body = res.data?.data ?? res.data;
      setInfo(body?.conversation ?? null);
      const list: Message[] = Array.isArray(body?.messages) ? body.messages : [];
      setMessages([...list].sort((a, b) => a.id - b.id));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const timer = setInterval(() => { load(); }, 5000);
    return () => clearInterval(timer);
  }, [load]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText('');
    try {
      await api.post(`/team-space/${id}/messages`, { body, request_id: uuidv4() });
      await load();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      setText(body);
      toast(apiErrorMessage(err, 'تعذّر إرسال الرسالة'));
    } finally {
      setSending(false);
    }
  }

  const isGroup = info?.kind === 'group';

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <Stack.Screen options={{ headerShown: true, title: info?.display_name ?? '', headerTitleAlign: 'center', headerShadowVisible: false }} />
      {loading ? (
        <SkeletonList rows={5} />
      ) : failed && messages.length === 0 ? (
        <EmptyState icon="wifiOff" title="تعذّر تحميل المحادثة" actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={<EmptyState icon="chat" title="ابدأ المحادثة" message="اكتب أول رسالة بالأسفل." compact />}
          renderItem={({ item, index }) => {
            const mine = item.user_id === user?.id;
            const prev = messages[index - 1];
            const newDay = !prev || prev.created_at.slice(0, 10) !== item.created_at.slice(0, 10);
            const deleted = !!item.deleted_at;
            return (
              <View>
                {newDay ? <Text style={styles.day}>{dayLabel(item.created_at)}</Text> : null}
                <View style={[styles.bubbleRow, mine ? styles.mineRow : styles.theirRow]}>
                  <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                    {isGroup && !mine ? <Text style={styles.sender}>{item.name}</Text> : null}
                    <Text style={[styles.body, mine && { color: '#fff' }, deleted && { fontStyle: 'italic', opacity: 0.7 }]}>
                      {deleted ? 'تم حذف الرسالة' : item.body ?? ''}
                    </Text>
                    {(item.attachments ?? []).map((a) => (
                      <Text key={a.id} style={[styles.attach, mine && { color: '#fff' }]}>📎 {a.name}</Text>
                    ))}
                    <Text style={[styles.time, mine && { color: '#fff', opacity: 0.8 }]}>{clock(item.created_at)}</Text>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      <View style={[styles.composer, { paddingBottom: 12 + bottomInset }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="اكتب رسالة…"
          placeholderTextColor={Colors.textFaint}
          multiline
          style={styles.input}
          accessibilityLabel="رسالة جديدة"
        />
        <Pressable accessibilityRole="button" accessibilityLabel="إرسال" disabled={!text.trim() || sending} onPress={send} style={[styles.send, (!text.trim() || sending) && { opacity: 0.4 }]}>
          <Icon name="arrowUpRight" size={22} color="#fff" strokeWidth={2.4} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  list: { padding: 16, gap: 8, flexGrow: 1 },
  day: { alignSelf: 'center', fontSize: 12, color: Colors.textMuted, backgroundColor: Colors.bgSoft, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginVertical: 8 },
  bubbleRow: { flexDirection: 'row' },
  mineRow: { justifyContent: 'flex-start' },
  theirRow: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.md, gap: 4 },
  mine: { backgroundColor: Colors.accent },
  theirs: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line },
  sender: { fontSize: 12, fontWeight: '800', color: Colors.accentStrong, textAlign: 'auto' },
  body: { fontSize: 16, color: Colors.text, textAlign: 'auto', lineHeight: 22 },
  attach: { fontSize: 14, color: Colors.accentStrong },
  time: { fontSize: 11, color: Colors.textMuted, alignSelf: 'flex-end' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 12, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.line },
  input: { flex: 1, minHeight: 48, maxHeight: 120, borderRadius: 24, borderWidth: 1.5, borderColor: Colors.line, backgroundColor: Colors.bg, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 16, color: Colors.text, textAlign: 'auto' },
  send: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
});
