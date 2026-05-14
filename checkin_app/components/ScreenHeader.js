import React from "react";
import { View, Text } from "react-native";
import styles from "../constants/styles";

export default function ScreenHeader() {
  return (
    <View style={styles.header}>
      <Text style={styles.heading}>📍 Offline Check-in</Text>
      <Text style={styles.subtitle}>Workshop-scoped QR registration</Text>
    </View>
  );
}
