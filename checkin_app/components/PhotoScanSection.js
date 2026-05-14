import React from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import styles from "../constants/styles";

export default function PhotoScanSection({ isPicking, onPickImage }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Step 4: Backup — Scan from Photo</Text>
      <Text style={styles.hint}>If the in-app camera has issues, choose a photo and the app will try to scan the QR from it.</Text>
      <View style={styles.imageControls}>
        <TouchableOpacity
          style={[styles.button, styles.imageButton, isPicking && styles.buttonDisabled]}
          onPress={onPickImage}
          disabled={isPicking}
        >
          <Text style={styles.buttonText}>{isPicking ? "⏳ Opening..." : "📸 Scan from Photo (backup)"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
