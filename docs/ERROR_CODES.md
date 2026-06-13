# Error Codes

Setiap error API sekarang punya dua level identifier:

- `code`: kategori luas untuk HTTP handling, misalnya `VALIDATION`, `AUTH`, `INTERNAL`.
- `errorCode`: kode stabil yang bisa dicari di UI/log, misalnya `CONTENT_IMAGE_PROVIDER_ERROR`.

## Generic API

| Code | Meaning |
| --- | --- |
| `API_VALIDATION_FAILED` | Request tidak lolos validasi aplikasi. |
| `API_SCHEMA_VALIDATION_FAILED` | Request tidak lolos validasi schema Fastify. |
| `API_RESPONSE_PARSE_FAILED` | Client gagal membaca response API sebagai JSON. |
| `API_UNHANDLED_INTERNAL_ERROR` | Error tak terduga di server. |

## Auth

| Code | Meaning |
| --- | --- |
| `AUTH_INVALID_CREDENTIALS` | Email/password salah atau user tidak punya team aktif. |
| `AUTH_SESSION_MISSING` | Cookie session tidak ada. |
| `AUTH_SESSION_EXPIRED` | Session expired atau invalid. |
| `AUTH_FORBIDDEN` | Role tidak punya permission untuk action. |
| `AUTH_TEAM_MISMATCH` | User mencoba akses resource team lain. |

## AI Provider

| Code | Meaning |
| --- | --- |
| `AI_API_KEY_MISSING` | API key untuk AI belum dikonfigurasi. |
| `AI_BUDGET_EXCEEDED` | Budget AI 30 hari habis. |
| `AI_PROVIDER_TIMEOUT` | Provider AI timeout. |
| `AI_PROVIDER_ERROR` | Provider AI mengembalikan error umum. |
| `AI_PROVIDER_QUOTA_EXCEEDED` | Kuota provider AI habis. |
| `AI_PROVIDER_MALFORMED_OUTPUT` | Output provider AI tidak sesuai format. |
| `AI_SETTINGS_INVALID` | Setting AI tidak valid. |
| `AI_PROVIDER_BASE_URL_MISSING` | Base URL provider belum diisi. |
| `AI_PROVIDER_ENDPOINT_MISMATCH` | Endpoint provider tidak sesuai konfigurasi. |
| `AI_PROVIDER_INSECURE_TRANSPORT` | Endpoint provider tidak memakai transport aman. |

## Content Generator

| Code | Meaning |
| --- | --- |
| `CONTENT_BRAND_KIT_INVALID` | Brand Kit tidak valid. |
| `CONTENT_BRAND_KIT_NOT_FOUND` | Brand Kit belum ada/tidak ditemukan. |
| `CONTENT_MASTER_TEMPLATE_INVALID` | Master Template tidak valid. |
| `CONTENT_MASTER_TEMPLATE_NOT_FOUND` | Master Template tidak ditemukan. |
| `CONTENT_PLAN_VALIDATION_ERROR` | Rencana carousel tidak lolos validasi. |
| `CONTENT_LAYOUT_UNSATISFIABLE` | Layout tidak bisa diterapkan dengan konten saat ini. |
| `CONTENT_IMAGE_PROVIDER_ERROR` | Image provider gagal generate image. |
| `CONTENT_IMAGE_PROVIDER_TIMEOUT` | Image provider timeout. |
| `CONTENT_IMAGE_BACKGROUND_UNCLEAN` | Background image tidak lolos scanner. |
| `CONTENT_IMAGE_OFF_BRAND` | Output visual tidak sesuai brand. |
| `CONTENT_CHART_DATA_MISSING` | Slide butuh chart data tapi data tidak tersedia. |
| `CONTENT_MOCKUP_MISSING` | Slide butuh mockup tapi asset tidak tersedia. |
| `CONTENT_UPLOAD_FAILED` | Upload asset/render gagal. |
| `CONTENT_PRIVACY_VIOLATION` | Payload terdeteksi melanggar privacy guard. |
| `CONTENT_JOB_NOT_FOUND` | Job content tidak ditemukan. |
| `CONTENT_JOB_FAILED` | Job content gagal tanpa reason lebih spesifik. |
| `CONTENT_REFERENCE_INVALID` | File/reference image tidak valid. |
| `CONTENT_REFERENCE_NOT_FOUND` | Reference image tidak ditemukan. |

## Other Domains

| Code | Meaning |
| --- | --- |
| `TEAM_NOT_FOUND` | Team tidak ditemukan. |
| `TEAM_ROLE_INVALID` | Role team tidak valid. |
| `TEAM_INVITE_INVALID` | Invite team invalid. |
| `TEAM_INVITE_EXPIRED` | Invite team expired. |
| `CONNECTOR_CONFIG_INVALID` | Konfigurasi connector invalid. |
| `CONNECTOR_NOT_FOUND` | Connector tidak ditemukan. |
| `CONNECTOR_ACTIVATION_FAILED` | Aktivasi connector gagal. |
| `CONNECTOR_CREDENTIAL_INVALID` | Credential connector invalid. |
| `SCAN_CONFIG_INVALID` | Scan configuration invalid. |
| `SCAN_CONFIG_NOT_FOUND` | Scan configuration tidak ditemukan. |
| `SCAN_JOB_ALREADY_RUNNING` | Scan job untuk konfigurasi ini masih berjalan. |
| `SCAN_CONNECTOR_FAILED` | Connector gagal saat scan. |
| `LEAD_NOT_FOUND` | Lead tidak ditemukan. |
| `LEAD_DELETE_CONFIRMATION_REQUIRED` | Delete lead butuh konfirmasi. |
| `LEAD_AI_REANALYZE_FAILED` | Gagal enqueue re-analysis AI untuk lead. |
| `PRIVACY_EXPORT_FAILED` | Export data privacy gagal. |
| `PRIVACY_DELETE_FAILED` | Delete data privacy gagal. |
| `STORAGE_NOT_CONFIGURED` | Object storage belum dikonfigurasi. |
| `STORAGE_UPLOAD_FAILED` | Upload ke object storage gagal. |
| `STORAGE_RESOURCE_NOT_FOUND` | Resource tidak ditemukan. |
