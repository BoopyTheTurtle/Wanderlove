import { useEffect, useRef, useState } from "react";
import type { LatLng } from "@wannadoo/core";

type LiveState = {
  position: LatLng | null;
  simulated: boolean;
  error: string | null;
  setSimulatedPosition: (pos: LatLng | null) => void;
};

// Wraps navigator.geolocation.watchPosition, with a manual override so the
// stationary demo can fake arrival without real GPS movement.
export function useLivePosition(): LiveState {
  const [gpsPosition, setGpsPosition] = useState<LatLng | null>(null);
  const [simulatedPosition, setSimulatedPosition] = useState<LatLng | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation not supported in this browser.");
      return;
    }

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setError(null);
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );

    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, []);

  return {
    position: simulatedPosition ?? gpsPosition,
    simulated: simulatedPosition !== null,
    error,
    setSimulatedPosition,
  };
}
