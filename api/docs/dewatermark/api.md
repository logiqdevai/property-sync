# Dewatermark API Reference

## Introduction

Hi, developers, welcome to use Dewatermark's API. The following are some basic introductions to your access service. Hope you can find the AI technology capabilities that are suitable for your business here. Thank you for using!

---

## Authentication

Dewatermark uses API keys to allow access to the API. You can receive your unique API key by signing up and opening the API management page.

The API key must be included in all API requests to the server in a header that looks like the following:

`X-API-KEY: API_KEY`

You must replace `API_KEY` with your personal API key. Your personal API key can be obtained from the [API management interface](https://dewatermark.ai/api-management).

> Make sure to replace `<API-KEY>` with your API key.

#### Request examples

```bash
# With shell, you can just pass the correct header with each request
curl "https://platform.dewatermark.ai/api/object_removal/v3/erase_watermark" \
  -H "X-API-KEY: <API-KEY>"
```

```python
import requests

API_KEY = "YOUR_API_KEY"
headers = {
    "X-API-KEY": API_KEY
}

# Make API request
response = requests.get(
    "https://platform.dewatermark.ai/api/object_removal/v3/erase_watermark",
    headers=headers
)
```

```javascript
const API_KEY = "YOUR_API_KEY";

// Make API request
const response = await fetch(
  "https://platform.dewatermark.ai/api/object_removal/v3/erase_watermark",
  {
    headers: { "X-API-KEY": API_KEY },
  }
);
```

---

## POST — Remove Watermark

> **API v3 Update:** We have upgraded to the v3 endpoint (`/api/object_removal/v3/erase_watermark`), which provides better results for high resolution images.

This API allows you to remove watermark from an image and seamlessly inpaint the erased area to blend it naturally with the surrounding background. Each remove watermark image API call is counted as **1 credit**.

```
POST https://platform.dewatermark.ai/api/object_removal/v3/erase_watermark
```

#### Request body

| Form | Required | Type | Description |
| --- | --- | --- | --- |
| `original_preview_image` | Optional | binary | The input image, it should be a JPEG image and the largest dimension is not greater than 6000 px. |
| `session_id` | Optional | text | The session id, it represents the current image. |
| `mask_base` | Optional | text | The masked image of the previously erased parts. |
| `mask_brush` | Optional | binary | The mask image for the Remove Object API should include a binary representation of the unwanted object's outline, delineating the area to be removed and inpainted. |
| `remove_text` | Optional | text | If set to 'true', enables the text removal feature for improved results when removing purely textual watermarks. Note that this may remove all text from your image. |
| `predict_mode` | Optional | text | You can choose between "old" (2.0), "3.0", or "4.0". 2.0 works best for emoji, while 3.0 and 4.0 work for most cases. Its default value is 4.0. |

In the request form data, while either `original_preview_image` or `session_id` parameter is required, it is recommended to include `session_id` if it's already available. The initial request doesn't require `mask_base` and `mask_brush`.

#### Response

| Property | Description |
| --- | --- |
| `edited_image.image` | The result after removing object, it's a base64 encoded image. |
| `edited_image.watermark_mask` | This is the masked image of all previously erased parts. |

#### Continuing with Manual Refinement

Here's a complete example that demonstrates the watermark removal process with automatic detection and manual refinement. The process works as follows:

**Initial Input Image**
![Input image](https://assets.dewatermark.ai/api-document/images/input-d65e2f31.jpeg)

**Automatic Watermark Detection & Removal**
![Auto-processed result](https://assets.dewatermark.ai/api-document/images/result_auto-571e1e35.jpeg)

**First Manual Correction**
![First manual mask](https://assets.dewatermark.ai/api-document/images/mask_brush_manual_step_1-1834c6af.png)
![After first manual correction](https://assets.dewatermark.ai/api-document/images/manual_result_step_1-70b7c953.jpeg)

**Second Manual Correction**
![Second manual mask](https://assets.dewatermark.ai/api-document/images/mask_brush_manual_step_2-a2302a1f.png)
![Final result](https://assets.dewatermark.ai/api-document/images/manual_result_step_2-3662cb54.jpeg)

1. Start with automatic watermark detection and removal
2. If needed, perform manual corrections using brush masks
3. Use `session_id` for subsequent refinements to optimize the process

The images show the progression from the original image through each step of the watermark removal process, including the manual masks used for refinement.

Even after the initial API call, you can achieve even more precise results by manually specifying the remaining watermark area you want to erase. Here's the process:

- **Manual Selection:** Define a mask that isolates the specific part of the image containing the remaining watermark or unwanted element. This mask acts as a guide for the API.
- **API Call with Session ID and Mask:** Make a subsequent API call to remove the designated area. Remember to include `original_preview_image` (the `edited_image.image` from the previous call, JPEG with largest dimension ≤ 1920), `session_id` (use this instead of `original_preview_image` on the second refinement), `mask_brush` (a refined mask of the remaining area), and `remove_text` when the watermark is purely text.

By following these steps, you can iteratively remove watermarks and achieve a highly refined final image.

#### Request examples

```bash
curl -X POST "https://platform.dewatermark.ai/api/object_removal/v3/erase_watermark" \
  -H "X-API-KEY: API_KEY" \
  --form 'session_id="SESSION_ID"' \
  --form 'original_preview_image=@"IMAGE_FILE"' \
  --form 'mask_base=@"MASK_BASE_FILE"' \
  --form 'mask_brush=@"MASK_BRUSH_FILE"' \
  --form 'remove_text="true"' \
  --form 'predict_mode="4.0"'
```

```python
import requests
import base64
import uuid
import os
from io import BytesIO

def erase_watermark(original_preview_image=None, mask_base=None, mask_brush=None, session_id=None, remove_text="true"):
    API_KEY = "YOUR_API_KEY"
    erase_url = "https://platform.dewatermark.ai/api/object_removal/v3/erase_watermark"
    headers = {
        "X-API-KEY": API_KEY
    }
    erase_files = {}

    if original_preview_image is not None:
        if isinstance(original_preview_image, str) and os.path.isfile(original_preview_image):
            image_file = open(original_preview_image, "rb")
            file_original_preview_image = ("original_preview_image.jpeg", image_file)
        else:
            image_bytes = base64.b64decode(original_preview_image)
            image_file = BytesIO(image_bytes)
            file_original_preview_image = ("original_preview_image.jpeg", image_file)
        erase_files["original_preview_image"] = file_original_preview_image
    else:
        if session_id is not None:
            erase_files["session_id"] = (None, session_id)
        else:
            raise ValueError("Either original_preview_image or session_id must be provided.")

    if mask_base is not None:
        image_bytes = base64.b64decode(mask_base)
        image_file = BytesIO(image_bytes)
        file_mask_base = ("mask_base.jpeg", image_file)

    if mask_brush is not None:
        image_file = open(mask_brush, "rb")
        file_mask_brush = ("mask_brush.png", image_file)

    if original_preview_image is not None:
        erase_files["original_preview_image"] = file_original_preview_image

    if mask_base is not None:
        erase_files["mask_base"] = file_mask_base

    if mask_brush is not None:
        erase_files["mask_brush"] = file_mask_brush

    erase_files["remove_text"] = (None, remove_text)
    data = {"predict_mode": "4.0"}
    erase_response = requests.post(erase_url, headers=headers, files=erase_files, data=data)

    response_data = erase_response.json()
    return {
        "session_id": response_data["session_id"],
        "image_base64": response_data["edited_image"]["image"],
        "mask_base": response_data["edited_image"]["mask"]
    }

# Initial call: Automatically detect and remove visible watermarks using AI
auto_result = erase_watermark("input.jpeg")

# Save the auto-processed result (Base64-encoded image)
output_image_path = "output_image.jpg"
image_data = base64.b64decode(auto_result['image_base64'])
with open(output_image_path, 'wb') as f:
    f.write(image_data)
print(f"Image saved to {output_image_path}")
```

```javascript
import fs from "fs";

const API_KEY = "YOUR_API_KEY";
const url = "https://platform.dewatermark.ai/api/object_removal/v3/erase_watermark";

// Initial call: automatically detect and remove visible watermarks using AI
const form = new FormData();
form.append(
  "original_preview_image",
  new Blob([fs.readFileSync("input.jpeg")], { type: "image/jpeg" }),
  "original_preview_image.jpeg"
);
form.append("remove_text", "true");
form.append("predict_mode", "4.0");

const response = await fetch(url, {
  method: "POST",
  headers: { "X-API-KEY": API_KEY },
  body: form,
});

const data = await response.json();
const sessionId = data.session_id;
const imageBase64 = data.edited_image.image;

// Save the auto-processed result (Base64-encoded image)
fs.writeFileSync("output_image.jpg", Buffer.from(imageBase64, "base64"));
console.log("Session:", sessionId);
```

#### Response

`200`

```json
{
  "edited_image": {
    "image": "BASE_64_IMAGE",
    "image_id": "image_id",
    "mask": "BASE64_MASK",
    "watermark_mask": "BASE64_MASK"
  },
  "event_id": "event_id",
  "session_id": "session_id"
}
```

---

## POST — Remove Watermark PRO

The PRO endpoint runs a higher-quality watermark removal model — best when you want the cleanest result in a single automatic call. Each PRO call is counted as **3 credits**.

```
POST https://platform.dewatermark.ai/api/object_removal/v1/erase_watermark_pro
```

#### Request body

| Form | Required | Type | Description |
| --- | --- | --- | --- |
| `original_preview_image` | Required | binary | The input image, it should be a JPEG image and the largest dimension is not greater than 6000 px. |

#### Response

| Property | Description |
| --- | --- |
| `edited_image.image` | The result after removing the watermark, it's a base64 encoded image. |

#### Request examples

```bash
curl --location 'https://platform.dewatermark.ai/api/object_removal/v1/erase_watermark_pro' \
  --header 'X-API-KEY: YOUR_API_KEY' \
  --form 'original_preview_image=@"/path/to/file"'
```

```python
import requests

API_KEY = "YOUR_API_KEY"
url = "https://platform.dewatermark.ai/api/object_removal/v1/erase_watermark_pro"

with open("input.jpeg", "rb") as image_file:
    response = requests.post(
        url,
        headers={"X-API-KEY": API_KEY},
        files={"original_preview_image": ("original_preview_image.jpeg", image_file)}
    )

data = response.json()
image_base64 = data["edited_image"]["image"]
print("Session:", data.get("session_id"))
```

```javascript
import fs from "fs";

const API_KEY = "YOUR_API_KEY";
const url = "https://platform.dewatermark.ai/api/object_removal/v1/erase_watermark_pro";

const form = new FormData();
form.append(
  "original_preview_image",
  new Blob([fs.readFileSync("input.jpeg")], { type: "image/jpeg" }),
  "original_preview_image.jpeg"
);

const response = await fetch(url, {
  method: "POST",
  headers: { "X-API-KEY": API_KEY },
  body: form,
});

const data = await response.json();
const imageBase64 = data.edited_image.image;
console.log("Session:", data.session_id);
```

#### Response

`200`

```json
{
  "edited_image": {
    "image": "BASE_64_IMAGE",
    "image_id": "image_id"
  },
  "event_id": "event_id",
  "session_id": "session_id"
}
```

---

## Video Watermark Removal

The Video Watermark Removal API allows you to remove watermarks from video files. The process involves four steps: generating an upload URL, uploading the video file, submitting the task, and polling for completion.

#### Video Requirements

> **Important:** Please upload MP4 files with 24fps and a maximum duration of 9 minutes. Other file formats, frame rates, or longer videos might not be compatible and could cause errors.

#### Pricing

The credit cost is **0.5 credits per second**, which equals approximately **1 credit for a 2-second video**. Any failed or timeout tasks will result in a credit refund.

---

## POST — Step 1: Generate Upload URL

This endpoint generates a signed URL for uploading your video file and creates a task ID for tracking.

```
POST https://platform.dewatermark.ai/api/video/v1/upload
```

#### Response

| Property | Description |
| --- | --- |
| `task_id` | Unique identifier for this video processing task |
| `upload_signed_url` | Signed URL to upload your video file (valid for limited time) |
| `file_path` | Internal storage path for the video |
| `status` | Current status of the task (CREATED) |
| `created_at` | Unix timestamp when the task was created |

#### Request examples

```bash
curl --request POST \
  --url https://platform.dewatermark.ai/api/video/v1/upload \
  --header 'Content-Type: multipart/form-data' \
  --header 'X-API-KEY: YOUR_API_KEY'
```

```python
import requests

API_KEY = "YOUR_API_KEY"
headers = {
    "X-API-KEY": API_KEY,
    "Content-Type": "multipart/form-data"
}

# Generate upload URL
upload_url = "https://platform.dewatermark.ai/api/video/v1/upload"
response = requests.post(upload_url, headers=headers)
data = response.json()

task_id = data["task_id"]
upload_signed_url = data["upload_signed_url"]
file_path = data["file_path"]

print(f"Task ID: {task_id}")
print(f"Upload URL: {upload_signed_url}")
```

```javascript
const API_KEY = "YOUR_API_KEY";

// Generate upload URL
const response = await fetch(
  "https://platform.dewatermark.ai/api/video/v1/upload",
  {
    method: "POST",
    headers: { "X-API-KEY": API_KEY },
  }
);

const data = await response.json();
const { task_id, upload_signed_url, file_path } = data;

console.log("Task ID:", task_id);
console.log("Upload URL:", upload_signed_url);
```

#### Response

`200`

```json
{
  "task_id": "yIuf8WVuRE2pzP2WM48v",
  "upload_signed_url": "https://storage.googleapis.com/...",
  "file_path": "dewatermark-videos-asia-southeast1-prod/yIuf8WVuRE2pzP2WM48v",
  "status": "CREATED",
  "push_notification_token": null,
  "created_at": 1763794508
}
```

---

## PUT — Step 2: Upload Video File

Upload your video file to the signed URL obtained in Step 1.

#### Important Notes

- Use HTTP PUT method (not POST)
- Set Content-Type header to `application/octet-stream`
- Send the video file as binary data
- For detailed information about using signed URLs, refer to Google Cloud Storage documentation

> Only proceed to Step 3 after the upload is complete. Do not submit the task before the video file has been fully uploaded.

#### Request examples

```bash
# Replace UPLOAD_SIGNED_URL with the URL from Step 1
curl --request PUT \
  --url "UPLOAD_SIGNED_URL" \
  --header 'Content-Type: application/octet-stream' \
  --data-binary '@/path/to/your/video.mp4'
```

```python
import requests

# Use the upload_signed_url from Step 1
video_file_path = "path/to/your/video.mp4"

with open(video_file_path, 'rb') as video_file:
    headers = {
        "Content-Type": "application/octet-stream"
    }

    upload_response = requests.put(
        upload_signed_url,
        data=video_file,
        headers=headers
    )

    if upload_response.status_code == 200:
        print("Video uploaded successfully")
    else:
        print(f"Upload failed with status code: {upload_response.status_code}")
```

```javascript
import fs from "fs";

// Use the upload_signed_url from Step 1
const videoBuffer = fs.readFileSync("path/to/your/video.mp4");

const uploadResponse = await fetch(upload_signed_url, {
  method: "PUT",
  headers: { "Content-Type": "application/octet-stream" },
  body: videoBuffer,
});

if (uploadResponse.ok) {
  console.log("Video uploaded successfully");
} else {
  console.log(`Upload failed with status code: ${uploadResponse.status}`);
}
```

---

## POST — Step 3: Submit Task

Submit the task for processing after the video upload is complete.

```
POST https://platform.dewatermark.ai/api/video/v1/tasks
```

#### Request Parameters

| Parameter | Required | Type | Description |
| --- | --- | --- | --- |
| `task_id` | Yes | string | The task ID obtained from Step 1 |
| `mask_brush` | No | Binary File | Mask image to help AI focus on removing specific regions only, improving speed and accuracy |

`mask_brush` is optional, it helps AI focus on removing specific regions only, improving speed and accuracy. The mask should be the same size as the video input, it's a PNG image like the sample below.

![Example video mask_brush](https://assets.dewatermark.ai/api-document/images/mask_video-42c69302.png)
_Example mask_brush — a PNG the same size as the video input._

#### Request examples

```bash
curl --request POST \
  --url https://platform.dewatermark.ai/api/video/v1/tasks \
  --header 'Content-Type: multipart/form-data' \
  --header 'X-API-KEY: YOUR_API_KEY' \
  --form 'task_id=yIuf8WVuRE2pzP2WM48v' \
  --form 'mask_brush=@mask_brush_file'
```

```python
import requests

API_KEY = "YOUR_API_KEY"
submit_url = "https://platform.dewatermark.ai/api/video/v1/tasks"

headers = {
    "X-API-KEY": API_KEY
}

data = {
    "task_id": task_id  # From Step 1
}

files = {
    "mask_brush": open("mask_brush_file.png", "rb")  # Optional: helps AI focus on specific regions
}

response = requests.post(submit_url, headers=headers, data=data, files=files)
result = response.json()

print(f"Task submitted: {result}")
```

```javascript
import fs from "fs";

const API_KEY = "YOUR_API_KEY";

const form = new FormData();
form.append("task_id", task_id); // From Step 1
// Optional: helps AI focus on specific regions
form.append(
  "mask_brush",
  new Blob([fs.readFileSync("mask_brush_file.png")], { type: "image/png" }),
  "mask_brush_file.png"
);

const response = await fetch(
  "https://platform.dewatermark.ai/api/video/v1/tasks",
  {
    method: "POST",
    headers: { "X-API-KEY": API_KEY },
    body: form,
  }
);

const result = await response.json();
console.log("Task submitted:", result);
```

---

## GET — Step 4: Poll Task Status

Poll this endpoint to check the status of your video processing task.

```
GET https://platform.dewatermark.ai/api/video/v1/tasks/{task_id}
```

#### Response

| Property | Description |
| --- | --- |
| `task_id` | Unique identifier for the task |
| `status` | Current status (CREATED, PROCESSING, COMPLETED, FAILED) |
| `progress` | Processing progress (0 to 1) |
| `has_watermark` | Whether watermark was detected in the video |
| `duration` | Video duration in seconds |
| `created_at` | Unix timestamp when task was created |
| `started_at` | Unix timestamp when processing started |
| `completed_at` | Unix timestamp when processing completed |
| `download_signed_url` | Signed URL to download the processed video (valid for 2 days) |
| `file_path` | Internal storage path |
| `instance_name` | Processing instance name |

> The `download_signed_url` is valid for **2 days** from task completion. Use this URL to download your processed video file.

#### Status Values

| Status | Description |
| --- | --- |
| `CREATED` | Task has been created but not yet submitted |
| `PROCESSING` | Video is being processed |
| `COMPLETED` | Processing completed successfully, video is ready for download |
| `FAILED` | Processing failed, credits will be refunded |

#### Request examples

```bash
curl --request GET \
  --url https://platform.dewatermark.ai/api/video/v1/tasks/yIuf8WVuRE2pzP2WM48v \
  --header 'X-API-KEY: YOUR_API_KEY'
```

```python
import requests
import time

API_KEY = "YOUR_API_KEY"
status_url = f"https://platform.dewatermark.ai/api/video/v1/tasks/{task_id}"

headers = {
    "X-API-KEY": API_KEY
}

# Poll until task is complete
while True:
    response = requests.get(status_url, headers=headers)
    task_data = response.json()

    status = task_data["status"]
    progress = task_data.get("progress", 0)

    print(f"Status: {status}, Progress: {progress}")

    if status == "COMPLETED":
        download_url = task_data["download_signed_url"]
        duration = task_data["duration"]
        print(f"Video processing completed!")
        print(f"Duration: {duration}s")

        # Download the processed video
        video_response = requests.get(download_url)
        with open("processed_video.mp4", "wb") as f:
            f.write(video_response.content)
        print("Video downloaded successfully")
        break

    elif status == "FAILED":
        print("Task failed. Credits will be refunded.")
        break

    # Wait before polling again
    time.sleep(5)
```

```javascript
import fs from "fs";

const API_KEY = "YOUR_API_KEY";
const statusUrl = `https://platform.dewatermark.ai/api/video/v1/tasks/${task_id}`;

// Poll until task is complete
while (true) {
  const response = await fetch(statusUrl, {
    headers: { "X-API-KEY": API_KEY },
  });
  const taskData = await response.json();

  const status = taskData.status;
  const progress = taskData.progress ?? 0;
  console.log(`Status: ${status}, Progress: ${progress}`);

  if (status === "COMPLETED") {
    const downloadUrl = taskData.download_signed_url;
    console.log("Video processing completed!");
    console.log(`Duration: ${taskData.duration}s`);

    // Download the processed video
    const videoResponse = await fetch(downloadUrl);
    const buffer = Buffer.from(await videoResponse.arrayBuffer());
    fs.writeFileSync("processed_video.mp4", buffer);
    console.log("Video downloaded successfully");
    break;
  } else if (status === "FAILED") {
    console.log("Task failed. Credits will be refunded.");
    break;
  }

  // Wait before polling again
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
```

#### Response

`200`

```json
{
  "created_at": 1763794508,
  "task_id": "yIuf8WVuRE2pzP2WM48v",
  "has_watermark": true,
  "instance_name": "snapedit-dewatermark-video-prod-northeast3-zrtv",
  "progress": 1,
  "file_path": "dewatermark-videos-asia-southeast1-prod/yIuf8WVuRE2pzP2WM48v",
  "completed_at": 1763794728,
  "upload_signed_url": "https://storage.googleapis.com/...",
  "push_notification_token": null,
  "duration": 51.3,
  "status": "COMPLETED",
  "download_signed_url": "https://storage.googleapis.com/...",
  "started_at": 1763794550
}
```

---

## Complete Workflow Example

The full end-to-end example below chains all four steps: generate the upload URL, upload the video, submit the task, then poll until it is `COMPLETED` and download the result.

#### Request examples

```bash
# The full workflow is a sequence of the 4 requests above:
#   1. POST /api/video/v1/upload        -> get task_id + upload_signed_url
#   2. PUT  <upload_signed_url>          -> upload the .mp4 (octet-stream)
#   3. POST /api/video/v1/tasks          -> submit task_id
#   4. GET  /api/video/v1/tasks/{id}     -> poll until COMPLETED
```

```python
import requests
import time

API_KEY = "YOUR_API_KEY"
VIDEO_FILE_PATH = "input_video.mp4"

# Step 1: Generate upload URL
print("Step 1: Generating upload URL...")
upload_response = requests.post(
    "https://platform.dewatermark.ai/api/video/v1/upload",
    headers={"X-API-KEY": API_KEY, "Content-Type": "multipart/form-data"}
)
upload_data = upload_response.json()
task_id = upload_data["task_id"]
upload_signed_url = upload_data["upload_signed_url"]
print(f"Task ID: {task_id}")

# Step 2: Upload video file
print("Step 2: Uploading video...")
with open(VIDEO_FILE_PATH, 'rb') as video_file:
    upload_result = requests.put(
        upload_signed_url,
        data=video_file,
        headers={"Content-Type": "application/octet-stream"}
    )
print(f"Upload status: {upload_result.status_code}")

# Step 3: Submit task
print("Step 3: Submitting task...")
submit_response = requests.post(
    "https://platform.dewatermark.ai/api/video/v1/tasks",
    headers={"X-API-KEY": API_KEY, "Content-Type": "multipart/form-data"},
    data={"task_id": task_id}
)
print("Task submitted")

# Step 4: Poll for completion
print("Step 4: Polling for completion...")
status_url = f"https://platform.dewatermark.ai/api/video/v1/tasks/{task_id}"
while True:
    status_response = requests.get(
        status_url,
        headers={"X-API-KEY": API_KEY}
    )
    task_data = status_response.json()
    status = task_data["status"]
    progress = task_data.get("progress", 0)

    print(f"Status: {status}, Progress: {progress * 100}%")

    if status == "COMPLETED":
        download_url = task_data["download_signed_url"]
        duration = task_data["duration"]
        cost = duration * 0.5

        print(f"Processing completed!")
        print(f"Video duration: {duration}s")
        print(f"Credit cost: {cost} credits")

        # Download processed video
        video_data = requests.get(download_url).content
        with open("output_video.mp4", "wb") as f:
            f.write(video_data)
        print("Video downloaded to output_video.mp4")
        break

    elif status == "FAILED":
        print("Processing failed. Credits will be refunded.")
        break

    time.sleep(5)
```

```javascript
import fs from "fs";

const API_KEY = "YOUR_API_KEY";
const VIDEO_FILE_PATH = "input_video.mp4";

// Step 1: Generate upload URL
console.log("Step 1: Generating upload URL...");
const uploadResponse = await fetch(
  "https://platform.dewatermark.ai/api/video/v1/upload",
  { method: "POST", headers: { "X-API-KEY": API_KEY } }
);
const uploadData = await uploadResponse.json();
const taskId = uploadData.task_id;
const uploadSignedUrl = uploadData.upload_signed_url;
console.log("Task ID:", taskId);

// Step 2: Upload video file
console.log("Step 2: Uploading video...");
const uploadResult = await fetch(uploadSignedUrl, {
  method: "PUT",
  headers: { "Content-Type": "application/octet-stream" },
  body: fs.readFileSync(VIDEO_FILE_PATH),
});
console.log("Upload status:", uploadResult.status);

// Step 3: Submit task
console.log("Step 3: Submitting task...");
const submitForm = new FormData();
submitForm.append("task_id", taskId);
await fetch("https://platform.dewatermark.ai/api/video/v1/tasks", {
  method: "POST",
  headers: { "X-API-KEY": API_KEY },
  body: submitForm,
});
console.log("Task submitted");

// Step 4: Poll for completion
console.log("Step 4: Polling for completion...");
const statusUrl = `https://platform.dewatermark.ai/api/video/v1/tasks/${taskId}`;
while (true) {
  const statusResponse = await fetch(statusUrl, {
    headers: { "X-API-KEY": API_KEY },
  });
  const taskData = await statusResponse.json();
  const status = taskData.status;
  const progress = taskData.progress ?? 0;
  console.log(`Status: ${status}, Progress: ${progress * 100}%`);

  if (status === "COMPLETED") {
    const duration = taskData.duration;
    console.log("Processing completed!");
    console.log(`Video duration: ${duration}s`);
    console.log(`Credit cost: ${duration * 0.5} credits`);

    const videoData = Buffer.from(
      await (await fetch(taskData.download_signed_url)).arrayBuffer()
    );
    fs.writeFileSync("output_video.mp4", videoData);
    console.log("Video downloaded to output_video.mp4");
    break;
  } else if (status === "FAILED") {
    console.log("Processing failed. Credits will be refunded.");
    break;
  }

  await new Promise((resolve) => setTimeout(resolve, 5000));
}
```

---

## PDF Watermark Removal

Process a PDF asynchronously: request an upload URL, upload the file, start a task, then poll for the result.

#### How it works

1. **Request an upload URL** — get a `task_id` and a signed upload URL.
2. **Upload the PDF** — `PUT` the file directly to the signed URL.
3. **Start the task** — submit the `task_id` to begin processing.
4. **Poll for the result** — check the task status until it finishes.

#### Credits & pricing

Cost is based on the number of pages in the PDF: `credits = ceil(pages × 0.1)` — in other words, **1 credit per 10 pages, rounded up**. Any partial block of 10 pages costs a full credit.

| Pages | Credits |
| --- | --- |
| 1–10 | 1 |
| 11–20 | 2 |
| 15 | 2 |
| 21–30 | 3 |
| 100 | 10 |
| 300 (max) | 30 |

- Credits are deducted only when the task is **successfully started** (Step 3).
- If a task ends in `FAILED`, the credits are **automatically refunded**.
- The maximum allowed size is **300 pages** per PDF.

---

## POST — Step 1: Request an Upload URL

Creates a task and returns a pre-signed URL to upload your PDF to.

```
POST https://platform.dewatermark.ai/api/pdf/v1/upload
```

#### Response

| Property | Description |
| --- | --- |
| `task_id` | Unique identifier for this PDF task |
| `upload_signed_url` | Signed URL to upload your PDF file to |
| `file_path` | Internal storage path for the PDF |
| `status` | Current status of the task (CREATED) |
| `created_at` | Unix timestamp when the task was created |

Keep the `task_id` and `upload_signed_url` for the next steps.

#### Request examples

```bash
curl --location --request POST 'https://platform.dewatermark.ai/api/pdf/v1/upload' \
  --header 'X-API-KEY: YOUR_API_KEY' \
  --data ''
```

```python
import requests

API_KEY = "YOUR_API_KEY"
upload_url = "https://platform.dewatermark.ai/api/pdf/v1/upload"

response = requests.post(upload_url, headers={"X-API-KEY": API_KEY})
data = response.json()

task_id = data["task_id"]
upload_signed_url = data["upload_signed_url"]
print(f"Task ID: {task_id}")
print(f"Upload URL: {upload_signed_url}")
```

```javascript
const API_KEY = "YOUR_API_KEY";

// Request an upload URL
const response = await fetch(
  "https://platform.dewatermark.ai/api/pdf/v1/upload",
  {
    method: "POST",
    headers: { "X-API-KEY": API_KEY },
  }
);

const data = await response.json();
const { task_id, upload_signed_url, file_path } = data;
console.log("Task ID:", task_id);
```

#### Response

`200`

```json
{
  "task_id": "abc123",
  "upload_signed_url": "https://storage.googleapis.com/...",
  "file_path": "...",
  "status": "CREATED",
  "created_at": 1718600000
}
```

---

## PUT — Step 2: Upload the PDF

Upload the raw PDF bytes directly to the signed URL returned above. This request does **not** go to the API base URL and does **not** need the `X-API-KEY` header.

#### Important Notes

- Use HTTP PUT method (not POST)
- Set Content-Type header to `application/pdf`
- Send the PDF file as binary data

> A `200 OK` with an empty body means the upload succeeded.

#### Request examples

```bash
# Replace UPLOAD_SIGNED_URL with the URL from Step 1
curl --location --request PUT 'UPLOAD_SIGNED_URL' \
  --header 'Content-Type: application/pdf' \
  --data-binary '@document.pdf'
```

```python
import requests

# Use the upload_signed_url from Step 1
with open("document.pdf", "rb") as pdf_file:
    upload_response = requests.put(
        upload_signed_url,
        data=pdf_file,
        headers={"Content-Type": "application/pdf"}
    )

if upload_response.status_code == 200:
    print("PDF uploaded successfully")
else:
    print(f"Upload failed with status code: {upload_response.status_code}")
```

```javascript
import fs from "fs";

// Use the upload_signed_url from Step 1
const uploadResponse = await fetch(upload_signed_url, {
  method: "PUT",
  headers: { "Content-Type": "application/pdf" },
  body: fs.readFileSync("document.pdf"),
});

console.log(
  uploadResponse.ok
    ? "PDF uploaded successfully"
    : `Upload failed with status code: ${uploadResponse.status}`
);
```

---

## POST — Step 3: Start the Task

Begins processing the uploaded PDF. The `task_id` must be sent as **multipart form data**.

```
POST https://platform.dewatermark.ai/api/pdf/v1/tasks
```

#### Request Parameters

| Parameter | Required | Type | Description |
| --- | --- | --- | --- |
| `task_id` | Yes | string | The task ID obtained from Step 1 |

> Processing runs asynchronously — a `200` here means the job was accepted and started, not that it is finished. Proceed to polling.

#### Possible errors

| Status | Meaning |
| --- | --- |
| `400` | Missing `task_id`, or the PDF exceeds the page limit (max **300 pages**). |
| `403` | No credit available. |
| `429` | Insufficient balance for this PDF's page count. |

#### Request examples

```bash
curl --location --request POST 'https://platform.dewatermark.ai/api/pdf/v1/tasks' \
  --header 'X-API-KEY: YOUR_API_KEY' \
  --form 'task_id=TASK_ID'
```

```python
import requests

API_KEY = "YOUR_API_KEY"
submit_url = "https://platform.dewatermark.ai/api/pdf/v1/tasks"

response = requests.post(
    submit_url,
    headers={"X-API-KEY": API_KEY},
    files={"task_id": (None, task_id)}  # From Step 1
)
print(f"Task started: {response.json()}")
```

```javascript
const API_KEY = "YOUR_API_KEY";

const form = new FormData();
form.append("task_id", task_id); // From Step 1

const response = await fetch(
  "https://platform.dewatermark.ai/api/pdf/v1/tasks",
  {
    method: "POST",
    headers: { "X-API-KEY": API_KEY },
    body: form,
  }
);

console.log("Task started:", await response.json());
```

#### Response

`200`

```json
{ "task_id": "abc123" }
```

---

## GET — Step 4: Poll for the Result

Returns the current state of the task. Poll periodically (e.g. every few seconds) until `status` is `SUCCESS` or `FAILED`.

```
GET https://platform.dewatermark.ai/api/pdf/v1/tasks/{task_id}
```

#### Status Values

| Status | Meaning |
| --- | --- |
| `CREATED` | Task is queued or in progress — keep polling. |
| `SUCCESS` | Done. The processed PDF is available at the result URL. |
| `FAILED` | Processing failed. Credits charged for this task are automatically refunded. |

#### Request examples

```bash
curl --location 'https://platform.dewatermark.ai/api/pdf/v1/tasks/TASK_ID' \
  --header 'X-API-KEY: YOUR_API_KEY'
```

```python
import requests
import time

API_KEY = "YOUR_API_KEY"
status_url = f"https://platform.dewatermark.ai/api/pdf/v1/tasks/{task_id}"

# Poll until the task finishes
while True:
    response = requests.get(status_url, headers={"X-API-KEY": API_KEY})
    task_data = response.json()
    status = task_data["status"]
    print(f"Status: {status}")

    if status == "SUCCESS":
        print(f"Result URL: {task_data['result_url']}")
        break
    elif status == "FAILED":
        print("Processing failed. Credits will be refunded.")
        break

    time.sleep(5)
```

```javascript
const API_KEY = "YOUR_API_KEY";
const statusUrl = `https://platform.dewatermark.ai/api/pdf/v1/tasks/${task_id}`;

// Poll until the task finishes
while (true) {
  const response = await fetch(statusUrl, {
    headers: { "X-API-KEY": API_KEY },
  });
  const taskData = await response.json();
  console.log(`Status: ${taskData.status}`);

  if (taskData.status === "SUCCESS") {
    console.log("Result URL:", taskData.result_url);
    break;
  } else if (taskData.status === "FAILED") {
    console.log("Processing failed. Credits will be refunded.");
    break;
  }

  await new Promise((resolve) => setTimeout(resolve, 5000));
}
```

#### Response

`Processing`

```json
{ "task_id": "abc123", "status": "CREATED" }
```

`Success`

```json
{
  "task_id": "abc123",
  "status": "SUCCESS",
  "result_url": "https://..."
}
```

---

## GET — Tracking Credit Balance

You can use this API to get the credit balance.

```
GET https://platform.dewatermark.ai/api/creditInfo
```

#### Response

| Property | Description |
| --- | --- |
| `status` | Status of the request |
| `data.available_credit` | Your current available credit balance |
| `data.user_id` | Your user ID |

#### Request examples

```bash
curl --request GET \
  --url https://platform.dewatermark.ai/api/creditInfo \
  --header 'X-API-KEY: YOUR_API_KEY'
```

```python
import requests

API_KEY = "YOUR_API_KEY"
headers = {
    "X-API-KEY": API_KEY
}

response = requests.get(
    "https://platform.dewatermark.ai/api/creditInfo",
    headers=headers
)

data = response.json()
print(f"Available credit: {data['data']['available_credit']}")
```

```javascript
const API_KEY = "YOUR_API_KEY";

const response = await fetch(
  "https://platform.dewatermark.ai/api/creditInfo",
  {
    headers: { "X-API-KEY": API_KEY },
  }
);

const data = await response.json();
console.log(`Available credit: ${data.data.available_credit}`);
```

#### Response

`200`

```json
{
  "status": "OK",
  "data": {
    "available_credit": 1000,
    "user_id": "user_id"
  }
}
```

---

## Errors

| Error Code | Meaning |
| --- | --- |
| 400 | Bad Request — Your request is invalid. |
| 401 | Unauthorized — Your API key is wrong. |
| 500 | Internal Server Error — We had a problem with our server. Try again later. |
| 503 | Service Unavailable — We're temporarily offline for maintenance. Please try again later. |