// The download that fits the visitor's computer. Worked out in the browser after the page loads,
// so the prerendered page (and anyone without JavaScript) keeps the link to #download.
import { useEffect, useState } from "react";
import { RELEASE, mb, type Asset } from "./content";

export type OS = "windows" | "mac" | "linux";
/** `arm` is null when the browser doesn't say (Safari, Firefox). */
export type System = { os: OS; arm: boolean | null };

type UaData = { getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }> };

async function detect(): Promise<System | null> {
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return null;
  const os: OS | null = /Windows/i.test(ua) ? "windows" : /Mac OS X|Macintosh/i.test(ua) ? "mac" : /Linux|X11|CrOS/i.test(ua) ? "linux" : null;
  if (!os) return null;
  // An iPad asking for the desktop site says "Macintosh" but has a touch screen.
  if (os === "mac" && navigator.maxTouchPoints > 1) return null;
  let arm: boolean | null = /aarch64|arm64/i.test(ua) ? true : os === "linux" && /x86_64/i.test(ua) ? false : null;
  const uad = (navigator as Navigator & { userAgentData?: UaData }).userAgentData;
  if (uad?.getHighEntropyValues) {
    try {
      const v = await uad.getHighEntropyValues(["architecture"]);
      if (v.architecture) arm = v.architecture.toLowerCase().startsWith("arm");
    } catch {
      // Keep what the user agent said.
    }
  }
  return { os, arm };
}

export function useSystem(): System | null {
  const [sys, setSys] = useState<System | null>(null);
  useEffect(() => {
    let live = true;
    detect().then((s) => live && setSys(s));
    return () => {
      live = false;
    };
  }, []);
  return sys;
}

const NAMES: Record<OS, string> = { windows: "Windows", mac: "macOS", linux: "Linux" };

/** The file to offer first for a system, if the release has one that fits it. */
function fileFor(sys: System): Asset | undefined {
  const a = RELEASE.assets;
  if (sys.os === "windows") return a.windows; // Windows on Arm runs the x64 build.
  if (sys.os === "mac") return sys.arm === false ? a.macIntel : a.macArm;
  return sys.arm ? undefined : a.appimage; // The Linux builds are x86_64 only.
}

/** The hero's main button: straight to the file once the system is known, else to #download. */
export function useDownload() {
  const sys = useSystem();
  const file = sys && fileFor(sys);
  if (sys && file) return { href: file.url, label: `Download for ${NAMES[sys.os]}`, size: mb(file.size), sys };
  if (sys) return { href: "#download", label: `Download for ${NAMES[sys.os]}`, size: null, sys };
  return { href: "#download", label: "Download", size: null, sys };
}
