import React from 'react';
import { Image, StyleSheet, View, Text, ViewStyle } from 'react-native';
import { colors } from '../utils/theme';

interface LogoProps {
  size?: number;
  showWordmark?: boolean;
  style?: ViewStyle;
}

export default function Logo({ size = 40, showWordmark = false, style }: LogoProps) {
  return (
    <View style={[styles.row, style]}>
      <Image
        source={require('../../assets/logo.png')}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
      {showWordmark && (
        <Text style={[styles.wordmark, { fontSize: size * 0.45 }]}>
          Stock<Text style={{ color: colors.brandGreen }}>Mate</Text>
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordmark: { fontWeight: '800', color: colors.text },
});
