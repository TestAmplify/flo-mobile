import React from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
export const ink = "#28212f",
  purple = "#6935ad",
  paper = "#faf8f5",
  lilac = "#eee7f2";
export const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: paper },
  body: { paddingHorizontal: 22, paddingVertical: 22, gap: 16, flexGrow: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  title: {
    fontSize: 36,
    lineHeight: 41,
    fontWeight: "600",
    letterSpacing: -1.8,
    color: ink,
  },
  heading: {
    fontSize: 20,
    fontWeight: "600",
    color: ink,
    letterSpacing: -0.55,
  },
  text: { fontSize: 16, lineHeight: 23, color: ink },
  meta: { fontSize: 14, lineHeight: 21, color: "#615969" },
  card: {
    backgroundColor: "#fffdfc",
    borderWidth: 1,
    borderColor: "#dfd9e1",
    borderRadius: 22,
    padding: 20,
    gap: 12,
  },
  feature: { backgroundColor: lilac, borderColor: "#e1d5ec" },
  label: { fontSize: 13, fontWeight: "600", color: purple },
  input: {
    color: ink,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#cfc7d3",
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 13,
    backgroundColor: "#fff",
  },
});
export function Page({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <SafeAreaView style={s.page}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {footer}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Brand() {
  return (
    <View style={s.row}>
      <Image
        source={require("../assets/flo-waveform.png")}
        style={{ width: 34, height: 34 }}
        resizeMode="contain"
      />
      <Text style={s.heading}>Flo</Text>
    </View>
  );
}
export function Action({
  label,
  onPress,
  secondary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 14,
        minHeight: 46,
        paddingHorizontal: 17,
        paddingVertical: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: secondary ? "#eee9ef" : ink,
        opacity: disabled ? 0.48 : pressed ? 0.72 : 1,
      })}
    >
      <Text
        style={{
          fontSize: 15,
          fontWeight: "600",
          color: secondary ? ink : "white",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function Field({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={s.meta}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        style={[
          s.input,
          props.multiline && { minHeight: 95, textAlignVertical: "top" },
        ]}
      />
    </View>
  );
}
export function Notice({ children }: { children: string }) {
  return children ? (
    <Text
      accessibilityLiveRegion="polite"
      style={{ color: "#803840", fontSize: 15 }}
    >
      {children}
    </Text>
  ) : null;
}
