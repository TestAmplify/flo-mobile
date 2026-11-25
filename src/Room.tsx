import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, Text, View } from "react-native";
import { useKeepAwake } from "expo-keep-awake";
import {
  AudioSession,
  LiveKitRoom,
  useLocalParticipant,
  useTracks,
  isTrackReference,
  VideoTrack,
} from "@livekit/react-native";
import { Track } from "livekit-client";
import { client, Meeting, message, useResource } from "./api";
import { Action, Notice, s } from "./ui";
import { ParticipantTile, RoomCanvas, RoomControl, RoomControls, RoomPanel, roomSecondary, roomText, type RoomDevices } from "./RoomView";

export type Join = {
  accessToken: string;
  serverUrl: string;
  controlToken: string;
  sessionId: string;
  canPublish: boolean;
};
type Controls = {
  isHost: boolean;
  bookingRoom?: string;
  admissions?: { id: string; name: string; verified: boolean; state: string }[];
  capture?: {
    enabled: boolean;
    state: string;
    canManage: boolean;
    accepted?: boolean;
    waiting?: string[];
    notice?: string;
    elapsedMs?: number;
    canStartAlone?: boolean;
    recordingOptOut?: boolean;
  };
};
const captureLabels: Record<string, string> = {
  off: "Recording is off",
  consent: "Waiting for recording consent",
  starting: "Starting audio recording…",
  recording: "Recording",
  paused: "Recording paused",
  stopping: "Stopping audio recording…",
};

function CaptureStatus({ state, elapsedMs, optedOut }: { state: string; elapsedMs?: number; optedOut?: boolean }) {
  const [elapsed, setElapsed] = useState(elapsedMs);
  useEffect(() => {
    setElapsed(elapsedMs);
    if (state !== "recording" || elapsedMs === undefined) return;
    const received = performance.now();
    const timer = setInterval(() => setElapsed(elapsedMs + performance.now() - received), 250);
    return () => clearInterval(timer);
  }, [state, elapsedMs]);

  const duration = state === "recording" ? elapsed : elapsedMs;
  const continuingWithoutRecording = optedOut && (state === "off" || state === "paused");
  const seconds = Math.max(0, Math.floor((duration ?? 0) / 1000));
  const recordedTime = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return <View style={s.row}>
    {state === "recording" && <View style={{ backgroundColor: "#a32944", borderRadius: 4, height: 8, width: 8 }} />}
    <Text accessibilityLiveRegion="polite" style={roomText}>{continuingWithoutRecording ? "Meeting continues without recording" : captureLabels[state] ?? "Recording status unavailable"}</Text>
    {duration !== undefined && !continuingWithoutRecording && (state === "recording" || state === "paused") && (
      <Text accessibilityLabel={`Recorded time ${recordedTime}`} style={roomSecondary}>{recordedTime}</Text>
    )}
  </View>;
}

type Props = {
  meeting: Meeting;
  join: Join;
  devices: RoomDevices;
  onLeave: () => void;
  onEnd: () => void;
};
export function MeetingRoom(props: Props) {
  const [ready, setReady] = useState(false),
    [connected, setConnected] = useState(false),
    [error, setError] = useState("");
  const endRequested = useRef(false);
  useEffect(() => {
    let active = true;
    const start = AudioSession.startAudioSession();
    start
      .then(() => {
        if (active) setReady(true);
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
      void start.then(() => AudioSession.stopAudioSession()).catch(() => {});
    };
  }, []);
  const connecting = (
    <RoomCanvas title={props.meeting.title} live={false} subtitle={error ? "Room disconnected" : "Connecting…"}>
      <Notice>{error}</Notice>
      <Action secondary label="Back to Meetings" onPress={props.onLeave} />
    </RoomCanvas>
  );
  return ready ? (
        <LiveKitRoom
          token={props.join.accessToken}
          serverUrl={props.join.serverUrl}
          connect
          audio={props.devices.mic}
          video={props.devices.camera}
          onConnected={() => { setConnected(true); setError(""); }}
          onError={(e) => setError(message(e))}
          onDisconnected={() => {
            setConnected(false);
            if (!endRequested.current)
              setError(
                "Disconnected. Return to Meetings to check the room and rejoin.",
              );
          }}
        >
          {connected ? <Inside {...props} endRequested={endRequested} roomError={error} /> : connecting}
        </LiveKitRoom>
  ) : connecting;
}
function Inside({
  join,
  meeting,
  onLeave,
  onEnd,
  endRequested,
  roomError,
}: Props & { endRequested: React.RefObject<boolean>; roomError: string }) {
  useKeepAwake(undefined, { suppressDeactivateWarnings: true });
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } =
    useLocalParticipant();
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
  ]);
  const command = useMemo(() => {
    const send = client(join.controlToken);
    return <T,>(name: string, body: unknown = {}) =>
      send<T>(
        "/flo/media-sessions/" +
          encodeURIComponent(join.sessionId) +
          "/control/" +
          name,
        body,
      );
  }, [join]);
  const poll = useResource(
    useCallback(() => command<Controls>("status"), [command]),
    3500,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const control = poll.value,
    cap = control?.capture;
  async function run(fn: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
      poll.refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const act = (label: string, name: string, body?: unknown) => (
    <Action
      key={name + label}
      label={label}
      disabled={busy}
      onPress={() => void run(() => command(name, body))}
    />
  );
  function end() {
    Alert.alert("Leave meeting?", meeting.title, [
      { text: "Keep meeting", style: "cancel" },
      {
        text: "End meeting",
        style: "destructive",
        onPress: () =>
          void run(async () => {
            endRequested.current = true;
            try {
              await command("end");
              onEnd();
            } catch (e) {
              endRequested.current = false;
              throw e;
            }
          }),
      },
      { text: "Leave room", onPress: onLeave },
    ]);
  }
  const footer = <RoomControls>
    {join.canPublish && <>
      <RoomControl icon={isMicrophoneEnabled ? "mic-outline" : "mic-off-outline"}
        label={isMicrophoneEnabled ? "Mic on" : "Mic off"} accessibilityLabel={isMicrophoneEnabled ? "Mute mic" : "Turn mic on"}
        disabled={busy} onPress={() => void run(() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled))} />
      {meeting.callMode !== "audio" && <RoomControl icon={isCameraEnabled ? "videocam-outline" : "videocam-off-outline"}
        label={isCameraEnabled ? "Camera on" : "Camera off"} accessibilityLabel={isCameraEnabled ? "Turn camera off" : "Turn camera on"}
        disabled={busy} onPress={() => void run(() => localParticipant.setCameraEnabled(!isCameraEnabled))} />}
    </>}
    <RoomControl icon="call-outline" label={control?.isHost ? "End meeting" : "Leave"}
      accessibilityLabel={control?.isHost ? "End meeting options" : "Leave room"} danger disabled={busy}
      onPress={control?.isHost ? end : onLeave} />
  </RoomControls>;
  return (
    <RoomCanvas title={meeting.title} live={Boolean(control && control.bookingRoom !== "preparing")}
      subtitle={tracks.length + (tracks.length === 1 ? " participant" : " participants")}
      status={cap && <CaptureStatus state={cap.state} elapsedMs={cap.elapsedMs} optedOut={cap.recordingOptOut} />}
      footer={footer}>
      <Notice>{roomError || error || poll.error}</Notice>
      {control?.bookingRoom === "preparing" && control.isHost && (
        <RoomPanel title="You’re here early">
          {act("Open meeting early", "open-booking-early")}
        </RoomPanel>
      )}
      {tracks.map((track) => (
        <ParticipantTile key={track.participant.identity}
          name={track.participant.isLocal ? control?.isHost ? "You · Host" : "You" : track.participant.name || "Guest"}
          sage={track.participant.isLocal} micOn={track.participant.isMicrophoneEnabled}>
          {isTrackReference(track) && !track.publication.isMuted && (
            <VideoTrack trackRef={track} style={{ width: "100%", height: 190 }} />
          )}
        </ParticipantTile>
      ))}
      {control?.isHost &&
        control.admissions
          ?.filter((g) => g.verified && g.state === "requested")
          .map((g) => (
            <RoomPanel key={g.id} title={g.name}>
              <Text style={roomSecondary}>Verified guest · Waiting</Text>
              {act("Admit guest", "guest-decision", {
                requestId: g.id,
                decision: "approve",
              })}
            </RoomPanel>
          ))}
      {cap && (cap.state === "consent" || (cap.enabled && cap.canManage && cap.state !== "stopping")) && (
        <RoomPanel title="Meeting capture">
          {cap.enabled &&
            cap.state === "off" &&
            cap.canManage &&
            (cap.canStartAlone ? <>
              <Text style={roomSecondary}>{cap.notice}</Text>
              {act("Start recording", "capture-start-early")}
            </> : act("Request recording consent", "capture-request"))}
          {cap.state === "consent" && (
            <>
              <Text style={roomSecondary}>
                {cap.notice ||
                  "Audio will be recorded and processed for meeting notes."}
              </Text>
              {!cap.accepted && (
                <>
                  {act(
                    "Agree to recording and AI processing",
                    "capture-consent",
                    { accepted: true },
                  )}
                  {act("Decline recording", "capture-consent", {
                    accepted: false,
                  })}
                </>
              )}
              {!!cap.waiting?.length && (
                <Text style={roomSecondary}>Waiting for {cap.waiting.join(", ")}</Text>
              )}
              {cap.canManage &&
                cap.accepted &&
                !cap.waiting?.length &&
                act("Start audio recording", "capture-start")}
            </>
          )}
          {cap.canManage && ["starting", "recording"].includes(cap.state) &&
            act("Stop recording", "capture-stop")}
          {cap.canManage && cap.state === "paused" && act("Resume recording", "capture-resume")}
        </RoomPanel>
      )}
      {cap && !control?.isHost && !cap.recordingOptOut && cap.accepted &&
        ["starting", "recording", "paused"].includes(cap.state) && act("Withdraw consent", "capture-withdraw")}
    </RoomCanvas>
  );
}
