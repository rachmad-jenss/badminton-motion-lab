# 048 - Wire error-notice to role alert containers

- **Status**: DONE
- **Commit**: 18b7980
- **Severity**: MEDIUM
- **Category**: Design-system completeness / semantic color

## Problem

globals.css lines 794-797 define .error-notice with red border-left but no
TSX uses it. Alert notices (role=alert) in analyze:242, compare:122, and
label:274 render with the neutral accent border, hiding semantic urgency.

## Target

Add error-notice class alongside existing classes on the three alert divs.

## Verification

- npm run typecheck
- In-app browser: alerts show red accent border.
