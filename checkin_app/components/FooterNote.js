import React from "react";
import { View, Text } from "react-native";
import styles from "../constants/styles";

export default function FooterNote() {
  return (
    <View style={styles.footer}>
      <Text style={styles.footerText}>
        💡 App works offline. Auto-syncs pending check-ins when online.
      </Text>
    </View>
  );
}
