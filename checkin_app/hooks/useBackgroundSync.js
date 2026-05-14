import { useEffect } from "react";
import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import { BACKGROUND_SYNC_TASK } from "../constants/config";
import { pushPendingToServer } from "../services/syncService";

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

export default function useBackgroundSync({ onMessage }) {
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
          if (typeof onMessage === "function") {
            onMessage("Background sync disabled by OS.");
          }
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
  }, [onMessage]);
}
