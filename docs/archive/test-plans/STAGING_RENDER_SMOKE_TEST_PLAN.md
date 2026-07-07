# Staging Render Smoke Test Plan

**Date:** 2026-06-16  
**Scope:** `sdui-carousel-worker.ts` staging rerun after image-template fix  
**Status:** 📋 Ready

---

## Goal

Verify the patched render pipeline now shows generated images in the final carousel output.

---

## Test Flow

### 1. Trigger Job
- Send `POST /carousel/generate`
- Capture returned `jobId`
- Record `teamId`, timestamp, and request body

### 2. Watch Queue
- Confirm job enters `content-generation`
- Confirm worker picks it up
- Poll `GET /carousel/jobs/:jobId`

### 3. Verify Render
- Confirm image generation runs for slides with `image_placeholder`
- Confirm template picker does not leave image slides on text-only layouts
- Confirm final PNG contains the generated image

### 4. Verify Persistence
- Confirm `content_generation_job.status = success`
- Confirm `content_generation_slide.image_url` is populated
- Confirm storage object exists and is reachable

### 5. Visual Check
- Open the rendered PNG
- Confirm the image is actually visible in the slide
- Confirm no blank image area or text-only fallback remains

---

## Test Scenarios

### Scenario A: Happy Path, Image Slide
- **Prompt:** `Buat carousel Instagram 4 slide tentang manfaat automasi AI untuk UMKM.`
- **Aspect ratio:** `4:5`
- **Expected:** at least 1 slide with visible image and no text-only fallback

### Scenario B: Long Content, Image Slide
- **Prompt:** `Buat carousel edukasi 5 slide tentang strategi content marketing untuk brand kecil dengan visual yang profesional dan mudah dibaca.`
- **Aspect ratio:** `4:5`
- **Expected:** image still visible, layout stable, text not clipped

### Scenario C: Controlled Failure
- **Prompt:** invalid or incomplete payload
- **Expected:** job fails gracefully, status and reason persist

---

## Example Prompt and Content

### Prompt Used in the Verified Job
`Buat carousel Instagram 4 slide tentang manfaat automasi AI untuk UMKM.`

### Resulting Content Snapshot
- **Slide 1:** `AI Automation` — cover slide with generated image placeholder
- **Slide 2:** `Tingkatkan Efisiensi` — slide with generated image placeholder
- **Slide 3:** `Manfaat Nyata AI untuk Bisnis Anda` — text/card slide
- **Slide 4:** `Siap Mengadopsi Otomatisasi AI?` — closing CTA slide

### Verified Job ID
`a4cd88d9-a13d-4018-93cb-22877b68c3c3`

### Previous Output URL Pattern
`https://ioqazptafolroxwgkera.supabase.co/storage/v1/object/public/content-assets/11365b70-5e56-4d74-9adf-bdce6d14c10c/jobs/a4cd88d9-a13d-4018-93cb-22877b68c3c3/slide-0.png`

---

## Pass Criteria
- Generated image is visible in the final PNG
- No text-only fallback for image-required slide
- Queue, render, upload, and DB all succeed

---

## Evidence to Save
- `jobId`
- request body
- worker log lines
- `GET /carousel/jobs/:jobId` response
- storage URL
- screenshot of final slide
