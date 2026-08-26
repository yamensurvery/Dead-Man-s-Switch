import { resend, FROM_EMAIL } from './resend';

type SendResult = { success: true; id: string } | { success: false; error: string };

async function safeSend(params: Parameters<typeof resend.emails.send>[0]): Promise<SendResult> {
  try {
    const { data, error } = await resend.emails.send(params);
    if (error) {
      console.error('[email] Resend returned an error:', error);
      return { success: false, error: error.message };
    }
    return { success: true, id: data!.id };
  } catch (err) {
    console.error('[email] Send threw:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Sent to the switch owner as they enter the grace period —
 * a "you missed your check-in, here's your countdown" warning.
 */
export async function sendGracePeriodWarning(params: {
  to: string;
  switchName: string;
  gracePeriodEndsAt: Date;
  checkInUrl: string;
}): Promise<SendResult> {
  const { to, switchName, gracePeriodEndsAt, checkInUrl } = params;
  const formattedDate = gracePeriodEndsAt.toLocaleString('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  return safeSend({
    from: FROM_EMAIL,
    to,
    subject: `Action needed: "${switchName}" check-in overdue`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Your check-in is overdue</h2>
        <p>Your dead man's switch <strong>"${switchName}"</strong> did not receive a check-in on schedule.</p>
        <p>You are now in the grace period. If you don't check in by:</p>
        <p style="font-size: 18px; font-weight: bold;">${formattedDate}</p>
        <p>your designated recipients will be notified and given access to what you've stored.</p>
        <a href="${checkInUrl}" style="display:inline-block; padding:12px 24px; background:#111; color:#fff; text-decoration:none; border-radius:6px;">
          Check in now
        </a>
      </div>
    `,
  });
}

/**
 * Sent to the switch owner as confirmation their check-in was recorded.
 */
export async function sendCheckInConfirmation(params: {
  to: string;
  switchName: string;
  nextDeadline: Date;
}): Promise<SendResult> {
  const { to, switchName, nextDeadline } = params;
  const formattedDate = nextDeadline.toLocaleString('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  return safeSend({
    from: FROM_EMAIL,
    to,
    subject: `Check-in confirmed for "${switchName}"`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>You're checked in</h2>
        <p>Your switch <strong>"${switchName}"</strong> has been reset.</p>
        <p>Next check-in deadline:</p>
        <p style="font-size: 18px; font-weight: bold;">${formattedDate}</p>
      </div>
    `,
  });
}

/**
 * Sent to a recipient once the switch has triggered.
 * Note: this is a stub notification only — it does NOT include any
 * decrypted content or key material. It just tells the recipient
 * something is waiting for them, with a link to the (future) recipient portal.
 */
export async function sendRecipientTriggerNotification(params: {
  to: string;
  ownerDisplayName: string;
}): Promise<SendResult> {
  const { to, ownerDisplayName } = params;

  return safeSend({
    from: FROM_EMAIL,
    to,
    subject: `You've been designated as a recipient by ${ownerDisplayName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>It's time</h2>
        <p>${ownerDisplayName}'s check-in period has lapsed.</p>
        <p>You can now use the access link you were sent when you were originally designated as a recipient.</p>
        <p style="color:#888; font-size:12px; margin-top:24px;">
          This is an automated message. If you believe you received this in error, no action is needed.
        </p>
      </div>
    `,
  });
}
export async function sendRecipientInviteNotification(params: {
  to: string;
  ownerDisplayName: string;
  accessUrl: string;
}): Promise<SendResult> {
  const { to, ownerDisplayName, accessUrl } = params;

  return safeSend({
    from: FROM_EMAIL,
    to,
    subject: `${ownerDisplayName} has designated you as a recipient`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>You've been designated as a recipient</h2>
        <p>${ownerDisplayName} has set up a secure dead man's switch and designated you as a recipient.</p>
        <p>Nothing is available to you yet — this link will only work if their check-in period lapses.</p>
        <p><strong>Save this email.</strong> This link is the only way to access what was shared with you, and it cannot be resent or recovered if lost.</p>
        <a href="${accessUrl}" style="display:inline-block; padding:12px 24px; background:#111; color:#fff; text-decoration:none; border-radius:6px;">
          View your access link
        </a>
        <p style="color:#888; font-size:12px; margin-top:24px;">
          This is an automated message. If you believe you received this in error, no action is needed.
        </p>
      </div>
    `,
  });
}