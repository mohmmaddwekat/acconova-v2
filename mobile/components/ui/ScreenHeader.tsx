import { useRouter } from 'expo-router';
import React from 'react';
import { I18nManager, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Layout } from '../../constants/theme';
import { Gradient } from './Gradient';
import { Icon, IconName } from './Icon';
import { useStyles } from '../../lib/theme';
import { Text } from './/Text';

interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  showBack?: boolean;
  actionIcon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'light' | 'solid';
  color?: string;
  children?: React.ReactNode;
}

/** Slightly darker tone for the far end of the header gradient. */
function shade(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, ((n >> 16) & 255) - 28);
  const g = Math.max(0, ((n >> 8) & 255) - 18);
  const b = Math.max(0, (n & 255) - 8);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function ScreenHeader({
  title,
  onBack,
  showBack = true,
  actionIcon,
  actionLabel,
  onAction,
  tone = 'light',
  color = Colors.accent,
  children,
}: ScreenHeaderProps) {
  const styles = useStyles(createStyles);
  const router = useRouter();
  const solid = tone === 'solid';
  const fg = solid ? '#fff' : Colors.text;
  const backIcon: IconName = I18nManager.isRTL ? 'chevronRight' : 'chevronLeft';

  const body = (
    <>
      <View style={styles.row}>
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="رجوع"
            onPress={onBack ?? (() => router.back())}
            style={[styles.iconBtn, solid && styles.iconBtnSolid]}
          >
            <Icon name={backIcon} size={22} color={fg} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
        <Text style={[styles.title, { color: fg }]} numberOfLines={1}>{title}</Text>
        {actionIcon ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel ?? title}
            onPress={onAction}
            style={[styles.iconBtn, solid && styles.iconBtnSolid, !solid && styles.iconBtnLight]}
          >
            <Icon name={actionIcon} size={20} color={fg} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>
      {children}
    </>
  );

  return (
    <SafeAreaView edges={['top']} style={solid ? { backgroundColor: color } : [styles.safe, styles.light]}>
      {solid ? <Gradient colors={[color, shade(color)]} style={styles.safe}>{body}</Gradient> : body}
    </SafeAreaView>
  );
}

const createStyles = () => StyleSheet.create({
  safe: { paddingHorizontal: 12, paddingBottom: 10 },
  light: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.line },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 },
  title: { flex: 1, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  iconBtn: { width: Layout.minTouch, height: Layout.minTouch, borderRadius: Layout.minTouch / 2, alignItems: 'center', justifyContent: 'center' },
  iconBtnSolid: { backgroundColor: 'rgba(255,255,255,0.2)' },
  iconBtnLight: { backgroundColor: Colors.bgSoft },
});
