import { useCallback, useState } from "react";
import { store } from "./store";

export type Position = { lat: number; lon: number };
export type LocationProblem = "denied" | "failed" | "unsupported";

/**
 * The device position, on request. After the first request the app asks again
 * at every start (see App), which is what makes it open on the nearest station.
 */
export function useLocation() {
  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<LocationProblem | null>(null);

  const locate = useCallback((): Promise<Position | null> => {
    if (!navigator.geolocation) {
      setProblem("unsupported");
      return Promise.resolve(null);
    }
    setLocating(true);
    setProblem(null);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const next = { lat: p.coords.latitude, lon: p.coords.longitude };
          store.setFollowsLocation(true);
          setPosition(next);
          setLocating(false);
          resolve(next);
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) store.setFollowsLocation(false);
          setProblem(err.code === err.PERMISSION_DENIED ? "denied" : "failed");
          setLocating(false);
          resolve(null);
        },
        // A fix up to a minute old is fine for "which stop am I at" and comes back at once.
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
      );
    });
  }, []);

  return { position, locating, problem, locate };
}
