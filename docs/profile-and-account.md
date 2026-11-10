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

Use the two profile tabs for these controls:

| Tab | Controls |
| --- | --- |
| **Account** | Login username, password controls when available, Google-link status and account deletion. |
| **Settings** | Table preferences and Slack alerts. |

The username editor appears once, under **Account**. **Settings** includes Table replay, table effects, gag and Smoke Shop preferences (**Allow Gags?** also covers [table spectacles](spectacles.md)), Guntrad's voice, and Slack alert controls when configured. Existing availability and save behavior still apply.

Each tab has one scrollable content pane. Its cards take the height their contents need, and scrolling the pane reaches the remaining forms and actions on a small or short screen. This layout applies to the profile's Account and Settings panes; other profile tabs and game screens keep their existing layouts.

The avatar upload, account and preference request/response contracts are unchanged, including `PATCH /api/me`. Existing browser and server preference storage is preserved. No saved-player migration is required.
