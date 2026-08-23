---
inclusion: auto
priority: high
---

# Plan Completion Priority

**Priority**: Always update existing plan/audit documents instead of creating new completion documents

## Rule

When completing a planned phase or task:

✅ **DO**: Update the main plan/audit document with completion status
- Mark tasks as complete with checkboxes [x]
- Add completion dates
- Update status sections
- Add implementation notes inline

❌ **DON'T**: Create separate completion documents
- No `PHASE_X_COMPLETION.md` files
- No `COMPLETION_REPORT.md` files
- No redundant analysis documents

## Why

**Problem**: Document fatigue and redundancy
- Too many documents make it hard to find information
- Duplicated content across multiple files
- Main plan becomes outdated while completion docs are current
- Readers don't know which document is source of truth

**Solution**: Single source of truth
- One document per feature/system
- Completion status tracked inline
- Easy to see progress at a glance
- No context switching between documents

## Pattern

### Main Plan Document
```markdown
## Phase 1: Feature X ✅ COMPLETE
- [x] Task 1
- [x] Task 2
- [x] Task 3

**Completion Date**: 2026-08-23
**Files Modified**: 
- src/feature-x.ts
- src/feature-y.ts

**Result**: Feature X now works offline

### Phase 2: Feature Y 🟡 IN PROGRESS
- [x] Task 1
- [ ] Task 2 (NEXT)
- [ ] Task 3
```

### No Separate Completion Docs
```markdown
❌ Don't create:
- docs/PHASE_1_COMPLETION.md
- docs/FEATURE_X_DONE.md
- docs/IMPLEMENTATION_SUMMARY.md
```

## Example: Offline-First Architecture

**Good**: Updated `OFFLINE_FIRST_ARCHITECTURE_AUDIT.md` directly
- Phase 1: ✅ Marked complete with implementation notes
- Phase 2: ✅ Marked complete with hybrid approach explanation
- Phase 3: ✅ Marked complete with "already worked" finding
- All info in one place, easy to review

**Bad** (what we removed):
- `OFFLINE_FIRST_PHASE_1_COMPLETION.md` - redundant
- `OFFLINE_FIRST_PHASE_2_COMPLETION.md` - redundant
- `PHASE_2_ANALYSIS.md` - redundant (merged into main doc)

## When to Create New Documents

**Create new docs only for**:
- New features/systems (e.g., `AUTHORIZATION_AUDIT.md`)
- Separate concerns (e.g., `TESTING_GUIDE.md`)
- Reference guides (e.g., `API_REFERENCE.md`)

**Don't create for**:
- Progress updates
- Completion reports
- Analysis that belongs in main plan
- Temporary status tracking

## Implementation Checklist

When completing a phase:
- [ ] Update main plan document with completion status
- [ ] Mark tasks complete with [x]
- [ ] Add completion date
- [ ] Add files modified
- [ ] Add key results/findings
- [ ] Update conclusion/summary section
- [ ] Do NOT create separate completion document

## Cleanup Strategy

When you find redundant completion docs:
1. Extract any unique information
2. Merge into main plan document
3. Delete the completion document
4. Verify main plan is complete

## Document Naming Convention

**Main documents** (keep these):
- `{FEATURE}_AUDIT.md` - Initial assessment and plan
- `{FEATURE}_GUIDE.md` - How-to documentation
- `{FEATURE}_REFERENCE.md` - API/usage reference

**Avoid these patterns**:
- `{FEATURE}_COMPLETION.md` - merge into audit/plan
- `{FEATURE}_DONE.md` - merge into audit/plan
- `{FEATURE}_STATUS.md` - merge into audit/plan
- `PHASE_X_REPORT.md` - merge into audit/plan
