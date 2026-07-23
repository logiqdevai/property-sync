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
| `Cookie` | `estate_session=eyJpdiI6IlFiMHhVaGt4TktsUEZvYkU1d3U0bUE9PSIsInZhbHVlIjoia0hjL2FIdDBMRmV2Nm5wVHBqMTVENUU0QTNLaUNPM0ZSeElqY0pHODdIMTVDNzJ4SEVGY3IwNlh2MmR1WWU5VjJmeGhqUUh2MTRaMG5iMjNOWEJsenc9PSIsIm1hYyI6ImZlYWRjMTM0NDdlNmE1OGU5ZjIzMDQ4NDE5YWExNDg4MmY3ZmY2NDcxODVjYThmZjM2YmYxMjFmODM0MTNlOTIifQ%3D%3D` |

```http
Accept: application/json
Accept-Language: en-US,en;q=0.9,el;q=0.8
Authorization: Bearer G36g47zh04jnrAOxMNg2k8Z9Pb02khCq9anUoncE
Cookie: estate_session=eyJpdiI6IlFiMHhVaGt4TktsUEZvYkU1d3U0bUE9PSIsInZhbHVlIjoia0hjL2FIdDBMRmV2Nm5wVHBqMTVENUU0QTNLaUNPM0ZSeElqY0pHODdIMTVDNzJ4SEVGY3IwNlh2MmR1WWU5VjJmeGhqUUh2MTRaMG5iMjNOWEJsenc9PSIsIm1hYyI6ImZlYWRjMTM0NDdlNmE1OGU5ZjIzMDQ4NDE5YWExNDg4MmY3ZmY2NDcxODVjYThmZjM2YmYxMjFmODM0MTNlOTIifQ%3D%3D
```

Use `Content-Type: application/json` only for `PATCH /api/property/{id}`.

For `POST /api/property` and `POST /api/property/{id}/img`, omit `Content-Type` — the client sets `multipart/form-data` with a boundary automatically.

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

Bearer token and `estate_session` cookie both expire. Refresh from DevTools after signing in at [app.estateweb.gr](https://app.estateweb.gr) when requests return `401`.

Postman: set `estateSession` to the cookie value only (without `estate_session=`). Import `postman/estateweb.collection.json` and `postman/estateweb.environment.json`.

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
    Client->>API: DELETE /api/img/{imageId} (delete photo)
    API-->>Client: imageId
```

| Step | Method | Endpoint | Purpose |
|------|--------|----------|---------|
| 1 | `GET` | `/api/property` | List or search properties |
| 2 | `POST` | `/api/property` | Create a new property |
| 3 | `PATCH` | `/api/property/{id}` | Update property details, ads, coordinates |
| 4 | `POST` | `/api/property/{id}/img` | Upload property image |
| 5 | `DELETE` | `/api/img/{imageId}` | Delete property image |

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
Content-Type: multipart/form-data
```

Creates a new property. Payload is sent as **form-data** with a single text field named `payload` whose value is a JSON string. Send `id: 0` for a new record.

#### Form fields

| Field | Type | Value |
|-------|------|-------|
| `payload` | text (JSON string) | Full property object — see `example-requests/create-property.json` |

#### Example form-data

```http
payload: {"id":0,"type_id":27,"scope_id":1,"location_id":400,"client_id":0,"coop_id":0,"to_client_id":0,"code":"","address":"estavromenos 11","zip":"71111","price_start":50000,"price":50000,"price_final":0,"price_web":50000,"sqm":45,"distance_airport":"1000","distance_port":"1000","distance_beach":"1000","description":"Πωλείται φωτεινή και λειτουργική γκαρσονιέρα σε εξαιρετική τοποθεσία, ιδανική για ιδιοκατοίκηση ή επενδυτική εκμετάλλευση. Διαθέτει άνετους χώρους, εύκολη πρόσβαση σε μέσα μεταφοράς και βρίσκεται κοντά σε καταστήματα και βασικές υπηρεσίες. Αποτελεί μια εξαιρετική επιλογή για φοιτητές, εργαζόμενους ή όσους αναζητούν ένα ακίνητο με υψηλή απόδοση.","status_id":0,"is_offer":1,"is_exclusive_order":1,"video_url":"","show_video_on_site":0,"lat_lng":"","show_map_on_site":0,"metadata":"{\"guarantee\":\"\",\"stamp\":\"\",\"inc_type\":0,\"inc_value\":\"\",\"inc_period\":0,\"inc_2years\":0,\"contract_period\":\"\",\"terms\":\"\",\"has_keys\":\"\",\"rental_history\":[]}","client_contacted_at":"","expires_at":"","fields":[],"sites":[],"gateways":[],"ads":[{"lang_id":1,"text":"Πωλείται γκαρσονιέρα σε πολύ καλή κατάσταση, με άνετη και πρακτική διαρρύθμιση που αξιοποιεί ιδανικά τους διαθέσιμους χώρους. Αποτελεί εξαιρετική επιλογή για φοιτητές, εργαζόμενους ή επενδυτές που αναζητούν ένα ακίνητο με προοπτικές υψηλής απόδοσης. Η τοποθεσία της προσφέρει άμεση πρόσβαση σε αγορά, συγκοινωνίες και όλες τις καθημερινές ανέσεις, συνδυάζοντας λειτουργικότητα και άνεση.","title":"Φωτεινή Γκαρσονιέρα σε Εξαιρετική Τοποθεσία","description":"Λειτουργική και φωτεινή γκαρσονιέρα, ιδανική για ιδιοκατοίκηση ή επένδυση. Βρίσκεται σε προνομιακή περιοχή με εύκολη πρόσβαση σε μέσα μεταφοράς, καταστήματα και βασικές υπηρεσίες."},{"lang_id":2,"text":"","title":"","description":""},{"lang_id":3,"text":"","title":"","description":""},{"lang_id":4,"text":"","title":"","description":""},{"lang_id":5,"text":"","title":"","description":""},{"lang_id":6,"text":"","title":"","description":""}],"foreign_agents":[],"history":[],"notes":[],"price_negotiable":0,"note":""}
```

#### Example response `200 OK`

```json
{
  "id": 51706,
  "code": "2199"
}
```

#### Request body (captured example)

See `example-requests/create-property.json` and `postman/create-property-body.json`. Key fields:

| Field | Example | Notes |
|-------|---------|-------|
| `id` | `0` | `0` on create |
| `type_id` | `27` | Property type |
| `scope_id` | `1` | Sale / rent scope |
| `location_id` | `400` | Location reference |
| `address` | `estavromenos 11` | Street address |
| `zip` | `71111` | Postal code |
| `price` / `price_web` | `50000` | Listing price |
| `sqm` | `45` | Size in m² |
| `description` | *(Greek text)* | Main description |
| `is_offer` | `1` | Offer flag |
| `is_exclusive_order` | `1` | Exclusive listing |
| `lat_lng` | `""` | Empty on create; set on update |
| `metadata` | *(JSON string)* | Contract / guarantee metadata |
| `fields` | `[]` | Empty on create; populated on update |
| `ads[0]` | Greek title, text, description | Filled on create in captured session |
| `price_negotiable` | `0` | Negotiable flag |

<details>
<summary>Full create payload (JSON)</summary>

```json
{
  "id": 0,
  "type_id": 27,
  "scope_id": 1,
  "location_id": 400,
  "client_id": 0,
  "coop_id": 0,
  "to_client_id": 0,
  "code": "",
  "address": "estavromenos 11",
  "zip": "71111",
  "price_start": 50000,
  "price": 50000,
  "price_final": 0,
  "price_web": 50000,
  "sqm": 45,
  "distance_airport": "1000",
  "distance_port": "1000",
  "distance_beach": "1000",
  "description": "Πωλείται φωτεινή και λειτουργική γκαρσονιέρα σε εξαιρετική τοποθεσία, ιδανική για ιδιοκατοίκηση ή επενδυτική εκμετάλλευση. Διαθέτει άνετους χώρους, εύκολη πρόσβαση σε μέσα μεταφοράς και βρίσκεται κοντά σε καταστήματα και βασικές υπηρεσίες. Αποτελεί μια εξαιρετική επιλογή για φοιτητές, εργαζόμενους ή όσους αναζητούν ένα ακίνητο με υψηλή απόδοση.",
  "status_id": 0,
  "is_offer": 1,
  "is_exclusive_order": 1,
  "video_url": "",
  "show_video_on_site": 0,
  "lat_lng": "",
  "show_map_on_site": 0,
  "metadata": "{\"guarantee\":\"\",\"stamp\":\"\",\"inc_type\":0,\"inc_value\":\"\",\"inc_period\":0,\"inc_2years\":0,\"contract_period\":\"\",\"terms\":\"\",\"has_keys\":\"\",\"rental_history\":[]}",
  "client_contacted_at": "",
  "expires_at": "",
  "fields": [],
  "sites": [],
  "gateways": [],
  "ads": [
    {
      "lang_id": 1,
      "text": "Πωλείται γκαρσονιέρα σε πολύ καλή κατάσταση, με άνετη και πρακτική διαρρύθμιση που αξιοποιεί ιδανικά τους διαθέσιμους χώρους. Αποτελεί εξαιρετική επιλογή για φοιτητές, εργαζόμενους ή επενδυτές που αναζητούν ένα ακίνητο με προοπτικές υψηλής απόδοσης. Η τοποθεσία της προσφέρει άμεση πρόσβαση σε αγορά, συγκοινωνίες και όλες τις καθημερινές ανέσεις, συνδυάζοντας λειτουργικότητα και άνεση.",
      "title": "Φωτεινή Γκαρσονιέρα σε Εξαιρετική Τοποθεσία",
      "description": "Λειτουργική και φωτεινή γκαρσονιέρα, ιδανική για ιδιοκατοίκηση ή επένδυση. Βρίσκεται σε προνομιακή περιοχή με εύκολη πρόσβαση σε μέσα μεταφοράς, καταστήματα και βασικές υπηρεσίες."
    },
    { "lang_id": 2, "text": "", "title": "", "description": "" },
    { "lang_id": 3, "text": "", "title": "", "description": "" },
    { "lang_id": 4, "text": "", "title": "", "description": "" },
    { "lang_id": 5, "text": "", "title": "", "description": "" },
    { "lang_id": 6, "text": "", "title": "", "description": "" }
  ],
  "foreign_agents": [],
  "history": [],
  "notes": [],
  "price_negotiable": 0,
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

Same body shape as create, but with the assigned `id` and `code`. Used to add dynamic fields, coordinates, and other details after initial creation.

#### Path parameter

| Parameter | Example | Description |
|-----------|---------|-------------|
| `id` | `51706` | Property ID from create response |

#### Differences from create (captured example)

| Field | Create | Update |
|-------|--------|--------|
| `id` | `0` | `51706` |
| `code` | `""` | `"2199"` |
| `fields` | `[]` | 21 dynamic attribute entries |
| `lat_lng` | `""` | `""` (still empty in this capture) |
| `agent_id` | — | `2` |
| `group_id` | — | `1192` |
| `user_id` | — | `1285` |
| `created_at` | — | `"2026-07-13 23:12:54.269814"` |
| `history` | `[]` | Creation audit entry |

#### Example response

```json
{
  "id": 51706,
  "code": "2199"
}
```

See `example-requests/update-property.json` and `postman/update-property-body.json` for the full update payload.

---

### 4. Upload property image

```http
POST /api/property/{id}/img
Content-Type: multipart/form-data
```

#### Path parameter

| Parameter | Example | Description |
|-----------|---------|-------------|
| `id` | `51706` | Property ID |

#### Form fields

| Field | Type | Example |
|-------|------|---------|
| `payload` | text (JSON string) | `{"filename":"20260613231205011285.jpg","show_on_site":1,"show_on_groups":1,"show_on_foreign_agents":0,"zindex":1}` |
| `image` | file | Binary image data (e.g. `.jpg`) |

#### Payload object

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `filename` | string | `20260613231205011285.jpg` | Target filename |
| `show_on_site` | number | `1` | Show on agency website |
| `show_on_groups` | number | `1` | Show on group portals |
| `show_on_foreign_agents` | number | `0` | Show on foreign agent feeds |
| `zindex` | number | `1` | Display order |

#### Example request headers

```http
POST /api/property/51706/img
Accept: application/json
Authorization: Bearer <token>
Cookie: estate_session=<session_value>
Origin: https://app.estateweb.gr
Referer: https://app.estateweb.gr/app/property
```

Do not set `Content-Type` manually — Postman or your HTTP client must send `multipart/form-data` with the correct boundary.

#### Response headers (observed)

| Header | Value |
|--------|-------|
| `content-type` | `application/json` |
| `content-encoding` | `br` |
| `x-estate-version` | `1.4.0` |
| `server` | `nginx` |

---

### 5. Delete property image

```http
DELETE /api/img/{imageId}
```

#### Path parameter

| Parameter | Example | Description |
|-----------|---------|-------------|
| `imageId` | `1176597` | Image ID |

#### Example request

```http
DELETE /api/img/1176597
Accept: application/json
Authorization: Bearer <token>
Cookie: estate_session=<session_value>
```

#### Response

```text
1176597
```

Response body is the deleted image id.

---

## Dynamic fields reference

The `fields` array uses numeric IDs for property attributes. Values from the captured update session:

| Field ID | Value | Likely meaning |
|----------|-------|----------------|
| `110` | `16` | — |
| `1001` | `"20"` | — |
| `1012` | `"3"` | — |
| `1013` | `"2010"` | Build year |
| `1014` | `"2020"` | Renovation year |
| `1202` | `"2"` | — |
| `2000` | `"OXI"` | No |
| `2003`–`2007` | `"2"` | Room counts |
| `2010` | `25` | — |
| `2600` | `"400"` | — |
| `4191` | `"2"` | — |
| `4009`, `4012`, `4015`, `4090`, `4145`, `4116`, `4018` | `"1"` | Boolean flags |

Field ID meanings need mapping from the EstateWeb admin UI or a fields metadata endpoint.

---

## Related files

| File | Description |
|------|-------------|
| `postman/estateweb.collection.json` | Postman collection (list, create, update, upload/delete image) |
| `postman/estateweb.environment.json` | Postman environment (`estateSession`, `bearerToken`, `propertyId`, `imageId`, …) |
| `postman/create-property-body.json` | Create `payload` form field value |
| `postman/update-property-body.json` | Update request JSON body |
| `postman/upload-image-payload.json` | Image upload `payload` form field value |
| `example-requests/create-property.json` | Source capture for create payload |
| `example-requests/update-property.json` | Source capture for update payload |
