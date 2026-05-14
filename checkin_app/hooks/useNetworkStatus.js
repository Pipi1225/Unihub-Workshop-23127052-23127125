import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

export default function useNetworkStatus(onOnline) {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected);
      setIsConnected(online);
      if (online && typeof onOnline === "function") {
        onOnline();
      }
    });

    return () => unsubscribe();
  }, [onOnline]);

  return isConnected;
}
