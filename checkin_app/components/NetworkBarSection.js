import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import styles from "../constants/styles";

export default function NetworkBarSection({ isConnected, isPushing, onPush, syncMessage }) {
  return (
    <View style={styles.section}>
      <View style={styles.networkBar}>
        <Text style={styles.networkStatus}>
          {isConnected ? "🌐 Online" : "📵 Offline"}
        </Text>
        <TouchableOpacity
          style={[styles.syncButton, isPushing && styles.buttonDisabled]}
          onPress={onPush}
          disabled={isPushing}
        >
          <Text style={styles.syncButtonText}>{isPushing ? "⏳" : "📤"}</Text>
        </TouchableOpacity>
      </View>
      {syncMessage ? (
        <Text style={styles.syncMessage}>{syncMessage}</Text>
      ) : null}
    </View>
  );
}
