import React from 'react';
import { I18nManager, TextInput as RNTextInput, TextInputProps } from 'react-native';
import { Colors } from '../../constants/theme';
import { t, useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

/** Themed text field: readable text and placeholder colors in both themes, translated placeholder. */
export function TextInput({ style, placeholder, placeholderTextColor, ...props }: TextInputProps) {
  useTheme();
  useI18n();
  return (
    <RNTextInput
      {...props}
      placeholder={placeholder ? t(placeholder) : placeholder}
      placeholderTextColor={placeholderTextColor ?? Colors.textFaint}
      style={[{ color: Colors.text, textAlign: I18nManager.isRTL ? 'right' : 'left' }, style]}
    />
  );
}
