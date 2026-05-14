import React from "react";
import { View, Text } from "react-native";
import styles from "../constants/styles";

export default function StatsSection({ stats }) {
  if (!stats || stats.total <= 0) {
    return null;
  }

  return (
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
  );
}
