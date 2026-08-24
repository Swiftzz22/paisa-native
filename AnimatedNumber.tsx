import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Text,
  type StyleProp,
  type TextStyle,
} from "react-native";

/**
 * Counts from the previous value to the new one instead of snapping.
 *
 * Driven by requestAnimationFrame rather than Animated, because the thing
 * changing is the formatted string inside a Text node, which Animated cannot
 * interpolate. Only one Text updates per frame, so this stays cheap.
 *
 * An interrupted run resumes from whatever was on screen, so rapid period
 * switches chain smoothly instead of jumping back to the old figure.
 */
export function AnimatedNumber({
  value,
  format,
  style,
  duration = 450,
}: {
  value: number;
  format: (n: number) => string;
  style?: StyleProp<TextStyle>;
  duration?: number;
}) {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);
  const frame = useRef<number | null>(null);
  const reduceMotion = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        reduceMotion.current = on;
      })
      .catch(() => {
        // Older platforms may not answer; motion stays on.
      });
  }, []);

  useEffect(() => {
    const from = displayRef.current;
    const to = value;
    if (from === to) return;

    if (reduceMotion.current || duration <= 0) {
      displayRef.current = to;
      setDisplay(to);
      return;
    }

    const startedAt = Date.now();
    const step = () => {
      const t = Math.min((Date.now() - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const next = Math.round(from + (to - from) * eased);
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) frame.current = requestAnimationFrame(step);
      else frame.current = null;
    };
    frame.current = requestAnimationFrame(step);

    return () => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    };
  }, [value, duration]);

  return <Text style={style}>{format(display)}</Text>;
}
