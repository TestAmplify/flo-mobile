import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, Text, View } from "react-native";
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
import { ParticipantPreviews, ParticipantTile, RoomButton, RoomCanvas, RoomControl, RoomControls, RoomSheet, roomSecondary, roomText, type RoomDevices } from "./RoomView";

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
  starting: "Starting recording…",
  recording: "Recording",
  paused: "Recording paused",
  stopping: "Stopping recording…",
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
  return <View style={[s.row, { gap: 6, flexShrink: 1 }]}>
    {state === "recording" && <View style={{ backgroundColor: "#a32944", borderRadius: 4, height: 8, width: 8 }} />}
    <Text accessibilityLiveRegion="polite" style={[roomSecondary, state === "recording" && roomText]}>{continuingWithoutRecording ? "Continuing without recording" : captureLabels[state] ?? "Recording status unavailable"}</Text>
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
  const [sheet, setSheet] = useState<"recording" | "guests" | "leave" | null>(null);
  const [showNotice, setShowNotice] = useState(false);
  const [focused, setFocused] = useState<string>();
  const lock = useRef(false);
  const control = poll.value,
    cap = control?.capture;
  const waitingForMyConsent = cap?.state === "consent" && !cap.accepted;
  useEffect(() => {
    if (waitingForMyConsent) setSheet(current => current ?? "recording");
  }, [waitingForMyConsent]);

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
  const act = (label: string, name: string, { body, dismiss, kind = "primary" }: {
    body?: unknown;
    dismiss?: boolean;
    kind?: React.ComponentProps<typeof RoomButton>["kind"];
  } = {}) => (
    <RoomButton
      key={name + label}
      label={label}
      kind={kind}
      disabled={busy}
      onPress={() => void run(async () => {
        await command(name, body);
        if (dismiss) setSheet(null);
      })}
    />
  );
  function end() {
    void run(async () => {
      endRequested.current = true;
      try {
        await command("end");
        onEnd();
      } catch (e) {
        endRequested.current = false;
        throw e;
      }
    });
  }
  const preparing = control?.bookingRoom === "preparing";
  const lobby = control?.isHost ? control.admissions?.filter(g => g.verified && g.state === "requested") ?? [] : [];
  const primaryTrack = tracks.find(track => track.participant.identity === focused)
    ?? tracks.find(track => !track.participant.isLocal)
    ?? tracks[0];
  const previews = tracks.filter(track => track !== primaryTrack);
  function tile(track: typeof tracks[number], primary: boolean) {
    const person = track.participant;
    return <ParticipantTile key={person.identity}
      name={person.isLocal ? control?.isHost ? "You · Host" : "You" : person.name || "Guest"}
      avatarName={person.name || (person.isLocal ? "You" : "Guest")}
      sage={person.isLocal} micOn={person.isMicrophoneEnabled} size={primary ? "stage" : "preview"}
      focus={primary ? undefined : () => setFocused(person.identity)}>
      {isTrackReference(track) && !track.publication.isMuted && (
        <VideoTrack trackRef={track} objectFit="contain" style={StyleSheet.absoluteFill} />
      )}
    </ParticipantTile>;
  }
  const captureAvailable = cap?.enabled && !preparing;
  const canWithdraw = !control?.isHost && !cap?.recordingOptOut && cap?.accepted &&
    ["starting", "recording", "paused"].includes(cap.state);
  const errorMessage = roomError || error || poll.error;
  const footer = <RoomControls>
    {join.canPublish && <>
      <RoomControl icon={isMicrophoneEnabled ? "mic-outline" : "mic-off-outline"}
        label={isMicrophoneEnabled ? "Mic on" : "Mic off"} accessibilityLabel={isMicrophoneEnabled ? "Mute mic" : "Turn mic on"}
        disabled={busy} onPress={() => void run(() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled))} />
      {meeting.callMode !== "audio" && <RoomControl icon={isCameraEnabled ? "videocam-outline" : "videocam-off-outline"}
        label={isCameraEnabled ? "Camera on" : "Camera off"} accessibilityLabel={isCameraEnabled ? "Turn camera off" : "Turn camera on"}
        disabled={busy} onPress={() => void run(() => localParticipant.setCameraEnabled(!isCameraEnabled))} />}
    </>}
    {captureAvailable && <RoomControl icon="radio-button-on-outline" label="Recording"
      accessibilityLabel="Recording options" active={cap.state === "recording"} disabled={busy}
      onPress={() => { setShowNotice(false); setSheet("recording"); }} />}
    <RoomControl icon="call-outline" label="Leave" accessibilityLabel="Leave meeting options" danger disabled={busy}
      onPress={() => setSheet("leave")} />
  </RoomControls>;
  return (
    <RoomCanvas title={meeting.title} live={Boolean(control && !preparing)}
      subtitle={tracks.length + (tracks.length === 1 ? " participant" : " participants")}
      status={captureAvailable && <CaptureStatus state={cap.state} elapsedMs={cap.elapsedMs} optedOut={cap.recordingOptOut} />}
      footer={footer}>
      {!!errorMessage && !sheet && <Notice>{errorMessage}</Notice>}
      {preparing && control?.isHost && act("Open meeting early", "open-booking-early", { kind: "inline" })}
      {lobby.length > 0 && <RoomButton label={`${lobby.length} ${lobby.length === 1 ? "guest" : "guests"} waiting`}
        kind="inline" onPress={() => setSheet("guests")} />}
      {primaryTrack ? tile(primaryTrack, true) : <View style={{ flex: 1 }} />}
      {previews.length > 0 && <ParticipantPreviews>{previews.map(track => tile(track, false))}</ParticipantPreviews>}
      {sheet === "guests" && <RoomSheet title="Waiting room" busy={busy} close={() => setSheet(null)}>
        <Notice>{errorMessage}</Notice>
        {lobby.length === 0 && <Text style={roomSecondary}>No guests waiting.</Text>}
        {lobby.map(guest => <View key={guest.id} style={{ gap: 6 }}>
          <Text style={roomText}>{guest.name}</Text>
          {act("Admit guest", "guest-decision", { body: { requestId: guest.id, decision: "approve" }, dismiss: lobby.length === 1 })}
        </View>)}
      </RoomSheet>}
      {sheet === "leave" && <RoomSheet title="Leave meeting?" busy={busy} close={() => setSheet(null)}>
        <Notice>{errorMessage}</Notice>
        {control?.isHost && <Text style={roomSecondary}>You can leave the room and rejoin later, or end the meeting for everyone.</Text>}
        <RoomButton label="Leave room" disabled={busy} onPress={onLeave} />
        {control?.isHost && <RoomButton label="End for everyone" kind="danger" disabled={busy} onPress={end} />}
        <RoomButton label="Keep meeting" disabled={busy} onPress={() => setSheet(null)} />
      </RoomSheet>}
      {sheet === "recording" && <RoomSheet title="Recording" busy={busy} close={() => setSheet(null)}>
        <Notice>{errorMessage}</Notice>
        {cap ? <>
          <CaptureStatus state={cap.state} elapsedMs={cap.elapsedMs} optedOut={cap.recordingOptOut} />
          {cap.enabled && cap.state === "off" && cap.canManage && !cap.recordingOptOut &&
            (cap.canStartAlone ? <>
              <Text style={roomSecondary}>Flo records audio and processes it with AI to create meeting notes.</Text>
              {act("Start recording", "capture-start-early", { dismiss: true })}
            </> : act("Request recording consent", "capture-request"))}
          {cap.state === "consent" && (
            <>
              {waitingForMyConsent && (
                <>
                  <Text style={roomSecondary}>Flo records audio and processes it with AI to create meeting notes.</Text>
                  {act("Agree to recording and AI processing", "capture-consent", { body: { accepted: true }, dismiss: !cap.canManage })}
                  {act("Decline recording", "capture-consent", { body: { accepted: false }, dismiss: true, kind: "secondary" })}
                </>
              )}
              {!!cap.waiting?.length && (
                <Text style={roomSecondary}>Waiting for {cap.waiting.join(", ")}</Text>
              )}
              {cap.canManage &&
                cap.accepted &&
                !cap.waiting?.length &&
                act("Start audio recording", "capture-start", { dismiss: true })}
            </>
          )}
          {cap.canManage && ["starting", "recording"].includes(cap.state) &&
            act("Stop recording", "capture-stop", { dismiss: true })}
          {cap.canManage && cap.state === "paused" && !cap.recordingOptOut && act("Resume recording", "capture-resume", { dismiss: true })}
          {canWithdraw && act("Withdraw consent", "capture-withdraw", { dismiss: true })}
          {!!cap.notice && <RoomButton label={showNotice ? "Hide recording details" : "Recording details"}
            onPress={() => setShowNotice(current => !current)} />}
          {showNotice && <Text style={roomSecondary}>{cap.notice}</Text>}
        </> : <Text style={roomSecondary}>Recording status unavailable.</Text>}
      </RoomSheet>}
    </RoomCanvas>
  );
}
