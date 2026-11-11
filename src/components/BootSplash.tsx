/**
 * The startup screen shown after the native splash while the app loads
 * (fonts, saved sign-in). Android's native splash can only be one colour, so
 * this carries the look: a deep indigo gradient with soft light, the app icon
 * gently scaling in, the name, and a quiet progress line. Fades out when ready.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

const ICON = require('../../assets/images/icon.png');

export function BootSplash({ visible }: { visible: boolean }) {
  const [fade] = useState(() => new Animated.Value(1));
  const [pop] = useState(() => new Animated.Value(0.86));
  const [sweep] = useState(() => new Animated.Value(0));
  // Gone for good once faded: left mounted, its off-screen light blobs widen the web page.
  const [gone, setGone] = useState(false);

  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [pop, sweep]);

  useEffect(() => {
    if (visible) return;
    Animated.timing(fade, { toValue: 0, duration: 320, useNativeDriver: true }).start(({ finished }) => finished && setGone(true));
  }, [visible, fade]);

  if (gone) return null;
  return (
    <Animated.View pointerEvents={visible ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { opacity: fade, overflow: 'hidden' }]}>
      <LinearGradient colors={['#1B1464', '#3B2FC9', '#5B4BF5']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* Soft light blobs for depth. */}
      <View style={[styles.blob, { top: -80, start: -60, width: 280, height: 280, backgroundColor: 'rgba(124,108,255,0.35)' }]} />
      <View style={[styles.blob, { bottom: -100, end: -70, width: 340, height: 340, backgroundColor: 'rgba(34,197,148,0.18)' }]} />
      <View style={styles.center}>
        <Animated.View style={[styles.iconWrap, { transform: [{ scale: pop }] }]}>
          <Image source={ICON} style={styles.icon} contentFit="cover" />
        </Animated.View>
        <Text style={styles.name}>Inbox And Campaigns</Text>
        <Text style={styles.tag}>WhatsApp · Contacts · Campaigns</Text>
        <View style={styles.track}>
          <Animated.View
            style={[styles.bar, { transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-60, 120] }) }] }]}
          />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  blob: { position: 'absolute', borderRadius: 999 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  iconWrap: {
    width: 112,
    height: 112,
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#0B0640',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 14,
    marginBottom: 10,
  },
  icon: { width: 112, height: 112 },
  name: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: 0.3 },
  tag: { color: 'rgba(255,255,255,0.72)', fontSize: 14, fontWeight: '500' },
  track: { width: 120, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden', marginTop: 22 },
  bar: { width: 60, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.9)' },
});
