export interface EmailAddress {
  address: string;
  alias: string;
  domain: string;
  createdAt: Date;
}

/** One saved inbox. `accessToken` is null for addresses created before ownership tokens existed. */
export interface SavedAddress {
  email: string;
  accessToken: string | null;
  /** Unix ms when the token stops working (24h after creation). */
  expiresAt: number | null;
}

export interface InboxMessage {
  id: string;
  from: string;
  subject: string;
  /** Short plain-text excerpt returned by the list endpoint. */
  preview: string;
  /** Only present after the message detail has been fetched. */
  body?: string;
  isHtml?: boolean;
  receivedAt: Date;
}

export interface CreateEmailResponse {
  success: boolean;
  email?: string;
  /** Ownership token for the inbox. Required to read it. */
  accessToken?: string;
  /** Unix ms when `accessToken` expires. */
  expiresAt?: number;
  error?: string;
  mock?: boolean;
}

export type InboxErrorCode = "unauthorized" | "token_expired" | "rate_limited" | "not_found" | "network" | "server";

export interface FetchInboxResponse {
  success: boolean;
  messages?: InboxMessage[];
  error?: string;
  code?: InboxErrorCode;
}

export interface FetchMessageResponse {
  success: boolean;
  message?: InboxMessage;
  error?: string;
  code?: InboxErrorCode;
}
