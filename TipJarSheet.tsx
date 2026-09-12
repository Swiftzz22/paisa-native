import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIAP, finishTransaction, ErrorCode } from "expo-iap";
import { C, R, R_INNER, SPACE } from "./theme";
import { notifyError, notifySuccess, tapLight } from "./haptics";
import { TIP_SKUS, TIP_LABELS, markTipped, type TipSku } from "./tipJar";

/**
 * The tip jar sheet.
 *
 * Opens from Settings and asks for nothing. Every price shown comes from the
 * store rather than from this file, so it is localised and correct in whatever
 * currency the person's App Store account uses.
 *
 * If the store cannot be reached, or the products are not yet approved, the
 * sheet says so plainly instead of showing an empty list — an empty tip jar
 * reads as a broken app, and this is the one screen where that impression
 * costs something.
 */
export function TipJarSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [thanks, setThanks] = useState(false);
  const [buying, setBuying] = useState<TipSku | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const { connected, products, fetchProducts, requestPurchase } = useIAP({
    onPurchaseSuccess: async (purchase) => {
      // Consumable: finishing it is what lets the same tip be given again.
      // Skipping this leaves the transaction open and the store will not sell
      // the product a second time.
      await finishTransaction({ purchase, isConsumable: true });
      await markTipped();
      setBuying(null);
      setThanks(true);
      notifySuccess();
    },
    onPurchaseError: (error) => {
      setBuying(null);
      // Backing out of Apple's sheet is a choice, not a failure.
      if (error.code === ErrorCode.UserCancelled) return;
      notifyError();
      setFailed("That didn't go through. Nothing was charged.");
    },
  });

  useEffect(() => {
    if (connected && visible) {
      void fetchProducts({ skus: [...TIP_SKUS] });
    }
  }, [connected, visible, fetchProducts]);

  // Reset between openings, so a previous thank-you or error doesn't greet
  // someone who came back for an unrelated reason.
  useEffect(() => {
    if (!visible) {
      setThanks(false);
      setFailed(null);
      setBuying(null);
    }
  }, [visible]);

  function buy(sku: TipSku) {
    tapLight();
    setFailed(null);
    setBuying(sku);
    void requestPurchase({
      request: { apple: { sku }, google: { skus: [sku] } },
      type: "in-app",
    });
  }

  // Keep the store's order rather than whatever the network returned.
  const ordered = TIP_SKUS.map((sku) =>
    products.find((p) => p.id === sku)
  ).filter(Boolean) as { id: string; displayPrice?: string }[];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />

          {thanks ? (
            <View style={styles.thanks}>
              <View style={styles.thanksIcon}>
                <Ionicons name="heart" size={28} color={C.red} />
              </View>
              <Text style={styles.title}>Thank you</Text>
              <Text style={styles.body}>
                That genuinely helps keep paisa. running. Nothing about the app
                changes — it was always all yours.
              </Text>
              <Pressable style={styles.primary} onPress={onClose}>
                <Text style={styles.primaryText}>Close</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView bounces={false}>
              <Text style={styles.title}>Tip jar</Text>
              <Text style={styles.body}>
                paisa. is free and stays free. Every feature is already yours —
                there is nothing here to unlock. This is only for anyone who
                wants to help cover what it costs to run.
              </Text>

              {failed ? <Text style={styles.error}>{failed}</Text> : null}

              {!connected || ordered.length === 0 ? (
                <View style={styles.loading}>
                  <ActivityIndicator color={C.accent} />
                  <Text style={styles.loadingText}>
                    {connected
                      ? "Couldn't reach the App Store just now."
                      : "Connecting to the App Store…"}
                  </Text>
                </View>
              ) : (
                <View style={styles.options}>
                  {ordered.map((p) => {
                    const meta = TIP_LABELS[p.id as TipSku];
                    const busy = buying === p.id;
                    return (
                      <Pressable
                        key={p.id}
                        style={({ pressed }) => [
                          styles.option,
                          pressed && { opacity: 0.75 },
                        ]}
                        onPress={() => buy(p.id as TipSku)}
                        disabled={buying !== null}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.optionTitle}>{meta.title}</Text>
                          <Text style={styles.optionBlurb}>{meta.blurb}</Text>
                        </View>
                        {busy ? (
                          <ActivityIndicator color={C.text} />
                        ) : (
                          <Text style={styles.price}>{p.displayPrice}</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <Pressable style={styles.secondary} onPress={onClose}>
                <Text style={styles.secondaryText}>Not now</Text>
              </Pressable>
            </ScrollView>
          )}
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
    maxHeight: "88%",
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
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: C.muted,
    marginTop: 8,
    marginBottom: 20,
  },
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
  loading: { alignItems: "center", gap: 12, paddingVertical: 32 },
  loadingText: { color: C.subtle, fontSize: 13, textAlign: "center" },
  primary: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: R_INNER,
    backgroundColor: C.accent,
    marginTop: 24,
  },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  secondary: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  secondaryText: { color: C.muted, fontSize: 14, fontWeight: "500" },
  thanks: { alignItems: "center", paddingVertical: 16 },
  thanksIcon: {
    width: 64,
    height: 64,
    borderRadius: R.card,
    backgroundColor: C.redBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
});
