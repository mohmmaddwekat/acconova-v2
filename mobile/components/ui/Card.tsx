import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { Colors, Radius, Shadow } from '../../constants/theme';
import { useStyles } from '../../lib/theme';

interface CardProps extends ViewProps {
  children: React.ReactNode;
}

export function Card({ children, style, ...props }: CardProps) {
  const styles = useStyles(createStyles);
  return (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    padding: 16,
    ...Shadow.soft,
  },
});
