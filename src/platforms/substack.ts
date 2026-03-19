import nodemailer from "nodemailer";
import type { Config } from "../config.js";
import type { PublishResult } from "../types.js";
import { toHtml } from "../markdown.js";

export async function publishToSubstack(
  content: string,
  title: string,
  config: NonNullable<Config["substack"]>,
): Promise<PublishResult> {
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPassword,
    },
  });

  const info = await transporter.sendMail({
    from: config.fromAddress,
    to: config.toAddress,
    subject: title,
    html: toHtml(content),
  });

  return {
    platform: "substack",
    success: true,
    url: `message-id:${info.messageId}`,
  };
}
