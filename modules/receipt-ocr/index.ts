import { requireOptionalNativeModule } from "expo";
import { blocksToLines, type TextBlock } from "./src/rows";

export { blocksToLines, type TextBlock } from "./src/rows";

type ReceiptOcrNative = {
  isSupported: boolean;
  /** Absent in builds made before the document camera was added. */
  canScanDocuments?: boolean;
  recognize(path: string): Promise<TextBlock[]>;
  scanDocument?(): Promise<TextBlock[][]>;
  /** Absent in builds made before the live scanner was added. */
  canScanLive?(): Promise<boolean>;
  startLiveScan?(): Promise<void>;
  stopLiveScan?(): Promise<void>;
  addListener?(event: string, listener: (e: Record<string, unknown>) => void): { remove(): void };
};

// Optional rather than required: a build made before this module existed
// (or Expo Go) simply reports that it can't read photos, instead of crashing.
const native = requireOptionalNativeModule<ReceiptOcrNative>("ReceiptOcr");

/** Whether this build can read text from photos. */
export const isSupported = Boolean(native?.isSupported);

/** Whether this build has Apple's document camera, which captures by itself. */
export const canScanDocuments = Boolean(native?.canScanDocuments && native.scanDocument);

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

/**
 * Open Apple's document camera: it finds the receipt in view, takes the shot
 * once it's steady, and flattens it. A long receipt can go in as a few pages,
 * read top to bottom. Null when the person closes it without scanning.
 */
export async function scanReceipt(): Promise<string[] | null> {
  if (!native?.scanDocument) throw new Error("This build can't scan documents.");
  const pages = await native.scanDocument();
  if (pages.length === 0) return null;
  return pages.flatMap((blocks) => blocksToLines(blocks));
}

/** Whether this iPhone can read receipts and QR codes live (iOS 16+, recent models). */
export async function canScanLive(): Promise<boolean> {
  if (!native?.canScanLive || !native.startLiveScan || !native.addListener) return false;
  try {
    return await native.canScanLive();
  } catch {
    return false;
  }
}

export type LiveScan = { stop: () => void };

/**
 * Open the live scanner: no shutter, no photo. While it's open, `onLines`
 * gets the receipt text in view (one printed row per entry) about twice a
 * second, and `onCode` gets each QR code it sees. Call `stop()` once there's
 * enough to log; `onClosed` fires however it closes, including the person
 * tapping Close.
 */
export function startLiveScan(handlers: {
  onLines: (lines: string[]) => void;
  onCode: (data: string) => void;
  onClosed: () => void;
}): LiveScan {
  if (!native?.startLiveScan || !native.addListener) throw new Error("This build can't scan live.");
  const subs = [
    native.addListener("onLiveText", (e) => {
      const blocks = (e.blocks as TextBlock[] | undefined) ?? [];
      if (blocks.length) handlers.onLines(blocksToLines(blocks));
    }),
    native.addListener("onLiveCode", (e) => {
      if (typeof e.data === "string") handlers.onCode(e.data);
    }),
    native.addListener("onLiveClosed", () => {
      subs.forEach((sub) => sub.remove());
      handlers.onClosed();
    }),
  ];
  native.startLiveScan().catch(() => {
    subs.forEach((sub) => sub.remove());
    handlers.onClosed();
  });
  return { stop: () => void native.stopLiveScan?.() };
}
