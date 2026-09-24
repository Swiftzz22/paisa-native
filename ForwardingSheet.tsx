import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, R, R_INNER, SPACE } from "./theme";
import { notifyError, notifySuccess, tapLight } from "./haptics";
import { API_BASE, fetchForwardingAddress, type Forwarding } from "./api";

/**
 * Setting up forwarding, on the phone.
 *
 * The web had this first and the app only handed over the address, which left
 * the actual work — the confirmation code, the filter — somewhere most people
 * were never going to look. The three things that decide whether forwarding
 * works are here in the order they are needed.
 *
 * Sharing rather than copying throughout: a clipboard library is a native
 * module, and a native module means a new build rather than an update that
 * reaches phones today. The iOS share sheet has Copy in it.
 */
export function ForwardingSheet({
  visible,
  onClose,
  token,
}: {
  visible: boolean;
  onClose: () => void;
  token: string;
}) {
  const [data, setData] = useState<Forwarding | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchForwardingAddress(token));
    } catch {
      setData(null);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  async function share(value: string, what: string) {
    tapLight();
    try {
      await Share.share({ message: value });
      notifySuccess();
    } catch {
      notifyError();
      Alert.alert(`Couldn't share your ${what}`, "Please try again.");
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <ScrollView bounces={false}>
            <Text style={styles.title}>Forward bank alerts</Text>
            <Text style={styles.body}>
              Send your bank&rsquo;s emails to paisa. yourself. paisa. never
              holds access to your mailbox — it only sees what you forward.
            </Text>

            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={C.accent} />
              </View>
            ) : !data?.address ? (
              <Text style={styles.unavailable}>
                Not available yet — forwarding isn&rsquo;t switched on for this
                account.
              </Text>
            ) : (
              <>
                {/* Gmail forwards nowhere until this is entered, and the mail
                    carrying it arrives in paisa. rather than their own inbox —
                    so the obvious place to look is the wrong one. */}
                {data.pendingCode ? (
                  <View style={styles.codeBox}>
                    <Text style={styles.codeLabel}>
                      Gmail is waiting for this code
                    </Text>
                    <Text style={styles.code}>{data.pendingCode}</Text>
                    <Text style={styles.codeHint}>
                      Enter it in Gmail → Settings → Forwarding and POP/IMAP,
                      next to the address you added, then press Verify.
                    </Text>
                  </View>
                ) : null}

                <Step n={1} title="Your private address" />
                <Pressable
                  style={styles.valueRow}
                  onPress={() => share(data.address!, "address")}
                >
                  <Text style={styles.value} numberOfLines={1}>
                    {data.address}
                  </Text>
                  <Ionicons name="share-outline" size={16} color={C.subtle} />
                </Pressable>
                <Text style={styles.hint}>
                  In Gmail: Settings → Forwarding and POP/IMAP → Add a
                  forwarding address → paste this. The code Gmail sends appears
                  at the top of this screen.
                </Text>

                <Step n={2} title="The filter" />
                <Pressable
                  style={styles.valueRow}
                  onPress={() => share(data.filter, "filter")}
                >
                  <Text style={styles.value} numberOfLines={2}>
                    {data.filter}
                  </Text>
                  <Ionicons name="share-outline" size={16} color={C.subtle} />
                </Pressable>
                <Text style={styles.hint}>
                  Paste into Gmail&rsquo;s search box, press Enter, then the
                  filter icon → Forward it to → your address. It covers every
                  Indian bank, card, UPI app and wallet paisa. can read.
                </Text>

                <Step n={3} title="Is it working" />
                <Text style={styles.statusText}>
                  {data.lastReceivedAt
                    ? `Last alert ${relative(data.lastReceivedAt)}${
                        data.recentCount > 0
                          ? ` · ${data.recentCount} in the last 7 days`
                          : ""
                      }`
                    : "No forwarded mail yet. A new filter never forwards mail you already had — the next alert your bank sends should arrive within a minute."}
                </Text>

                <Pressable
                  style={styles.secondary}
                  onPress={() => Linking.openURL(`${API_BASE}/settings/email`)}
                >
                  <Text style={styles.secondaryText}>Open on the web</Text>
                </Pressable>
              </>
            )}

            <Pressable style={styles.secondary} onPress={onClose}>
              <Text style={styles.secondaryText}>Done</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <Text style={styles.step}>
      Step {n} · {title}
    </Text>
  );
}

/** "4 minutes ago" — precise enough for "did my filter work". */
function relative(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
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
  title: { fontSize: 22, fontWeight: "700", color: C.text },
  body: { fontSize: 14, lineHeight: 21, color: C.muted, marginTop: 8 },
  loading: { alignItems: "center", paddingVertical: 32 },
  unavailable: { color: C.subtle, fontSize: 13, marginTop: 20 },
  codeBox: {
    marginTop: 20,
    padding: 14,
    borderRadius: R_INNER,
    backgroundColor: C.card,
    borderWidth: 0.5,
    borderColor: C.accent,
  },
  codeLabel: { color: C.text, fontSize: 13, fontWeight: "600" },
  code: {
    color: C.accent,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: 2,
    marginTop: 8,
  },
  codeHint: { color: C.subtle, fontSize: 12, lineHeight: 17, marginTop: 8 },
  step: {
    color: C.subtle,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 22,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
    padding: 12,
    borderRadius: R_INNER,
    backgroundColor: C.card,
    borderWidth: 0.5,
    borderColor: C.border,
  },
  value: { flex: 1, color: C.text, fontSize: 12, fontFamily: "Menlo" },
  hint: { color: C.subtle, fontSize: 12, lineHeight: 17, marginTop: 6 },
  statusText: { color: C.text, fontSize: 13, lineHeight: 19, marginTop: 8 },
  secondary: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 10 },
  secondaryText: { color: C.muted, fontSize: 14, fontWeight: "500" },
});
