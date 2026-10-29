import { requireOptionalNativeModule } from "expo";
import { blocksToLines, type TextBlock } from "./src/rows";

export { blocksToLines, type TextBlock } from "./src/rows";

type ReceiptOcrNative = {
  isSupported: boolean;
  recognize(path: string): Promise<TextBlock[]>;
};

// Optional rather than required: a build made before this module existed
// (or Expo Go) simply reports that it can't read photos, instead of crashing.
const native = requireOptionalNativeModule<ReceiptOcrNative>("ReceiptOcr");

/** Whether this build can read text from photos. */
export const isSupported = Boolean(native?.isSupported);

/**
 * The text on a receipt photo, one printed row per entry, top to bottom.
 * Runs entirely on the phone.
 */
export async function readReceipt(uri: string): Promise<string[]> {
  if (!native) throw new Error("This build can't read text from photos.");
  // The picker hands back a file:// URL, percent-encoded; Vision wants a path.
  const path = decodeURIComponent(uri.replace(/^file:\/\//, ""));
  return blocksToLines(await native.recognize(path));
}
