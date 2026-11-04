import React from 'react';
import { StyleSheet, Text as RNText, TextProps } from 'react-native';
import { Colors } from '../../constants/theme';
import { t } from '../../lib/i18n';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

function translateNode(node: React.ReactNode): React.ReactNode {
  if (typeof node === 'string') return t(node);
  if (Array.isArray(node)) return node.map((child, i) => (typeof child === 'string' ? t(child) : child));
  return node;
}

/**
 * App text: defaults to the theme text color (React Native's default is black), keeps the
 * same size scale everywhere, and translates literal strings into the active language.
 */
export function Text({ style, children, ...props }: TextProps) {
  useTheme();
  useI18n();
  const flat = StyleSheet.flatten(style) ?? {};
  return (
    <RNText {...props} style={[{ color: Colors.text }, style, flat.fontSize ? { fontSize: Math.max(12, flat.fontSize) } : null]}>
      {translateNode(children)}
    </RNText>
  );
}
