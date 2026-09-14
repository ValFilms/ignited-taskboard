export type Attachment = {path: string; name: string; contentType: string; size: number};
export const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;
export const attachmentTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif", "video/mp4", "video/quicktime", "video/webm", "video/x-m4v", "audio/mp4", "audio/mpeg", "audio/webm", "audio/ogg", "audio/wav", "audio/x-wav", "application/pdf", "text/plain", "application/zip", "application/x-zip-compressed"]);
export const baseType = (type: string) => type.split(";")[0].trim().toLowerCase();
export function validateAttachment(file: Pick<Attachment,"name"|"size"|"contentType">) {
  if (!file || typeof file.name !== "string" || !file.name.trim() || file.name.length > 255 || typeof file.contentType !== "string" || !attachmentTypes.has(baseType(file.contentType)) || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_ATTACHMENT_SIZE) throw new Error("Choose a picture, video, audio, PDF, text or ZIP file up to 50 MB");
}
