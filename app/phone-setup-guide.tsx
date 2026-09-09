import type { Member } from "../lib/workflow";

export default function PhoneSetupGuide({ member }: { member: Member }) {
  const firstName = member.name.trim().split(/\s+/)[0];
  const name = firstName.toLowerCase();
  const phone = name === "karl" ? "Vivo Y04s" : name === "john" ? "Samsung Galaxy A07" : null;
  if (!phone) return null;
  return <section className="personal-phone-guide" aria-label={`${firstName}'s phone setup`}>
    <h3>{firstName}, set up your {phone}</h3>
    <p className="muted">{name === "karl" ? "Android 15 · Funtouch OS 15" : "Android 16"}</p>
    <ol>
      <li><strong>Open Ignited in Chrome.</strong> Update Chrome, sign in to your account, and use the live workspace. For an app icon, choose Chrome’s menu → Add to Home screen → Install, if offered.</li>
      <li><strong>Allow notifications.</strong> Tap Enable push notifications above and choose Allow. If blocked, open Chrome → Settings → Site settings → Notifications and allow this site. Also allow Chrome/Ignited notifications in Android Settings.</li>
      <li><strong>Check battery settings if alerts are delayed.</strong> {name === "karl" ? <>
        In your Vivo’s settings, look for Battery or Background power consumption management. If Chrome or Ignited is listed, allow its background activity instead of restricting it.
      </> : <>
        Open Settings → Battery → Background usage limits. Remove Chrome or Ignited from Sleeping apps and Deep sleeping apps. If available, add it to Never sleeping apps.
      </>} <span className="muted">Menu names can vary with phone updates.</span></li>
      <li><strong>Check delivery.</strong> Once enabled, use Send test notification above and check your notification panel. Then lock your phone and ask a teammate to assign you a task. Open the alert to check that it reaches your inbox.</li>
    </ol>
    <p className="muted">These steps are for your listed phone. The status and buttons above apply to the device you are using right now. Android permission and battery settings must be changed on the phone itself. After changing them, tap Check device status above.</p>
    <p><a href={name === "karl" ? "https://www.vivo.com/en/support/questionList?categoryId=54716" : "https://www.samsung.com/us/support/answer/ANS10003442/"} target="_blank" rel="noreferrer">{name === "karl" ? "Vivo battery help" : "Samsung sleeping-app help"}</a> · <a href="https://support.google.com/chrome/answer/3220216?co=GENIE.Platform%3DAndroid&hl=en" target="_blank" rel="noreferrer">Chrome notification help</a></p>
    <p className="muted">Using a different phone? Open Phone and desktop setup below for the general steps.</p>
  </section>;
}
