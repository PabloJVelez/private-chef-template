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
  signingSecret?: string;
  tokenEncryptionKey?: string;
  defaultTimezone?: string;
};

export default Module(GOOGLE_CALENDAR_CONNECTION_MODULE, {
  service: GoogleCalendarConnectionModuleService,
});
