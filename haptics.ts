import * as Haptics from "expo-haptics";

// Thin, fire-and-forget wrappers — haptics should never block or throw into UI.
export const tapLight = () =>
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

export const tapSelection = () => Haptics.selectionAsync().catch(() => {});

export const notifySuccess = () =>
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

export const notifyError = () =>
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
