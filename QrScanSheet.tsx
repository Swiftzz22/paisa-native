import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { C, R } from "./theme";
import { notifyError, tapLight } from "./haptics";
import { parsePaymentQr, type PaymentQr } from "./upiQr";

/**
 * Point the camera at a shop's payment QR and it's read the moment it's in
 * view: no shutter, no photo kept. Only payment codes count; anything else
 * (a menu link, a product barcode) gets a one-line "that's not a payment
 * code" and the camera keeps looking.
 */
export function QrScanSheet({
  visible,
  onScanned,
  onClose,
}: {
  visible: boolean;
  onScanned: (qr: PaymentQr) => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [hint, setHint] = useState<string | null>(null);
  // The camera reports the same code many times a second while it's in view.
  // Only the first payment code counts; a rejected one is ignored until a
  // different code comes along.
  const done = useRef(false);
  const lastRejected = useRef<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    done.current = false;
    lastRejected.current = null;
    setHint(null);
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [visible, permission, requestPermission]);

  function onBarcode(result: BarcodeScanningResult) {
    if (done.current || result.data === lastRejected.current) return;
    const qr = parsePaymentQr(result.data);
    if (!qr) {
      lastRejected.current = result.data;
      notifyError();
      setHint("That isn't a payment QR. Point at the shop's UPI code.");
      return;
    }
    done.current = true;
    tapLight();
    onScanned(qr);
  }

  const denied = permission && !permission.granted && !permission.canAskAgain;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.root}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={visible ? onBarcode : undefined}
          />
        ) : null}

        <SafeAreaView style={styles.overlay} edges={["top", "bottom"]}>
          <View style={styles.top}>
            <Text style={styles.title}>Scan to log</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close scanner">
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
          </View>

          <View style={styles.frameWrap} pointerEvents="none">
            <View style={styles.frame} />
          </View>

          <View style={styles.bottom}>
            {denied ? (
              <>
                <Text style={styles.text}>Camera access is off for paisa.</Text>
                <Pressable onPress={() => void Linking.openSettings()} hitSlop={10}>
                  <Text style={styles.link}>Open Settings</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.text}>
                {hint ?? "Point at the UPI QR you're paying. It logs as soon as it's read."}
              </Text>
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  overlay: { flex: 1, justifyContent: "space-between" },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "700" },
  frameWrap: { alignItems: "center" },
  frame: {
    width: 240,
    height: 240,
    borderRadius: R.card,
    borderWidth: 3,
    borderColor: C.highlight,
  },
  bottom: { alignItems: "center", gap: 8, paddingHorizontal: 32, paddingBottom: 24 },
  text: { color: "#fff", fontSize: 15, textAlign: "center", lineHeight: 21 },
  link: { color: C.highlight, fontSize: 15, fontWeight: "600" },
});
