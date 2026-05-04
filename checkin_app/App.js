import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image, Vibration, ScrollView } from "react-native";
import { BarCodeScanner } from "expo-barcode-scanner";
import * as ImagePicker from "expo-image-picker";
import NetInfo from "@react-native-community/netinfo";
import * as SQLite from "expo-sqlite/legacy";
import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";

const db = SQLite.openDatabase("checkin.db");

const RETRY_DELAYS_MS = [15 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000];

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:4000";
const PULL_ENDPOINT = process.env.EXPO_PUBLIC_SYNC_PULL_ENDPOINT || "/api/sync-data";
const PUSH_ENDPOINT = process.env.EXPO_PUBLIC_SYNC_PUSH_ENDPOINT || "/api/registrations/sync";
const BACKGROUND_SYNC_TASK = "CHECKIN_BACKGROUND_SYNC";

function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        sql,
        params,
        (_, result) => resolve(result),
        (_, error) => {
          reject(error);
          return false;
        }
      );
    });
  });
}

async function initDb() {
  await runSql(
    "CREATE TABLE IF NOT EXISTS local_registrations (registration_id TEXT PRIMARY KEY NOT NULL, qr_code_hash TEXT UNIQUE, workshop_id TEXT, full_name TEXT, checkin_status INTEGER DEFAULT 0, checkin_time TEXT, sync_status TEXT DEFAULT 'SYNCED')"
  );
  await runSql("CREATE INDEX IF NOT EXISTS idx_local_qr_hash ON local_registrations (qr_code_hash)");
  await runSql("CREATE INDEX IF NOT EXISTS idx_local_workshop_qr ON local_registrations (workshop_id, qr_code_hash)");
  await runSql("CREATE INDEX IF NOT EXISTS idx_local_sync_status ON local_registrations (sync_status)");

  const migrations = [
    "ALTER TABLE local_registrations ADD COLUMN workshop_id TEXT",
    "ALTER TABLE local_registrations ADD COLUMN full_name TEXT",
  ];

  for (const migration of migrations) {
    try {
      await runSql(migration);
    } catch (error) {
      // Ignore if column already exists
    }
  }
}

function mapPullData(data) {
  if (Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data?.items)) {
    return data.items;
  }
  return [];
}

async function pushPendingToServer() {
  const pendingResult = await runSql(
    "SELECT registration_id, qr_code_hash, workshop_id, checkin_time FROM local_registrations WHERE sync_status = 'PENDING'"
  );

  const pendingItems = [];
  for (let i = 0; i < pendingResult.rows.length; i += 1) {
    pendingItems.push(pendingResult.rows.item(i));
  }

  if (!pendingItems.length) {
    return { sent: 0 };
  }

  const response = await fetch(`${API_BASE_URL}${PUSH_ENDPOINT}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(pendingItems),
  });

  if (!response.ok) {
    throw new Error(`Sync failed with status ${response.status}`);
  }

  await runSql("BEGIN TRANSACTION");
  try {
    for (const item of pendingItems) {
      await runSql("UPDATE local_registrations SET sync_status = 'SYNCED' WHERE registration_id = ?", [
        item.registration_id,
      ]);
    }
    await runSql("COMMIT");
  } catch (error) {
    await runSql("ROLLBACK");
    throw error;
  }

  return { sent: pendingItems.length };
}

let isBackgroundTaskDefined = false;
if (typeof TaskManager?.defineTask === "function") {
  try {
    TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
      try {
        const result = await pushPendingToServer();
        if (result.sent === 0) {
          return BackgroundFetch.BackgroundFetchResult.NoData;
        }
        return BackgroundFetch.BackgroundFetchResult.NewData;
      } catch (error) {
        console.warn("[backgroundSync] Failed:", error.message);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });
    isBackgroundTaskDefined = true;
  } catch (error) {
    console.warn("[backgroundSync] defineTask failed:", error.message);
  }
}

export default function App() {
  const [hasPermission, setHasPermission] = useState(null);
  const [workshopId, setWorkshopId] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [stats, setStats] = useState({ total: 0, checkedIn: 0, pending: 0 });
  const [scannerKey, setScannerKey] = useState(0);
  const [selectedImageUri, setSelectedImageUri] = useState("");
  const [isPicking, setIsPicking] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [flashColor, setFlashColor] = useState("");
  const retryStateRef = useRef({ timeoutId: null, index: 0 });
  const flashTimeoutRef = useRef(null);

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

  useEffect(() => {
    const registerTask = async () => {
      try {
        if (!isBackgroundTaskDefined) {
          return;
        }

        const status = await BackgroundFetch.getStatusAsync();
        if (
          status === BackgroundFetch.BackgroundFetchStatus.Restricted
          || status === BackgroundFetch.BackgroundFetchStatus.Denied
        ) {
          setSyncMessage("Background sync disabled by OS.");
          return;
        }

        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
        if (!isRegistered) {
          await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
            minimumInterval: 15 * 60,
            stopOnTerminate: false,
            startOnBoot: true,
          });
        }
      } catch (error) {
        console.warn("[backgroundSync] Registration failed:", error.message);
      }
    };

    registerTask();
  }, []);

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
      const url = `${API_BASE_URL}${PULL_ENDPOINT}?workshop_id=${encodeURIComponent(workshopId.trim())}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Sync failed with status ${response.status}`);
      }

      const payload = await response.json();
      const items = mapPullData(payload);

      await runSql("BEGIN TRANSACTION");
      await runSql(
        "DELETE FROM local_registrations WHERE workshop_id = ? AND sync_status != 'PENDING'",
        [workshopId.trim()]
      );
      for (const item of items) {
        const registrationId = String(item.registration_id || item.id || "");
        const qrHash = String(item.qr_code_hash || "");
        const itemWorkshopId = String(item.workshop_id || workshopId.trim() || "");
        const fullName = String(item.full_name || item.fullName || "").trim();
        if (!registrationId || !qrHash) {
          continue;
        }

        if (!itemWorkshopId) {
          continue;
        }

        const existing = await runSql(
          "SELECT sync_status FROM local_registrations WHERE registration_id = ?",
          [registrationId]
        );
        if (existing.rows.length > 0 && existing.rows.item(0).sync_status === "PENDING") {
          continue;
        }

        const checkinStatus = item.checkin_status ? 1 : 0;
        const checkinTime = item.checkin_time || null;

        await runSql(
          "INSERT OR REPLACE INTO local_registrations (registration_id, qr_code_hash, workshop_id, full_name, checkin_status, checkin_time, sync_status) VALUES (?, ?, ?, ?, ?, ?, 'SYNCED')",
          [registrationId, qrHash, itemWorkshopId, fullName, checkinStatus, checkinTime]
        );
      }
      await runSql("COMMIT");

      await refreshStats();
      Alert.alert("Sync complete", `Downloaded ${items.length} records.`);
    } catch (error) {
      console.error(error);
      Alert.alert("Sync failed", error.message);
      await runSql("ROLLBACK");
    } finally {
      setIsSyncing(false);
    }
  }, [workshopId, refreshStats]);

  const scheduleRetry = useCallback(() => {
    const state = retryStateRef.current;
    if (state.timeoutId) {
      return;
    }

    const delay = RETRY_DELAYS_MS[Math.min(state.index, RETRY_DELAYS_MS.length - 1)];
    state.timeoutId = setTimeout(() => {
      state.timeoutId = null;
      pushPending().catch(() => null);
    }, delay);
    state.index = Math.min(state.index + 1, RETRY_DELAYS_MS.length - 1);
    setSyncMessage(`Retry scheduled in ${Math.round(delay / 60000)} minutes`);
  }, []);

  const resetRetry = useCallback(() => {
    const state = retryStateRef.current;
    if (state.timeoutId) {
      clearTimeout(state.timeoutId);
    }
    state.timeoutId = null;
    state.index = 0;
  }, []);

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
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected);
      setIsConnected(online);
      if (online) {
        pushPending().catch(() => null);
      }
    });

    return () => unsubscribe();
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
        setSelectedImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Image selection failed", "Please try again.");
    } finally {
      setIsPicking(false);
    }
  }, []);

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
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.heading}>📍 Offline Check-in</Text>
        <Text style={styles.subtitle}>Workshop-scoped QR registration</Text>
      </View>

      {/* Step 1: Setup Workshop */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Step 1: Setup Workshop</Text>
        <Text style={styles.hint}>Enter the workshop ID to download registrations</Text>
        <View style={styles.inputGroup}>
          <TextInput
            style={styles.input}
            placeholder="e.g., WS001, WS-WORKSHOP"
            placeholderTextColor="#a0adc1"
            value={workshopId}
            onChangeText={setWorkshopId}
          />
          <TouchableOpacity 
            style={[styles.button, isSyncing && styles.buttonDisabled]} 
            onPress={pullSync} 
            disabled={isSyncing}
          >
            <Text style={styles.buttonText}>{isSyncing ? "⏳ Syncing..." : "📥 Sync Data"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Step 2: Check Stats */}
      {stats.total > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Step 2: Workshop Status</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Total</Text>
              <Text style={styles.statValue}>{stats.total}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Checked In</Text>
              <Text style={styles.statValue}>{stats.checkedIn}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Pending</Text>
              <Text style={styles.statValue}>{stats.pending}</Text>
            </View>
          </View>
          <Text style={styles.progressHint}>
            {stats.pending > 0 
              ? `${stats.pending} check-ins waiting to sync` 
              : "All check-ins synced ✓"}
          </Text>
        </View>
      )}

      {/* Network Status & Sync Control */}
      <View style={styles.section}>
        <View style={styles.networkBar}>
          <Text style={styles.networkStatus}>
            {isConnected ? "🌐 Online" : "📵 Offline"}
          </Text>
          <TouchableOpacity 
            style={[styles.syncButton, isPushing && styles.buttonDisabled]} 
            onPress={pushPending} 
            disabled={isPushing}
          >
            <Text style={styles.syncButtonText}>{isPushing ? "⏳" : "📤"}</Text>
          </TouchableOpacity>
        </View>
        {syncMessage && (
          <Text style={styles.syncMessage}>{syncMessage}</Text>
        )}
      </View>

      {/* Step 3: Scanner */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Step 3: Scan QR Code</Text>
        <Text style={styles.hint}>Point camera at student's QR code</Text>
        <View style={styles.scannerBox} key={scannerKey}>
          <BarCodeScanner
            onBarCodeScanned={handleScan}
            style={{ flex: 1 }}
          />
        </View>
        <View style={[styles.resultBox, flashColor ? { backgroundColor: flashColor } : null]}>
          <Text style={[styles.resultText, { color: scanStatusColor }]}>
            {scanResult ? scanResult.message : "📱 Ready to scan"}
          </Text>
        </View>
      </View>

      {/* Step 4: Optional Image Evidence */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Step 4: Add Evidence (Optional)</Text>
        <Text style={styles.hint}>Attach a photo for compliance records</Text>
        <View style={styles.imageControls}>
          <TouchableOpacity 
            style={[styles.button, styles.imageButton, isPicking && styles.buttonDisabled]} 
            onPress={pickImage} 
            disabled={isPicking}
          >
            <Text style={styles.buttonText}>{isPicking ? "⏳ Opening..." : "📸 Choose Photo"}</Text>
          </TouchableOpacity>
          {selectedImageUri && (
            <TouchableOpacity 
              style={styles.clearButton} 
              onPress={() => setSelectedImageUri("")}
              disabled={isPicking}
            >
              <Text style={styles.clearButtonText}>✕ Clear</Text>
            </TouchableOpacity>
          )}
        </View>
        {selectedImageUri ? (
          <Image source={{ uri: selectedImageUri }} style={styles.previewImage} />
        ) : (
          <Text style={styles.emptyImageHint}>No image selected</Text>
        )}
      </View>

      {/* Footer Info */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          💡 App works offline. Auto-syncs pending check-ins when online.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingTop: 0,
    paddingBottom: 20,
    backgroundColor: "#f0f4f9",
  },

  /* Header */
  header: {
    paddingTop: 40,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: "#1f6feb",
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  heading: {
    fontSize: 26,
    fontWeight: "800",
    color: "#ffffff",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: "#c7dcf7",
  },

  /* Sections */
  section: {
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1f2a44",
    marginBottom: 6,
  },
  hint: {
    fontSize: 13,
    color: "#7b889e",
    marginBottom: 12,
    fontStyle: "italic",
  },

  /* Input Group */
  inputGroup: {
    flexDirection: "column",
    gap: 10,
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#d7ddea",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#fdfdfd",
    fontSize: 14,
    color: "#1f2a44",
  },

  /* Buttons */
  button: {
    backgroundColor: "#1f6feb",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    backgroundColor: "#d0d7e8",
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  syncButton: {
    backgroundColor: "#1f6feb",
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  syncButtonText: {
    fontSize: 20,
  },

  /* Network Bar */
  networkBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  networkStatus: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2a44",
  },
  syncMessage: {
    fontSize: 12,
    color: "#7b889e",
    marginTop: 4,
    fontStyle: "italic",
  },

  /* Stats */
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#f8fafd",
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e0e8f0",
  },
  statLabel: {
    fontSize: 12,
    color: "#7b889e",
    marginBottom: 4,
    fontWeight: "600",
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1f6feb",
  },
  progressHint: {
    fontSize: 13,
    color: "#52607a",
    textAlign: "center",
  },

  /* Scanner */
  scannerBox: {
    width: "100%",
    height: 280,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#000",
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#1f6feb",
  },
  resultBox: {
    padding: 16,
    borderRadius: 10,
    backgroundColor: "#f8f9fb",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d7ddea",
  },
  resultText: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },

  /* Image Picker */
  imageControls: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  imageButton: {
    flex: 1,
  },
  clearButton: {
    backgroundColor: "#f2f4f8",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d7ddea",
  },
  clearButtonText: {
    color: "#5c6a82",
    fontWeight: "600",
    fontSize: 13,
  },
  previewImage: {
    width: "100%",
    height: 220,
    borderRadius: 10,
    marginTop: 12,
    backgroundColor: "#f0f0f0",
  },
  emptyImageHint: {
    marginTop: 12,
    color: "#9ca7b8",
    fontSize: 13,
    textAlign: "center",
    fontStyle: "italic",
  },

  /* Footer */
  footer: {
    marginHorizontal: 16,
    marginVertical: 16,
    padding: 12,
    backgroundColor: "#e0e8f0",
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#1f6feb",
  },
  footerText: {
    fontSize: 12,
    color: "#4a5568",
    lineHeight: 18,
  },

  /* Loading State */
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f0f4f9",
  },
});
