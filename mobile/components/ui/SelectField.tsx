import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Colors, Radius } from '../../constants/theme';
import { Icon } from './Icon';
import { useStyles } from '../../lib/theme';
import { Text } from './/Text';

interface SelectFieldProps {
  label: string;
  value?: string;
  placeholder?: string;
  onPress: () => void;
  error?: string;
}

export function SelectField({ label, value, placeholder = 'اختر...', onPress, error }: SelectFieldProps) {
  const styles = useStyles(createStyles);
  return (
    <View style={{ gap: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? placeholder}`}
        onPress={onPress}
        style={[styles.field, error ? { borderColor: Colors.danger } : null]}
      >
        <View style={styles.texts}>
          <Text style={styles.label}>{label}</Text>
          <Text style={[styles.value, !value && { color: Colors.textFaint, fontWeight: '500' }]} numberOfLines={1}>
            {value ?? placeholder}
          </Text>
        </View>
        <Icon name="chevronDown" size={18} color={Colors.textMuted} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  field: {
    minHeight: 58, borderRadius: Radius.xs, borderWidth: 1.5, borderColor: Colors.line, backgroundColor: Colors.surface,
    paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  },
  texts: { flex: 1, gap: 1 },
  label: { fontSize: 12, color: Colors.textMuted, fontWeight: '500', textAlign: 'auto' },
  value: { fontSize: 15, fontWeight: '700', color: Colors.text, textAlign: 'auto' },
  error: { fontSize: 12, color: Colors.danger, textAlign: 'auto' },
});
