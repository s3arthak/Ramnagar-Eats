import { randomUUID } from "node:crypto";

export interface PaymentResult {
  status: "PENDING" | "PAID";
  reference: string;
}

export interface PaymentRequest {
  amount: number;
  orderId: string | null;
  customerId: string;
}

/**
 * Payment layer for the local MVP. Implementations are swappable later with
 * Razorpay/Stripe; nothing in the order flow depends on a concrete provider.
 */
export interface PaymentService {
  readonly name: string;
  createPayment(request: PaymentRequest): Promise<PaymentResult>;
}

/** Cash on delivery: payment is settled at the door, never "paid" here. */
export class CODPayment implements PaymentService {
  readonly name = "COD";
  async createPayment(request: PaymentRequest): Promise<PaymentResult> {
    return { status: "PENDING", reference: `COD-${request.orderId ?? "pending"}-${Date.now()}` };
  }
}

/** Test/mock provider for local development. */
export class MockPayment implements PaymentService {
  readonly name = "MOCK";
  async createPayment(_request: PaymentRequest): Promise<PaymentResult> {
    return { status: "PAID", reference: `MOCK-${randomUUID()}` };
  }
}

export function paymentService(method: "COD" | "MOCK"): PaymentService {
  return method === "COD" ? new CODPayment() : new MockPayment();
}
