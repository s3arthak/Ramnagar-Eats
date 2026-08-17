/**
 * Transactional email abstraction. Business logic only ever calls this interface;
 * the provider is chosen from env:
 *  - OTP_DELIVERY=console        → messages go to the server log (dev)
 *  - SMTP_HOST+SMTP_USER+PASS    → real delivery via SMTP relay (e.g. Brevo SMTP)
 *  - BREVO_API_KEY               → real delivery via the Brevo REST API
 *  - default                     → console (safe local fallback)
 *
 * All real-provider messages share the same branded HTML template (brand name,
 * currency, and a track-order link come from server config / env).
 */

import nodemailer from "nodemailer";
import { config } from "../config.js";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface OrderEmailDetails {
  orderNumber: string;
  orderId: string;
  restaurantName?: string;
  total?: number;
  status?: string;
}

export interface EmailService {
  sendOtpEmail(to: string, code: string): Promise<void>;
  sendWelcome(to: string, name: string): Promise<void>;
  sendOrderConfirmation(to: string, details: OrderEmailDetails): Promise<void>;
  sendOrderStatus(to: string, details: OrderEmailDetails): Promise<void>;
  sendOrderCancelled(to: string, details: OrderEmailDetails): Promise<void>;
}

const FROM = process.env.EMAIL_FROM ?? `${config.brandName} <noreply@ramnagareats.test>`;
const customerWebUrl = () => process.env.CUSTOMER_WEB_URL ?? "http://localhost:3000";

function fromParts(): { name: string; email: string } {
  const match = FROM.match(/^(.*?)\s*<([^>]+)>$/);
  return match ? { name: match[1].trim(), email: match[2] } : { name: config.brandName, email: FROM };
}

/** Reserved TLDs (RFC 2606) and common placeholder domains that can never receive mail. */
const PLACEHOLDER_DOMAINS = ["yourdomain.com", "your-domain.com", "example.com", "example.org", "example.net", "domain.com", "email.com"];

function fromDomainLooksPlaceholder(): boolean {
  const domain = fromParts().email.split("@")[1]?.toLowerCase() ?? "";
  const tld = domain.split(".").pop() ?? "";
  return PLACEHOLDER_DOMAINS.includes(domain) || ["test", "example", "invalid", "localhost"].includes(tld);
}

function warnIfPlaceholderSender() {
  if (fromDomainLooksPlaceholder()) {
    console.warn(
      `[email] EMAIL_FROM is set to a non-deliverable placeholder (${FROM}). ` +
        `Real emails will fail to reach recipients — use a sender address on a domain verified with the email provider.`,
    );
  }
}

/** Human-friendly OTP validity window derived from the configured TTL. */
function otpValidityCopy(): string {
  const minutes = Math.round(config.otp.ttlMs / 60_000);
  return minutes >= 1 ? `${minutes} minutes` : `${Math.round(config.otp.ttlMs / 1000)} seconds`;
}

/** "ACCEPTED" → "Accepted", "OUT_FOR_DELIVERY" → "Out for delivery". */
function prettyStatus(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

interface Mail {
  subject: string;
  text: string;
  html: string;
}

/** Shared branded HTML shell — clean, responsive, matches the app's palette. */
function brandedHtml(title: string, bodyLines: string[], opts: { cta?: { label: string; url: string }; bigCode?: string } = {}): string {
  const code = opts.bigCode
    ? `<p style="margin:18px 0;text-align:center;font-size:30px;font-weight:800;letter-spacing:8px;color:#173b35">${opts.bigCode}</p>`
    : "";
  const cta = opts.cta
    ? `<p style="margin:22px 0;text-align:center"><a href="${opts.cta.url}" style="background:#173b35;color:#dafa57;text-decoration:none;padding:12px 26px;border-radius:10px;font-weight:700;display:inline-block">${opts.cta.label}</a></p>`
    : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e2e9e1;border-radius:14px;overflow:hidden">
  <div style="background:#173b35;color:#dafa57;padding:16px 24px;font-size:17px;font-weight:800;letter-spacing:.4px">${config.brandName}</div>
  <div style="padding:24px;color:#173b35">
    <h1 style="font-size:19px;margin:0 0 10px">${title}</h1>
    ${bodyLines.map((line) => `<p style="margin:7px 0;line-height:1.55;color:#3d554c">${line}</p>`).join("")}
    ${code}
    ${cta}
  </div>
  <div style="background:#f4f7f3;padding:12px 24px;font-size:11px;color:#6a7b75">You received this because of activity on ${config.brandName}. No reply needed.</div>
</div>`;
}

function orderLine(details: OrderEmailDetails): string {
  const parts = [`Order ${details.orderNumber}`];
  if (details.restaurantName) parts.push(`from ${details.restaurantName}`);
  if (details.total !== undefined) parts.push(`(${config.currency}${details.total})`);
  return parts.join(" ");
}

const trackUrl = (orderId: string) => `${customerWebUrl()}/orders/${orderId}`;

/** Shared message builders — every provider renders the same branded content. */
const messages = {
  otp(code: string): Mail {
    const validity = otpValidityCopy();
    return {
      subject: `Your ${config.brandName} verification code: ${code}`,
      text: `Your verification code is ${code}.\n\nIt expires in ${validity}. If you didn't request this, you can ignore this email.`,
      html: brandedHtml(`Sign in to ${config.brandName}`, [`Use this code to verify your email. It expires in ${validity}.`], { bigCode: code }),
    };
  },
  welcome(name: string): Mail {
    return {
      subject: `Welcome to ${config.brandName} 🍽️`,
      text: `Hi ${name},\n\nWelcome to ${config.brandName}! Your account is ready.\n\nOrder from kitchens around the corner and track it live.`,
      html: brandedHtml(`Welcome, ${name}! 👋`, [`Your ${config.brandName} account is ready.`, "Order from kitchens around the corner and track your delivery live."], {
        cta: { label: "Browse restaurants", url: customerWebUrl() },
      }),
    };
  },
  orderConfirmed(details: OrderEmailDetails): Mail {
    return {
      subject: `Order ${details.orderNumber} confirmed`,
      text: `${orderLine(details)} is confirmed.\n\nTrack it live: ${trackUrl(details.orderId)}`,
      html: brandedHtml("Order confirmed 🎉", [`${orderLine(details)} is confirmed and the kitchen has been notified.`], {
        cta: { label: "Track order", url: trackUrl(details.orderId) },
      }),
    };
  },
  orderStatus(details: OrderEmailDetails): Mail {
    const status = prettyStatus(details.status ?? "updated");
    return {
      subject: `Order ${details.orderNumber} — ${status}`,
      text: `Your order ${details.orderNumber} is now: ${status}.\n\nTrack it live: ${trackUrl(details.orderId)}`,
      html: brandedHtml(`Order ${status}`, [`Your order ${details.orderNumber} is now: <b>${status}</b>.`, "Follow every step live on the tracking page."], {
        cta: { label: "Track order", url: trackUrl(details.orderId) },
      }),
    };
  },
  orderCancelled(details: OrderEmailDetails): Mail {
    return {
      subject: `Order ${details.orderNumber} cancelled`,
      text: `Your order ${details.orderNumber} was cancelled. Any payment will be refunded.`,
      html: brandedHtml("Order cancelled", [`Your order <b>${details.orderNumber}</b> was cancelled.`, "Any payment will be refunded to your original payment method."]),
    };
  },
};

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
      // Fail fast (15 s) instead of hanging the OTP request for minutes.
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Brevo send failed (${response.status}): ${detail.slice(0, 300)}`);
    }
  }

  async sendOtpEmail(to: string, code: string) {
    await this.send({ to, ...messages.otp(code) });
  }
  async sendWelcome(to: string, name: string) {
    await this.send({ to, ...messages.welcome(name) });
  }
  async sendOrderConfirmation(to: string, details: OrderEmailDetails) {
    await this.send({ to, ...messages.orderConfirmed(details) });
  }
  async sendOrderStatus(to: string, details: OrderEmailDetails) {
    await this.send({ to, ...messages.orderStatus(details) });
  }
  async sendOrderCancelled(to: string, details: OrderEmailDetails) {
    await this.send({ to, ...messages.orderCancelled(details) });
  }
}

/** SMTP provider (NodeMailer) — used by Brevo SMTP relay and any other SMTP server. */
class SmtpEmailProvider implements EmailService {
  private readonly transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: false, // STARTTLS on 587
    requireTLS: true,
    auth: {
      user: process.env.SMTP_USER ?? "",
      pass: process.env.SMTP_PASS ?? "",
    },
    // Bounded timeouts: an unreachable relay must fail in seconds, not the
    // NodeMailer default of 2 minutes, so OTP requests never hang.
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 15_000,
  });

  private async send(message: EmailMessage) {
    const info = await this.transport.sendMail({ from: FROM, to: message.to, subject: message.subject, text: message.text, html: message.html });
    if (!info.accepted.includes(message.to)) {
      throw new Error(`SMTP send rejected (${info.response ?? "no response"})`);
    }
  }

  async sendOtpEmail(to: string, code: string) {
    await this.send({ to, ...messages.otp(code) });
  }
  async sendWelcome(to: string, name: string) {
    await this.send({ to, ...messages.welcome(name) });
  }
  async sendOrderConfirmation(to: string, details: OrderEmailDetails) {
    await this.send({ to, ...messages.orderConfirmed(details) });
  }
  async sendOrderStatus(to: string, details: OrderEmailDetails) {
    await this.send({ to, ...messages.orderStatus(details) });
  }
  async sendOrderCancelled(to: string, details: OrderEmailDetails) {
    await this.send({ to, ...messages.orderCancelled(details) });
  }
}

/** Development provider: writes to the server log. Never sends real mail. */
class ConsoleEmailProvider implements EmailService {
  private async send(message: EmailMessage) {
    console.info(`[email] To: ${message.to}\n[email] Subject: ${message.subject}\n[email] ${message.text.replace(/\n/g, "\n[email] ")}`);
  }

  async sendOtpEmail(to: string, code: string) {
    await this.send({ to, ...messages.otp(code) });
  }
  async sendWelcome(to: string, name: string) {
    await this.send({ to, ...messages.welcome(name) });
  }
  async sendOrderConfirmation(to: string, details: OrderEmailDetails) {
    await this.send({ to, ...messages.orderConfirmed(details) });
  }
  async sendOrderStatus(to: string, details: OrderEmailDetails) {
    await this.send({ to, ...messages.orderStatus(details) });
  }
  async sendOrderCancelled(to: string, details: OrderEmailDetails) {
    await this.send({ to, ...messages.orderCancelled(details) });
  }
}

function provider(): EmailService {
  const delivery = (process.env.OTP_DELIVERY ?? "").toLowerCase();
  // Force console delivery for local testing even when real credentials are present.
  if (delivery === "console") return new ConsoleEmailProvider();
  // Explicit SMTP request, or auto-detect when SMTP is configured (no API key).
  if (delivery === "smtp" || (delivery !== "brevo" && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)) {
    warnIfPlaceholderSender();
    return new SmtpEmailProvider();
  }
  if (delivery === "brevo" || process.env.BREVO_API_KEY) {
    warnIfPlaceholderSender();
    return new BrevoEmailProvider();
  }
  return new ConsoleEmailProvider();
}

export const emailService: EmailService = provider();
