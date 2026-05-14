import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, View, Text, Alert, ActivityIndicator, Vibration, ScrollView } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BarCodeScanner } from "expo-barcode-scanner";
import * as ImagePicker from "expo-image-picker";
import styles from "./constants/styles";
import { RETRY_DELAYS_MS, RETRY_STATE_KEY } from "./constants/config";
import { initDb, runSql } from "./services/db";
import { applyRegistrations, pullRegistrations, pushPendingToServer } from "./services/syncService";
import useBackgroundSync from "./hooks/useBackgroundSync";
import useNetworkStatus from "./hooks/useNetworkStatus";
import ScreenHeader from "./components/ScreenHeader";
import WorkshopSetupSection from "./components/WorkshopSetupSection";
import StatsSection from "./components/StatsSection";
import NetworkBarSection from "./components/NetworkBarSection";
import ScannerSection from "./components/ScannerSection";
import PhotoScanSection from "./components/PhotoScanSection";
import FooterNote from "./components/FooterNote";

export default function App() {
  const [hasPermission, setHasPermission] = useState(null);
  const [workshopId, setWorkshopId] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [stats, setStats] = useState({ total: 0, checkedIn: 0, pending: 0 });
  const [scannerKey, setScannerKey] = useState(0);
  const [isPicking, setIsPicking] = useState(false);
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
    BarCodeScanner.requestPermissionsAsync().then(({ status }) => {
      setHasPermission(status === "granted");
    });
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
        const timeTag = row.checkin_time || "unknown";
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

  const pickImage = useCallback(async () => {
    setIsPicking(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Permission denied", "Please allow photo library access.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const uri = result.assets[0].uri;

        // Try scanning QR from the selected image and reuse the same handleScan flow
        try {
          const barcodes = await BarCodeScanner.scanFromURLAsync(uri);
          if (Array.isArray(barcodes) && barcodes.length > 0 && barcodes[0].data) {
            // reuse camera scan handler
            await handleScan({ data: String(barcodes[0].data) });
          } else {
            Alert.alert('No QR found', 'Không phát hiện mã QR trong ảnh.');
          }
        } catch (scanErr) {
          console.warn('scanFromURLAsync failed:', scanErr);
          Alert.alert('Scan failed', 'Không thể quét QR từ ảnh.');
        }
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Image selection failed", "Please try again.");
    } finally {
      setIsPicking(false);
    }
  }, [handleScan]);

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

  if (hasPermission === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.center}>
        <Text>No access to camera</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <ScreenHeader />
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
      <PhotoScanSection
        isPicking={isPicking}
        onPickImage={pickImage}
      />
      <FooterNote />
    </ScrollView>
  );
}

