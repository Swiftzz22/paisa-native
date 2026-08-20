import { useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { C } from "./theme";
import { AuthError, ask } from "./api";
import { tapLight } from "./haptics";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "How much did I spend on food this month?",
  "What are my top merchants?",
  "Am I over budget anywhere?",
];

export function AskScreen({
  token,
  onNeedAuth,
}: {
  token: string;
  onNeedAuth: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    tapLight();
    setInput("");
    const history = messages.slice();
    const next = [...messages, { role: "user" as const, content: message }];
    setMessages(next);
    setBusy(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    try {
      const { answer } = await ask(token, message, history);
      setMessages([...next, { role: "assistant", content: answer }]);
    } catch (e) {
      if (e instanceof AuthError) return onNeedAuth();
      setMessages([
        ...next,
        {
          role: "assistant",
          content:
            e instanceof Error ? e.message : "Something went wrong. Try again.",
        },
      ]);
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  const empty = messages.length === 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Ask paisa</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.messages}
        showsVerticalScrollIndicator={false}
      >
        {empty ? (
          <View style={styles.intro}>
            <View style={styles.introIcon}>
              <Ionicons name="sparkles" size={24} color={C.accent} />
            </View>
            <Text style={styles.introText}>
              Ask anything about your spending. I can read your transactions,
              budgets, and categories.
            </Text>
            <View style={styles.chips}>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} style={styles.chip} onPress={() => send(s)}>
                  <Text style={styles.chipText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          messages.map((m, i) => (
            <View
              key={i}
              style={[styles.bubble, m.role === "user" ? styles.user : styles.assistant]}
            >
              <Text style={m.role === "user" ? styles.userText : styles.assistantText}>
                {m.content}
              </Text>
            </View>
          ))
        )}
        {busy ? (
          <View style={[styles.bubble, styles.assistant, styles.thinking]}>
            <ActivityIndicator color={C.muted} size="small" />
            <Text style={styles.thinkingText}>Thinking…</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Ask about your spending…"
          placeholderTextColor={C.subtle}
          value={input}
          onChangeText={setInput}
          editable={!busy}
          onSubmitEditing={() => send()}
          returnKeyType="send"
        />
        <Pressable
          style={[styles.sendBtn, (!input.trim() || busy) && styles.sendDisabled]}
          onPress={() => send()}
          disabled={!input.trim() || busy}
        >
          <Ionicons name="arrow-up" size={20} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 18, paddingVertical: 10 },
  title: { fontSize: 24, fontWeight: "700", color: C.text },
  messages: { paddingHorizontal: 18, paddingBottom: 16, gap: 10 },
  intro: { alignItems: "center", paddingTop: 40, paddingHorizontal: 10 },
  introIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: C.card,
    borderWidth: 0.5,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  introText: {
    color: C.muted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  chips: { gap: 10, alignSelf: "stretch" },
  chip: {
    backgroundColor: C.card,
    borderWidth: 0.5,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  chipText: { color: C.text, fontSize: 13 },
  bubble: { maxWidth: "85%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  user: { alignSelf: "flex-end", backgroundColor: C.accent },
  assistant: {
    alignSelf: "flex-start",
    backgroundColor: C.card,
    borderWidth: 0.5,
    borderColor: C.border,
  },
  userText: { color: "#fff", fontSize: 14, lineHeight: 20 },
  assistantText: { color: C.text, fontSize: 14, lineHeight: 20 },
  thinking: { flexDirection: "row", alignItems: "center", gap: 8 },
  thinkingText: { color: C.muted, fontSize: 13 },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 0.5,
    borderTopColor: C.border,
  },
  input: {
    flex: 1,
    backgroundColor: C.card,
    borderWidth: 0.5,
    borderColor: C.border,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: C.text,
    fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { opacity: 0.4 },
});
