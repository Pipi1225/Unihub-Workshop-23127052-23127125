# Notification System - Usage & Design

## Overview

This notification system sends important messages (registration confirmation, QR tickets, cancellations) using a **Message Queue** so the core API remains fast. It is designed with a **Strategy Pattern** so new channels (Telegram, Zalo, SMS) can be added without changing existing core logic.

Current channel: **Email** (via Gmail SMTP).

## Architecture

```
API (Producer)
  -> BullMQ Queue: notification_queue
     -> Worker (Consumer)
        -> NotificationService (routing)
                -> EmailProvider (SMTP/Gmail)
                   -> QR endpoint (render PNG)
```

## Happy Path (Email)

1. API builds payload and enqueues a job (no await send).
2. Worker consumes the job from `notification_queue`.
3. NotificationService selects `EmailProvider` (based on `NOTIFICATION_CHANNEL`).
4. EmailProvider renders HTML template and sends via SMTP.
5. Worker marks the job as completed.

## Queue Names

- `notification_queue`: main queue
- `notification_dlq`: dead-letter queue (failed after retries)

## Payload Format

```json
{
  "user_email": "student@fitus.edu.vn",
  "full_name": "Nguyen Van A",
  "workshop_info": {
    "title": "Intro Workshop",
    "time": "2026-04-29 08:00",
    "qr_code_url": "https://example.com/qr/abc"
  },
  "qr_code_hash": "abc123"
}
```

## Environment Variables

```env
# Channel routing
NOTIFICATION_CHANNEL=EMAIL

# SMTP (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_app_password_no_spaces
SMTP_SECURE=false
SMTP_FROM="FPTU Events <your_gmail@gmail.com>"

# Optional
QR_CODE_BASE_URL=http://localhost:4000/api/qr
QR_CODE_WIDTH=256
QR_CODE_MARGIN=1
QR_CODE_ERROR_LEVEL=M
QR_CODE_EMBED_MODE=data
NOTIFICATION_JOB_ATTEMPTS=5
NOTIFICATION_WORKER_CONCURRENCY=5
NOTIFICATION_RATE_LIMIT=50

# For script testing
NOTIFICATION_TEST_EMAIL=student@fitus.edu.vn
NOTIFICATION_TEST_NAME=Test Student
NOTIFICATION_TEST_WORKSHOP=Intro Workshop
NOTIFICATION_TEST_TIME=2026-04-29 08:00
NOTIFICATION_TEST_QR=qr-demo-0001
```

**Gmail notes:**

- You must enable 2FA and generate an App Password for `SMTP_PASS`.
- Remove spaces from the App Password (Gmail displays spaces for readability).
- If Gmail rejects the sender, set `SMTP_FROM` to the same address as `SMTP_USER`.
- You can switch back to Mailtrap by replacing the SMTP\_\* values.

**QR embed notes:**

- `QR_CODE_EMBED_MODE=cid`: attaches a QR image and embeds it via CID for best Gmail compatibility.
- `QR_CODE_EMBED_MODE=data` (default): embeds QR as a data URL (some clients block it).
- `QR_CODE_EMBED_MODE=url`: uses a remote image URL (needs a public `QR_CODE_BASE_URL`).

## How to Run

### 1) Start Worker

```bash
npm run worker:notification
```

### 2) Enqueue Test Job(s)

```bash
# Enqueue 1 job
npm run notification:enqueue -- --count 1

# Enqueue 1000 jobs (perf test)
npm run notification:enqueue -- --count 1000 --batch 200
```

## Error Handling

### Provider Down / Timeout

- Worker throws error -> BullMQ retries with backoff.
- Backoff schedule: 1 min, 3 min, 5 min (then 5 min for remaining attempts).
- After attempts exhausted, job is added to `notification_dlq`.

### Invalid Email

- Worker validates email before sending.
- Invalid email throws `UnrecoverableError` -> no retry -> goes to DLQ.

### Queue Spike (High Volume)

- Producer only enqueues jobs (fast). UI response is not blocked.
- Worker limits rate via `NOTIFICATION_RATE_LIMIT` (default 50/sec).

## Acceptance Criteria (Suggested Tests)

1. **Decoupling Performance**
   - Run `npm run notification:enqueue -- --count 1000`.
   - Check avg enqueue time (should be ~<10ms/job on local).

2. **Email Delivery**
   - Run worker and enqueue 1 job.
   - Check Gmail inbox for HTML email with correct name + QR hash.
   - Click View QR Code or view the embedded QR image.

3. **Retry Mechanism**
   - Set wrong `SMTP_PASS` temporarily.
   - Enqueue job and observe retry logs.

## Extending to New Channels

Implement a new provider in `src/notifications/providers`:

- `TelegramProvider.js` implements `send(payload)`
- Update `NotificationService` routing to handle `NOTIFICATION_CHANNEL=TELEGRAM`

No changes required in API or Worker logic.

## File Structure

```
server/
├── src/
│   ├── notifications/
│   │   ├── notificationQueue.js
│   │   ├── notificationService.js
│   │   ├── templateRenderer.js
│   │   ├── providers/
│   │   │   ├── INotificationProvider.js
│   │   │   └── EmailProvider.js
│   │   └── templates/
│   │       └── emailTicket.html
│   ├── workers/
│   │   └── notificationWorker.js
│   └── scripts/
│       └── enqueueNotificationBatch.js
```

---

**Version**: 1.0  
**Updated**: 2026-05-01
