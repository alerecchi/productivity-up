# CODING STANDARDS

- Avoid `any` unless there is no reasonable typed alternative or the user specifically asks for it.
- Comments describe how a thing is used, and move when the code moves. To be used mostly to describe functions, not to annotate every line of behavior.
- Prefer concise, simple solutions over heavy abstractions. Channel YAGNI principles.

## Core Priorities

1. Performance
2. Reliability
3. Maintainability

## Backend changes

ONLY IF performing Backend changes, then follow the [backend standards](BACKEND_STANDARD.md). It defines the required request, authorization, persistence, atomicity, response, cache, telemetry, testing, and review practices for new and changed server code.
