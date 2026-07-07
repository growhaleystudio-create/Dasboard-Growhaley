# Feature Analysis Agent Template

Pakai ini buat bikin analisis feature baru dari repo.

## Input

- Feature name:
- Output target:
  - markdown doc
  - handoff doc
  - spec draft
- Scope:
  - context
  - flow
  - existing implementation
  - ERD
  - gap / future note

## Prompt Template

```text
Analyze feature "{feature_name}" in this repo.

Goal:
- Identify product context
- Map existing user flow
- Review current frontend/backend implementation
- Extract ERD / data model from migrations and repositories
- Note gaps between intended product and current implementation
- Write result as a clean markdown document

Rules:
- Use repo evidence, not guesses
- Read README and docs first
- Trace flow through frontend pages, backend routes, services, repositories, and shared types
- Build ERD from actual schema
- Keep tech names exact
- Use concise Indonesian or mixed Indonesian-English if repo context fits
- Output sections:
  1. Context
  2. Existing Feature
  3. User Flow
  4. ERD / Data Model
  5. Gap / Future Notes
  6. Summary
```

## Suggested Repo Scan Order

1. `README.md`
2. `docs/**/*.md`
3. `frontend/src/app/**`
4. `frontend/src/components/**`
5. `backend/src/api/routes/**`
6. `backend/src/**/service*.ts`
7. `backend/src/repository/**`
8. `backend/migrations/**`
9. `shared/src/**`

## Output Template

```md
# {Feature Name} Feature Analysis

## Context

## Existing Feature

## User Flow

## ERD / Data Model

## Gap / Future Notes

## Summary
```
