export type PasswordChange = { currentPassword: string; newPassword: string; confirmPassword: string };

export function passwordChange(input: unknown): PasswordChange {
  if (!input || typeof input !== "object") throw new Error("Enter your current and new passwords.");
  const { currentPassword, newPassword, confirmPassword } = input as PasswordChange;
  if (typeof currentPassword !== "string" || !currentPassword || currentPassword.length > 256)
    throw new Error("Enter your current password.");
  if (typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 256)
    throw new Error("Use a new password between 8 and 256 characters.");
  if (typeof confirmPassword !== "string" || newPassword !== confirmPassword)
    throw new Error("The new passwords do not match.");
  if (newPassword === currentPassword) throw new Error("Choose a password different from your current one.");
  return { currentPassword, newPassword, confirmPassword };
}
