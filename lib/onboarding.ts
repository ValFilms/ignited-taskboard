export const ONBOARDING_VERSION = 1;
export function onboardingComplete(metadata: Record<string, unknown> | undefined): boolean {
  return metadata?.ignited_onboarding_version === ONBOARDING_VERSION;
}
