import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { C } from "./theme";
import { tapSelection } from "./haptics";

type Item<T extends string> = { key: T; label: string };

/**
 * iOS-style segmented control whose highlight slides between options.
 *
 * Options are given a shared minimum width so every one measures the same,
 * which lets the indicator move with translateX alone — on the native driver,
 * and without the stretched corners that scaling a rounded box would produce.
 */
export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
}: {
  items: Item<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  const [itemWidth, setItemWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const settled = useRef(false);

  const index = Math.max(
    0,
    items.findIndex((i) => i.key === value)
  );

  useEffect(() => {
    if (itemWidth === 0) return;
    const to = index * itemWidth;
    // Snap into position once geometry is known; animate every move after.
    if (!settled.current) {
      settled.current = true;
      x.setValue(to);
      return;
    }
    Animated.spring(x, {
      toValue: to,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
  }, [index, itemWidth, x]);

  const onItemLayout = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    if (width > 0 && width !== itemWidth) setItemWidth(width);
  };

  return (
    <View style={styles.track}>
      {itemWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            { width: itemWidth, transform: [{ translateX: x }] },
          ]}
        />
      ) : null}

      {items.map((it) => {
        const active = it.key === value;
        return (
          <Pressable
            key={it.key}
            onLayout={onItemLayout}
            hitSlop={6}
            onPress={() => {
              if (!active) {
                tapSelection();
                onChange(it.key);
              }
            }}
            style={({ pressed }) => [
              styles.item,
              pressed && !active && { opacity: 0.6 },
            ]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {it.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    backgroundColor: C.card,
    borderRadius: 10,
    padding: 3,
  },
  indicator: {
    position: "absolute",
    top: 3,
    bottom: 3,
    left: 3,
    backgroundColor: C.accent,
    borderRadius: 8,
  },
  item: {
    // Equal widths keep the sliding indicator honest across labels of
    // different lengths ("Day" vs "Month").
    minWidth: 52,
    alignItems: "center",
    paddingVertical: 5,
    borderRadius: 8,
  },
  label: { fontSize: 12, color: C.muted, fontWeight: "500" },
  labelActive: { color: "#fff" },
});
