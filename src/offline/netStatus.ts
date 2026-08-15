import NetInfo from '@react-native-community/netinfo';

type Listener = (isOnline: boolean) => void;

let isOnline = true;
const listeners = new Set<Listener>();

NetInfo.addEventListener((state) => {
  const online = Boolean(state.isConnected && state.isInternetReachable !== false);
  if (online !== isOnline) {
    isOnline = online;
    listeners.forEach((l) => l(isOnline));
  }
});

export function getIsOnline(): boolean {
  return isOnline;
}

export function subscribeOnlineStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
