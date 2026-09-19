import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { notifyError, notifySuccess, tapLight } from "./haptics";
import { API_BASE } from "./api";
import {
  buyPlus,
  loadOffers,
  restorePlus,
  isPlusConfigured,
  type PlusOffer,
} from "./plus";

/**
 * The paywall.
 *
 * Opened from Settings, and from anywhere the server answers 402 — which is
 * the point of the `paywall` flag on those responses: the refusal and the
 * offer arrive together, at the moment someone actually wanted the thing.
 *
 * What is listed is what costs money to run. Saying so plainly is not
 * self-deprecation, it is the honest reason the line falls where it does, and
 * it reads far better than a feature grid implying the free app is crippled.
 */

const INCLUDED: { icon: string; text: string }[] = [
  { icon: "mail-outline", text: "Automatic sync from your bank emails" },
  { icon: "document-text-outline", text: "Unlimited statement imports" },
  { icon: "sparkles-outline", text: "Unlimited questions in Ask" },
];

export function PlusSheet({
  visible,
  onClose,
  onPurchased,
  /** Shown above the offers when a specific refusal opened this. */
  reason,
}: {
  visible: boolean;
  onClose: () => void;
  onPurchased: () => void;
  reason?: string | null;
}) {
  const [offers, setOffers] = useState<PlusOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setOffers(await loadOffers());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (visible) void load();
    else {
      setFailed(null);
      setBusy(null);
    }
  }, [visible, load]);

  async function buy(offer: PlusOffer) {
    tapLight();
    setFailed(null);
    setBusy(offer.pkg.identifier);
    const res = await buyPlus(offer.pkg);
    setBusy(null);
    if (res.ok) {
      notifySuccess();
      onPurchased();
      return;
    }
    if (res.cancelled) return;
    notifyError();
    setFailed(res.message);
  }

  async function restore() {
    tapLight();
    setFailed(null);
    setBusy("restore");
    const ok = await restorePlus();
    setBusy(null);
    if (ok) {
      notifySuccess();
      onPurchased();
      return;
    }
    setFailed("Nothing to restore on this Apple ID.");
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <ScrollView bounces={false}>
            <Text style={styles.title}>
              paisa<Text style={{ color: C.accent }}>. plus</Text>
            </Text>

            {reason ? (
              <Text style={styles.reason}>{reason}</Text>
            ) : (
              <Text style={styles.body}>
                Everything you can see stays free. Plus covers the three things
                that cost money to run — the ones where a computer reads for you.
              </Text>
            )}

            <View style={styles.included}>
              {INCLUDED.map((f) => (
                <View key={f.text} style={styles.feature}>
                  <Ionicons name={f.icon as never} size={18} color={C.accent} />
                  <Text style={styles.featureText}>{f.text}</Text>
                </View>
              ))}
            </View>

            {failed ? <Text style={styles.error}>{failed}</Text> : null}

            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={C.accent} />
              </View>
            ) : offers.length === 0 ? (
              <View style={styles.loading}>
                <Text style={styles.loadingText}>
                  {isPlusConfigured()
                    ? "Couldn't reach the App Store just now. Please try again."
                    : "Plus isn't available yet."}
                </Text>
              </View>
            ) : (
              <View style={styles.options}>
                {offers.map((o) => (
                  <Pressable
                    key={o.pkg.identifier}
                    style={({ pressed }) => [styles.option, pressed && { opacity: 0.75 }]}
                    onPress={() => buy(o)}
                    disabled={busy !== null}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optionTitle}>{o.title}</Text>
                      <Text style={styles.optionBlurb}>{o.blurb}</Text>
                    </View>
                    {busy === o.pkg.identifier ? (
                      <ActivityIndicator color={C.text} />
                    ) : (
                      <Text style={styles.price}>
                        {o.price}
                        <Text style={styles.per}>{perPeriod(o.pkg.packageType)}</Text>
                      </Text>
                    )}
                  </Pressable>
                ))}
              </View>
            )}

            {/* Guideline 3.1.2 wants this at the point of purchase: that it
                renews on its own, how to stop it, and working links to the
                terms and privacy policy. Missing it is among the most common
                reasons a first subscription is rejected — and it is also just
                what someone deserves to know before they are charged again. */}
            <Text style={styles.legal}>
              Payment is charged to your Apple ID when you confirm. Plus renews
              automatically at the same price unless you cancel at least 24 hours
              before the end of the current period. Manage or cancel any time in
              iPhone Settings › your name › Subscriptions.
            </Text>
            <View style={styles.legalLinks}>
              <Pressable onPress={() => Linking.openURL(`${API_BASE}/terms`)} hitSlop={8}>
                <Text style={styles.link}>Terms of Use</Text>
              </Pressable>
              <Text style={styles.legalDot}>·</Text>
              <Pressable onPress={() => Linking.openURL(`${API_BASE}/privacy`)} hitSlop={8}>
                <Text style={styles.link}>Privacy Policy</Text>
              </Pressable>
            </View>

            {/* Required by App Review, and genuinely needed: a new phone or a
                reinstall arrives with nothing. */}
            <Pressable style={styles.secondary} onPress={restore} disabled={busy !== null}>
              <Text style={styles.secondaryText}>
                {busy === "restore" ? "Checking…" : "Restore purchases"}
              </Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={onClose}>
              <Text style={styles.secondaryText}>Not now</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** " / year" — so the price never reads without the length it buys. */
function perPeriod(packageType: string): string {
  switch (packageType) {
    case "ANNUAL":
      return " / year";
    case "MONTHLY":
      return " / month";
    case "SIX_MONTH":
      return " / 6 months";
    case "THREE_MONTH":
      return " / 3 months";
    default:
      return "";
  }
}

const styles = StyleSheet.create({
  per: { fontSize: 12, fontWeight: "500", color: C.subtle },
  legal: { fontSize: 11, lineHeight: 16, color: C.subtle, marginTop: 18 },
  legalLinks: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
  },
  legalDot: { color: C.subtle, fontSize: 12 },
  link: { color: C.muted, fontSize: 12, textDecorationLine: "underline" },
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
  title: { fontSize: 26, fontWeight: "700", color: C.text },
  body: { fontSize: 14, lineHeight: 21, color: C.muted, marginTop: 8 },
  reason: { fontSize: 14, lineHeight: 21, color: C.text, marginTop: 10 },
  included: { gap: 12, marginTop: 22, marginBottom: 24 },
  feature: { flexDirection: "row", alignItems: "center", gap: 12 },
  featureText: { flex: 1, fontSize: 14, color: C.text },
  error: { color: C.red, fontSize: 13, marginBottom: 14 },
  options: { gap: 10 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 68,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: C.card,
    borderWidth: 0.5,
    borderColor: C.border,
    borderRadius: R_INNER,
  },
  optionTitle: { fontSize: 15, fontWeight: "600", color: C.text },
  optionBlurb: { fontSize: 12, color: C.subtle, marginTop: 2 },
  price: { fontSize: 16, fontWeight: "700", color: C.accent },
  loading: { alignItems: "center", gap: 12, paddingVertical: 28 },
  loadingText: { color: C.subtle, fontSize: 13, textAlign: "center" },
  secondary: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 8 },
  secondaryText: { color: C.muted, fontSize: 14, fontWeight: "500" },
});
