export interface EmailAddress {
  address: string;
  alias: string;
  domain: string;
  createdAt: Date;
}

export interface InboxMessage {
  id: string;
  from: string;
  subject: string;
  body: string;
  isHtml: boolean;
  receivedAt: Date;
  read: boolean;
}

export interface CreateEmailResponse {
  success: boolean;
  email?: string;
  error?: string;
}

export interface FetchInboxResponse {
  success: boolean;
  messages?: InboxMessage[];
  error?: string;
}
