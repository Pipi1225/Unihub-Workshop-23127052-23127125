import { StyleSheet } from "react-native";

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

export default styles;
