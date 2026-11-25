import React, { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Client, Meeting, message, pathFor, useResource } from "./api";
import { Page, Action, Field, Notice, s } from "./ui";
type Outcome = {
  _id: string;
  captureId: string;
  title: string;
  type: string;
  status: string;
  dueDate?: string;
  meetingReview?: { status: string };
  taskologicWorkId?: string;
  workStatus?: string;
};
type Records = {
  captures: { _id: string; state: string; analysis?: { summary?: string } }[];
  outcomes: Outcome[];
};
type Receipt = {
  canSend: boolean;
  recipient: string;
  draft?: { notes: string; followups: string };
  emails: { state: string; acceptedAt?: string }[];
};
export function AfterMeeting({
  api,
  meeting,
  back,
  initialFollow = false,
}: {
  api: Client;
  meeting: Meeting;
  back: () => void;
  initialFollow?: boolean;
}) {
  const [screen, setScreen] = useState<"recap" | "edit" | "sent" | "follow">(
    initialFollow ? "follow" : "recap",
  );
  const captures = pathFor(meeting) + "/captures",
    delivery = "/flo/booking-settings/recap/" + encodeURIComponent(meeting._id);
  const data = useResource(
    useCallback(() => api<Records>(captures), [api, captures]),
    5000,
  );
  const receipt = useResource(
    useCallback(() => api<Receipt>(delivery), [api, delivery]),
    7000,
  );
  const [notes, setNotes] = useState<string>(),
    [actions, setActions] = useState<string>();
  const priorReceipt = useRef<Receipt | undefined>(undefined);
  const [sent, setSent] = useState<Receipt>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const locked = useRef(false);
  const records = data.value,
    guest = receipt.value;
  const steps = (records?.outcomes || []).filter(
    (o) =>
      ["commitment", "follow_up"].includes(o.type) &&
      o.meetingReview?.status !== "rejected" &&
      o.status !== "archived",
  );
  const summary =
    notes ??
    guest?.draft?.notes ??
    records?.captures
      .map((c) => c.analysis?.summary)
      .filter(Boolean)
      .join("\n\n") ??
    "";
  const items =
    actions ?? guest?.draft?.followups ?? steps.map((o) => o.title).join("\n");
  const run = async (fn: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const latest =
    receipt.value === priorReceipt.current
      ? sent?.emails[0]
      : (receipt.value?.emails[0] ?? sent?.emails[0]);
  return (
    <Page>
      <Action
        secondary
        label={screen === "edit" ? "Back to recap" : "Back to Meetings"}
        onPress={screen === "edit" ? () => setScreen("recap") : back}
      />
      <Text style={s.label}>{meeting.title}</Text>
      <Text style={s.title}>
        {
          {
            recap: "Recap & actions",
            edit: "Review & send",
            sent: "Guest recap",
            follow: "Follow-ups",
          }[screen]
        }
      </Text>
      <Notice>
        {error || data.error || (screen === "follow" ? "" : receipt.error)}
      </Notice>
      {screen === "recap" && (
        <>
          <View style={[s.card, s.feature]}>
            <Text style={s.heading}>Meeting notes</Text>
            <Text style={s.text}>
              {summary ||
                (!records
                  ? "Loading capture…"
                  : records.captures.length
                    ? "Capture · " + records.captures[0].state
                    : "No recording for this meeting.")}
            </Text>
          </View>
          {items !== "" && (
            <View style={s.card}>
              <Text style={s.heading}>Follow-ups</Text>
              <Text style={s.text}>{items}</Text>
            </View>
          )}
          {guest?.canSend && (
            <Action label="Review & send" onPress={() => setScreen("edit")} />
          )}
          {guest && !guest.canSend && (
            <Text style={s.meta}>
              A recap can be shared after a verified guest attends and the
              meeting ends.
            </Text>
          )}
          <Action
            secondary
            label="View follow-ups"
            onPress={() => setScreen("follow")}
          />
        </>
      )}
      {screen === "edit" && (
        <>
          <View style={s.card}>
            <Text style={s.label}>To</Text>
            <Text style={s.text}>{guest?.recipient}</Text>
          </View>
          <Field
            label="Meeting notes"
            multiline
            maxLength={5000}
            value={summary}
            onChangeText={setNotes}
          />
          <Field
            label="Follow-ups"
            multiline
            maxLength={3000}
            value={items}
            onChangeText={setActions}
          />
          <Action
            label={busy ? "Sending…" : "Send email"}
            disabled={
              busy || !guest?.canSend || !(summary.trim() || items.trim())
            }
            onPress={() =>
              void run(async () => {
                const result = await api<Receipt>(delivery, {
                  notes: summary,
                  followups: items,
                });
                priorReceipt.current = receipt.value;
                setSent(result);
                receipt.refresh();
                setScreen("sent");
              })
            }
          />
        </>
      )}
      {screen === "sent" && (
        <>
          <View style={[s.card, s.feature]}>
            <Text style={s.heading}>
              {latest?.state === "accepted"
                ? "Accepted by email provider"
                : latest?.state === "failed"
                  ? "Email failed"
                  : "Queued for delivery"}
            </Text>
            <Text style={s.text}>{sent?.recipient}</Text>
          </View>
          <Action label="View follow-ups" onPress={() => setScreen("follow")} />
        </>
      )}
      {screen === "follow" && (
        <>
          {!records ? (
            <Text style={s.meta}>Loading follow-ups…</Text>
          ) : !steps.length ? (
            <Text style={s.meta}>No captured follow-ups yet.</Text>
          ) : (
            steps.map((o) => (
              <View style={s.card} key={o._id}>
                <Text style={s.heading}>{o.title}</Text>
                <Text style={s.meta}>
                  {o.status === "resolved" || o.workStatus === "done"
                    ? "Done"
                    : o.dueDate
                      ? "Due " + new Date(o.dueDate).toLocaleDateString()
                      : "No due date"}
                </Text>
                {o.meetingReview?.status === "suggested" &&
                  !o.taskologicWorkId &&
                  !["resolved", "archived"].includes(o.status) && (
                    <Action
                      secondary
                      label="Mark done"
                      disabled={busy}
                      onPress={() =>
                        void run(async () => {
                          await api(
                            captures +
                              "/" +
                              encodeURIComponent(o.captureId) +
                              "/outcomes/" +
                              encodeURIComponent(o._id) +
                              "/review",
                            { action: "resolve" },
                          );
                          data.refresh();
                        })
                      }
                    />
                  )}
              </View>
            ))
          )}
        </>
      )}
    </Page>
  );
}
