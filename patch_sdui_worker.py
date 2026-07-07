#!/usr/bin/env python3
"""Patch sdui-carousel-worker.ts to fix the slide_failed_has_reason check-constraint bug."""
from pathlib import Path

p = Path("/Users/luthfierlambang/Documents/Leads Generator/backend/src/content/sdui-carousel-worker.ts")
src = p.read_text(encoding="utf-8")

OLD = (
    "  // Slides that REQUIRED an image but generation failed \u2192 fail the whole job honestly\n"
    "  if (requiredImageFailedSlideNumbers.size > 0) {\n"
    "    const failedNums = [...requiredImageFailedSlideNumbers].sort((a, b) => a - b);\n"
    "    console.error(`[sdui-worker] Required image generation failed for slide(s) ${failedNums.join(', ')} \u2014 failing job`);\n"
    "    for (let idx = 0; idx < slides.length; idx++) {\n"
    "      const s = slides[idx]!;\n"
    "      const isFailed = requiredImageFailedSlideNumbers.has(s.slide_number);\n"
    "      await deps.slideRepo.insertSlide({\n"
    "        teamId,\n"
    "        jobId,\n"
    "        index: idx,\n"
    "        status: isFailed ? 'failed' : 'pending',\n"
    "        blockComposition: blockComposition(s),\n"
    "      });\n"
    "    }\n"
    "    await deps.jobRepo.setStatus(teamId, jobId, 'failed', 'provider_error');\n"
    "    return;\n"
    "  }\n"
)

NEW = (
    "  // Slides that REQUIRED an image but generation failed \u2192 fail the whole job honestly\n"
    "  if (requiredImageFailedSlideNumbers.size > 0) {\n"
    "    const failedNums = [...requiredImageFailedSlideNumbers].sort((a, b) => a - b);\n"
    "    console.error(`[sdui-worker] Required image generation failed for slide(s) ${failedNums.join(', ')} \u2014 failing job`);\n"
    "    // Wrap the slide-row writes in try/catch so that even if the DB throws\n"
    "    // (e.g. a check-constraint violation), the job itself still reaches a\n"
    "    // terminal `failed` state. Without this safety net, a thrown error\n"
    "    // bubbles out of the worker, the job row is never updated, and the\n"
    "    // frontend polls forever (\"infinite loading\").\n"
    "    try {\n"
    "      for (let idx = 0; idx < slides.length; idx++) {\n"
    "        const s = slides[idx]!;\n"
    "        const isFailed = requiredImageFailedSlideNumbers.has(s.slide_number);\n"
    "        // Always insert as 'pending' first to satisfy the\n"
    "        // `slide_failed_has_reason` CHECK constraint, which requires\n"
    "        // `reason IS NOT NULL` whenever `status = 'failed'`. We then\n"
    "        // mark failed slides with a reason via `updateSlide`.\n"
    "        await deps.slideRepo.insertSlide({\n"
    "          teamId,\n"
    "          jobId,\n"
    "          index: idx,\n"
    "          status: 'pending',\n"
    "          blockComposition: blockComposition(s),\n"
    "        });\n"
    "        if (isFailed) {\n"
    "          await deps.slideRepo.updateSlide(teamId, jobId, idx, {\n"
    "            status: 'failed',\n"
    "            reason: 'provider_error',\n"
    "          });\n"
    "        }\n"
    "      }\n"
    "    } catch (e) {\n"
    "      console.error('[sdui-worker] failed to record failed-slide rows; job will still be marked failed:', e);\n"
    "    }\n"
    "    await deps.jobRepo.setStatus(teamId, jobId, 'failed', 'provider_error');\n"
    "    return;\n"
    "  }\n"
)

if OLD not in src:
    print("ERROR: OLD pattern not found. File may already be patched or has been modified.")
    print("Searching for nearby lines:")
    for i, line in enumerate(src.splitlines(), 1):
        if 895 <= i <= 915:
            print(f"  {i:4d}: {line}")
    raise SystemExit(1)

new = src.replace(OLD, NEW, 1)
p.write_text(new, encoding="utf-8")
print("OK: file patched successfully.")
print(f"  - {len(OLD)} chars replaced with {len(NEW)} chars")
