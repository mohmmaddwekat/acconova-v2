import React, { useId } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

interface GradientProps {
  colors: [string, string];
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/** Diagonal two-stop gradient background, drawn with SVG so it needs no extra native module. */
export function Gradient({ colors, style, children }: GradientProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <View style={[styles.wrap, style]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors[0]} />
            <Stop offset="1" stopColor={colors[1]} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
});
