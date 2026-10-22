import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { USE_NATIVE_DRIVER } from '@/lib/animation';
import { getTeam } from '@/services';
import { colors, withAlpha } from '@/theme';

/** Stadium-light color washes, cross-faded in order (team colors from the app's team data). */
const GLOWS = ['kc', 'phi', 'buf', 'det'].map((id) => getTeam(id).primary);
const GLOW_MS = 5000;

/** One field strip: 10 yard lines (every 10 yards = 70 pt) with numbers; drawn twice for a seamless loop. */
const YARD = 7; // points per yard
const STRIP_YARDS = 100;
const STRIP = STRIP_YARDS * YARD;
const NUMBERS = [10, 20, 30, 40, 50, 40, 30, 20, 10];
const PAN_MS = 60000; // one strip per minute: a slow camera pan

function FieldStrip({ offset }: { offset: number }) {
  return (
    <View style={{ position: 'absolute', left: offset, top: 0, width: STRIP, height: 300 }}>
      {Array.from({ length: STRIP_YARDS / 5 }, (_, i) => (
        <View
          key={`l${i}`}
          style={{
            position: 'absolute',
            left: i * 5 * YARD,
            top: 0,
            bottom: 0,
            width: i % 2 === 0 ? 2 : 1,
            backgroundColor: `rgba(255,255,255,${i % 2 === 0 ? 0.3 : 0.13})`,
          }}
        />
      ))}
      {Array.from({ length: STRIP_YARDS }, (_, y) =>
        y % 5 === 0 ? null : (
          <View key={`h${y}`} style={[styles.hash, { left: y * YARD, top: 96 }]} />
        ),
      )}
      {Array.from({ length: STRIP_YARDS }, (_, y) =>
        y % 5 === 0 ? null : (
          <View key={`g${y}`} style={[styles.hash, { left: y * YARD, top: 196 }]} />
        ),
      )}
      {NUMBERS.map((n, i) => (
        <Text key={`n${i}`} style={[styles.number, { left: (i + 1) * 10 * YARD - 22, top: 236 }]}>
          {n}
        </Text>
      ))}
    </View>
  );
}

/**
 * Welcome-screen background, drawn in code (no video, no licensed footage): team-color stadium light
 * cross-fading, a football field slowly panning under an angled "camera", and a soft light sweep.
 * Transforms/opacity only, so it runs on the native driver; static when Reduce Motion is on.
 */
export function WelcomeBackdrop() {
  const [glow] = useState(() => new Animated.Value(0));
  const [pan] = useState(() => new Animated.Value(0));
  const [sweep] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let loops: Animated.CompositeAnimation[] = [];
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (!alive || reduce) return;
        loops = [
          Animated.loop(
            Animated.timing(glow, {
              toValue: GLOWS.length,
              duration: GLOW_MS * GLOWS.length,
              easing: Easing.linear,
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
          ),
          Animated.loop(
            Animated.timing(pan, {
              toValue: 1,
              duration: PAN_MS,
              easing: Easing.linear,
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
          ),
          Animated.loop(
            Animated.sequence([
              Animated.timing(sweep, {
                toValue: 1,
                duration: 3200,
                easing: Easing.inOut(Easing.quad),
                useNativeDriver: USE_NATIVE_DRIVER,
              }),
              Animated.delay(3800),
            ]),
          ),
        ];
        loops.forEach((l) => l.start());
      });
    return () => {
      alive = false;
      loops.forEach((l) => l.stop());
    };
  }, [glow, pan, sweep]);

  // The loop value runs 0 → n; glow i peaks at i and fades out toward its neighbours. Glow 0 also
  // peaks at n, where the loop wraps around, so the cycle is seamless.
  const n = GLOWS.length;
  const glowOpacity = (i: number) =>
    i === 0
      ? glow.interpolate({ inputRange: [0, 1, n - 1, n], outputRange: [1, 0, 0, 1] })
      : glow.interpolate({
          inputRange: [i - 1, i, i + 1],
          outputRange: [0, 1, 0],
          extrapolate: 'clamp',
        });

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      aria-hidden
    >
      {GLOWS.map((c, i) => (
        <Animated.View key={c + i} style={[StyleSheet.absoluteFill, { opacity: glowOpacity(i) }]}>
          <LinearGradient
            colors={[withAlpha(c, 0.95), withAlpha(c, 0.35), withAlpha(colors.bg, 0)]}
            locations={[0, 0.38, 0.75]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ))}

      {/* The field, seen at an angle, panning slowly. */}
      <View style={styles.fieldWrap}>
        <Animated.View
          style={{
            width: STRIP * 2,
            height: 300,
            transform: [
              { translateX: pan.interpolate({ inputRange: [0, 1], outputRange: [0, -STRIP] }) },
            ],
          }}
        >
          <FieldStrip offset={0} />
          <FieldStrip offset={STRIP} />
        </Animated.View>
      </View>

      {/* Stadium light sweep. */}
      <Animated.View
        style={[
          styles.sweep,
          {
            transform: [
              { rotate: '20deg' },
              { translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-500, 900] }) },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.07)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Legibility: darken the top a little and the bottom (buttons) a lot. */}
      <LinearGradient
        colors={[
          withAlpha(colors.bg, 0.15),
          withAlpha(colors.bg, 0.05),
          withAlpha(colors.bg, 0.8),
        ]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fieldWrap: {
    position: 'absolute',
    left: -200,
    right: -200,
    bottom: 120,
    height: 300,
    transform: [{ perspective: 600 }, { rotateX: '58deg' }, { rotateZ: '-8deg' }, { scale: 1.25 }],
  },
  hash: { position: 'absolute', width: 1, height: 10, backgroundColor: 'rgba(255,255,255,0.24)' },
  number: {
    position: 'absolute',
    width: 44,
    textAlign: 'center',
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 30,
    color: 'rgba(255,255,255,0.3)',
  },
  sweep: { position: 'absolute', top: -200, bottom: -200, width: 220 },
});
