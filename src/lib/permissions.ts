/**
 * The permission keys the app checks before showing an option, the same keys
 * the CPaaS server enforces on each call (node_modules/@ab-ecosystem/cpaas/docs).
 * Hiding is a courtesy: the server refuses regardless.
 *
 * Check with `useCan(P.contacts.delete)` from `@/stores/auth`.
 */
export const P = {
  contacts: {
    list: 'CRM.CONTACT.LIST',
    create: 'CRM.CONTACT.CREATE',
    update: 'CRM.CONTACT.UPDATE',
    delete: 'CRM.CONTACT.DELETE',
    export: 'CRM.CONTACT.EXPORT',
  },
  tags: { create: 'CRM.CONTACT.TAG.CREATE', delete: 'CRM.CONTACT.TAG.DELETE' },
  segments: { create: 'CRM.CONTACT.SEGMENT.CREATE', delete: 'CRM.CONTACT.SEGMENT.DELETE' },
  chats: {
    list: 'CRM.CHAT.LIST',
    send: 'CRM.CHAT.SEND',
    update: 'CRM.CHAT.UPDATE',
    transfer: 'CRM.CHAT.TRANSFER',
    delete: 'CRM.CHAT.DELETE',
  },
  quickReplies: { create: 'CRM.CHAT.CANNED_REPLY.CREATE', update: 'CRM.CHAT.CANNED_REPLY.UPDATE', delete: 'CRM.CHAT.CANNED_REPLY.DELETE' },
  scheduled: { create: 'CRM.CHAT.SCHEDULED_MESSAGE.CREATE', send: 'CRM.CHAT.SCHEDULED_MESSAGE.SEND', delete: 'CRM.CHAT.SCHEDULED_MESSAGE.DELETE' },
  campaigns: {
    list: 'CRM.CAMPAIGN.LIST',
    create: 'CRM.CAMPAIGN.CREATE',
    update: 'CRM.CAMPAIGN.UPDATE',
    send: 'CRM.CAMPAIGN.SEND',
    delete: 'CRM.CAMPAIGN.DELETE',
  },
  templates: { create: 'CRM.TEMPLATE.CREATE', update: 'CRM.TEMPLATE.UPDATE', delete: 'CRM.TEMPLATE.DELETE' },
  /** Listing any channel at all (each type is its own key). */
  channelsAny: ['CRM.CHANNEL.WHATSAPP.LIST', 'CRM.CHANNEL.SMS.LIST', 'CRM.CHANNEL.RCS.LIST'],
  fields: { create: 'CRM.CONTACT.FIELD.CREATE', update: 'CRM.CONTACT.FIELD.UPDATE', delete: 'CRM.CONTACT.FIELD.DELETE' },
} as const;
