import { Resend } from 'resend';

// Resend restricts sending to `onboarding@resend.dev` → the account owner's
// own email until a custom domain is verified. Swap this once a real domain
// (e.g. noreply@stayintouch.app) is verified in the Resend dashboard.
const FROM_ADDRESS = 'Stay In Touch <onboarding@resend.dev>';

export async function sendEmail(
  apiKey: string,
  { to, subject, html }: { to: string; subject: string; html: string },
) {
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }

  return data;
}
