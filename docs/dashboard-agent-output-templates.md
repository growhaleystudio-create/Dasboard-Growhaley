# Dashboard Agent Output Templates

Template ini bikin output agent konsisten saat bantu pahami feature, bikin spec, desain arsitektur, atau minta konfirmasi action.

## 1. Current-State Summary

```md
## Current State
- Feature: <name>
- Goal sekarang: <what feature does>
- Frontend entry: <files>
- Backend entry: <files>
- Shared contracts: <files>
- Key actions: <list>
- Async / worker behavior: <if any>
- Permission boundary: <if any>
- Known gap / ambiguity: <if any>
```

## 2. Gap Analysis

```md
## Gap Analysis
- Requested change: <request>
- Current behavior: <current>
- Desired behavior: <target>
- Gap 1: <difference>
- Gap 2: <difference>
- Risk / dependency: <cross-feature or data impact>
- Recommendation: <best next move>
```

## 3. Feature Spec Draft

```md
# <Feature Name> Spec

## Goal
<single clear goal>

## Problems To Solve
- <problem 1>
- <problem 2>

## In Scope
- <item>
- <item>

## Out of Scope
- <item>
- <item>

## User Flow
1. <step>
2. <step>
3. <step>

## Data / API Impact
- Frontend: <impact>
- Backend: <impact>
- Shared types: <impact>

## Success Criteria
- <criterion>
- <criterion>
```

## 4. Architecture Proposal

```md
# <Feature Name> Architecture Proposal

## Approach
<short description>

## Files To Touch
- Create: <files>
- Modify: <files>

## Reused Existing Patterns
- <pattern>
- <pattern>

## Flow
1. <step>
2. <step>
3. <step>

## Tradeoffs
- Pro: <point>
- Con: <point>
```

## 5. Execution Plan

```md
# <Feature Name> Execution Plan

## Step List
1. <step>
2. <step>
3. <step>

## Verification
- Run: <command>
- Expect: <result>

## Notes
- <dependency>
- <rollback or caution>
```

## 6. Action Confirmation Request

Untuk mutation biasa:

```md
Action siap jalan.

- Feature: <feature>
- Action: <action>
- Target: <file/data/entity>
- Effect: <what will change>

Confirm kalau mau gue lanjut.
```

Untuk action destruktif:

```md
Warning: action ini destruktif.

- Feature: <feature>
- Action: <action>
- Target: <file/data/entity>
- Permanent effect: <what will be removed>

Confirm eksplisit kalau mau gue lanjut.
```

## 7. Docs-vs-Code Mismatch Report

```md
## Docs vs Code Check
- Area: <feature>
- Docs say: <statement>
- Code shows: <statement>
- Impact: <why mismatch matters>
- Recommendation: <update docs or code>
```

## 8. New Feature Onboarding Summary

```md
## New Feature Onboarding
- Feature name: <name>
- Related existing area: <closest feature>
- Frontend anchor: <file>
- Backend anchor: <file>
- Shared types anchor: <file>
- Docs/spec anchor: <file>
- New actions to classify: <list>
- Confirm-sensitive actions: <list>
```
