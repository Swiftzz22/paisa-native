import * as DocumentPicker from "expo-document-picker";
import { Alert } from "react-native";
import { importStatement, AuthError, PaywallError } from "./api";
import { notifyError, notifySuccess } from "./haptics";

/**
 * Pick a statement file and import it.
 *
 * Covers the case automatic capture cannot: a bank paisa. does not recognise,
 * an account on an email provider it cannot read, or history from before the
 * app existed. CSV, spreadsheet and PDF all go through the same importer.
 *
 * Returns true when something was actually added, so the caller can refresh.
 */
export async function pickAndImportStatement(
  token: string,
  onNeedAuth: () => void
): Promise<boolean> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: [
      "text/csv",
      "text/comma-separated-values",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/pdf",
      "text/plain",
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (picked.canceled || !picked.assets?.length) return false;
  const file = picked.assets[0];

  try {
    const result = await importStatement(token, {
      uri: file.uri,
      name: file.name,
      mimeType: file.mimeType,
    });

    if (result.added === 0 && result.duplicates > 0) {
      // Worth saying plainly — an import that adds nothing looks broken
      // otherwise, when in fact it did its job.
      notifySuccess();
      Alert.alert(
        "Already up to date",
        `All ${result.duplicates} transactions in that file were already here.`
      );
      return false;
    }
    if (result.added === 0) {
      notifyError();
      Alert.alert(
        "Nothing to import",
        "No transactions were found in that file. Check it's a statement export rather than a summary."
      );
      return false;
    }

    notifySuccess();
    const dupes =
      result.duplicates > 0 ? ` ${result.duplicates} were already here.` : "";
    Alert.alert(
      "Imported",
      `Added ${result.added} transaction${result.added === 1 ? "" : "s"}.${dupes}`
    );
    return true;
  } catch (e) {
    if (e instanceof AuthError) {
      onNeedAuth();
      return false;
    }
    // The paywall sheet is already up; a second alert on top of it would just
    // be the same refusal twice.
    if (e instanceof PaywallError) return false;
    notifyError();
    Alert.alert(
      "Couldn't import that",
      e instanceof Error ? e.message : "Please try again."
    );
    return false;
  }
}
