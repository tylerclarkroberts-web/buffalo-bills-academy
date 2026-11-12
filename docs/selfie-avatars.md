# Selfie avatars

Take a selfie or upload a photo to make a low-poly head for the card table. You can also choose **No photo, make me one** for a generated avatar. To replace an existing avatar, choose **Change avatar** on your profile picture or in the account menu. The editor supports both photos and generated avatars; your current avatar stays unchanged until you save.

## Make and review your head

1. **Frame the photo.** Drag to position it and use **Zoom** to fit your head, including hair and ears, inside the outline. Arrow keys also move the photo. The guide and saved head use the same outline; automatic face framing is only a starting point where the browser supports it.
2. Choose **Remove background**. Automatic removal runs on this device in a background worker. Its model and runtime are fetched from this site when first needed, about **28 MB** before transfer compression or browser caching. They are not loaded just to view the lobby or a saved avatar.
3. **Review the cutout.** Choose **Keep** to restore hair or ears and **Erase** to remove background. Adjust **Brush size**, then drag or touch the picture. Dimmed areas will be removed; turn off **Show removed areas** to inspect the cutout without the dimmed photo. **Reset cutout** restores the automatic result, or the initial outline when using manual mode.
4. Choose **Make it low-poly** to review the 3D head and **At the table** preview. Both use the same edited cutout. **Edit cutout** returns to your current brush edits. **Adjust framing** reuses the local photo and starts a new cutout, so you do not have to upload it again.
5. Choose **Looks good, save it**. Only then is the finished PNG uploaded. **Cancel** or **Retake** discards the local photo and starts over.

Keyboard users can focus the cutout canvas, use arrow keys to move the brush, and press Space or Enter to paint. Shift plus an arrow moves farther. Keep can restore pixels inside the head outline; if hair or ears lie outside it, adjust framing first.

Automatic removal can miss fine hair, ears, accessories or parts of a face, especially with poor lighting or a busy background. Review before saving: anything you keep in the drawing will be visible in your avatar.

## Manual fallback

**Use manual cutout** is available while automatic removal is loading or running. It cancels that attempt and lets you use the brushes immediately. Automatic removal also falls back to the manual editor if the worker, OffscreenCanvas, WebAssembly/SIMD, model download or inference is unavailable, if no head is found, or after a 60-second timeout. The fallback starts with the head outline; background inside it remains until you erase it. It does not silently claim that removal succeeded.

If the camera is unavailable or denied, upload a photo instead. A generated avatar remains available without a photo or segmentation download.

## Privacy and saved data

The original photo stays in local editing canvases while you frame, correct and preview the head. It is retained through conversion so you can adjust it without choosing the file again. These canvases are cleared after a successful save, when you cancel or retake, and when you leave the page. A failed save leaves the editor available for retry. This clears the app's editing copies, not the original file in your photo library.

The existing `POST /api/me/avatar` contract is unchanged: a photo avatar sends `{ "kind": "photo", "png": "data:image/png;base64,..." }` containing the finished 240×300 PNG. It does not send the original photo, editing mask or worker input. Generated avatars continue to send a seed. The server stores the finished avatar and metadata through the existing avatar service; no migration or automatic replacement of old avatars is needed.

The segmentation model and runtime are served from this application. There is no external image-processing service. The one outbound request is MediaPipe's own: each cutout posts performance and usage metrics about the library (not the photo, mask or result) to `https://odml.pa.googleapis.com/v1/log`. The privacy page says so. Browser network checks must still verify actual requests when changing this implementation or dependency version; worker requests do not show in the page's network list, so wrap `fetch` in the worker to see them.

## Model, licensing and maintenance

The implementation pins `@mediapipe/tasks-vision` **1.2.2** and Google's **SelfieMulticlass 256×256, float32, version 1** model. It uses CPU image inference in a module worker, retaining hair, face skin and accessories inside the shared head outline, while removing background, body skin and clothes. The finished PNG and 3D triangles are clipped to the edited mask.

The model is 16,371,837 bytes and is checked in at `client/public/avatar-model/selfie_multiclass_256x256-v1.tflite`:

```text
SHA-256 c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0
```

Vite emits the matching module WASM loader and binary from the pinned npm package. Both the model and MediaPipe library use Apache-2.0; preserve [LICENSE.txt](../client/public/avatar-model/LICENSE.txt) and [NOTICE.txt](../client/public/avatar-model/NOTICE.txt). Sources, versions and the model hash are recorded in that notice. Do not upgrade to a different library build without checking its loading behavior, outbound requests and notices. Releases from 1.0.0 send the metrics described above with no documented opt-out, and the package README makes the app responsible for telling users; keep the privacy page accurate.

The [official model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Multiclass%20Segmentation.pdf) describes expected limitations. [Google's Image Segmenter guide](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter) documents the labels and task API. [Development and troubleshooting](development.md#selfie-avatar-checks) lists regression and browser checks. These references do not establish live-site deployment or real-device performance.
