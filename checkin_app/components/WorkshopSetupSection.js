import React from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import styles from "../constants/styles";

export default function WorkshopSetupSection({ workshopId, onChangeWorkshopId, isSyncing, onSync }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Step 1: Setup Workshop</Text>
      <Text style={styles.hint}>Enter the workshop ID to download registrations</Text>
      <View style={styles.inputGroup}>
        <TextInput
          style={styles.input}
          placeholder="e.g., WS001, WS-WORKSHOP"
          placeholderTextColor="#a0adc1"
          value={workshopId}
          onChangeText={onChangeWorkshopId}
        />
        <TouchableOpacity
          style={[styles.button, isSyncing && styles.buttonDisabled]}
          onPress={onSync}
          disabled={isSyncing}
        >
          <Text style={styles.buttonText}>{isSyncing ? "⏳ Syncing..." : "📥 Sync Data"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
