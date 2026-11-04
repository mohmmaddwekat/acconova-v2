import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View, ViewStyle } from 'react-native';
import { Colors } from '../../constants/theme';

export function SkeletonBar({ height = 64, width = '100%', style }: { height?: number; width?: ViewStyle['width']; style?: ViewStyle }) {
  const [pulse] = useState(() => new Animated.Value(0.45));

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [pulse]);

  return <Animated.View style={[styles.bar, { height, width, opacity: pulse }, style]} />;
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <View style={styles.list} accessibilityLabel="جارٍ التحميل" accessibilityLiveRegion="polite">
      <SkeletonBar height={18} width="40%" />
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBar key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderRadius: 12, backgroundColor: Colors.surfaceStrong },
  list: { padding: 16, gap: 12 },
});
