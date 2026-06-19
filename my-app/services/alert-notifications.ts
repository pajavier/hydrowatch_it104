import { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { Database } from "@/types/database.types";
import { SystemAlert } from "@/types/hydrowatch";

let resendClient: Resend | null = null;

type AlertEmailInput = {
  alert: SystemAlert;
  deviceId: string;
  supabase: SupabaseClient<Database>;
  userId: string;
};

export async function sendAlertEmail({ alert, deviceId, supabase, userId }: AlertEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_EMAIL_FROM;

  if (!apiKey || !from) {
    console.warn("[ALERT EMAIL SKIPPED] Resend environment is incomplete", {
      hasApiKey: Boolean(apiKey),
      hasFrom: Boolean(from),
      user_id: userId,
      recipientEmail: null,
      type: alert.type,
      severity: alert.severity,
    });
    return;
  }

  const to = await getVerifiedUserEmail(supabase, userId);
  if (!to) {
    console.warn("[ALERT EMAIL SKIPPED] Missing verified user email", {
      alertId: alert.id,
      user_id: userId,
      recipientEmail: null,
      type: alert.type,
      severity: alert.severity,
    });
    return;
  }

  resendClient ??= new Resend(apiKey);

  const { error } = await resendClient.emails.send({
    from: `HydroWatch Alerts <${from}>`,
    to,
    subject: `[HydroWatch] ${alert.severity}: ${alert.title}`,
    text: [
      `${alert.severity}: ${alert.title}`,
      `Device: ${deviceId}`,
      `Type: ${alert.type}`,
      `Detected: ${alert.timestamp}`,
      alert.ntuValue !== undefined ? `NTU: ${alert.ntuValue}` : null,
      "",
      alert.message,
      "",
      `Recommended action: ${alert.action}`,
    ]
      .filter((line): line is string => line !== null)
      .join("\n"),
  });

  if (error) {
    console.error("[ALERT EMAIL FAILED]", {
      alertId: alert.id,
      deviceId,
      user_id: userId,
      recipientEmail: to,
      type: alert.type,
      severity: alert.severity,
      error,
    });
    return;
  }

  console.info("[ALERT EMAIL SENT]", {
    alertId: alert.id,
    deviceId,
    user_id: userId,
    recipientEmail: to,
    severity: alert.severity,
    type: alert.type,
  });
}

async function getVerifiedUserEmail(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase.auth.admin.getUserById(userId);

  if (error) {
    console.warn("[ALERT EMAIL SKIPPED] Missing verified user email", {
      user_id: userId,
      recipientEmail: null,
      error: error.message,
    });
    return null;
  }

  const user = data.user;
  if (!user?.email || !user.email_confirmed_at) {
    return null;
  }

  return user.email;
}
