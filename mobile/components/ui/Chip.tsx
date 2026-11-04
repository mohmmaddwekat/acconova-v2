import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Colors, Layout } from '../../constants/theme';
import { useStyles } from '../../lib/theme';
import { Text } from './/Text';

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function Chip({ label, selected, onPress }: ChipProps) {
  const styles = useStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.selected]}
    >
      <Text style={[styles.text, selected && styles.textSelected]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = () => StyleSheet.create({
  chip: {
    flex: 1, minHeight: Layout.minTouch, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.line,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  selected: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  text: { fontSize: 14, fontWeight: '700', color: Colors.textSoft },
  textSelected: { color: Colors.accentStrong },
});
