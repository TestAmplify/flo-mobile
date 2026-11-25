import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  ApiError,
  Client,
  Meeting,
  UserContext,
  client,
  dateLabel,
  history,
  message,
  pathFor,
  useResource,
} from "./api";
import { Join, MeetingRoom } from "./Room";
import { AfterMeeting } from "./Recap";
import { Action, Brand, Field, Notice, Page, ink, lilac, s } from "./ui";

const storage = "flo.staging.session.v1";
type Session = { token: string; context: UserContext };
async function identify(token: string): Promise<Session> {
  const context = await client(token)<UserContext>("/auth/me");
  if (context.workspace?.workspaceMode !== "flo_standalone")
    throw new Error("Choose a standalone Flo staging account.");
  return { context, token };
}
export default function App() {
  return (
    <SafeAreaProvider>
      <Entry />
    </SafeAreaProvider>
  );
}
function Entry() {
  const [session, setSession] = useState<Session>(),
    [checking, setChecking] = useState(true);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = await SecureStore.getItemAsync(storage);
        if (token) {
          const saved = await identify(token);
          if (active) setSession(saved);
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 401)
          await SecureStore.deleteItemAsync(storage);
        if (active) setError(message(e));
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync(storage);
    setSession(undefined);
    setPassword("");
  }, []);
  async function login() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const auth = await client()<{ access_token: string }>("/auth/login", {
        email: email.trim(),
        password,
      });
      const next = await identify(auth.access_token);
      await SecureStore.setItemAsync(storage, next.token, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      setPassword("");
      setSession(next);
    } catch (e) {
      setError(message(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (checking)
    return (
      <Page>
        <Brand />
        <ActivityIndicator />
      </Page>
    );
  if (session) return <Workspace session={session} logout={logout} />;
  return (
    <Page>
      <Brand />
      <View style={{ flex: 0.25, minHeight: 56 }} />
      <Text style={s.label}>Staging workspace</Text>
      <Text style={s.title}>Sign in to Flo</Text>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoComplete="email"
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        onSubmitEditing={() => {
          if (email.trim() && password) void login();
        }}
      />
      <Notice>{error}</Notice>
      <Action
        label={busy ? "Signing in…" : "Sign in"}
        disabled={busy || !password || !email.trim()}
        onPress={() => void login()}
      />
    </Page>
  );
}
function Workspace({
  session,
  logout,
}: {
  session: Session;
  logout: () => Promise<void>;
}) {
  const [section, setSection] = useState<"Meetings" | "Follow-ups">("Meetings");
  const [tab, setTab] = useState<"Upcoming" | "History">("Upcoming"),
    [screen, setScreen] = useState<
      "list" | "setup" | "room" | "recap" | "follow"
    >("list");
  const [selected, setSelected] = useState<Meeting>(),
    [join, setJoin] = useState<Join>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const api = useMemo<Client>(() => {
    const call = client(session.token);
    return async <T,>(path: string, body?: unknown) => {
      try {
        return await call<T>(path, body);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) await logout();
        throw e;
      }
    };
  }, [session, logout]);
  const list = useResource(
    useCallback(() => api<Meeting[]>("/flo/meetings?organizer=1"), [api]),
    15000,
  );
  const back = () => {
    setJoin(undefined);
    setSelected(undefined);
    setError("");
    setScreen("list");
    list.refresh();
  };
  async function enter() {
    if (!selected || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const ticket = await api<Join>(pathFor(selected) + "/media/join", {
        recordingConsent: selected.recordingMode === "required",
      });
      if (
        !ticket.controlToken ||
        !ticket.accessToken ||
        !ticket.serverUrl?.startsWith("wss://")
      )
        throw new Error(
          "This room is unavailable. Refresh Meetings and try again.",
        );
      setJoin(ticket);
      setScreen("room");
    } catch (e) {
      setError(message(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (selected && screen === "room" && join)
    return (
      <MeetingRoom
        meeting={selected}
        join={join}
        onLeave={back}
        onEnd={() => {
          setJoin(undefined);
          setTab("History");
          setScreen("recap");
          list.refresh();
        }}
      />
    );
  if (selected && (screen === "recap" || screen === "follow"))
    return (
      <AfterMeeting
        key={selected._id + screen}
        api={api}
        meeting={selected}
        back={back}
        initialFollow={screen === "follow"}
      />
    );
  if (selected && screen === "setup")
    return (
      <Page>
        <Action
          secondary
          disabled={busy}
          label="Back to Meetings"
          onPress={back}
        />
        <Text style={s.label}>Room setup</Text>
        <Text style={s.title}>{selected.title}</Text>
        <Text style={s.meta}>{dateLabel(selected.startTime)}</Text>
        <View style={[s.card, s.feature]}>
          <Text style={s.heading}>Microphone is off</Text>
          <Text style={s.heading}>Camera is off</Text>
          <Text style={s.meta}>You can turn them on inside the room.</Text>
        </View>
        <Text style={s.meta}>
          {selected.recordingMode === "required"
            ? "Joining requires consent to audio recording and AI processing."
            : selected.recordingMode === "off"
              ? "Recording is off."
              : "Recording requires consent from everyone."}
        </Text>
        <Notice>{error}</Notice>
        <Action
          label={
            busy
              ? "Joining…"
              : selected.recordingMode === "required"
                ? "Agree and join"
                : selected.organizer?.canPrepare
                  ? "Enter room early"
                  : "Join room"
          }
          disabled={busy}
          onPress={() => void enter()}
        />
      </Page>
    );
  const rows = (list.value || [])
    .filter((m) => m.bookingManaged && history(m) === (tab === "History"))
    .sort(
      (a, b) =>
        (Date.parse(a.startTime) - Date.parse(b.startTime)) *
        (tab === "Upcoming" ? 1 : -1),
    );
  const name =
    session.context.user.firstName ||
    session.context.user.name ||
    session.context.user.email;
  const footer = (
    <View
      style={{
        flexDirection: "row",
        borderTopWidth: 1,
        borderColor: "#dfd9e1",
        backgroundColor: "#fffdfc",
      }}
    >
      {(["Meetings", "Follow-ups"] as const).map((item) => (
        <Pressable
          key={item}
          accessibilityRole="tab"
          accessibilityState={{ selected: section === item }}
          onPress={() => setSection(item)}
          style={{ flex: 1, paddingVertical: 13, alignItems: "center" }}
        >
          <Text style={item === section ? s.label : s.meta}>{item}</Text>
        </Pressable>
      ))}
    </View>
  );
  if (section === "Follow-ups")
    return (
      <FollowupsList
        api={api}
        footer={footer}
        meetings={list.value || []}
        onSelect={(m) => {
          setSelected(m);
          setScreen("follow");
        }}
      />
    );
  return (
    <Page footer={footer}>
      <View style={s.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open account menu"
          onPress={() =>
            Alert.alert(name, session.context.workspace.name, [
              { text: "Close" },
              {
                text: "Sign out",
                onPress: () => void logout().catch((e) => setError(message(e))),
              },
            ])
          }
          style={{
            backgroundColor: lilac,
            borderRadius: 22,
            width: 44,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={s.label}>{name.slice(0, 1).toUpperCase()}</Text>
        </Pressable>
        <Text style={s.meta}>{session.context.workspace.name}</Text>
      </View>
      <Text style={s.title}>Meetings</Text>
      <View style={s.row}>
        {(["Upcoming", "History"] as const).map((t) => (
          <Pressable
            key={t}
            accessibilityRole="tab"
            accessibilityState={{ selected: t === tab }}
            onPress={() => setTab(t)}
            style={{
              paddingVertical: 10,
              marginRight: 10,
              borderBottomWidth: t === tab ? 2 : 0,
              borderColor: ink,
            }}
          >
            <Text style={t === tab ? s.text : s.meta}>{t}</Text>
          </Pressable>
        ))}
      </View>
      <Notice>{list.error || error}</Notice>
      {list.error && <Action label="Retry" onPress={list.refresh} />}
      {!list.value && !list.error && <ActivityIndicator />}
      {list.value && !rows.length && (
        <Text style={s.meta}>
          {tab === "Upcoming"
            ? "No upcoming guest bookings."
            : "No past guest bookings."}
        </Text>
      )}
      {rows.map((m, i) => {
        const ended = history(m),
          available = m.organizer?.canPrepare || m.organizer?.roomOpen;
        return (
          <View key={m._id} style={[s.card, i === 0 && !ended && s.feature]}>
            <Text style={s.label}>
              {m.organizer?.state === "live"
                ? "Live now"
                : ended
                  ? m.organizer?.state
                  : "Booked meeting"}
            </Text>
            <Text style={s.heading}>{m.title}</Text>
            <Text style={s.meta}>{dateLabel(m.startTime)}</Text>
            {ended ? (
              m.organizer?.state === "ended" && (
                <Action
                  secondary
                  label="Recap & actions"
                  onPress={() => {
                    setSelected(m);
                    setScreen("recap");
                  }}
                />
              )
            ) : available ? (
              <Action
                label={
                  m.organizer?.hasJoined
                    ? "Rejoin room"
                    : m.organizer?.canPrepare
                      ? "Enter room early"
                      : "Join room"
                }
                onPress={() => {
                  setError("");
                  setSelected(m);
                  setScreen("setup");
                }}
              />
            ) : (
              <Text style={s.meta}>
                Join opens when the host opens the room or at the scheduled
                time.
              </Text>
            )}
          </View>
        );
      })}
    </Page>
  );
}

function FollowupsList({
  api,
  footer,
  meetings,
  onSelect,
}: {
  api: Client;
  footer: React.ReactNode;
  meetings: Meeting[];
  onSelect: (m: Meeting) => void;
}) {
  const result = useResource(
    useCallback(
      () =>
        api<
          {
            _id: string;
            sessionId?: string;
            title: string;
            type: string;
            status: string;
            dueDate?: string;
            meetingReview?: { status: string };
          }[]
        >("/flo/outcomes"),
      [api],
    ),
    10000,
  );
  const rows = result.value?.filter(
    (o) =>
      o.sessionId &&
      ["commitment", "follow_up"].includes(o.type) &&
      o.status !== "archived" &&
      o.meetingReview?.status !== "rejected" &&
      meetings.some((m) => m._id === o.sessionId && m.bookingManaged),
  );
  return (
    <Page footer={footer}>
      <Text style={s.title}>Follow-ups</Text>
      <Notice>{result.error}</Notice>
      {!rows && !result.error && <ActivityIndicator />}
      {rows && !rows.length && (
        <Text style={s.meta}>
          No captured follow-ups from booked meetings yet.
        </Text>
      )}
      {rows?.map((o) => {
        const meeting = meetings.find((m) => m._id === o.sessionId)!;
        return (
          <View key={o._id} style={s.card}>
            <Text style={s.label}>{meeting.title}</Text>
            <Text style={s.heading}>{o.title}</Text>
            <Text style={s.meta}>
              {o.status === "resolved"
                ? "Done"
                : o.dueDate
                  ? "Due " + new Date(o.dueDate).toLocaleDateString()
                  : "No due date"}
            </Text>
            <Action
              secondary
              label="View meeting follow-ups"
              onPress={() => onSelect(meeting)}
            />
          </View>
        );
      })}
    </Page>
  );
}
