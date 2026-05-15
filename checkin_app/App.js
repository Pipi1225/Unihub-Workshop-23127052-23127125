import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, View, Text, Alert, ActivityIndicator, Vibration, ScrollView, TextInput, TouchableOpacity } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Camera, useCameraPermissions } from "expo-camera";
import styles from "./constants/styles";
import { API_BASE_URL, AUTH_TOKEN_KEY, AUTH_USER_KEY, RETRY_DELAYS_MS, RETRY_STATE_KEY } from "./constants/config";
import { initDb, runSql } from "./services/db";
import { applyRegistrations, pullRegistrations, pushPendingToServer } from "./services/syncService";
import useBackgroundSync from "./hooks/useBackgroundSync";
import useNetworkStatus from "./hooks/useNetworkStatus";
import ScreenHeader from "./components/ScreenHeader";
import WorkshopSetupSection from "./components/WorkshopSetupSection";
import StatsSection from "./components/StatsSection";
import NetworkBarSection from "./components/NetworkBarSection";
import ScannerSection from "./components/ScannerSection";
import FooterNote from "./components/FooterNote";

export default function App() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [authLoading, setAuthLoading] = useState(true);
  const [authToken, setAuthToken] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [workshopId, setWorkshopId] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [stats, setStats] = useState({ total: 0, checkedIn: 0, pending: 0 });
  const [scannerKey, setScannerKey] = useState(0);
  const [syncMessage, setSyncMessage] = useState("");
  const [flashColor, setFlashColor] = useState("");
  const retryStateRef = useRef({ timeoutId: null, index: 0 });
  const flashTimeoutRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const pushPendingRef = useRef(null);

  useEffect(() => {
    initDb().catch((error) => {
      console.error("DB init failed:", error);
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadAuthSession = async () => {
      try {
        const [token, userRaw] = await Promise.all([
          AsyncStorage.getItem(AUTH_TOKEN_KEY),
          AsyncStorage.getItem(AUTH_USER_KEY),
        ]);

        if (!isMounted) {
          return;
        }

        setAuthToken(token || null);
        setAuthUser(userRaw ? JSON.parse(userRaw) : null);
      } catch (error) {
        console.warn("[auth] Failed to load session:", error?.message || error);
      } finally {
        if (isMounted) {
          setAuthLoading(false);
        }
      }
    };

    loadAuthSession();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    requestCameraPermission().catch((error) => {
      console.warn("Camera permission request failed:", error?.message || error);
    });
  }, [requestCameraPermission]);

  const persistAuthSession = useCallback(async (token, user) => {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
    await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    setAuthToken(token);
    setAuthUser(user);
  }, []);

  const clearAuthSession = useCallback(async () => {
    await AsyncStorage.multiRemove([AUTH_TOKEN_KEY, AUTH_USER_KEY]);
    setAuthToken(null);
    setAuthUser(null);
    setWorkshopId("");
    setStats({ total: 0, checkedIn: 0, pending: 0 });
    setScanResult(null);
    setSyncMessage("");
  }, []);

  useBackgroundSync({ onMessage: setSyncMessage });

  const attemptPushPending = useCallback(() => {
    const handler = pushPendingRef.current;
    if (typeof handler === "function") {
      handler().catch(() => null);
    }
  }, []);

  const persistRetryState = useCallback(async (nextAt, index) => {
    try {
      await AsyncStorage.setItem(RETRY_STATE_KEY, JSON.stringify({ nextAt, index }));
    } catch (error) {
      console.warn("[retryState] save failed:", error.message);
    }
  }, []);

  const clearRetryState = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(RETRY_STATE_KEY);
    } catch (error) {
      console.warn("[retryState] clear failed:", error.message);
    }
  }, []);

  const handleLogin = useCallback(async () => {
    const email = loginEmail.trim().toLowerCase();
    const password = loginPassword;

    if (!email || !password) {
      setLoginError("Please enter email and password.");
      return;
    }

    setIsLoggingIn(true);
    setLoginError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || `Login failed (${response.status})`);
      }

      if (!payload?.access_token) {
        throw new Error("Login response missing access token.");
      }

      const user = payload?.user || { email };
      await persistAuthSession(payload.access_token, user);
      setLoginPassword("");
    } catch (error) {
      setLoginError(error?.message || "Login failed.");
    } finally {
      setIsLoggingIn(false);
    }
  }, [loginEmail, loginPassword, persistAuthSession]);

  const handleLogout = useCallback(() => {
    clearAuthSession().catch(() => null);
  }, [clearAuthSession]);

  useEffect(() => {
    let cancelled = false;
    const hydrateRetryState = async () => {
      try {
        const raw = await AsyncStorage.getItem(RETRY_STATE_KEY);
        if (!raw) {
          return;
        }

        const parsed = JSON.parse(raw);
        const nextAt = Number(parsed?.nextAt);
        const storedIndex = Number.isFinite(parsed?.index) ? parsed.index : 0;
        retryStateRef.current.index = Math.min(Math.max(storedIndex, 0), RETRY_DELAYS_MS.length - 1);

        if (!nextAt) {
          return;
        }

        const delay = nextAt - Date.now();
        if (delay <= 0) {
          attemptPushPending();
          return;
        }

        if (!retryStateRef.current.timeoutId) {
          retryStateRef.current.timeoutId = setTimeout(() => {
            retryStateRef.current.timeoutId = null;
            attemptPushPending();
          }, delay);
          if (!cancelled) {
            setSyncMessage(`Retry scheduled in ${Math.round(delay / 60000)} minutes`);
          }
        }
      } catch (error) {
        console.warn("[retryState] hydrate failed:", error.message);
      }
    };

    hydrateRetryState();

    return () => {
      cancelled = true;
    };
  }, [attemptPushPending]);

  const refreshStats = useCallback(async () => {
    const workshopKey = workshopId.trim();
    const filter = workshopKey ? " WHERE workshop_id = ?" : "";
    const params = workshopKey ? [workshopKey] : [];

    const totalResult = await runSql(`SELECT COUNT(*) AS count FROM local_registrations${filter}`, params);
    const checkedResult = await runSql(
      `SELECT COUNT(*) AS count FROM local_registrations WHERE checkin_status = 1${workshopKey ? " AND workshop_id = ?" : ""}`,
      params
    );
    const pendingResult = await runSql(
      `SELECT COUNT(*) AS count FROM local_registrations WHERE sync_status = 'PENDING'${workshopKey ? " AND workshop_id = ?" : ""}`,
      params
    );

    const total = totalResult.rows.item(0)?.count || 0;
    const checkedIn = checkedResult.rows.item(0)?.count || 0;
    const pending = pendingResult.rows.item(0)?.count || 0;

    setStats({ total, checkedIn, pending });
  }, [workshopId]);

  useEffect(() => {
    refreshStats().catch(() => null);
  }, [refreshStats]);

  const pullSync = useCallback(async () => {
    if (!workshopId.trim()) {
      Alert.alert("Missing workshop", "Please enter workshop_id first.");
      return;
    }

    setIsSyncing(true);
    setScanResult(null);

    try {
      const workshopKey = workshopId.trim();
      const items = await pullRegistrations(workshopKey);
      await applyRegistrations(workshopKey, items);

      await refreshStats();
      Alert.alert("Sync complete", `Downloaded ${items.length} records.`);
    } catch (error) {
      console.error(error);
      Alert.alert("Sync failed", error.message);
    } finally {
      setIsSyncing(false);
    }
  }, [workshopId, refreshStats]);

  const scheduleRetry = useCallback(() => {
    const state = retryStateRef.current;
    if (state.timeoutId) {
      return;
    }

    const retryIndex = Math.min(state.index, RETRY_DELAYS_MS.length - 1);
    const delay = RETRY_DELAYS_MS[retryIndex];
    const nextAt = Date.now() + delay;
    state.timeoutId = setTimeout(() => {
      state.timeoutId = null;
      attemptPushPending();
    }, delay);
    state.index = Math.min(state.index + 1, RETRY_DELAYS_MS.length - 1);
    setSyncMessage(`Retry scheduled in ${Math.round(delay / 60000)} minutes`);
    persistRetryState(nextAt, state.index);
  }, [attemptPushPending, persistRetryState]);

  const resetRetry = useCallback(() => {
    const state = retryStateRef.current;
    if (state.timeoutId) {
      clearTimeout(state.timeoutId);
    }
    state.timeoutId = null;
    state.index = 0;
    clearRetryState();
  }, [clearRetryState]);

  const pushPending = useCallback(async () => {
    if (isPushing) {
      return;
    }

    setIsPushing(true);
    setSyncMessage("");

    try {
      const result = await pushPendingToServer();

      if (result.sent === 0) {
        resetRetry();
        setIsPushing(false);
        return;
      }

      await refreshStats();
      resetRetry();
      setSyncMessage(`Pushed ${result.sent} check-ins.`);
      Alert.alert("Sync success", `Pushed ${result.sent} check-ins.`);
    } catch (error) {
      console.error(error);
      Alert.alert("Sync failed", error.message);
      scheduleRetry();
    } finally {
      setIsPushing(false);
    }
  }, [isPushing, refreshStats, resetRetry, scheduleRetry]);

  useEffect(() => {
    pushPendingRef.current = pushPending;
  }, [pushPending]);

  const handleOnline = useCallback(() => {
    pushPending().catch(() => null);
  }, [pushPending]);

  const isConnected = useNetworkStatus(handleOnline);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      if ((previousState === "inactive" || previousState === "background") && nextState === "active") {
        pushPending().catch(() => null);
      }
    });

    return () => subscription.remove();
  }, [pushPending]);

  useEffect(() => {
    return () => {
      const state = retryStateRef.current;
      if (state.timeoutId) {
        clearTimeout(state.timeoutId);
      }

      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
      }
    };
  }, []);

  const triggerFeedback = useCallback((type) => {
    let color = "#ffffff";
    let pattern = [0, 50];

    if (type === "success") {
      color = "#d1e7dd";
      pattern = [0, 60, 40, 60];
    } else if (type === "warning") {
      color = "#fff3cd";
      pattern = [0, 120];
    } else if (type === "error") {
      color = "#f8d7da";
      pattern = [0, 150];
    }

    Vibration.vibrate(pattern);
    setFlashColor(color);

    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
    }

    flashTimeoutRef.current = setTimeout(() => {
      setFlashColor("");
    }, 800);
  }, []);

  const formatCheckinTime = useCallback((value) => {
    if (!value) {
      return "unknown";
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "unknown";
    }

    const pad = (part) => String(part).padStart(2, "0");
    const yyyy = parsed.getFullYear();
    const mm = pad(parsed.getMonth() + 1);
    const dd = pad(parsed.getDate());
    const hh = pad(parsed.getHours());
    const min = pad(parsed.getMinutes());
    const ss = pad(parsed.getSeconds());

    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
  }, []);

  const handleScan = useCallback(async ({ data }) => {
    const hash = String(data || "").trim();
    setScanResult(null);

    if (!workshopId.trim()) {
      setScanResult({ type: "error", message: "Please sync workshop data first." });
      triggerFeedback("error");
      return;
    }

    if (!hash) {
      setScanResult({ type: "error", message: "Invalid QR code." });
      triggerFeedback("error");
      return;
    }

    try {
      const result = await runSql(
        "SELECT registration_id, full_name, checkin_status, checkin_time FROM local_registrations WHERE qr_code_hash = ? AND workshop_id = ?",
        [hash, workshopId.trim()]
      );

      if (result.rows.length === 0) {
        setScanResult({ type: "error", message: "QR code not found for this workshop." });
        triggerFeedback("error");
        return;
      }

      const row = result.rows.item(0);
      if (row.checkin_status === 1) {
        const nameTag = row.full_name ? ` - ${row.full_name}` : "";
        const timeTag = formatCheckinTime(row.checkin_time);
        setScanResult({
          type: "warning",
          message: `Already checked in${nameTag} at ${timeTag}.`,
        });
        triggerFeedback("warning");
        return;
      }

      const now = new Date().toISOString();
      await runSql(
        "UPDATE local_registrations SET checkin_status = 1, checkin_time = ?, sync_status = 'PENDING' WHERE qr_code_hash = ?",
        [now, hash]
      );

      await refreshStats();
      const nameMessage = row.full_name ? ` - ${row.full_name}` : "";
      setScanResult({ type: "success", message: `Check-in success${nameMessage}.` });
      triggerFeedback("success");
    } catch (error) {
      console.error(error);
      setScanResult({ type: "error", message: "Local DB error." });
      triggerFeedback("error");
    } finally {
      setScannerKey((prev) => prev + 1);
    }
  }, [refreshStats, triggerFeedback, workshopId]);


  const scanStatusColor = useMemo(() => {
    if (!scanResult) {
      return "#1d1d1d";
    }
    if (scanResult.type === "success") {
      return "#0f5132";
    }
    if (scanResult.type === "warning") {
      return "#664d03";
    }
    return "#842029";
  }, [scanResult]);

  if (authLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text>Loading session...</Text>
      </View>
    );
  }

  if (!authToken) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 24 }}>
        <ScreenHeader />
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Staff Login</Text>
          <Text style={styles.hint}>Sign in with your CHECKIN_STAFF account.</Text>
          <View style={styles.inputGroup}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#a0adc1"
              autoCapitalize="none"
              keyboardType="email-address"
              value={loginEmail}
              onChangeText={setLoginEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#a0adc1"
              secureTextEntry
              value={loginPassword}
              onChangeText={setLoginPassword}
            />
            {loginError ? (
              <Text style={{ color: "#b42318", fontSize: 12 }}>{loginError}</Text>
            ) : null}
            <TouchableOpacity
              style={[styles.button, isLoggingIn && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={isLoggingIn}
            >
              <Text style={styles.buttonText}>{isLoggingIn ? "Signing in..." : "Sign in"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  }

  if (!cameraPermission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!cameraPermission.granted) {
    return (
      <View style={styles.center}>
        <Text>No access to camera</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <ScreenHeader />
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Signed in</Text>
        <Text style={styles.hint}>{authUser?.email || "Unknown user"}</Text>
        <TouchableOpacity style={styles.button} onPress={handleLogout}>
          <Text style={styles.buttonText}>Log out</Text>
        </TouchableOpacity>
      </View>
      <WorkshopSetupSection
        workshopId={workshopId}
        onChangeWorkshopId={setWorkshopId}
        isSyncing={isSyncing}
        onSync={pullSync}
      />
      <StatsSection stats={stats} />
      <NetworkBarSection
        isConnected={isConnected}
        isPushing={isPushing}
        onPush={pushPending}
        syncMessage={syncMessage}
      />
      <ScannerSection
        scannerKey={scannerKey}
        onScan={handleScan}
        scanResult={scanResult}
        flashColor={flashColor}
        scanStatusColor={scanStatusColor}
      />
      <FooterNote />
    </ScrollView>
  );
}

