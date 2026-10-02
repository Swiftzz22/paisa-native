import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, AppState, StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { C } from "./theme";
import {
  AuthError,
  PaywallError,
  clearToken,
  fetchTransactions,
  getToken,
  syncNow,
  HISTORY_LIMIT,
  type Dashboard,
  type SyncResult,
  type Txn,
} from "./api";
import {
  authenticate,
  type AuthOutcome,
  hasSeenIntro,
  markIntroSeen,
  markSynced,
  shouldLock,
  syncedRecently,
} from "./biometrics";
import * as Updates from "expo-updates";
import { ConnectScreen } from "./ConnectScreen";
import { WelcomeScreen } from "./WelcomeScreen";
import { LockScreen } from "./LockScreen";
import { FadeIn } from "./FadeIn";
import { DashboardScreen } from "./DashboardScreen";
import { TransactionsScreen } from "./TransactionsScreen";
import { AskScreen } from "./AskScreen";
import { SettingsScreen } from "./SettingsScreen";
import { TransactionModal } from "./TransactionModal";
import { FlowDetailScreen, type Flow } from "./FlowDetailScreen";
import { TabBar, type TabKey } from "./TabBar";
import { PlusSheet } from "./PlusSheet";
import { onShowPaywall } from "./paywallBus";
import { AiConsentSheet } from "./AiConsentSheet";
import { clearAiConsent, hasAiConsent } from "./aiConsent";
import { initPlus, resetPlus } from "./plus";

/** How long the app can be backgrounded before it re-locks. */
const LOCK_GRACE_MS = 60_000;

/** Window after a successful unlock during which re-locking is refused. */
const RELOCK_SUPPRESS_MS = 3_000;

type Phase =
  | { kind: "booting" }
  | { kind: "intro" }
  | { kind: "connect" }
  | { kind: "main"; token: string };

export default function App() {
  const [state, setState] = useState<Phase>({ kind: "booting" });

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) return setState({ kind: "main", token });
      // Explain what paisa. is before asking anyone to sign in to it.
      setState((await hasSeenIntro()) ? { kind: "connect" } : { kind: "intro" });
    })();
  }, []);

  // Fetch and apply an update on launch.
  //
  // The comment that used to sit here said auto-updates "start working once
  // this ships as a real build" — true, and then nothing was ever added to do
  // it. Expo's own background check applies an update on the launch *after* the
  // one that downloads it, so getting a fix onto a device meant opening the app
  // twice with a pause in between and no way to tell whether it had worked.
  // That silence cost several rounds of debugging fixes that were never
  // actually running on the phone.
  //
  // Every call here is a no-op in Expo Go and in dev, where `Updates.isEnabled`
  // is false — which is why the old note was right that a check would have been
  // dead code back then, and why this one is guarded rather than removed.
  useEffect(() => {
    if (!Updates.isEnabled) return;
    let alive = true;
    (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (!alive || !check.isAvailable) return;
        await Updates.fetchUpdateAsync();
        if (!alive) return;
        // Restart straight into it. Waiting for the next launch is what made
        // this invisible; a reload one second after opening reads as the app
        // simply starting.
        await Updates.reloadAsync();
      } catch {
        // Offline, or the server had nothing. Neither is worth interrupting
        // someone over — the app they already have works.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const goConnect = useCallback(() => setState({ kind: "connect" }), []);
  const onConnected = useCallback(async () => {
    const t = await getToken();
    setState(t ? { kind: "main", token: t } : { kind: "connect" });
  }, []);

  if (state.kind === "booting") {
    return (
      <SafeAreaProvider>
        <View style={styles.boot}>
          <ActivityIndicator color={C.accent} />
        </View>
      </SafeAreaProvider>
    );
  }

  if (state.kind === "intro") {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <WelcomeScreen
          onDone={() => {
            markIntroSeen();
            setState({ kind: "connect" });
          }}
        />
      </SafeAreaProvider>
    );
  }

  if (state.kind === "connect") {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <ConnectScreen onConnected={onConnected} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <BiometricGate>
        <MainShell token={state.token} onSignOut={goConnect} />
      </BiometricGate>
    </SafeAreaProvider>
  );
}

/**
 * Gates its children behind Face ID / Touch ID. Locks on launch and whenever
 * the app returns from the background (so a grabbed phone stays private). No-op
 * when biometrics aren't available or the user turned the lock off in Settings.
 */
function BiometricGate({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState<boolean | null>(null);
  const authing = useRef(false);
  const appState = useRef(AppState.currentState);
  const leftAt = useRef<number | null>(null);
  const unlockedAt = useRef(0);

  useEffect(() => {
    shouldLock().then((lock) => setLocked(lock));
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const prev = appState.current;
      appState.current = next;
      // Ignore the background/active flicker caused by the auth prompt itself.
      if (authing.current) return;
      if (next.match(/inactive|background/)) {
        if (leftAt.current === null) leftAt.current = Date.now();
        return;
      }
      if (next === "active" && prev.match(/inactive|background/)) {
        const left = leftAt.current;
        leftAt.current = null;
        // No recorded departure means the app never actually went away: the
        // transition came from the passcode sheet closing. Reading that as an
        // infinite absence re-locked the app the instant it unlocked, so a
        // correct passcode looked like it had failed on the first try.
        if (left === null) return;
        // Only re-lock after a real absence. Without this, glancing at a
        // notification or the app switcher re-prompts on every return.
        if (Date.now() - left < LOCK_GRACE_MS) return;
        // A late event from the auth sheet can still arrive after `authing`
        // clears, so never re-lock right on the heels of a successful unlock.
        if (Date.now() - unlockedAt.current < RELOCK_SUPPRESS_MS) return;
        shouldLock().then((lock) => {
          if (lock) setLocked(true);
        });
      }
    });
    return () => sub.remove();
  }, []);

  const unlock = useCallback(async (): Promise<AuthOutcome> => {
    // A second prompt while one is already up is rejected by iOS as a failure,
    // so report the in-flight attempt as a cancel rather than an error.
    if (authing.current) return { status: "cancelled" };
    authing.current = true;
    try {
      const outcome = await authenticate();
      if (outcome.status === "ok") {
        unlockedAt.current = Date.now();
        leftAt.current = null;
        setLocked(false);
      }
      return outcome;
    } finally {
      // Keep the guard up briefly so the return-from-prompt event is ignored.
      setTimeout(() => {
        authing.current = false;
      }, 600);
    }
  }, []);

  const skipLock = useCallback(() => {
    unlockedAt.current = Date.now();
    leftAt.current = null;
    setLocked(false);
  }, []);

  if (locked === null) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }
  if (locked) return <LockScreen onUnlock={unlock} onSkipLock={skipLock} />;
  return <>{children}</>;
}

function MainShell({ token, onSignOut }: { token: string; onSignOut: () => void }) {
  const [tab, setTab] = useState<TabKey>("home");
  // Screens mount on first visit and then stay mounted. Rendering only the
  // active tab tore the others down on every switch, so Activity refetched and
  // flashed a spinner each time, Home refetched its dashboard and insights, and
  // Ask lost the whole conversation.
  const [visited, setVisited] = useState<Set<TabKey>>(() => new Set(["home"]));

  // The paywall lives here, at the root, because a 402 can come from a
  // statement import buried in a helper, from Ask, or from anywhere else —
  // screens that share no ancestor worth threading a callback through.
  const [paywall, setPaywall] = useState<string | null>(null);
  useEffect(() => {
    onShowPaywall((reason) => setPaywall(reason));
    return () => onShowPaywall(null);
  }, []);

  useEffect(() => {
    setVisited((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  }, [tab]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Txn | null>(null);
  const [version, setVersion] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [user, setUser] = useState<Dashboard["user"] | null>(null);

  // Tell RevenueCat who this is, using our own user id, so the purchase
  // webhook can find the row without a mapping table — and so a subscription
  // follows the account rather than the phone that bought it.
  useEffect(() => {
    if (user?.id) void initPlus(user.id);
  }, [user?.id]);
  const [flow, setFlow] = useState<Flow | null>(null);

  // History lives here rather than inside Activity so the spend/income
  // drill-downs can read the same rows without a second fetch.
  const [txns, setTxns] = useState<Txn[]>([]);
  const [txnsCursor, setTxnsCursor] = useState<string | null>(null);
  const [txnsLoading, setTxnsLoading] = useState(true);
  const [txnsMore, setTxnsMore] = useState(false);
  const [txnsError, setTxnsError] = useState<string | null>(null);

  const openAdd = useCallback(() => {
    setEditing(null);
    setModalOpen(true);
  }, []);
  const openEdit = useCallback((t: Txn) => {
    setEditing(t);
    setModalOpen(true);
  }, []);

  const signOut = useCallback(async () => {
    // Forget the account with RevenueCat too, so the next person to sign in on
    // this phone is not offered — or granted — someone else's subscription.
    await resetPlus();
    await clearToken();
    // A second person signing in on this phone is asked for themselves.
    await clearAiConsent();
    onSignOut();
  }, [onSignOut]);

  // Pull the latest bank emails and, if anything new landed, refresh the
  // on-screen data by bumping `version`.
  const sync = useCallback(async () => {
    // Syncing reads new bank mail with NVIDIA. Without permission there is
    // nothing it may do, so it does not run — rather than send first and ask
    // after, which is exactly what Guideline 5.1.2(i) forbids.
    if (!(await hasAiConsent())) return;
    setSyncing(true);
    try {
      const res = await syncNow(token);
      setLastSync(res);
      if (res.fetched > 0 || res.parsed > 0 || (res.datesFixed ?? 0) > 0) {
        setVersion((v) => v + 1);
      }
    } catch (e) {
      if (e instanceof AuthError) return signOut();
      // Sync being a Plus feature is not a failure to report on every launch.
      if (e instanceof PaywallError) return;
      // Surface the failure instead of leaving the last good result on screen —
      // a silent catch here is why a broken sync looked like "nothing changed".
      setLastSync({
        fetched: 0,
        parsed: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSyncing(false);
    }
  }, [token, signOut]);

  const loadTxns = useCallback(async () => {
    setTxnsError(null);
    try {
      const { items, nextCursor } = await fetchTransactions(
        token,
        null,
        HISTORY_LIMIT
      );
      setTxns(items);
      setTxnsCursor(nextCursor);
    } catch (e) {
      if (e instanceof AuthError) return signOut();
      setTxnsError("Couldn't load transactions.");
    } finally {
      setTxnsLoading(false);
    }
  }, [token, signOut]);

  const loadMoreTxns = useCallback(async () => {
    if (!txnsCursor || txnsMore) return;
    setTxnsMore(true);
    try {
      const { items, nextCursor } = await fetchTransactions(
        token,
        txnsCursor,
        HISTORY_LIMIT
      );
      setTxns((prev) => [...prev, ...items]);
      setTxnsCursor(nextCursor);
    } catch (e) {
      if (e instanceof AuthError) signOut();
    } finally {
      setTxnsMore(false);
    }
  }, [token, txnsCursor, txnsMore, signOut]);

  // Pull-to-refresh always syncs — an explicit request should never be skipped.
  const refreshTxns = useCallback(async () => {
    await sync();
    markSynced();
    await loadTxns();
  }, [sync, loadTxns]);

  useEffect(() => {
    loadTxns();
  }, [loadTxns, version]);

  // Sync on open, but not on every open.
  //
  // A sync fetches Gmail and runs a parse batch — by far the heaviest call the
  // app makes, and it was firing on every unlock, so the screen sat waiting on
  // work that had usually just been done. A cron already sweeps server-side
  // every half hour, so anything more often than this buys nothing. Pull to
  // refresh still forces one immediately.
  useEffect(() => {
    (async () => {
      if (await syncedRecently()) return;
      await sync();
      markSynced();
    })();
  }, [sync]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.body}>
        {visited.has("home") && (
          <TabPane active={tab === "home"}>
            <DashboardScreen
              token={token}
              version={version}
              syncing={syncing}
              lastSync={lastSync}
              onSync={refreshTxns}
              onEdit={openEdit}
              onNeedAuth={signOut}
              onUser={setUser}
              onOpenFlow={setFlow}
              onAdd={openAdd}
              items={txns}
            />
          </TabPane>
        )}
        {visited.has("activity") && (
          <TabPane active={tab === "activity"}>
            <TransactionsScreen
              items={txns}
              loading={txnsLoading}
              loadingMore={txnsMore}
              error={txnsError}
              onRefresh={refreshTxns}
              onLoadMore={loadMoreTxns}
              onEdit={openEdit}
            />
          </TabPane>
        )}
        {visited.has("ask") && (
          <TabPane active={tab === "ask"}>
            <AskScreen token={token} onNeedAuth={signOut} />
          </TabPane>
        )}
        {visited.has("settings") && (
          <TabPane active={tab === "settings"}>
            <SettingsScreen
              user={user}
              token={token}
              onSignOut={signOut}
              onImported={() => setVersion((v) => v + 1)}
            />
          </TabPane>
        )}
      </View>

      <TabBar active={tab} onTab={setTab} onAdd={openAdd} />

      <FlowDetailScreen
        flow={flow}
        items={txns}
        loading={txnsLoading}
        onClose={() => setFlow(null)}
        onEdit={(t) => {
          setFlow(null);
          openEdit(t);
        }}
      />

      <AiConsentSheet />

      <PlusSheet
        visible={paywall !== null}
        reason={paywall}
        onClose={() => setPaywall(null)}
        onPurchased={() => {
          setPaywall(null);
          // RevenueCat's webhook decides access, and it may still be in flight.
          // Refetching is how the app learns the answer rather than assuming it.
          setVersion((v) => v + 1);
        }}
      />

      <TransactionModal
        visible={modalOpen}
        token={token}
        editing={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          setVersion((v) => v + 1);
        }}
        onNeedAuth={signOut}
      />
    </SafeAreaView>
  );
}

/**
 * Holds one tab's screen. Inactive panes stay mounted but are removed from
 * layout, so switching back is instant and keeps scroll position, chat history
 * and already-fetched data. FadeIn runs on first mount only.
 */
function TabPane({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <View
      style={[StyleSheet.absoluteFill, active ? null : styles.paneHidden]}
      pointerEvents={active ? "auto" : "none"}
    >
      <FadeIn>{children}</FadeIn>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  body: { flex: 1 },
  paneHidden: { display: "none" },
  boot: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});
