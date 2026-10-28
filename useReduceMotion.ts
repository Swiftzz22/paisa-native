import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Whether the person has asked iOS to Reduce Motion. Starts false and settles
 * a tick later, then follows the switch live if they change it mid-session.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => alive && setReduce(on))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduce;
}
