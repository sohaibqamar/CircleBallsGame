import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Physical millimeters → layout dp (same unit as StyleSheet numbers). */
function mm(value: number): number {
  return (value * 160) / 25.4;
}
import {
  assignRandomVelocities,
  ballCoverageRatio,
  BALL_RADIUS_FRAC,
  createInitialBalls,
  FILL_AREA_RATIO,
  stepSimulation,
  trySpawnBall,
  type Ball,
} from '../game/physics';

type Phase = 'idle' | 'playing' | 'paused' | 'ended';

const BG = '#0b1224';
const SURFACE = '#111b33';
const ACCENT = '#3dd6ff';
const ACCENT_DIM = '#247799';
const BALL_COLORS = ['#ff6b9d', '#c084fc', '#fbbf24', '#34d399', '#fb923c', '#60a5fa'];
const TEXT_PRIMARY = '#e8f4fc';
const BUTTON_BG = '#1c2b4a';

export function BallCircleGame(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const topInset = insets.top + 12;
  const buttonBottomInset = insets.bottom + mm(10);

  const [arenaPx, setArenaPx] = useState(280);
  const [phase, setPhase] = useState<Phase>('idle');
  const [tick, setTick] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [ballCountLabel, setBallCountLabel] = useState(2);

  const ballsRef = useRef<Ball[]>([]);
  const pairTouchingRef = useRef<Record<string, boolean>>({});
  const nextBallIdRef = useRef(3);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>('idle');
  const pauseStartedAtRef = useRef<number | null>(null);
  const playStartedMonotonicRef = useRef<number | null>(null);

  const timerFlash = useRef(new Animated.Value(1)).current;

  const strokeWidth = 5;
  /** Inner edge of the ring — ball skins must stay inside this radius. */
  const bowlInnerRadius = useMemo(() => {
    return Math.max(48, arenaPx / 2 - strokeWidth - 10);
  }, [arenaPx]);
  const ballRadius = useMemo(
    () => Math.max(6, bowlInnerRadius * BALL_RADIUS_FRAC),
    [bowlInnerRadius],
  );

  const resetSimulation = useCallback(() => {
    nextBallIdRef.current = 3;
    pairTouchingRef.current = {};
    ballsRef.current = createInitialBalls(
      bowlInnerRadius,
      ballRadius,
      () => nextBallIdRef.current++,
    );
    setBallCountLabel(ballsRef.current.length);
    lastTsRef.current = null;
    pauseStartedAtRef.current = null;
    playStartedMonotonicRef.current = null;
    setElapsedMs(0);
    setTick(t => t + 1);
  }, [bowlInnerRadius, ballRadius]);

  useEffect(() => {
    resetSimulation();
  }, [resetSimulation]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTsRef.current = null;
  }, []);

  const endGame = useCallback(() => {
    stopLoop();
    setPhase('ended');
    phaseRef.current = 'ended';
    timerFlash.setValue(1);
    Animated.loop(
      Animated.sequence([
        Animated.timing(timerFlash, {
          toValue: 0.25,
          duration: 420,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(timerFlash, {
          toValue: 1,
          duration: 420,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [stopLoop, timerFlash]);

  useEffect(() => {
    return () => stopLoop();
  }, [stopLoop]);

  const loop = useCallback(
    (ts: number) => {
      if (phaseRef.current !== 'playing') {
        return;
      }
      if (lastTsRef.current == null) {
        lastTsRef.current = ts;
      }
      let dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      dt = Math.min(dt, 1 / 30);

      const balls = ballsRef.current;
      const inner = bowlInnerRadius;

      if (ballCoverageRatio(balls, inner) >= FILL_AREA_RATIO) {
        endGame();
        setTick(x => x + 1);
        return;
      }

      const { newCollisionPairs } = stepSimulation(
        balls,
        inner,
        dt,
        pairTouchingRef.current,
      );

      for (let c = 0; c < newCollisionPairs.length; c++) {
        const spawned = trySpawnBall(
          balls,
          inner,
          ballRadius,
          () => nextBallIdRef.current++,
        );
        if (!spawned) {
          endGame();
          setTick(x => x + 1);
          return;
        }
        balls.push(spawned);
      }
      if (newCollisionPairs.length > 0) {
        setBallCountLabel(balls.length);
      }

      setTick(x => x + 1);
      rafRef.current = requestAnimationFrame(loop);
    },
    [ballRadius, bowlInnerRadius, endGame],
  );

  useEffect(() => {
    if (phase !== 'playing') {
      return;
    }
    const id = requestAnimationFrame(loop);
    rafRef.current = id;
    return () => {
      if (rafRef.current === id) {
        cancelAnimationFrame(id);
        rafRef.current = null;
      }
    };
  }, [phase, loop]);

  useEffect(() => {
    if (phase !== 'playing') {
      return;
    }
    if (playStartedMonotonicRef.current == null) {
      playStartedMonotonicRef.current = Date.now();
    }
    const wallMs = 80;
    const id = setInterval(() => {
      if (phaseRef.current !== 'playing') {
        return;
      }
      if (pauseStartedAtRef.current != null || playStartedMonotonicRef.current == null) {
        return;
      }
      const raw = Date.now() - playStartedMonotonicRef.current;
      setElapsedMs(Math.floor(raw));
    }, wallMs);
    return () => clearInterval(id);
  }, [phase]);

  const onPlay = () => {
    if (phase === 'ended') {
      timerFlash.stopAnimation();
      timerFlash.setValue(1);
      resetSimulation();
      assignRandomVelocities(ballsRef.current, bowlInnerRadius);
      pauseStartedAtRef.current = null;
      playStartedMonotonicRef.current = Date.now();
      lastTsRef.current = null;
      setPhase('playing');
      return;
    }
    if (phase === 'idle') {
      assignRandomVelocities(ballsRef.current, bowlInnerRadius);
      pauseStartedAtRef.current = null;
      playStartedMonotonicRef.current = Date.now();
      lastTsRef.current = null;
      setPhase('playing');
      return;
    }
    if (phase === 'paused') {
      if (pauseStartedAtRef.current != null && playStartedMonotonicRef.current != null) {
        const pausedFor = Date.now() - pauseStartedAtRef.current;
        playStartedMonotonicRef.current += pausedFor;
      }
      pauseStartedAtRef.current = null;
      lastTsRef.current = null;
      setPhase('playing');
    }
  };

  const onPause = () => {
    if (phase !== 'playing') {
      return;
    }
    pauseStartedAtRef.current = Date.now();
    stopLoop();
    setPhase('paused');
  };

  const onStop = () => {
    timerFlash.stopAnimation();
    timerFlash.setValue(1);
    stopLoop();
    setPhase('idle');
    resetSimulation();
  };

  const onQuit = () => {
    if (Platform.OS === 'android') {
      BackHandler.exitApp();
    }
  };

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const rs = s % 60;
    const cs = Math.floor((ms % 1000) / 10);
    return `${m.toString().padStart(2, '0')}:${rs.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
  };

  const balls = ballsRef.current;
  const svgSize = arenaPx;
  const cx = svgSize / 2;
  const cy = svgSize / 2;

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: topInset, paddingBottom: buttonBottomInset },
      ]}>
      <Text style={styles.title}>Circle Fill</Text>
      <Text style={styles.sub}>
        Collisions spawn balls — survive until the ring is packed.
      </Text>

      <Animated.Text
        style={[
          styles.timer,
          phase === 'ended' ? { opacity: timerFlash } : null,
        ]}>
        {formatTime(elapsedMs)}
      </Animated.Text>

      <View
        style={styles.arenaWrap}
        onLayout={e => {
          const { width } = e.nativeEvent.layout;
          const next = Math.min(width - 24, 340);
          if (Math.abs(next - arenaPx) > 2) {
            setArenaPx(next);
          }
        }}>
        <Svg width={svgSize} height={svgSize} testID={`arena-${tick}`}>
          <SvgCircle
            cx={cx}
            cy={cy}
            r={bowlInnerRadius + strokeWidth / 2}
            stroke={ACCENT}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {balls.map((b, idx) => (
            <SvgCircle
              key={b.id}
              cx={cx + b.x}
              cy={cy - b.y}
              r={b.r}
              fill={BALL_COLORS[idx % BALL_COLORS.length]}
              stroke="#0b1224"
              strokeWidth={1}
            />
          ))}
        </Svg>
      </View>

      <Text style={styles.meta}>Balls: {ballCountLabel}</Text>

      <View style={styles.buttons}>
        <Pressable
          style={({ pressed }) => [
            styles.btn,
            pressed && styles.btnPressed,
            phase === 'playing' && styles.btnDisabled,
          ]}
          disabled={phase === 'playing'}
          onPress={onPlay}>
          <Text style={styles.btnLabel}>Play</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.btn,
            pressed && styles.btnPressed,
            phase !== 'playing' && styles.btnDisabled,
          ]}
          disabled={phase !== 'playing'}
          onPress={onPause}>
          <Text style={styles.btnLabel}>Pause</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
          onPress={onStop}>
          <Text style={styles.btnLabel}>Stop</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.btn,
            styles.btnDanger,
            pressed && styles.btnPressed,
          ]}
          onPress={onQuit}>
          <Text style={styles.btnLabel}>Quit</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
    paddingHorizontal: 20,
    justifyContent: 'flex-start',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sub: {
    fontSize: 13,
    color: ACCENT_DIM,
    marginBottom: 12,
  },
  timer: {
    alignSelf: 'center',
    fontVariant: ['tabular-nums'],
    fontSize: 34,
    fontWeight: '700',
    color: ACCENT,
    marginBottom: 10,
  },
  arenaWrap: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    width: '100%',
    backgroundColor: SURFACE,
    borderRadius: 24,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#1e3558',
  },
  meta: {
    alignSelf: 'center',
    marginTop: 8,
    color: ACCENT_DIM,
    fontSize: 14,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginTop: 'auto',
    paddingTop: 12,
  },
  btn: {
    backgroundColor: BUTTON_BG,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2c4270',
    minWidth: 92,
    alignItems: 'center',
  },
  btnDanger: {
    borderColor: '#7f1d1d',
    backgroundColor: '#3f1518',
  },
  btnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnLabel: {
    color: TEXT_PRIMARY,
    fontWeight: '600',
    fontSize: 15,
  },
});
