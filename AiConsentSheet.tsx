import { useEffect, useRef, useState } from "react";
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, R, R_INNER, SPACE } from "./theme";
import { API_BASE } from "./api";
import { onRequestAiConsent } from "./aiConsent";
import { tapLight } from "./haptics";

/**
 * The one place paisa. asks before sending anything to an AI service.
 *
 * Names each provider and what goes to it, because Guideline 5.1.2(i) rejects
 * "powered by AI" and rejects consent buried in a policy. Mounted once at the
 * root; any screen reaches it through requestAiConsent().
 */

const FLOWS: { icon: string; title: string; detail: string }[] = [
  {
    icon: "document-text-outline",
    title: "Statements you upload",
    detail:
      "The file's contents go to Google (Gemini) and NVIDIA, to pull out each transaction.",
  },
  {
    icon: "mail-outline",
    title: "Bank alert emails",
    detail:
      "If you connect a mailbox, the text of each bank or UPI alert goes to NVIDIA, to read the amount, merchant and category.",
  },
  {
    icon: "sparkles-outline",
    title: "Questions in Ask",
    detail:
      "Your question, and the transactions needed to answer it, go to NVIDIA.",
  },
];

export function AiConsentSheet() {
  const [visible, setVisible] = useState(false);
  const resolver = useRef<((allowed: boolean) => void) | null>(null);
  const pending = useRef<boolean | null>(null);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onRequestAiConsent(
      () =>
        new Promise<boolean>((resolve) => {
          resolver.current = resolve;
          setVisible(true);
        })
    );
    return () => onRequestAiConsent(null);
  }, []);

  /**
   * Hand the answer back only once the sheet has finished closing.
   *
   * "Allow" is followed at once by the file picker or Google's sign-in sheet.
   * iOS will not present a new screen while this one is still animating away
   * — it fails silently — so resolving on tap left "Upload a statement" doing
   * nothing after Allow. onDismiss fires when the dismissal has completed; the
   * timer covers the case where it never does.
   */
  function settle() {
    if (fallback.current) clearTimeout(fallback.current);
    fallback.current = null;
    const allowed = pending.current;
    pending.current = null;
    if (allowed === null) return;
    resolver.current?.(allowed);
    resolver.current = null;
  }

  function answer(allowed: boolean) {
    if (pending.current !== null) return;
    tapLight();
    pending.current = allowed;
    setVisible(false);
    fallback.current = setTimeout(settle, 700);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={() => answer(false)}
      onDismiss={settle}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <ScrollView bounces={false}>
            <Text style={styles.title}>Before paisa. uses AI</Text>
            <Text style={styles.body}>
              Reading statements and bank alerts, and answering your questions,
              needs AI services run by other companies. This is what would be
              sent, and to whom:
            </Text>

            <View style={styles.flows}>
              {FLOWS.map((f) => (
                <View key={f.title} style={styles.flow}>
                  <Ionicons name={f.icon as never} size={20} color={C.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.flowTitle}>{f.title}</Text>
                    <Text style={styles.flowDetail}>{f.detail}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Text style={styles.note}>
              They use it to return a result to paisa. It is never sold or used
              for advertising. You can turn this off any time in Settings, and
              without it you can still add, edit and view transactions by hand.
            </Text>

            <Pressable
              onPress={() => Linking.openURL(`${API_BASE}/privacy`)}
              hitSlop={8}
            >
              <Text style={styles.link}>Read the privacy policy</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.allow, pressed && { opacity: 0.85 }]}
              onPress={() => answer(true)}
            >
              <Text style={styles.allowText}>Allow</Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={() => answer(false)}>
              <Text style={styles.secondaryText}>Not now</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "90%",
    backgroundColor: C.bg,
    borderTopLeftRadius: R.card,
    borderTopRightRadius: R.card,
    borderWidth: 0.5,
    borderColor: C.border,
    paddingHorizontal: SPACE.card,
    paddingTop: 8,
    paddingBottom: 28,
  },
  grab: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: R.pill,
    backgroundColor: C.border,
    marginBottom: 18,
  },
  title: { fontSize: 24, fontWeight: "700", color: C.text },
  body: { fontSize: 14, lineHeight: 21, color: C.muted, marginTop: 8 },
  flows: { gap: 14, marginTop: 20, marginBottom: 18 },
  flow: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    backgroundColor: C.card,
    borderWidth: 0.5,
    borderColor: C.border,
    borderRadius: R_INNER,
  },
  flowTitle: { fontSize: 14, fontWeight: "600", color: C.text },
  flowDetail: { fontSize: 13, lineHeight: 19, color: C.muted, marginTop: 3 },
  note: { fontSize: 12, lineHeight: 18, color: C.subtle },
  link: {
    color: C.muted,
    fontSize: 12,
    textDecorationLine: "underline",
    marginTop: 10,
  },
  allow: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: R.control,
    backgroundColor: C.accent,
    marginTop: 20,
  },
  allowText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  secondary: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  secondaryText: { color: C.muted, fontSize: 14, fontWeight: "500" },
});
