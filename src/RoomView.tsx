import React, { useState } from "react";
import { Modal, ScrollView, Pressable, StatusBar, StyleSheet, Switch, Text, View } from "react-native";
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
        <View style={styles.headerLine}>
          <Text accessibilityRole="header" accessibilityLabel={title} numberOfLines={1} style={styles.roomTitle}>{title}</Text>
          <View style={styles.liveBadge}>
            {live && <View style={styles.liveDot} />}
            <Text style={styles.secondary}>{live ? "Live" : "Room setup"}</Text>
          </View>
        </View>
        <View style={styles.headerMeta}>
          {!!subtitle && <Text style={styles.secondary}>{subtitle}</Text>}
          {status}
        </View>
      </View>
      <View style={styles.roomContent}>{children}</View>
      {footer}
    </SafeAreaView>
  );
}

export function ParticipantTile({ name, avatarName = name, micOn, sage, size = "setup", focus, children }: {
  name: string;
  avatarName?: string;
  micOn: boolean;
  sage?: boolean;
  size?: "setup" | "stage" | "preview";
  focus?: () => void;
  children?: React.ReactNode;
}) {
  const initials = avatarName.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase() || "?";
  const preview = size === "preview";
  const label = name + (micOn ? ", microphone on" : ", microphone off");
  const tile = <>
    <View style={[styles.video, size === "stage" ? styles.flex : preview ? styles.previewVideo : styles.setupVideo,
      sage && styles.sage, Boolean(children) && styles.cameraVideo]}>
      {children || <>
        <View style={[styles.avatar, sage && styles.sageAvatar, preview && styles.previewAvatar]}>
          <Text style={[styles.initials, sage && styles.sageInitials, preview && styles.previewInitials]}>{initials}</Text>
        </View>
      </>}
    </View>
    <View style={[styles.tileLabel, preview && styles.previewLabel]} accessible={!focus} accessibilityLabel={label}>
      <Ionicons name={micOn ? "mic-outline" : "mic-off-outline"} size={preview ? 13 : 16} color={muted} />
      <Text numberOfLines={1} style={[styles.tileName, preview && styles.secondary]}>{name}</Text>
    </View>
  </>;
  return focus ? (
    <Pressable accessibilityRole="button" accessibilityLabel={`Focus ${label}`} onPress={focus} style={[styles.tile, styles.preview]}>{tile}</Pressable>
  ) : <View style={[styles.tile, size === "stage" && styles.flex]}>{tile}</View>;
}

export function ParticipantPreviews({ children }: { children: React.ReactNode }) {
  return <View style={styles.previewRail}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.previewContent}>{children}</ScrollView>
  </View>;
}

export function RoomControls({ children }: { children: React.ReactNode }) {
  return <View style={styles.controls}>{children}</View>;
}

export function RoomSheet({ title, busy, close, children }: {
  title: string;
  busy?: boolean;
  close: () => void;
  children: React.ReactNode;
}) {
  const dismiss = () => { if (!busy) close(); };
  return (
    <Modal transparent statusBarTranslucent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.scrim}>
        <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={dismiss} />
        <SafeAreaView edges={["bottom", "left", "right"]} style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.headerLine}>
            <Text accessibilityRole="header" style={[s.heading, roomText, styles.flex]}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close options" disabled={busy} style={styles.sheetClose} onPress={dismiss}>
              <Ionicons name="close" size={23} color={white} />
            </Pressable>
          </View>
          <ScrollView bounces={false} contentContainerStyle={styles.sheetContent}>{children}</ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export function RoomButton({ label, onPress, disabled, kind = "secondary" }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  kind?: "primary" | "secondary" | "danger" | "inline";
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, buttonStyles[kind], (disabled || pressed) && styles.dim]}>
    <Text style={[styles.buttonText, kind === "primary" && styles.primaryText]}>{label}</Text>
  </Pressable>;
}

export function RoomControl({ icon, label, accessibilityLabel, danger, active, disabled, onPress }: {
  icon: IconName;
  label: string;
  accessibilityLabel?: string;
  danger?: boolean;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} disabled={disabled}
      onPress={onPress} style={({ pressed }) => [styles.control, (disabled || pressed) && styles.dim]}>
      <View style={[styles.bubble, active && styles.active, danger && styles.danger]}><Ionicons name={icon} size={23} color={white} /></View>
      <Text style={styles.controlLabel}>{label}</Text>
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
  roomHeader: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, gap: 5 },
  headerLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  roomTitle: { flex: 1, color: white, fontSize: 18, letterSpacing: -0.45, fontWeight: "600" },
  headerMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 },
  liveBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 9, paddingVertical: 4, gap: 5, borderRadius: 8, backgroundColor: "#332939" },
  liveDot: { backgroundColor: "#afc8a9", width: 7, height: 7, borderRadius: 4 },
  secondary: { color: muted, fontSize: 13 },
  roomContent: { flex: 1, paddingHorizontal: 8, gap: 6 },
  tile: { overflow: "hidden", borderRadius: 17, borderWidth: 1, borderColor: "#51435a", backgroundColor: "#2d2433" },
  video: { backgroundColor: "#382d43", justifyContent: "center", alignItems: "center", overflow: "hidden" },
  setupVideo: { minHeight: 144 },
  cameraVideo: { backgroundColor: "#151219" },
  sage: { backgroundColor: "#2d423b" },
  avatar: { width: 70, height: 70, borderRadius: 35, backgroundColor: "#d8c5e6", alignItems: "center", justifyContent: "center" },
  sageAvatar: { backgroundColor: "#c3d6c6" },
  initials: { color: "#442d53", fontSize: 25, fontWeight: "600" },
  sageInitials: { color: "#30463a" },
  tileLabel: { paddingHorizontal: 12, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 6 },
  tileName: { color: white, flexShrink: 1, fontSize: 14 },
  previewRail: { flexShrink: 0 },
  previewContent: { flexGrow: 1, gap: 8, justifyContent: "flex-end" },
  preview: { width: 96, borderRadius: 12 },
  previewVideo: { height: 64 },
  previewAvatar: { width: 34, height: 34, borderRadius: 17 },
  previewInitials: { fontSize: 13 },
  previewLabel: { paddingHorizontal: 5, paddingVertical: 3, gap: 3 },
  controls: { flexDirection: "row", justifyContent: "center", alignItems: "center", paddingHorizontal: 6, paddingVertical: 10 },
  control: { flex: 1, maxWidth: 90, alignItems: "center", gap: 5 },
  controlLabel: { color: muted, fontSize: 12, textAlign: "center" },
  dim: { opacity: 0.64 },
  bubble: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#39323f" },
  active: { backgroundColor: "#784252" },
  danger: { backgroundColor: "#693f4a" },
  scrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "#100d16aa" },
  sheet: { maxHeight: "84%", backgroundColor: "#332939", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 10 },
  sheetClose: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  sheetContent: { gap: 10, paddingTop: 8, paddingBottom: 18 },
  button: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  primary: { backgroundColor: "#e8d8f0" },
  secondaryButton: { backgroundColor: "#45394e" },
  inlineButton: { alignSelf: "flex-start", backgroundColor: "#393041" },
  buttonText: { color: white, fontSize: 14, fontWeight: "600", textAlign: "center" },
  primaryText: { color: dark },
});

const buttonStyles = { primary: styles.primary, secondary: styles.secondaryButton, danger: styles.danger, inline: styles.inlineButton };
