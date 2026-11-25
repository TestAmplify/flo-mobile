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
import { Page, Action, Notice, s } from "./ui";

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
  };
};
type Props = {
  meeting: Meeting;
  join: Join;
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
  return (
    <Page>
      <Text style={s.label}>Flo Live</Text>
      <Text style={s.title}>{props.meeting.title}</Text>
      <Notice>{error}</Notice>
      {ready && (
        <LiveKitRoom
          token={props.join.accessToken}
          serverUrl={props.join.serverUrl}
          connect
          audio={false}
          video={false}
          onConnected={() => setConnected(true)}
          onError={(e) => setError(message(e))}
          onDisconnected={() => {
            setConnected(false);
            if (!endRequested.current)
              setError(
                "Disconnected. Return to Meetings to check the room and rejoin.",
              );
          }}
        >
          {connected && <Inside {...props} endRequested={endRequested} />}
        </LiveKitRoom>
      )}
      {!connected && (
        <>
          <Text style={s.meta}>
            {error
              ? "Room disconnected"
              : "Connecting with microphone and camera off…"}
          </Text>
          <Action secondary label="Back to Meetings" onPress={props.onLeave} />
        </>
      )}
    </Page>
  );
}
function Inside({
  join,
  meeting,
  onLeave,
  onEnd,
  endRequested,
}: Props & { endRequested: React.RefObject<boolean> }) {
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
    Alert.alert("End meeting for everyone?", meeting.title, [
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
    ]);
  }
  return (
    <>
      <Notice>{error || poll.error}</Notice>
      {control?.bookingRoom === "preparing" && control.isHost && (
        <View style={[s.card, s.feature]}>
          <Text style={s.heading}>You’re here early</Text>
          {act("Open meeting early", "open-booking-early")}
        </View>
      )}
      {tracks.map((track) => (
        <View
          key={track.participant.identity}
          style={{
            backgroundColor: "#312a39",
            borderRadius: 20,
            padding: 12,
            gap: 7,
          }}
        >
          {isTrackReference(track) && !track.publication.isMuted ? (
            <VideoTrack
              trackRef={track}
              style={{ height: 190, borderRadius: 14 }}
            />
          ) : (
            <Text
              style={{
                textAlign: "center",
                padding: 24,
                fontSize: 30,
                color: "white",
              }}
            >
              {(track.participant.name || "Guest").slice(0, 1)}
            </Text>
          )}
          <Text style={{ color: "white" }}>
            {track.participant.name || "Guest"} ·{" "}
            {track.participant.isMicrophoneEnabled ? "Mic on" : "Mic off"}
          </Text>
        </View>
      ))}
      {join.canPublish && (
        <View style={s.row}>
          <Action
            secondary
            disabled={busy}
            label={isMicrophoneEnabled ? "Mute mic" : "Turn mic on"}
            onPress={() =>
              void run(() =>
                localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled),
              )
            }
          />
          {meeting.callMode !== "audio" && (
            <Action
              secondary
              disabled={busy}
              label={isCameraEnabled ? "Turn camera off" : "Turn camera on"}
              onPress={() =>
                void run(() =>
                  localParticipant.setCameraEnabled(!isCameraEnabled),
                )
              }
            />
          )}
        </View>
      )}
      {control?.isHost &&
        control.admissions
          ?.filter((g) => g.verified && g.state === "requested")
          .map((g) => (
            <View key={g.id} style={s.card}>
              <Text style={s.heading}>{g.name}</Text>
              <Text style={s.meta}>Verified guest · Waiting</Text>
              {act("Admit guest", "guest-decision", {
                requestId: g.id,
                decision: "approve",
              })}
            </View>
          ))}
      {cap && (
        <View style={s.card}>
          <Text style={s.heading}>Meeting capture</Text>
          <Text accessibilityLiveRegion="polite" style={s.text}>
            {cap.state === "off"
              ? "Recording is off"
              : cap.state === "consent"
                ? "Waiting for recording consent"
                : cap.state}
          </Text>
          {cap.enabled &&
            cap.state === "off" &&
            cap.canManage &&
            act("Request recording consent", "capture-request")}
          {cap.state === "consent" && (
            <>
              <Text style={s.meta}>
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
                <Text style={s.meta}>Waiting for {cap.waiting.join(", ")}</Text>
              )}
              {cap.canManage &&
                cap.accepted &&
                !cap.waiting?.length &&
                act("Start audio recording", "capture-start")}
            </>
          )}
          {cap.canManage &&
            ["starting", "recording", "paused"].includes(cap.state) &&
            act("Stop recording", "capture-stop")}
          {!cap.canManage &&
            cap.accepted &&
            ["starting", "recording", "paused"].includes(cap.state) &&
            act("Withdraw consent", "capture-withdraw")}
        </View>
      )}
      {control?.isHost && (
        <Action
          label="End meeting for everyone"
          disabled={busy}
          onPress={end}
        />
      )}
      <Action secondary label="Leave room" onPress={onLeave} />
    </>
  );
}
