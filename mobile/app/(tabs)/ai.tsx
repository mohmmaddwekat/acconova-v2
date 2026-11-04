import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow, Spacing } from '../../constants/theme';
import { api } from '../../lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function AIScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const listRef = useRef<FlatList>(null);

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      let convId = conversationId;

      if (!convId) {
        const convRes = await api.post('/ai/conversations', { title: 'محادثة جديدة' });
        convId = convRes.data?.id ?? convRes.data?.data?.id;
        setConversationId(convId);
      }

      const msgRes = await api.post(`/ai/conversations/${convId}/messages`, {
        content: text,
      });

      const reply =
        msgRes.data?.response ??
        msgRes.data?.content ??
        msgRes.data?.message ??
        'عذراً، لم أتمكن من الإجابة.';

      const assistantMsg: Message = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: reply,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errMsg: Message = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: 'عذراً، حدث خطأ في الاتصال. حاول مرة أخرى.',
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const renderItem = useCallback(({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
        {!isUser && (
          <View style={styles.aiAvatar}>
            <Text style={styles.aiAvatarText}>AI</Text>
          </View>
        )}
        <View style={[styles.bubbleBody, isUser ? styles.bubbleBodyUser : styles.bubbleBodyAI]}>
          <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{item.content}</Text>
        </View>
      </View>
    );
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.aiIcon}>
          <Text style={styles.aiIconText}>🤖</Text>
        </View>
        <View>
          <Text style={styles.title}>المساعد الذكي</Text>
          <Text style={styles.subtitle}>اسأل عن أي شيء مالي</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={80}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>💬</Text>
              <Text style={styles.emptyTitle}>ابدأ محادثة</Text>
              <Text style={styles.emptyText}>اسأل المساعد عن أرصدة العملاء، الفواتير المتأخرة، أو أي تحليل مالي.</Text>
            </View>
          }
        />

        <View style={styles.inputArea}>
          {sending && (
            <View style={styles.typingIndicator}>
              <ActivityIndicator color={Colors.accent} size="small" />
              <Text style={styles.typingText}>يكتب...</Text>
            </View>
          )}
          <View style={styles.inputRow}>
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
              onPress={sendMessage}
              disabled={!input.trim() || sending}
            >
              <Text style={styles.sendIcon}>↑</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="اكتب سؤالك..."
              placeholderTextColor={Colors.textMuted}
              multiline
              maxLength={500}
              textAlign="right"
              onSubmitEditing={sendMessage}
              returnKeyType="send"
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  aiIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiIconText: { fontSize: 22 },
  title: { fontSize: 17, fontWeight: '700', color: Colors.text },
  subtitle: { fontSize: 12, color: Colors.textMuted },
  messageList: { padding: Spacing.md, gap: Spacing.md, flexGrow: 1 },
  bubble: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  bubbleUser: { flexDirection: 'row-reverse' },
  bubbleAI: { flexDirection: 'row' },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  aiAvatarText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  bubbleBody: {
    maxWidth: '75%',
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  bubbleBodyUser: { backgroundColor: Colors.accent },
  bubbleBodyAI: { backgroundColor: Colors.surface, ...Shadow.soft },
  bubbleText: { fontSize: 14, color: Colors.text, lineHeight: 20 },
  bubbleTextUser: { color: '#fff' },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.sm,
    marginTop: Spacing.xxl,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
  inputArea: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  typingIndicator: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  typingText: { fontSize: 12, color: Colors.textMuted },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  input: {
    flex: 1,
    backgroundColor: Colors.bg,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.line,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 14,
    color: Colors.text,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: Colors.line },
  sendIcon: { fontSize: 18, color: '#fff', fontWeight: '700' },
});
