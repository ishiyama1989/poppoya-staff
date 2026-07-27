import { supabase } from "./supabase";

const VAPID_PUBLIC_KEY =
  "BNsFp471tS5ythbwIkmx_5pjy5SzQNdL-ehVt3GcJKxKh2mH83zCq53F06daJvprvnYQhhPIETyZpY9Rv1sKKww";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// 現在このデバイスで通知が有効か
export async function isPushEnabled(): Promise<boolean> {
  if (!pushSupported()) return false;
  if (Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

// 通知を有効化（許可リクエスト → 購読 → Supabaseに保存）
export async function enablePush(
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!pushSupported()) {
    return { ok: false, error: "この端末は通知に対応していません" };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "通知が許可されませんでした" };
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        subscription: sub.toJSON(),
      },
      { onConflict: "endpoint" }
    );
    if (error) return { ok: false, error: "保存に失敗しました" };
    return { ok: true };
  } catch {
    return { ok: false, error: "通知の登録に失敗しました" };
  }
}

// 通知を無効化（購読解除 + Supabaseから削除）
export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
  } catch {
    /* noop */
  }
}

// 指定ユーザーにプッシュ通知を送る（Edge Function 経由）
export async function sendPushToUsers(
  userIds: string[],
  title: string,
  body: string,
  url = "/"
): Promise<void> {
  if (userIds.length === 0) return;
  try {
    await supabase.functions.invoke("send-push", {
      body: { userIds, title, body, url },
    });
  } catch {
    /* 通知失敗はアプリ動作に影響させない */
  }
}
