import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/theme';
import { Button } from './Button';
import { Icon, IconName } from './Icon';

interface EmptyStateProps {
  icon: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

export function EmptyState({ icon, title, message, actionLabel, onAction, compact }: EmptyStateProps) {
  return (
    <View style={[styles.wrap, compact && { paddingVertical: 24 }]}>
      <View style={styles.circle}>
        <Icon name={icon} size={32} color={Colors.accent} strokeWidth={1.8} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
          <Button label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10, paddingVertical: 48, paddingHorizontal: 28 },
  circle: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  message: { fontSize: 14, color: Colors.textMuted, lineHeight: 22, textAlign: 'center' },
});
