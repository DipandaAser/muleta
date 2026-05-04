import { faker } from "@faker-js/faker"

/**
 * Plausible-looking fake data for the demo. Backed by Faker.js so the
 * dashboard fills with names, addresses, products, and identifiers
 * that look like a real BullMQ-backed app's payload — without
 * shipping any real PII.
 */

export const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD"] as const

const EMAIL_TEMPLATES = [
  "welcome",
  "password-reset",
  "monthly-summary",
  "payment-receipt",
  "shipping-update",
  "promo-launch",
  "verify-email",
] as const

const WEBHOOK_EVENTS = [
  "order.created",
  "order.shipped",
  "order.cancelled",
  "subscription.updated",
  "invoice.paid",
  "user.deleted",
  "refund.processed",
] as const

const REPORT_KINDS = [
  "daily-revenue",
  "weekly-cohort",
  "monthly-churn",
  "vendor-payout",
  "tax-summary",
] as const

const IMAGE_OPS = ["resize", "thumbnail", "watermark", "convert-webp"] as const

export function pick<T>(arr: readonly T[]): T {
  return faker.helpers.arrayElement(arr)
}

export function randomId(): string {
  return faker.string.alphanumeric(8).toLowerCase()
}

export interface OrderJob {
  orderId: string
  amount: number
  currency: (typeof CURRENCIES)[number]
  customer: string
  itemCount: number
}

export function randomOrder(): OrderJob {
  return {
    orderId: `ord_${randomId()}`,
    amount: faker.number.float({ min: 20, max: 500, fractionDigits: 2 }),
    currency: pick(CURRENCIES),
    customer: faker.internet.email().toLowerCase(),
    itemCount: faker.number.int({ min: 1, max: 6 }),
  }
}

export function randomEmailJob() {
  return {
    template: pick(EMAIL_TEMPLATES),
    to: faker.internet.email().toLowerCase(),
    locale: pick(["en-US", "fr-FR", "es-ES", "de-DE", "ja-JP", "pt-BR"] as const),
    subject: faker.lorem.sentence({ min: 3, max: 6 }),
    user: { id: `usr_${randomId()}`, name: faker.person.fullName() },
  }
}

export function randomWebhookJob() {
  return {
    event: pick(WEBHOOK_EVENTS),
    target: `https://${faker.internet.domainName()}/v2/hooks/${randomId()}`,
    deliveryId: `whd_${randomId()}`,
    attempt: 1,
    payload: {
      objectId: `obj_${randomId()}`,
      occurredAt: faker.date.recent({ days: 1 }).toISOString(),
    },
  }
}

export function randomImageJob() {
  const ext = pick(["jpg", "png", "heic"] as const)
  return {
    op: pick(IMAGE_OPS),
    src: `s3://uploads/${faker.string.uuid()}/${randomId()}.${ext}`,
    width: pick([400, 800, 1024, 1600, 2400] as const),
    height: pick([300, 600, 768, 1200, 1800] as const),
    quality: faker.number.int({ min: 70, max: 95 }),
    uploadedBy: `usr_${randomId()}`,
  }
}

export function randomBillingJob() {
  return {
    invoiceId: `inv_${randomId()}`,
    customerId: `cus_${randomId()}`,
    plan: pick(["starter", "team", "business", "enterprise"] as const),
    amount: faker.number.float({ min: 9, max: 999, fractionDigits: 2 }),
    currency: pick(CURRENCIES),
    paymentMethod: pick(["card", "ach", "sepa", "wire"] as const),
    company: faker.company.name(),
  }
}

export function randomReportJob() {
  const end = faker.date.recent({ days: 1 })
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000)
  return {
    kind: pick(REPORT_KINDS),
    range: {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    },
    deliverTo: faker.internet.email().toLowerCase(),
    requestedBy: faker.person.fullName(),
  }
}

/**
 * Plausible failure messages — mix of transient (which a smart retry
 * policy would recover from) and permanent (which look like real bugs).
 */
export const TRANSIENT_FAILURES = [
  "ETIMEDOUT connecting to upstream",
  "Provider returned 503 service_unavailable",
  "Rate limited (429): retry after 30s",
  "Connection reset by peer",
  "Redis: ECONNRESET",
] as const

export const PERMANENT_FAILURES = [
  "Validation: recipient address rejected (550)",
  "Card declined: insufficient_funds",
  "Webhook target returned 410 Gone",
  "Unsupported MIME type — expected image/*",
  "Customer not found in billing provider",
] as const
