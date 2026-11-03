import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { Colors, Radius, Spacing } from '../../constants/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, style, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        {...props}
        style={[
          styles.input,
          focused && styles.inputFocused,
          error && styles.inputError,
          style,
        ]}
        placeholderTextColor={Colors.textFaint}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  label: {
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSoft,
  },
  input: {
    height: 48,
    borderRadius: Radius.xs,
    borderWidth: 1.5,
    borderColor: Colors.line,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    fontSize: 15,
    color: Colors.text,
  },
  inputFocused: {
    borderColor: Colors.accent,
    backgroundColor: Colors.surface,
  },
  inputError: {
    borderColor: Colors.danger,
  },
  error: {
    fontSize: 12,
    color: Colors.danger,
  },
});
