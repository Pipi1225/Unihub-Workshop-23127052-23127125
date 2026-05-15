# Test Scripts (Node.js)

These scripts hit the running API directly.

## Requirements

- Node.js 18+ (uses global `fetch`)
- Server running at BASE_URL (default: http://localhost:4000)

## Environment

Set env vars before running (the scripts auto-load `test_scripts/.env` if present):

- BASE_URL (optional)
- STUDENT_TOKEN (Bearer JWT for student)
- ORGANIZER_TOKEN (optional, for payment mock mode)
- WORKSHOP_ID (default provided)
- REGISTRATION_ID (optional, reuse existing registration)

## Scripts

- race_condition.js
- rate_limit.js
- idempotency.js
- circuit_breaker.js

## Examples (Windows PowerShell)

```
$env:BASE_URL="http://localhost:4000"
$env:STUDENT_TOKEN="<jwt>"
$env:WORKSHOP_ID="bed7830c-ab08-4523-bf1f-e49ceed90d8d"
node .\test_scripts\race_condition.js
node .\test_scripts\rate_limit.js
node .\test_scripts\idempotency.js
node .\test_scripts\circuit_breaker.js
```

## Notes

- For circuit breaker, either:
  - set ORGANIZER_TOKEN so the script can switch payment mode, or
  - set PAYMENT_MOCK_MODE=failure in server env and restart.
