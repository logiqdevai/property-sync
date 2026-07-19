# EstateWeb Location Match Responses

`POST https://app.estateweb.gr/patch/?path=gateways/location/match`

## Example 1 — Άγιος Ιωάννης (Καρτερού)

### Payload

```json
{
  "gateway_id": 2,
  "location_id": 113745
}
```

### Response

```json
{
  "data": {
    "id": "1345",
    "parent_id": "1231",
    "name": "Άγιος Ιωάννης (Καρτερού)",
    "level": "2",
    "path": "Ηράκλειο » Ευρύτερη περιοχή Ηρακλείου » Άγιος Ιωάννης (Καρτερού)"
  }
}
```

## Example 2 — Αγία Πελαγία

**Status:** `200 OK`

### Payload

```json
{
  "gateway_id": 2,
  "location_id": 105356
}
```

### Response

```json
{
  "data": {
    "id": "1542",
    "parent_id": "1240",
    "name": "Αγία Πελαγία",
    "level": "2",
    "path": "Ηράκλειο » Γούβες » Αγία Πελαγία"
  }
}
```

## Example 3 — Μεσσηνία (`location_id` 80601)

**Status:** `200 OK`

### Payload

```json
{
  "gateway_id": 2,
  "location_id": 80601
}
```

### Response

```json
{
  "data": {
    "id": "1838",
    "parent_id": "1755",
    "name": "Μεσσηνία",
    "level": "1",
    "path": "Υπόλοιπη Ελλάδα » Μεσσηνία"
  }
}
```

## Example 4 — Μεσσηνία (`location_id` 111390)

**Status:** `200 OK`

### Payload

```json
{
  "gateway_id": 2,
  "location_id": 111390
}
```

### Response

```json
{
  "data": {
    "id": "1838",
    "parent_id": "1755",
    "name": "Μεσσηνία",
    "level": "1",
    "path": "Υπόλοιπη Ελλάδα » Μεσσηνία"
  }
}
```
