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