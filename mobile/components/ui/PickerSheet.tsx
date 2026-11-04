import React, { useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Layout, Tint } from '../../constants/theme';
import { EmptyState } from './EmptyState';
import { useStyles } from '../../lib/theme';
import { Text } from './/Text';
import { TextInput } from './/TextInput';

export interface PickerItem {
  id: number | string;
  title: string;
  subtitle?: string;
}

interface PickerSheetProps {
  visible: boolean;
  title: string;
  items: PickerItem[];
  loading?: boolean;
  onSelect: (item: PickerItem) => void;
  onClose: () => void;
}

export function PickerSheet({ visible, title, items, loading, onSelect, onClose }: PickerSheetProps) {
  const styles = useStyles(createStyles);
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();

  function close() {
    setQuery('');
    onClose();
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => i.title.toLowerCase().includes(q)) : items;
  }, [items, query]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="إغلاق" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]} accessibilityViewIsModal>
          <View style={styles.grab} />
          <Text style={styles.title}>{title}</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث..."
            placeholderTextColor={Colors.textFaint}
            style={styles.search}
            autoFocus={false}
            accessibilityLabel="بحث"
          />
          <FlatList
            data={filtered}
            keyExtractor={(i) => String(i.id)}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <EmptyState icon="search" title={loading ? 'جارٍ التحميل...' : 'لا توجد نتائج'} message={loading ? undefined : 'جرّب كلمة أخرى.'} compact />
            }
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => { setQuery(''); onSelect(item); }}
                style={({ pressed }) => [styles.item, pressed && { backgroundColor: Colors.bgSoft }]}
              >
                <Text style={styles.itemTitle}>{item.title}</Text>
                {item.subtitle ? <Text style={styles.itemSub}>{item.subtitle}</Text> : null}
              </Pressable>
            )}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = () => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: Tint.overlay, justifyContent: 'flex-end' },
  sheet: { maxHeight: '80%', backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.line, marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '800', color: Colors.text, textAlign: 'auto', marginBottom: 10 },
  search: {
    height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.line, backgroundColor: Colors.bg,
    paddingHorizontal: 14, fontSize: 15, color: Colors.text, textAlign: 'auto', marginBottom: 6,
  },
  item: {
    minHeight: Layout.minTouch + 4, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 6,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  itemTitle: { fontSize: 15, fontWeight: '600', color: Colors.text, textAlign: 'auto' },
  itemSub: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto', marginTop: 2 },
});
