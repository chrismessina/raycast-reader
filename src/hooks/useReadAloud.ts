import { execFile } from "child_process";
import { failToast, showError } from "@chrismessina/raycast-kit/toast";
import { crossLaunchCommand } from "raycast-cross-extension";
import { useEffect, useRef, useState } from "react";
import { LaunchType, open, showToast, Toast } from "@raycast/api";
import { isMacOS } from "../utils/host-api";
import { isSayRunning, readAloudText, SAY_EXTENSION } from "../utils/read-aloud";

const POLL_MS = 1000;
// Say can take seconds to start speaking, as it loads voices and resolves the audio device.
const STARTUP_TIMEOUT_MS = 10_000;

function checkSayRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("/bin/ps", ["-axo", "command="], { maxBuffer: 16 * 1024 * 1024 }, (error, stdout) =>
      resolve(!error && isSayRunning(stdout)),
    );
  });
}

function launchSay(name: string, args?: { content: string }) {
  return crossLaunchCommand({
    name,
    type: LaunchType.Background,
    extensionName: SAY_EXTENSION.name,
    ownerOrAuthorName: SAY_EXTENSION.owner,
    arguments: args,
  });
}

/**
 * Read Aloud and Stop Reading Aloud, through the Say extension.
 *
 * On macOS, whether Say is speaking is observed, never remembered: while the reader is open it
 * checks Say's speech process every second, as Say's own Text to Say view does. So Stop shows
 * exactly while Say speaks, including speech that starts late, began before a re-import remounted
 * this view, or was started outside Reader. Windows has no such check: there "speaking" is set by
 * Read Aloud and cleared by Stop.
 */
export function useReadAloud(title: string, bodyMarkdown: string) {
  const [speaking, setSpeaking] = useState(false);
  // Launched, not yet heard. Nothing to stop yet (Say's Stop only ends speech that has begun), so
  // neither action shows and the toast keeps spinning.
  const [starting, setStarting] = useState(false);
  const toastRef = useRef<Toast | null>(null);

  useEffect(() => {
    if (!isMacOS) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      const running = await checkSayRunning();
      if (!active) return;
      setSpeaking(running);
      timer = setTimeout(check, POLL_MS);
    };
    check();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  // A re-import mid-start unmounts this view; the remounted one can't reach the spinning toast.
  useEffect(
    () => () => {
      if (toastRef.current?.style === Toast.Style.Animated) toastRef.current.hide();
    },
    [],
  );

  useEffect(() => {
    if (!starting) return;
    if (speaking) {
      setStarting(false);
      if (toastRef.current) showReading(toastRef.current);
      return;
    }
    // Speech that begins after this still gets its Stop action, from the observation above.
    const timer = setTimeout(() => {
      setStarting(false);
      if (toastRef.current) {
        failToast(toastRef.current, new Error("Say was launched but didn't start speaking within 10 seconds."), {
          title: "Say Didn't Start",
        });
      }
    }, STARTUP_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [starting, speaking]);

  async function stop(): Promise<void> {
    try {
      await launchSay(SAY_EXTENSION.stopCommand);
      setSpeaking(false);
      await toastRef.current?.hide();
    } catch (error) {
      await showError(error, { title: "Couldn't Stop Say" });
    }
  }

  function showReading(toast: Toast) {
    toast.style = Toast.Style.Success;
    toast.title = "Reading Aloud";
    toast.primaryAction = { title: "Stop Reading Aloud", onAction: () => stop() };
  }

  async function start(): Promise<void> {
    const toast = await showToast({ style: Toast.Style.Animated, title: "Starting Read Aloud…" });
    toastRef.current = toast;
    try {
      await launchSay(SAY_EXTENSION.speakCommand, { content: readAloudText(title, bodyMarkdown) });
      if (isMacOS) {
        setStarting(true);
      } else {
        showReading(toast);
        setSpeaking(true);
      }
    } catch (error) {
      // launchCommand throws when Say isn't installed, so offer the Store page.
      failToast(toast, error, {
        title: "Couldn't Start Say",
        action: {
          title: "Install Say",
          onAction: () => open(`raycast://extensions/${SAY_EXTENSION.owner}/${SAY_EXTENSION.name}`),
        },
      });
    }
  }

  return { isReading: speaking && !starting, isIdle: !speaking && !starting, start, stop };
}
