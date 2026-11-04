import { Pressable, StyleSheet, View } from 'react-native';
import { Colors, Layout } from '../../constants/theme';
import { useStyles } from '../../lib/theme';
import { Icon, IconName } from './Icon';
import { Text } from './Text';

interface SegmentedProps<T extends string> {
  options: { key: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (key: T) => void;
}

/** Pill-shaped choice control with an icon above each label. */
export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  const styles = useStyles(createStyles);
  return (
    <View style={styles.wrap} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.key)}
            style={[styles.item, on && styles.itemOn]}
          >
            {o.icon ? <Icon name={o.icon} size={18} color={on ? Colors.accent : Colors.textMuted} /> : null}
            <Text style={[styles.text, on && { color: Colors.accent }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: Colors.bgSoft, borderRadius: 14, padding: 4, gap: 4 },
  item: { flex: 1, minHeight: Layout.minTouch + 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 4 },
  itemOn: { backgroundColor: Colors.surface, shadowColor: '#011C32', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  text: { fontSize: 13, fontWeight: '800', color: Colors.textMuted },
});
