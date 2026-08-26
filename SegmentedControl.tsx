import { Pressable, StyleSheet, Text, View } from "react-native";
import { C } from "./theme";
import { tapSelection } from "./haptics";

type Item<T extends string> = { key: T; label: string };

/**
 * Period picker: one distinct box per option.
 *
 * An earlier version merged them into a single track with a highlight that slid
 * between them. That read as one control rather than four choices, so this is
 * back to separate boxes — each visibly its own tappable thing.
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
  return (
    <View style={styles.row}>
      {items.map((it) => {
        const active = it.key === value;
        return (
          <Pressable
            key={it.key}
            hitSlop={6}
            onPress={() => {
              if (active) return;
              tapSelection();
              onChange(it.key);
            }}
            style={({ pressed }) => [
              styles.box,
              active && styles.boxActive,
              pressed && !active && styles.boxPressed,
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
  row: { flexDirection: "row", gap: 6 },
  box: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 0.5,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  boxActive: { backgroundColor: C.accent, borderColor: C.accent },
  boxPressed: { backgroundColor: C.card2 },
  label: { fontSize: 12, color: C.muted, fontWeight: "500" },
  labelActive: { color: "#fff", fontWeight: "600" },
});
