import React, { useState } from 'react';
import { StyleSheet, TextInputProps, TouchableOpacity, View } from 'react-native';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { Icon, IconName } from './Icon';
import { useStyles } from '../../lib/theme';
import { Text } from './/Text';
import { TextInput } from './/TextInput';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: IconName;
}

export function Input({ label, error, icon, style, secureTextEntry, ...props }: InputProps) {
  const styles = useStyles(createStyles);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(secureTextEntry ?? false);

  const isPassword = secureTextEntry === true;

  return (
    <View style={styles.wrapper}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.row}>
        <TextInput
          {...props}
          secureTextEntry={hidden}
          style={[
            styles.input,
            focused && styles.inputFocused,
            error && styles.inputError,
            isPassword && styles.inputWithToggle,
            icon && styles.inputWithIcon,
            style,
          ]}
          placeholderTextColor={Colors.textFaint}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {icon && (
          <View style={styles.leadIcon} pointerEvents="none">
            <Icon name={icon} size={18} color={focused ? Colors.accent : Colors.textMuted} />
          </View>
        )}
        {isPassword && (
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setHidden((h) => !h)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityLabel={hidden ? 'إظهار كلمة السر' : 'إخفاء كلمة السر'}
          >
            <Icon name={hidden ? 'eye' : 'eyeOff'} size={20} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  label: {
    textAlign: 'auto',
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSoft,
  },
  row: {
    position: 'relative',
  },
  input: {
    height: 52,
    borderRadius: Radius.xs,
    borderWidth: 1.5,
    borderColor: Colors.line,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    fontSize: 15,
    color: Colors.text,
  },
  inputWithToggle: {
    paddingEnd: 48,
  },
  inputWithIcon: {
    paddingStart: 44,
  },
  leadIcon: {
    position: 'absolute',
    start: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  inputFocused: {
    borderColor: Colors.accent,
  },
  inputError: {
    borderColor: Colors.danger,
  },
  eyeBtn: {
    position: 'absolute',
    end: 4,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: 44,
  },
  error: {
    fontSize: 12,
    color: Colors.danger,
  },
});
