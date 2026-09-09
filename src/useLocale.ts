import { useEffect, useState } from "react";
import { detectLocale, fallbackLocale, type Locale } from "./i18n.js";
import type { SteamHost } from "./types.js";

export function useLocale(host: SteamHost): Locale {
  const [automatic, setAutomatic] = useState(() => fallbackLocale(host));
  useEffect(() => {
    let active = true;
    void detectLocale(host).then((locale) => { if (active) setAutomatic(locale); });
    return () => { active = false; };
  }, [host]);
  return automatic;
}
