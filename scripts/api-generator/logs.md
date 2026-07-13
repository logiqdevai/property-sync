# EstateWeb Property API

Captured HTTP traffic from the EstateWeb admin UI while creating and updating a property listing.

| | |
|---|---|
| **Base URL** | `https://app.estateweb.gr` |
| **API prefix** | `/api` |
| **Captured** | 2026-07-13 |
| **API version** | `1.4.0` (`x-estate-version` response header) |

---

## Authentication

Captured requests send **both** a Bearer token and a session cookie. Mirror the browser and include all headers below.

| Header | Value |
|--------|-------|
| `Accept-Language` | `en-US,en;q=0.9,el;q=0.8` |
| `Authorization` | `Bearer G36g47zh04jnrAOxMNg2k8Z9Pb02khCq9anUoncE` |
| `Content-Type` | `application/json` |
| `Cookie` | `estate_session=eyJpdiI6IlFiMHhVaGt4TktsUEZvYkU1d3U0bUE9PSIsInZhbHVlIjoia0hjL2FIdDBMRmV2Nm5wVHBqMTVENUU0QTNLaUNPM0ZSeElqY0pHODdIMTVDNzJ4SEVGY3IwNlh2MmR1WWU5VjJmeGhqUUh2MTRaMG5iMjNOWEJsenc9PSIsIm1hYyI6ImZlYWRjMTM0NDdlNmE1OGU5ZjIzMDQ4NDE5YWExNDg4MmY3ZmY2NDcxODVjYThmZjM2YmYxMjFmODM0MTNlOTIifQ%3D%3D` |

```http
Accept: application/json
Accept-Language: en-US,en;q=0.9,el;q=0.8
Authorization: Bearer G36g47zh04jnrAOxMNg2k8Z9Pb02khCq9anUoncE
Content-Type: application/json
Cookie: estate_session=eyJpdiI6IlFiMHhVaGt4TktsUEZvYkU1d3U0bUE9PSIsInZhbHVlIjoia0hjL2FIdDBMRmV2Nm5wVHBqMTVENUU0QTNLaUNPM0ZSeElqY0pHODdIMTVDNzJ4SEVGY3IwNlh2MmR1WWU5VjJmeGhqUUh2MTRaMG5iMjNOWEJsenc9PSIsIm1hYyI6ImZlYWRjMTM0NDdlNmE1OGU5ZjIzMDQ4NDE5YWExNDg4MmY3ZmY2NDcxODVjYThmZjM2YmYxMjFmODM0MTNlOTIifQ%3D%3D
```

### Login (web form)

Login form submit is a `POST` to `/login` and includes the form fields below:

```http
POST /login
Content-Type: application/x-www-form-urlencoded

__csrf=HadyaE3sXzGrZLdaMkLPfsazbhRAntsOhGp5y9UQ
email=test100@akinitakritis.gr
password=test100!X
```

Successful login sets cookies used by the API calls (including `estate_session`).

For `POST /api/property/{id}/img`, omit `Content-Type: application/json` — the client sets `multipart/form-data` with a boundary automatically.

Bearer token and `estate_session` cookie both expire. Refresh from DevTools after signing in at [app.estateweb.gr](https://app.estateweb.gr) when requests return `401`.

Postman: set `estateSession` to the cookie value only (without `estate_session=`). Add `Authorization: Bearer {{bearerToken}}` if the collection is updated for dual auth.

---

## Typical workflow

```mermaid
sequenceDiagram
    participant Client
    participant API as EstateWeb API

    Client->>API: GET /api/property (search / verify)
    Client->>API: POST /api/property (create draft)
    API-->>Client: { id, code }
    Client->>API: PATCH /api/property/{id} (enrich listing)
    API-->>Client: { id, code }
    Client->>API: POST /api/property/{id}/img (upload photo)
    API-->>Client: image record
```

| Step | Method | Endpoint | Purpose |
|------|--------|----------|---------|
| 1 | `GET` | `/api/property` | List or search properties |
| 2 | `POST` | `/api/property` | Create a new property |
| 3 | `PATCH` | `/api/property/{id}` | Update property details, ads, coordinates |
| 4 | `POST` | `/api/property/{id}/img` | Upload property image |

---

## Endpoints

### 1. List properties

```http
GET /api/property
```

#### Query parameters

| Parameter | Example | Description |
|-----------|---------|-------------|
| `code` | | Property code filter |
| `scope_id` | | Scope filter |
| `client_id` | | Client filter |
| `sqm_from` | | Min square meters |
| `sqm_to` | | Max square meters |
| `price_from` | | Min price |
| `price_to` | | Max price |
| `address` | | Address search |
| `is_exclusive_order` | | Exclusive order flag |
| `is_offer` | | Offer flag |
| `status_id` | `0` | Status filter |
| `types` | | Property types |
| `locations` | | Location filter |
| `site_id` | | Site filter |
| `gateway_id` | | Gateway filter |
| `agent_scope` | `0` | Agent scope |
| `page` | `1` | Page number |
| `rpp` | `50` | Results per page |
| `sort_col` | `created_at` | Sort column |
| `sort_way` | `DESC` | Sort direction |

#### Example request

```http
GET /api/property?status_id=0&agent_scope=0&page=1&rpp=50&sort_col=created_at&sort_way=DESC
Accept: application/json
Cookie: estate_session=<session_value>
```

#### Example response

```json
{
  "total": 0,
  "debug": null,
  "list": []
}
```

---

### 2. Create property

```http
POST /api/property
Content-Type: application/json
```

Creates a new property. Send `id: 0` for a new record.

#### Example response `200 OK`

```json
{
  "id": 51700,
  "code": "2193"
}
```

#### Request body (captured example)

See `postman/create-property-body.json` for the full payload. Key fields:

| Field | Example | Notes |
|-------|---------|-------|
| `id` | `0` | `0` on create |
| `type_id` | `21` | Property type |
| `scope_id` | `1` | Sale / rent scope |
| `location_id` | `400` | Location reference |
| `address` | `Melevizi 08` | Street address |
| `zip` | `74500` | Postal code |
| `price` / `price_web` | `40000` | Listing price |
| `sqm` | `50` | Size in m² |
| `description` | *(Greek text)* | Main description |
| `is_offer` | `1` | Offer flag |
| `is_exclusive_order` | `1` | Exclusive listing |
| `lat_lng` | `""` | Empty on create; set on update |
| `metadata` | *(JSON string)* | Contract / guarantee metadata |
| `client_contacted_at` | `2027-01-16` | Contact date |
| `expires_at` | `2027-02-27` | Listing expiry |
| `fields` | `[{ id, value }, …]` | Dynamic attribute fields |
| `ads` | `[{ lang_id, text, title, description }]` | Per-language ad copy (6 langs) |
| `price_negotiable` | `1` | Negotiable flag |

<details>
<summary>Full create payload (JSON)</summary>

```json
{
  "id": 0,
  "type_id": 21,
  "scope_id": 1,
  "location_id": 400,
  "client_id": 0,
  "coop_id": 0,
  "to_client_id": 0,
  "code": "",
  "address": "Melevizi 08",
  "zip": "74500",
  "price_start": 40000,
  "price": 40000,
  "price_final": 0,
  "price_web": 40000,
  "sqm": 50,
  "distance_airport": "500",
  "distance_port": "400",
  "distance_beach": "300",
  "description": "Πωλείται φωτεινή και λειτουργική γκαρσονιέρα σε εξαιρετική τοποθεσία...",
  "status_id": 0,
  "is_offer": 1,
  "is_exclusive_order": 1,
  "video_url": "",
  "show_video_on_site": 0,
  "lat_lng": "",
  "show_map_on_site": 0,
  "metadata": "{\"guarantee\":\"\",\"stamp\":\"\",\"inc_type\":0,\"inc_value\":\"\",\"inc_period\":0,\"inc_2years\":0,\"contract_period\":\"\",\"terms\":\"\",\"has_keys\":\"\",\"rental_history\":[]}",
  "client_contacted_at": "2027-01-16",
  "expires_at": "2027-02-27",
  "fields": [
    { "id": 110, "value": 15 },
    { "id": 1001, "value": "10" },
    { "id": 1006, "value": "45" },
    { "id": 1012, "value": "2" },
    { "id": 1013, "value": "2005" },
    { "id": 1014, "value": "2020" },
    { "id": 2000, "value": "ΟΧΙ" },
    { "id": 2003, "value": "2" },
    { "id": 2004, "value": "2" },
    { "id": 2005, "value": "4" },
    { "id": 2007, "value": "2" },
    { "id": 2010, "value": 24 },
    { "id": 4185, "value": 40 },
    { "id": 4187, "value": 62 },
    { "id": 4172, "value": "1" },
    { "id": 4006, "value": "1" },
    { "id": 4043, "value": "1" },
    { "id": 4080, "value": "1" },
    { "id": 4048, "value": "1" },
    { "id": 4101, "value": "1" }
  ],
  "sites": [],
  "gateways": [],
  "ads": [
    { "lang_id": 1, "text": "", "title": "", "description": "" },
    { "lang_id": 2, "text": "", "title": "", "description": "" },
    { "lang_id": 3, "text": "", "title": "", "description": "" },
    { "lang_id": 4, "text": "", "title": "", "description": "" },
    { "lang_id": 5, "text": "", "title": "", "description": "" },
    { "lang_id": 6, "text": "", "title": "", "description": "" }
  ],
  "foreign_agents": [],
  "history": [],
  "notes": [],
  "price_negotiable": 1,
  "note": ""
}
```

</details>

---

### 3. Update property

```http
PATCH /api/property/{id}
Content-Type: application/json
```

Same body shape as create, but with the assigned `id` and `code`. Used to add coordinates, localized ad copy, and other fields after initial creation.

#### Path parameter

| Parameter | Example | Description |
|-----------|---------|-------------|
| `id` | `51700` | Property ID from create response |

#### Differences from create (captured example)

| Field | Create | Update |
|-------|--------|--------|
| `id` | `0` | `51700` |
| `code` | `""` | `"2193"` |
| `lat_lng` | `""` | `"35.33053632689858,25.228695241154412"` |
| `ads[0]` | empty | Greek title, text, description filled |
| `agent_id` | — | `2` |
| `group_id` | — | `1192` |
| `user_id` | — | `1285` |
| `created_at` | — | `"2026-07-13"` |

#### Example response

```json
{
  "id": 51700,
  "code": "2193"
}
```

See `postman/update-property-body.json` for the full update payload.

---

### 4. Upload property image

```http
POST /api/property/{id}/img
Content-Type: multipart/form-data
```

#### Path parameter

| Parameter | Example | Description |
|-----------|---------|-------------|
| `id` | `51700` | Property ID |

#### Form fields

| Field | Type | Example |
|-------|------|---------|
| `payload` | text (JSON) | `{"filename":"20260613210131011285.jpg","show_on_site":false,"show_on_groups":1,"show_on_foreign_agents":0,"zindex":1}` |
| `image` | file | Binary image data |

#### Payload object

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `filename` | string | `20260613210131011285.jpg` | Target filename |
| `show_on_site` | boolean | `false` | Show on agency website |
| `show_on_groups` | number | `1` | Show on group portals |
| `show_on_foreign_agents` | number | `0` | Show on foreign agent feeds |
| `zindex` | number | `1` | Display order |

#### Example request headers

```http
POST /api/property/51700/img
Accept: application/json
Cookie: estate_session=<session_value>
Origin: https://app.estateweb.gr
Referer: https://app.estateweb.gr/app/property
```

#### Response headers (observed)

| Header | Value |
|--------|-------|
| `content-type` | `application/json` |
| `content-encoding` | `br` |
| `x-estate-version` | `1.4.0` |
| `server` | `nginx` |

---

## Dynamic fields reference

The `fields` array uses numeric IDs for property attributes. Values from the captured session:

| Field ID | Value | Likely meaning |
|----------|-------|----------------|
| `110` | `15` | — |
| `1001` | `"10"` | — |
| `1006` | `"45"` | — |
| `1012` | `"2"` | — |
| `1013` | `"2005"` | Build year |
| `1014` | `"2020"` | Renovation year |
| `2000` | `"ΟΧΙ"` | No (Greek) |
| `2003`–`2007` | `"2"` / `"4"` | Room counts |
| `2010` | `24` | — |
| `4185` | `40` | — |
| `4187` | `62` | — |
| `4172`, `4006`, `4043`, `4080`, `4048`, `4101` | `"1"` | Boolean flags |

Field ID meanings need mapping from the EstateWeb admin UI or a fields metadata endpoint.

---

## Related files

| File | Description |
|------|-------------|
| `postman/estateweb.environment.json` | Postman environment (`estateSession`, `propertyId`, …) |
| `postman/create-property-body.json` | Create request body |
| `postman/update-property-body.json` | Update request body |
| `logs.txt` | Raw browser capture (source) |

Postman collection: **EstateWeb Property API** in the LogiqDev workspace.
