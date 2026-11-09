# Profile and account

Open the account menu beside your balance and choose **Profile** to see your results and change your display name or avatar.

## Change your avatar

Choose **Change avatar** on your profile picture or directly from the account menu. Both open the same editor, with selfie, uploaded-photo and generated-avatar choices. The editor receives keyboard focus when it opens. **Back to profile** returns without replacing your current avatar; saving returns to your profile with the new avatar. Other players' profile pictures do not offer editing controls.

See [Selfie avatars](selfie-avatars.md) for framing, cutout correction, privacy and save behavior.

## Change your display name

Choose **Rename**, enter a name and select **Save**. Your display name is the name other players see; it is separate from the username used to sign in.

The editor keeps your draft and shows an error beside it if the name is empty or saving fails. Correct the name or retry without leaving your profile. The saved name uses the server's existing cleanup: surrounding whitespace and angle brackets are removed, and names are limited to 20 characters.

**Cancel** or Escape discards an unsaved draft. While saving, the field is read-only and Save/Cancel are disabled to avoid duplicate or ambiguous requests. After saving or cancelling, keyboard focus returns to **Rename**; a successful save announces **Display name saved.**

## Sign-in and preferences

The **Account** tab contains your login username, password controls when available, Google-link status and account deletion. The **Settings** tab contains table preferences and Slack alerts, and currently also shows the username editor. This UI update does not move those controls or change their storage.

The avatar upload and `PATCH /api/me` request/response contracts are unchanged. No saved-player migration is required.
