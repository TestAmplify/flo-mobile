import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import ts from "typescript";
import React from "react";
import renderer, { act } from "react-test-renderer";

const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("Maya joins and rejoins muted, requests consent, edits the capture and resolves Leo’s follow-up", async () => {
  const meeting = {
    _id: "meeting-leo",
    title: "Design review with Leo",
    bookingManaged: true,
    startTime: "2026-11-24T15:30:00Z",
    organizer: { state: "scheduled", canPrepare: true, roomOpen: false },
  };
  const credentials = {
    accessToken: "fake-media",
    controlToken: "fake-control",
    sessionId: "session-leo",
    serverUrl: "wss://media.invalid",
    canPublish: true,
  };
  let state = "off",
    agreed = false,
    preparing = true,
    ended = false,
    done = false,
    sent;
  let dialog, persisted;
  let awakeRooms = 0;
  const mediaProps = [],
    calls = [];
  const captures = {
    captures: [
      { state: "ready", analysis: { summary: "Leo approved the new finish." } },
    ],
    outcomes: [
      {
        _id: "next",
        captureId: "capture",
        type: "commitment",
        title: "Send sample Friday",
        meetingReview: { status: "suggested" },
      },
    ],
  };
  const route = (path, body) => {
    switch (path) {
      case "/auth/login":
        return { access_token: "fake-host" };
      case "/auth/me":
        return {
          user: { name: "Maya Rivera" },
          workspace: { name: "Forma Studio", workspaceMode: "flo_standalone" },
        };
      case "/flo/meetings?organizer=1":
        return [meeting];
      case "/flo/meetings/meeting-leo/media/join":
        assert.equal(body.recordingConsent, false);
        return credentials;
      case "/flo/meetings/meeting-leo/captures":
        return {
          ...captures,
          outcomes: captures.outcomes.map((o) => ({
            ...o,
            status: done ? "resolved" : "open",
          })),
        };
      case "/flo/booking-settings/recap/meeting-leo":
        assert.equal(ended, true);
        if (body) sent = body;
        return {
          canSend: true,
          recipient: "leo@example.test",
          draft: {
            notes: "Leo approved the new finish.",
            followups: "Send sample Friday",
          },
          emails: sent ? [{ state: "queued" }] : [],
        };
      case "/flo/meetings/meeting-leo/captures/capture/outcomes/next/review":
        assert.equal(body.action, "resolve");
        done = true;
        return {};
    }
    const prefix = "/flo/media-sessions/session-leo/control/";
    assert.ok(path.startsWith(prefix), path);
    switch (path.slice(prefix.length)) {
      case "open-booking-early":
        preparing = false;
        break;
      case "capture-request":
        state = "consent";
        break;
      case "capture-consent":
        agreed = body.accepted;
        break;
      case "capture-start":
        assert.equal(agreed, true);
        state = "recording";
        break;
      case "end":
        ended = true;
        meeting.organizer.state = "ended";
        break;
      case "status":
        return {
          isHost: true,
          bookingRoom: preparing ? "preparing" : "open",
          capture: {
            enabled: true,
            canManage: true,
            state,
            accepted: agreed,
            waiting: [],
            ...(state === "recording" ? { elapsedMs: 12_000 } : {}),
          },
        };
      default:
        assert.fail(path);
    }
    return {};
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const { origin, pathname, search } = new URL(url);
    assert.equal(origin, "https://taskologic-staging-api.onrender.com");
    const path = pathname + search;
    if (!path.includes("login"))
      assert.equal(
        init.headers.Authorization,
        path.includes("/control/") ? "Bearer fake-control" : "Bearer fake-host",
      );
    calls.push(path);
    return Response.json(
      route(path, init.body ? JSON.parse(init.body) : undefined),
    );
  };
  const hosts = Object.fromEntries(
    [
      "View",
      "Text",
      "TextInput",
      "Image",
      "ScrollView",
      "ActivityIndicator",
      "Pressable",
      "Switch",
      "StatusBar",
      "KeyboardAvoidingView",
    ].map((k) => [k, k]),
  );
  const mocks = {
    "@expo/vector-icons/Ionicons": "Icon",
    "expo-keep-awake": {
      useKeepAwake() {
        React.useEffect(() => {
          awakeRooms += 1;
          return () => { awakeRooms -= 1; };
        }, []);
      },
    },
    "react-native": {
      ...hosts,
      Platform: { OS: "ios" },
      StyleSheet: { create: (v) => v },
      Alert: {
        alert: (...args) => {
          dialog = args;
        },
      },
    },
    "expo-secure-store": {
      getItemAsync: async () => persisted,
      setItemAsync: async (_, v) => {
        persisted = v;
      },
    },
    "react-native-safe-area-context": {
      SafeAreaProvider: "SafeAreaProvider",
      SafeAreaView: "SafeAreaView",
    },
    "livekit-client": { Track: { Source: { Camera: "camera" } } },
    "@livekit/react-native": {
      AudioSession: {
        startAudioSession: async () => {},
        stopAudioSession: async () => {},
      },
      LiveKitRoom: (p) => {
        React.useEffect(() => {
          mediaProps.push([p.audio, p.video]);
          p.onConnected();
        }, []);
        return p.children;
      },
      useLocalParticipant: () => ({
        localParticipant: {},
        isMicrophoneEnabled: false,
        isCameraEnabled: false,
      }),
      useTracks: () => [],
    },
  };
  const cache = new Map();
  function load(name) {
    if (name in mocks) return mocks[name];
    if (name.endsWith(".png")) return 1;
    if (!name.startsWith("./")) return require(name);
    if (cache.has(name)) return cache.get(name);
    const base = new URL("../src/" + name.slice(2), import.meta.url);
    const file = [".tsx", ".ts"]
      .map((ext) => base.href + ext)
      .find((f) => fs.existsSync(new URL(f)));
    const code = ts.transpileModule(fs.readFileSync(new URL(file), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const mod = { exports: {} };
    new Function("require", "module", "exports", code)(load, mod, mod.exports);
    cache.set(name, mod.exports);
    return mod.exports;
  }
  const App = load("./App").default;
  let tree;
  const press = async (label) => {
    const node = tree.root.findAll(
      (n) =>
        n.type === "Pressable" &&
        (n.props.accessibilityLabel === label ||
          n.findAllByType("Text").some((t) => t.props.children === label)),
    )[0];
    assert.ok(node, label);
    assert.ok(!node.props.disabled, label + " disabled");
    await act(async () => {
      node.props.onPress();
    });
  };
  const edit = async (label, value) => {
    await act(async () => {
      tree.root
        .findAllByType("TextInput")
        .find((n) => n.props.accessibilityLabel === label)
        .props.onChangeText(value);
    });
  };
  try {
    await act(async () => {
      tree = renderer.create(React.createElement(App));
    });
    await edit("Email", "maya@example.test");
    await edit("Password", "test");
    await press("Sign in");
    assert.equal(persisted, "fake-host");
    await press("Enter room early");
    assert.equal(awakeRooms, 0);
    assert.deepEqual(tree.root.findAllByType("Switch").map(n => n.props.value), [false, false]);
    await press("Enter room early");
    assert.equal(awakeRooms, 1);
    await press("End meeting options");
    await act(async () => {
      dialog[2].find(option => option.text === "Leave room").onPress();
    });
    assert.equal(awakeRooms, 0);
    await press("Enter room early");
    await press("Enter room early");
    assert.deepEqual(mediaProps, [
      [false, false],
      [false, false],
    ]);
    assert.equal(awakeRooms, 1);
    await press("Open meeting early");
    await press("Request recording consent");
    await press("Agree to recording and AI processing");
    assert.equal(tree.root.findAllByProps({ accessibilityLabel: "Recorded time 00:12" }).length, 0);
    await press("Start audio recording");
    assert.ok(tree.root.findAllByProps({ accessibilityLabel: "Recorded time 00:12" }).length > 0);
    await press("End meeting options");
    await act(async () => {
      dialog[2][1].onPress();
    });
    await press("Review & send");
    assert.equal(awakeRooms, 0);
    const input = tree.root
      .findAllByType("TextInput")
      .find((n) => n.props.accessibilityLabel === "Meeting notes");
    assert.equal(input.props.value, "Leo approved the new finish.");
    assert.equal(sent, undefined);
    await edit("Meeting notes", "Leo approved brushed aluminium.");
    await press("Send email");
    assert.deepEqual(sent, {
      notes: "Leo approved brushed aluminium.",
      followups: "Send sample Friday",
    });
    await press("View follow-ups");
    await press("Mark done");
    assert.equal(done, true);
  } finally {
    if (tree) await act(async () => tree.unmount());
    globalThis.fetch = originalFetch;
  }
});
