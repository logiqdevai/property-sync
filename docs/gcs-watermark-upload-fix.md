# GCS watermark upload failure

## Problem

Watermark-removal jobs failed during GCS upload with either:

1. `Invalid response body while trying to fetch https://www.googleapis.com/oauth2/v4/token: Premature close`
2. `FILE_NO_UPLOAD` — `The uploaded data did not match the data from the server`

Dewatermark itself worked. Fail was storage/auth, not EstateWeb.

## Root causes

### 1. OAuth `Premature close` (Node 22.23+ / 24)

Node’s HTTP keep-alive teardown change exposed a bug in `google-auth-library@9` → `gaxios@6` → `node-fetch@2`. Token fetch to Google OAuth falsely failed with `Premature close`.

### 2. Multipart upload corruption (auth v10 attempt)

Bumping to `google-auth-library@10` / `gaxios@7` fixed OAuth but broke GCS **multipart** simple uploads: the MIME envelope was stored as the object body.

Example: local `75383` bytes → server `75597` (+214 MIME overhead). Object started with `--boundary…Content-Type: application/json…`. Client CRC of real bytes ≠ server CRC → `FILE_NO_UPLOAD`, file deleted as precaution.

## Fix

1. Keep **`google-auth-library@9.15.1`** (multipart uploads stay correct with `@google-cloud/storage@7`).
2. Disable HTTP keep-alive on the auth transporter (`agent: keepAlive: false`) so OAuth works on Node 22.23+/24.
3. Upload with `file.save(..., { resumable: false, validation: 'crc32c' })`.

## Code

- `api/src/integrations/storage/gcs/config/gcs.config.ts` — credentials parse + no-keep-alive transporter
- `api/src/integrations/storage/gcs/gcs.adapter.ts` — `file.save` upload path
- `api/package.json` — pin `google-auth-library@9.15.1`

## Verify

```text
token fetch ×N → OK
upload local size === server size
downloaded bytes === uploaded bytes
```
