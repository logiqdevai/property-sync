import { useEffect } from "react";

export function useDocumentScrollLock() {
  useEffect(() => {
    const lock = () => {
      if (document.documentElement.scrollTop !== 0) {
        document.documentElement.scrollTop = 0;
      }
      if (document.body.scrollTop !== 0) {
        document.body.scrollTop = 0;
      }
    };

    lock();
    window.addEventListener("scroll", lock, { capture: true, passive: true });
    return () => {
      window.removeEventListener("scroll", lock, { capture: true });
    };
  }, []);
}
