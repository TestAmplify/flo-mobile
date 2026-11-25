import React, { useState } from "react";
import { ScrollView, Pressable, StatusBar, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { dateLabel, type Meeting } from "./api";
import { Action, Notice, Page, ink, s } from "./ui";

export type RoomDevices = { mic: boolean; camera: boolean };
const dark = "#211c26";
const white = "#f9f3fa";
const muted = "#ccc2d1";
type IconName = React.ComponentProps<typeof Ionicons>["name"];

export function RoomSetup({ meeting, busy, error, back, join }: {
  meeting: Meeting;
  busy: boolean;
  error: string;
  back: () => void;
  join: (devices: RoomDevices) => void;
}) {
  const [mic, setMic] = useState(false);
  const [camera, setCamera] = useState(false);
  const required = meeting.recordingMode === "required";
  const label = required ? "Agree and join" : meeting.organizer?.canPrepare ? "Enter room early" : "Join room";
  const control = (name: string, icon: IconName, value: boolean, onChange: (next: boolean) => void) => (
    <View style={styles.deviceLine}>
      <Ionicons name={icon} size={22} color={ink} />
      <Text style={[s.text, styles.flex]}>{name}</Text>
      <Text style={s.meta}>{value ? "On" : "Off"}</Text>
      <Switch accessibilityLabel={name} disabled={busy} value={value} onValueChange={onChange} />
    </View>
  );
  return (
    <Page footer={
      <View style={styles.setupFooter}>
        <Notice>{error}</Notice>
        <Action label={busy ? "Joining…" : label} disabled={busy} onPress={() => join({ mic, camera })} />
      </View>
    }>
      <StatusBar barStyle="dark-content" />
      <Pressable style={styles.inline} accessibilityRole="button" accessibilityLabel="Back to Meetings" disabled={busy} onPress={back}>
        <Ionicons name="chevron-back" size={20} color={ink} />
        <Text style={s.heading}>Meetings</Text>
      </Pressable>
      <View style={styles.setupHeading}>
        <Text style={s.meta}>{dateLabel(meeting.startTime)}</Text>
        <Text style={s.title}>{meeting.title}</Text>
      </View>
      <ParticipantTile name="You" micOn={mic} />
      <Text style={s.heading}>Before you join</Text>
      {control("Microphone", mic ? "mic-outline" : "mic-off-outline", mic, setMic)}
      {meeting.callMode !== "audio" && control("Camera", camera ? "videocam-outline" : "videocam-off-outline", camera, setCamera)}
      {required && <Text style={s.meta}>Joining requires consent to audio recording and AI processing.</Text>}
    </Page>
  );
}

export function RoomCanvas({ title, subtitle, status, children, footer, live = true }: {
  title: string;
  subtitle?: string;
  status?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  live?: boolean;
}) {
  return (
    <SafeAreaView style={styles.room}>
      <StatusBar barStyle="light-content" />
      <View style={styles.roomHeader}>
        <View style={styles.inline}>
          {live && <View style={styles.liveDot} />}
          <Text style={styles.secondary}>{live ? "Live" : "Room setup"}</Text>
        </View>
        <Text accessibilityRole="header" style={styles.roomTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.secondary}>{subtitle}</Text>}
        {status}
      </View>
      <ScrollView contentContainerStyle={styles.roomContent}>{children}</ScrollView>
      {footer}
    </SafeAreaView>
  );
}

export function ParticipantTile({ name, micOn, sage, children }: {
  name: string;
  micOn: boolean;
  sage?: boolean;
  children?: React.ReactNode;
}) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
  return (
    <View style={[styles.tile, sage && styles.sage]}>
      {children || <>
        {[122, 184, 246, 308].map(size => (
          <View key={size} style={[styles.arc, { width: size, height: size, borderRadius: size / 2, top: 18 - size / 2, right: 12 - size / 2 }]} />
        ))}
        <View style={[styles.avatar, sage && styles.sageAvatar]}>
          <Text style={[styles.initials, sage && styles.sageInitials]}>{initials}</Text>
        </View>
      </>}
      <View style={styles.tileLabel} accessibilityLabel={name + (micOn ? ", microphone on" : ", microphone off")}>
        <Ionicons name={micOn ? "mic-outline" : "mic-off-outline"} size={17} color={white} />
        <Text numberOfLines={1} style={styles.tileName}>{name}</Text>
      </View>
    </View>
  );
}

export function RoomControls({ children }: { children: React.ReactNode }) {
  return <View style={styles.controls}>{children}</View>;
}

export function RoomPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.panel}>
    <Text style={[s.heading, roomText]}>{title}</Text>
    {children}
  </View>;
}

export function RoomControl({ icon, label, accessibilityLabel, danger, disabled, onPress }: {
  icon: IconName;
  label: string;
  accessibilityLabel?: string;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} disabled={disabled}
      onPress={onPress} style={({ pressed }) => [styles.control, (disabled || pressed) && styles.dim]}>
      <View style={[styles.bubble, danger && styles.danger]}><Ionicons name={icon} size={23} color={white} /></View>
      <Text style={styles.secondary}>{label}</Text>
    </Pressable>
  );
}

export const roomText = { color: white };
export const roomSecondary = { color: muted, fontSize: 14 };
const styles = StyleSheet.create({
  flex: { flex: 1 },
  inline: { flexDirection: "row", alignItems: "center", gap: 8 },
  setupHeading: { gap: 8, paddingTop: 8 },
  setupFooter: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 10, gap: 8 },
  deviceLine: { minHeight: 50, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#d7d0d9", flexDirection: "row", alignItems: "center", gap: 12 },
  room: { flex: 1, backgroundColor: dark },
  roomHeader: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, gap: 9 },
  roomTitle: { color: white, fontSize: 32, letterSpacing: -1.35, fontWeight: "600" },
  liveDot: { backgroundColor: "#afc8a9", width: 7, height: 7, borderRadius: 4 },
  secondary: { color: muted, fontSize: 13 },
  roomContent: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  tile: { backgroundColor: "#382d43", borderColor: "#51435a", borderWidth: 1, minHeight: 174,
    borderRadius: 22, justifyContent: "center", alignItems: "center", overflow: "hidden" },
  sage: { backgroundColor: "#2d423b", borderColor: "#435a50" },
  arc: { position: "absolute", borderWidth: 1, borderColor: "#ffffff12" },
  avatar: { width: 70, height: 70, borderRadius: 35, backgroundColor: "#d8c5e6", alignItems: "center", justifyContent: "center" },
  sageAvatar: { backgroundColor: "#c3d6c6" },
  initials: { color: "#442d53", fontSize: 25, fontWeight: "600" },
  sageInitials: { color: "#30463a" },
  tileLabel: { position: "absolute", bottom: 10, left: 10, right: 10, alignSelf: "flex-start",
    paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#211c2680" },
  tileName: { color: white, flexShrink: 1, fontSize: 14 },
  panel: { backgroundColor: "#332939", borderWidth: 1, borderColor: "#55435e", borderRadius: 18, padding: 14, gap: 10 },
  controls: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: "#514654", flexDirection: "row",
    justifyContent: "center", gap: 24, alignItems: "center", paddingHorizontal: 12, paddingVertical: 12 },
  control: { alignItems: "center", gap: 7, minWidth: 60 },
  dim: { opacity: 0.64 },
  bubble: { width: 49, height: 49, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#39323f" },
  danger: { backgroundColor: "#693f4a" },
});
