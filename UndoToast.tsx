import { useEffect, useRef, useState } from "react";
import { Animated, AppState, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { C, R } from "./theme";
import { tapLight } from "./haptics";
import { useReduceMotion } from "./useReduceMotion";
import { flushDelete, undoDelete, usePendingDelete } from "./undoDelete";

/**
 * "Deleted Zomato · Undo", floating above the tab bar while a delete waits.
 *
 * Mounted once at the root. Also where a pending delete is sent early if the
 * app goes to the background, since a timer may never fire once iOS suspends
 * the app.
 */
export function UndoToast({ bottom = 0 }: { bottom?: number }) {
  const txn = usePendingDelete();
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(0)).current;
  // Holds the last name while the toast fades out after an undo or send.
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "background") flushDelete();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (txn) setShown(txn.merchant);
    const anim = Animated.timing(v, {
      toValue: txn ? 1 : 0,
      duration: reduce ? 0 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (finished && !txn) setShown(null);
    });
    return () => anim.stop();
  }, [txn, reduce, v]);

  if (!shown) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <Animated.View
        pointerEvents={txn ? "auto" : "none"}
        style={[
          styles.toast,
          {
            opacity: v,
            transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          },
        ]}
        accessibilityLiveRegion="polite"
      >
        <Text style={styles.text} numberOfLines={1}>
          Deleted {shown}
        </Text>
        <Pressable
          onPress={() => {
            tapLight();
            undoDelete();
          }}
          hitSlop={12}
          accessibilityRole="button"
          style={({ pressed }) => pressed && { opacity: 0.6 }}
        >
          <Text style={styles.undo}>Undo</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center", paddingHorizontal: 16 },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    maxWidth: 420,
    width: "100%",
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: R.control,
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.glassEdge,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  text: { flex: 1, color: C.text, fontSize: 15 },
  undo: { color: C.highlight, fontSize: 15, fontWeight: "600" },
});
