"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/form-field";
import { spaceApi } from "@/components/use-api-action";

type Props = { c: string; s: string; resourceId: string; watchedPct: number; completed: boolean; preview: boolean };

/* Minimal typing for the YouTube IFrame API. */
type YTPlayer = { getCurrentTime(): number; getPlaybackRate(): number; destroy(): void };
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: { host: string; videoId: string; playerVars: Record<string, number>; events: { onStateChange: (e: { data: number }) => void } },
  ) => YTPlayer;
};
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytReady: Promise<void> | null = null;
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve();
  ytReady ??= new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;
    document.head.appendChild(tag);
  });
  return ytReady;
}

const HEARTBEAT_MS = 15_000;

/** Sends heartbeats and reflects what the SERVER credited. */
function useHeartbeat({ c, s, resourceId, watchedPct, completed, preview }: Props) {
  const router = useRouter();
  const [pct, setPct] = useState(watchedPct);
  const [done, setDone] = useState(completed);
  const doneRef = useRef(completed);
  const send = useCallback(async (position: number, playing: boolean, rate = 1) => {
    if (preview) return;
    const { data, error } = await spaceApi(c, s).resources({ id: resourceId }).heartbeat.post({ position: Math.max(0, position), playing, rate });
    if (error || !data) return;
    setPct(data.watchedPct);
    if (data.completed && !doneRef.current) {
      doneRef.current = true;
      setDone(true);
      toast.success("Lesson complete");
      router.refresh();
    }
  }, [c, s, resourceId, preview, router]);
  return { pct, done, send };
}

function Status({ pct, done, preview, mode }: { pct: number; done: boolean; preview: boolean; mode: string }) {
  if (preview) return <p className="text-xs text-muted-foreground">Preview: watch time isn&rsquo;t recorded.</p>;
  return done ? (
    <p className="inline-flex items-center gap-1.5 text-xs font-medium text-mint-foreground">
      <CheckCircle2 className="size-4 text-mint" /> Watched
    </p>
  ) : (
    <div className="flex items-center gap-3">
      <Progress value={pct} className="flex-1" />
      <span className="shrink-0 text-xs text-muted-foreground tabular">
        {pct}% {mode}
      </span>
    </div>
  );
}

export function YouTubeLesson(props: Props & { videoId: string; startAt: number }) {
  const { videoId, startAt } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const { pct, done, send } = useHeartbeat(props);

  useEffect(() => {
    let player: YTPlayer | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const beat = (playing: boolean) => {
      if (!player) return;
      void send(player.getCurrentTime(), playing, player.getPlaybackRate());
    };
    loadYouTubeApi().then(() => {
      if (cancelled || !hostRef.current || !window.YT) return;
      const el = document.createElement("div");
      hostRef.current.appendChild(el);
      player = new window.YT.Player(el, {
        host: "https://www.youtube-nocookie.com",
        videoId,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1, start: Math.floor(startAt) },
        events: {
          onStateChange: ({ data }) => {
            if (data === 1) {
              // PLAYING: a zero-credit baseline, so pausing, seeking ahead and resuming earns nothing.
              beat(false);
              stop();
              timer = setInterval(() => beat(true), HEARTBEAT_MS);
            } else if (data === 2 || data === 0) {
              // PAUSED / ENDED: credit what was played since the last heartbeat.
              beat(true);
              stop();
            } else if (data === 3) {
              stop();
            }
          },
        },
      });
    });
    return () => {
      cancelled = true;
      stop();
      player?.destroy();
    };
  }, [videoId, startAt, send]);

  return (
    <div className="space-y-2">
      <div ref={hostRef} className="aspect-video w-full overflow-hidden rounded-xl bg-ink [&_iframe]:size-full" />
      <Status pct={pct} done={done} preview={props.preview} mode="watched" />
    </div>
  );
}

/** Drive's preview player has no API: credit is time on this page while it's visible, capped at the video length. */
export function DriveLesson(props: Props & { embedUrl: string }) {
  const { pct, done, send } = useHeartbeat(props);
  useEffect(() => {
    if (done) return;
    void send(0, false);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void send(0, true);
    }, 20_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void send(0, false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [done, send]);
  return (
    <div className="space-y-2">
      <iframe src={props.embedUrl} className="aspect-video w-full rounded-xl bg-ink" allow="autoplay; fullscreen" title="Lesson video" />
      <Status pct={pct} done={done} preview={props.preview} mode="time on lesson" />
    </div>
  );
}

export function ExternalLesson({ url }: { url: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface p-4 text-sm">
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
        Open the video <ExternalLink className="size-3.5" />
      </a>
      <span className="text-muted-foreground">This one plays outside Lenigo, so it isn&rsquo;t tracked. Watch it anyway: the checkpoints cover it.</span>
    </div>
  );
}
