/**
 * Transactional email abstraction. Business logic only ever calls this interface;
 * the provider is chosen from env: BREVO_API_KEY enables the real Brevo provider,
 * otherwise (or with OTP_DELIVERY=console) messages go to the server log.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailService {
  sendOtpEmail(to: string, code: string): Promise<void>;
  sendWelcome(to: string, name: string): Promise<void>;
  sendOrderConfirmation(to: string, details: { orderNumber: string; restaurantName: string; total: number }): Promise<void>;
  sendOrderStatus(to: string, details: { orderNumber: string; status: string }): Promise<void>;
  sendOrderCancelled(to: string, details: { orderNumber: string }): Promise<void>;
}

const FROM = process.env.EMAIL_FROM ?? "Ramnagar Eats <noreply@ramnagareats.test>";

function fromParts(): { name: string; email: string } {
  const match = FROM.match(/^(.*?)\s*<([^>]+)>$/);
  return match ? { name: match[1].trim(), email: match[2] } : { name: "Ramnagar Eats", email: FROM };
}

/** Real Brevo transactional API (free tier: 300 emails/day). */
class BrevoEmailProvider implements EmailService {
  private readonly apiKey = process.env.BREVO_API_KEY ?? "";

  private async send(message: EmailMessage) {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": this.apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: fromParts(),
        to: [{ email: message.to }],
        subject: message.subject,
        textContent: message.text,
        htmlContent: message.html,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Brevo send failed (${response.status}): ${detail.slice(0, 300)}`);
    }
  }

  async sendOtpEmail(to: string, code: string) {
    await this.send({
      to,
      subject: `Your Ramnagar Eats verification code: ${code}`,
      text: `Your verification code is ${code}.\n\nIt expires in 5 minutes. If you didn't request this, you can ignore this email.`,
      html: `<p>Your verification code is</p><h1 style="letter-spacing:4px">${code}</h1><p>It expires in 5 minutes. If you didn't request this, you can ignore this email.</p>`,
    });
  }

  async sendWelcome(to: string, name: string) {
    await this.send({ to, subject: "Welcome to Ramnagar Eats 🍽️", text: `Hi ${name},\n\nWelcome to Ramnagar Eats! Your account is ready.\n\nOrder from kitchens around the corner and track it live.` });
  }

  async sendOrderConfirmation(to: string, details: { orderNumber: string; restaurantName: string; total: number }) {
    await this.send({
      to,
      subject: `Order ${details.orderNumber} confirmed`,
      text: `Your order ${details.orderNumber} from ${details.restaurantName} is confirmed.\nTotal: ₹${details.total}\n\nTrack it live from your orders page.`,
    });
  }

  async sendOrderStatus(to: string, details: { orderNumber: string; status: string }) {
    await this.send({ to, subject: `Order ${details.orderNumber} — ${details.status}`, text: `Your order ${details.orderNumber} is now: ${details.status}.` });
  }

  async sendOrderCancelled(to: string, details: { orderNumber: string }) {
    await this.send({ to, subject: `Order ${details.orderNumber} cancelled`, text: `Your order ${details.orderNumber} was cancelled. Any payment will be refunded.` });
  }
}

/** Development provider: writes to the server log. Never sends real mail. */
class ConsoleEmailProvider implements EmailService {
  private async send(message: EmailMessage) {
    console.info(`[email] To: ${message.to}\n[email] Subject: ${message.subject}\n[email] ${message.text.replace(/\n/g, "\n[email] ")}`);
  }

  async sendOtpEmail(to: string, code: string) {
    await this.send({ to, subject: "Your Ramnagar Eats verification code", text: `Your verification code is ${code}. It expires in 5 minutes.` });
  }

  async sendWelcome(to: string, name: string) {
    await this.send({ to, subject: "Welcome to Ramnagar Eats 🍽️", text: `Hi ${name},\n\nWelcome to Ramnagar Eats! Your account is ready.` });
  }

  async sendOrderConfirmation(to: string, details: { orderNumber: string; restaurantName: string; total: number }) {
    await this.send({ to, subject: `Order ${details.orderNumber} confirmed`, text: `Your order ${details.orderNumber} from ${details.restaurantName} is confirmed.\nTotal: ₹${details.total}` });
  }

  async sendOrderStatus(to: string, details: { orderNumber: string; status: string }) {
    await this.send({ to, subject: `Order ${details.orderNumber} — ${details.status}`, text: `Your order ${details.orderNumber} is now: ${details.status}.` });
  }

  async sendOrderCancelled(to: string, details: { orderNumber: string }) {
    await this.send({ to, subject: `Order ${details.orderNumber} cancelled`, text: `Your order ${details.orderNumber} was cancelled. Any payment will be refunded.` });
  }
}

function provider(): EmailService {
  // Force console delivery for local testing even when a Brevo key is present.
  if ((process.env.OTP_DELIVERY ?? "") === "console") return new ConsoleEmailProvider();
  if (process.env.BREVO_API_KEY) return new BrevoEmailProvider();
  return new ConsoleEmailProvider();
}

export const emailService: EmailService = provider();
