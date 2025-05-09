# Fourthwall Webhook Reference

## Webhook Endpoint
Your server should expose an endpoint such as:

```
POST /webhook/fourthwall
```

## Sample Webhook Payload
The following is an example of a `SUBSCRIPTION_PURCHASED` webhook:

```json
{
  "testMode": false,
  "id": "weve_O71pR3A3SQyamEcDddPECA",
  "webhookId": "wcon_VMG9BuxZQeK2kELDm0_uNw",
  "shopId": "sh_c9524068-3d80-4163-8e57-d2acf8354c55",
  "type": "SUBSCRIPTION_PURCHASED",
  "apiVersion": "V1",
  "createdAt": "2025-05-08T02:50:39.221454+00:00",
  "data": {
    "email": "quanttradingpro@gmail.com",
    "id": "633544",
    "nickname": "Titon Hoque",
    "subscription": {
      "type": "SUSPENDED",
      "variant": {
        "amount": {
          "currency": "USD",
          "value": 9.99
        },
        "id": "mtv_43604",
        "interval": "MONTHLY",
        "tierId": "mt_28243"
      }
    }
  }
}
```
## 📬 Fourthwall Webhook Payload Examples

These are real sample payloads received from the `SUBSCRIPTION_PURCHASED` webhook events.

---

### ✅ Webhook Sample #1
```json
{
  "testMode": false,
  "id": "weve_312IjIdOSO2JlXyybesbkA",
  "webhookId": "wcon_VMG9BuxZQeK2kELDm0_uNw",
  "shopId": "sh_c9524068-3d80-4163-8e57-d2acf8354c55",
  "type": "SUBSCRIPTION_PURCHASED",
  "apiVersion": "V1",
  "createdAt": "2025-05-08T02:31:54.604617+00:00",
  "data": {
    "email": "quanttradingpro@gmail.com",
    "id": "633544",
    "nickname": "Titon Hoque",
    "subscription": {
      "type": "SUSPENDED",
      "variant": {
        "amount": {
          "currency": "USD",
          "value": 9.99
        },
        "id": "mtv_43604",
        "interval": "MONTHLY",
        "tierId": "mt_28243"
      }
    }
  }
}
```

---

### ✅ Webhook Sample #2
```json
{
  "testMode": false,
  "id": "weve_O71pR3A3SQyamEcDddPECA",
  "webhookId": "wcon_VMG9BuxZQeK2kELDm0_uNw",
  "shopId": "sh_c9524068-3d80-4163-8e57-d2acf8354c55",
  "type": "SUBSCRIPTION_PURCHASED",
  "apiVersion": "V1",
  "createdAt": "2025-05-08T02:50:39.221454+00:00",
  "data": {
    "email": "quanttradingpro@gmail.com",
    "id": "633544",
    "nickname": "Titon Hoque",
    "subscription": {
      "type": "SUSPENDED",
      "variant": {
        "amount": {
          "currency": "USD",
          "value": 9.99
        },
        "id": "mtv_43604",
        "interval": "MONTHLY",
        "tierId": "mt_28243"
      }
    }
  }
}
```

---

### ✅ Webhook Sample #3
```json
{
  "testMode": false,
  "id": "weve_-bHNr_7lQkWCIjCI1ARQ0A",
  "webhookId": "wcon_VMG9BuxZQeK2kELDm0_uNw",
  "shopId": "sh_c9524068-3d80-4163-8e57-d2acf8354c55",
  "type": "SUBSCRIPTION_PURCHASED",
  "apiVersion": "V1",
  "createdAt": "2025-05-08T03:07:19.638294+00:00",
  "data": {
    "email": "hoquet@yahoo.com",
    "id": "632107",
    "nickname": "Titon Hoque",
    "subscription": {
      "type": "SUSPENDED",
      "variant": {
        "amount": {
          "currency": "USD",
          "value": 19.99
        },
        "id": "mtv_43609",
        "interval": "MONTHLY",
        "tierId": "mt_28247"
      }
    }
  }
}
```

## Notes
- The `subscription.type` can be `ACTIVE`, `SUSPENDED`, or `NONE`.
- You may wish to normalize tier IDs using a `tierMap`, for example:
  ```js
  const tierMap = {
    "mt_28243": "Pro",
    "mt_28247": "Elite"
  };
  ```

## Tips
- Webhooks can be tested manually through the Fourthwall dashboard.
- Ensure you return HTTP 200 status to acknowledge receipt.
- Log the full payload for debugging.