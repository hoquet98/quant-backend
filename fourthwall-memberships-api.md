# 📘 Fourthwall API: Get All Memberships

## ✅ Endpoint
```
GET https://api.fourthwall.com/open-api/v1.0/memberships/members
```

## 🔐 Authentication
- Type: **Basic Auth**
- Username: `fw_api_wuagxhg7nhseku6geyjk@fourthwall.com`
- Password: `3GMo3WkiUmiAEhkmsw0KxDCGcI1OACdgIfeBAHSO`

## 📦 Sample cURL Request
```bash
curl -X GET "https://api.fourthwall.com/open-api/v1.0/memberships/members" \
  -u "fw_api_wuagxhg7nhseku6geyjk@fourthwall.com:3GMo3WkiUmiAEhkmsw0KxDCGcI1OACdgIfeBAHSO" \
  -H "Accept-Encoding: gzip" \
  -H "Content-Type: application/json" \
  --compressed
```

## 📤 Sample Response
```json
{
  "results": [
    {
      "id": "632107",
      "email": "hoquet@yahoo.com",
      "nickname": "Titon Hoque",
      "subscription": {
        "type": "ACTIVE",
        "variant": {
          "id": "mtv_43609",
          "tierId": "mt_28247",
          "interval": "MONTHLY",
          "amount": {
            "value": 19.99,
            "currency": "USD"
          }
        }
      }
    },
    {
      "id": "632890",
      "email": "hoquet@gmail.com",
      "nickname": "Titon Hoque",
      "subscription": {
        "type": "NONE"
      }
    },
    {
      "id": "632898",
      "email": "hoquet2025@gmail.com",
      "nickname": "Titon Hoque",
      "subscription": {
        "type": "NONE"
      }
    },
    {
      "id": "633544",
      "email": "quanttradingpro@gmail.com",
      "nickname": "Titon Hoque",
      "subscription": {
        "type": "ACTIVE",
        "variant": {
          "id": "mtv_43604",
          "tierId": "mt_28243",
          "interval": "MONTHLY",
          "amount": {
            "value": 9.99,
            "currency": "USD"
          }
        }
      }
    }
  ],
  "total": 4
}
```

## 🧾 Notes
- `subscription.type`: Can be `"ACTIVE"`, `"SUSPENDED"`, or `"NONE"`
- `tierId` → tier name mapping:
  - `mt_28243` → **Pro**
  - `mt_28247` → **Elite**
- Response is gzip-compressed. Use `--compressed` in cURL or decompress in code.
- All emails are lowercase by default.
