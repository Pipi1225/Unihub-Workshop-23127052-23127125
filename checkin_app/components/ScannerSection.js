import React from "react";
import { View, Text } from "react-native";
import { BarCodeScanner } from "expo-barcode-scanner";
import styles from "../constants/styles";

export default function ScannerSection({ scannerKey, onScan, scanResult, flashColor, scanStatusColor }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Step 3: Scan QR Code</Text>
      <Text style={styles.hint}>Point camera at student's QR code</Text>
      <View style={styles.scannerBox} key={scannerKey}>
        <BarCodeScanner
          onBarCodeScanned={onScan}
          style={{ flex: 1 }}
        />
      </View>
      <View style={[styles.resultBox, flashColor ? { backgroundColor: flashColor } : null]}>
        <Text style={[styles.resultText, { color: scanStatusColor }]}>
          {scanResult ? scanResult.message : "📱 Ready to scan"}
        </Text>
      </View>
    </View>
  );
}
