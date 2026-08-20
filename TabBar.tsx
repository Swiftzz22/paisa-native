import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { C } from "./theme";
import { tapLight, tapSelection } from "./haptics";

export type TabKey = "home" | "activity" | "ask" | "settings";

const TABS: { key: TabKey; icon: string; label: string }[] = [
  { key: "home", icon: "home", label: "Home" },
  { key: "activity", icon: "receipt-outline", label: "Activity" },
  { key: "ask", icon: "chatbubble-outline", label: "Ask" },
  { key: "settings", icon: "settings-outline", label: "Settings" },
];

export function TabBar({
  active,
  onTab,
  onAdd,
}: {
  active: TabKey;
  onTab: (t: TabKey) => void;
  onAdd: () => void;
}) {
  const [left, right] = [TABS.slice(0, 2), TABS.slice(2)];
  const press = (k: TabKey) => {
    if (k !== active) tapSelection();
    onTab(k);
  };
  const add = () => {
    tapLight();
    onAdd();
  };
  return (
    <View style={styles.bar}>
      {left.map((t) => (
        <TabItem
          key={t.key}
          icon={t.icon}
          label={t.label}
          active={active === t.key}
          onPress={() => press(t.key)}
        />
      ))}
      <Pressable style={styles.fab} onPress={add} hitSlop={8}>
        <Ionicons name="add" size={26} color="#fff" />
      </Pressable>
      {right.map((t) => (
        <TabItem
          key={t.key}
          icon={t.icon}
          label={t.label}
          active={active === t.key}
          onPress={() => press(t.key)}
        />
      ))}
    </View>
  );
}

function TabItem({
  icon,
  label,
  active,
  onPress,
}: {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.tab} onPress={onPress} hitSlop={8}>
      <Ionicons name={icon as never} size={22} color={active ? C.text : C.subtle} />
      <Text style={[styles.tabLabel, { color: active ? C.text : C.subtle }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    borderTopWidth: 0.5,
    borderTopColor: C.border,
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: C.bg,
  },
  tab: { alignItems: "center", gap: 3, flex: 1 },
  tabLabel: { fontSize: 10 },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
});
