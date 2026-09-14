# Chat attachments and voice memos

Chat and task comments accept up to five attachments per message, up to 50 MB
each. Supported files are JPEG, PNG, GIF, WebP, HEIC/HEIF, MP4, MOV, WebM, M4V,
MP4 audio (M4A), MP3, Ogg, WAV, PDF, plain text and ZIP. Device support determines
which formats play inline; files also have an Open file link. Signed read links
expire after five minutes; Refresh file access requests a new authorized link.

Voice recording requires microphone permission. Record, stop, listen to the
preview, then send; discard removes the local recording. Recordings stop at five
minutes. Leaving the conversation stops the microphone. Files in a draft survive
switching between team/direct conversations while Chat remains mounted. Leaving
Chat or reloading discards local attachment drafts. Failed sends keep the message
and files for retry. Partially uploaded, unsent files can remain orphaned in storage.

## Required storage setup

In a **dedicated test Supabase project first**, create a bucket named
`chat-attachments` with **Public disabled**, maximum file size **52,428,800 bytes**,
and these allowed MIME types:

```
image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,
video/mp4,video/quicktime,video/webm,video/x-m4v,
audio/mp4,audio/mpeg,audio/webm,audio/ogg,audio/wav,audio/x-wav,
application/pdf,text/plain,application/zip,application/x-zip-compressed
```

Do not add public or blanket authenticated storage policies. Do not change the
existing `raw-footage` bucket. The app uses its existing server-only service
credential to authorize signed uploads and downloads after checking identity and
conversation membership. Browser uploads go directly to Storage. Attachment paths
are bound to the uploader, conversation and message; the server checks stored
size/type before saving a message. Private message files are accessible only to
the participants, even when another viewer is an owner. Reassigning a task revokes
the former assignee's file access unless they are also its creator or an owner.
Previously issued signed URLs remain valid until their short expiry.

No workspace SQL migration is needed. This branch does **not** create a bucket,
change production storage, copy credentials, or configure a separate test project.
Production storage setup is a separate operation after the test configuration is
verified. Existing filming uploads continue using their original bucket.

## Acceptance checks with fictional records

1. Sign in as each test teammate. Send a picture, video, PDF and voice memo in
   team chat, a private conversation and an accessible task. Reload and play/open
   them from the other authorized account.
2. Confirm a third account, including an owner outside the private conversation,
   cannot retrieve that file. Reassign a task and confirm access follows it.
3. Simulate an upload/network failure; confirm the draft remains and retry creates
   only one message. Verify unsupported files and files over 50 MB are rejected.
4. On a real iPhone, open the keyboard, type multiple lines, send, rotate, dismiss
   and reopen the keyboard. The composer must stay in the visible viewport.
5. Allow and deny microphone access. Record, stop, preview, discard and send a
   memo. Navigating away while recording must release the microphone.

Without Supabase configuration, the fictional demo can preview local recordings,
but sending attachments shows a setup message and preserves the draft. Demo mode
never represents a local file as a successful server upload or sends real notices.
