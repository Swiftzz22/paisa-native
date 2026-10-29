import { useEffect, useRef } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Animated, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { C, R_INNER } from "./theme";
import { tapLight } from "./haptics";
import { useReduceMotion } from "./useReduceMotion";

/** A small one-time hint with "Got it", and optionally a way to try the thing. */
export function Tip({
  icon,
  text,
  onDismiss,
  action,
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  onDismiss: () => void;
  action?: { label: string; onPress: () => void };
  style?: ViewStyle;
}) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: reduce ? 0 : 320, useNativeDriver: true }).start();
  }, [reduce, v]);

  return (
    <Animated.View style={[styles.tip, { opacity: v }, style]} accessibilityRole="summary">
      <Ionicons name={icon} size={17} color={C.highlight} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.text}>{text}</Text>
        <View style={styles.actions}>
          {action ? (
            <Pressable
              onPress={() => {
                tapLight();
                action.onPress();
              }}
              hitSlop={8}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <Text style={styles.primary}>{action.label}</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => {
              tapLight();
              onDismiss();
            }}
            hitSlop={8}
            style={({ pressed }) => pressed && { opacity: 0.6 }}
          >
            <Text style={action ? styles.secondary : styles.primary}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tip: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: R_INNER,
    backgroundColor: "rgba(59,130,246,0.1)",
    borderWidth: 1,
    borderColor: "rgba(122,176,255,0.25)",
  },
  text: { color: C.text, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: "row", gap: 18, marginTop: 8 },
  primary: { color: C.highlight, fontSize: 14, fontWeight: "600" },
  secondary: { color: C.muted, fontSize: 14 },
});
