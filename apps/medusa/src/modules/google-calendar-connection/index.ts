import { Module } from "@medusajs/framework/utils";
import GoogleCalendarConnectionModuleService from "./service";

export const GOOGLE_CALENDAR_CONNECTION_MODULE =
  "googleCalendarConnectionModuleService";

export type GoogleCalendarConnectionModuleOptions = {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  webhookUrl?: string;
  scope?: string;
  /** Used to sign and verify the OAuth `state` parameter. */
  signingSecret?: string;
  /**
   * Channel token sent on Google's push notifications. Defaults to the
   * `signingSecret` for backward compatibility but should be rotated
   * independently in production.
   */
  channelToken?: string;
  tokenEncryptionKey?: string;
  defaultTimezone?: string;
};

export default Module(GOOGLE_CALENDAR_CONNECTION_MODULE, {
  service: GoogleCalendarConnectionModuleService,
});
