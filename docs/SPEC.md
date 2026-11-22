# talk-to-form: specification

This is the specification the code was built against. It was written before the code, one phase at a
time, and every requirement below has an ID. Tests carry those IDs in their names, so
`npm test -- -t "EXT-04"` runs the tests that prove EXT-04.

## The problem

Someone witnesses or suffers an accident at work. They may not speak the language the report has to
be written in. Today a colleague translates, or the report is thin, or it is not written at all.

talk-to-form lets that person speak for up to 30 seconds in their own language. The audio is
transcribed, a language model fills a structured incident report in formal German or English, and a
human reviewer approves or corrects every field, seeing the exact words each field came from, before
the record is final.

## Principles

- **Schema first.** One Zod schema defines the form. The JSON schema the model must follow, the
  runtime validation, and the list of fields in the UI are all derived from it.
- **The model drafts, a human decides.** Nothing is final until a person has approved each field.
  Every field shows the transcript snippet it came from and a confidence hint.
- **Bounded automation.** If the model's output is invalid, it gets exactly one chance to repair it,
  with the validation errors. After that, the failing fields go to the human.
- **Works without a key.** With no API key, in CI, or when the free tier is rate limited, the app
  runs on recorded examples and says so.

## Requirements

### Form schema (INC)

| ID | Requirement |
|----|-------------|
| INC-01 | The incident report has these fields: summary of what happened, date, time, location, people involved (name, role), injuries (person, description, body part, treatment), immediate actions, witnesses (name, contact), follow-up actions (action, owner, due date). |
| INC-02 | Any field may be empty (`null`) to mean "not mentioned". Wrong shapes are rejected: a date that is not `YYYY-MM-DD`, a time that is not 24-hour `HH:MM`, an unknown treatment or confidence value, empty text. |
| INC-03 | The model's JSON schema, the validator and the UI field list all come from one schema definition, and a test fails if they drift. |

### Extraction pipeline (EXT)

| ID | Requirement |
|----|-------------|
| EXT-01 | The JSON schema sent to the model satisfies Groq strict mode: closed objects, every property required, supported keywords only. |
| EXT-02 | Every field carries a value, the verbatim source snippet from the transcript, and a confidence hint (high, medium, low). |
| EXT-03 | A source snippet that is not actually in the transcript, or a value with no source, is flagged and downgraded to low confidence. |
| EXT-04 | Invalid model output triggers exactly one repair call that includes the validation errors. There is never a third call. |
| EXT-05 | If the repair also fails, valid fields are kept and the failing fields are listed with their errors. The pipeline does not throw. |
| EXT-06 | Output is formal German (Sie-form) or English, chosen by the user. Source snippets stay in the spoken language. A reference date lets the model resolve "last Tuesday". |
| EXT-07 | The pipeline talks to the provider through an interface, so tests run with no network. |

### API and provider (API)

| ID | Requirement |
|----|-------------|
| API-01 | `POST /api/transcribe` takes one audio file and returns the transcript, detected language, duration and mode (live or demo). |
| API-02 | `POST /api/extract` takes a transcript, an output language, an optional reference date and an optional sample id, and returns the extraction result. |
| API-03 | Uploads over 4 MB are rejected with 413 before any provider call. |
| API-04 | Audio over 30 seconds is rejected with 400, before transcription when the client reports it and after transcription when the provider reports it. |
| API-05 | Each IP may make 10 live requests per 10 minutes per route; after that, 429 with `Retry-After`. Recorded samples don't count. |
| API-06 | A rate limit or server error from Groq falls back to a recorded example, with a notice, instead of an error. |
| API-07 | The API key stays on the server: it never appears in a response or in the client bundle. |
| API-08 | Malformed requests get a 400 with a readable message. |
| API-09 | `GET /api/status` tells the UI, per request, whether the server is live or in demo mode. |

### Demo mode (DEMO)

| ID | Requirement |
|----|-------------|
| DEMO-01 | With no API key the whole flow works on recorded examples. |
| DEMO-02 | Three recorded samples in Turkish, Arabic and Hindi, with fictional people and places, each with recorded model output in German and English. One sample replays an invalid first answer so the repair step is visible. |
| DEMO-03 | Recorded outputs run through the real pipeline and validation, and must end with no failing fields. |
| DEMO-04 | When a recorded example is shown, the UI says so next to the result. |

### Review UI (UI)

| ID | Requirement |
|----|-------------|
| UI-01 | One page: record with the microphone (stops at 30 s), upload a file, or pick a sample. |
| UI-02 | The transcript is shown next to the form. |
| UI-03 | Each field shows value, source snippet and confidence, with approve and edit controls. Edited fields are marked as edited by a human. |
| UI-04 | Failing fields show their error and can't be approved until a valid value is entered. |
| UI-05 | The final record unlocks only when every field is approved, as JSON (copy, download) and as a printable view. |
| UI-06 | Switching Deutsch/English re-runs extraction and resets approvals. |
| UI-07 | Everything works by keyboard, with visible focus, labels, and announced status changes. |
| UI-08 | Works at 360 px width with no horizontal scrolling. |
| UI-09 | If the microphone is denied or missing, the UI says so and upload and samples still work. |

### Quality and docs (QA)

| ID | Requirement |
|----|-------------|
| QA-01 | Vitest covers schema, pipeline, repair, rate limit, routes and review logic; every test name carries its requirement IDs. |
| QA-02 | CI runs install, typecheck, lint, test and build on Node 22, with no secrets. |
| QA-03 | A Playwright smoke test walks the demo flow end to end (optional in CI). |
| QA-04 | The README covers the problem, a diagram of the pipeline, running with and without a key, deploying, design decisions, limitations and the license. |
| QA-05 | This document is published and linked from the README. |
| QA-06 | Secrets and the planning workspace are git-ignored; `.env.example` lists variable names only. |

## Acceptance criteria by phase

The project was built in four phases. Each phase's criteria were written before its code.

### Phase 1: schema and extraction core

- The schema has exactly the nine incident fields and parses a complete example.
- An all-empty record is valid; `"yesterday"` as a date, `"2026-02-30"`, `"25:00"`, `"7pm"`, an
  unknown treatment and an empty summary are all rejected.
- Schema fields, UI field metadata and JSON-schema properties are the same set.
- Every object in the generated JSON schema is closed and lists all its properties as required; no
  unsupported keyword (`pattern`, `minLength`, `$schema`) remains.
- A source snippet that isn't in the transcript is downgraded to low confidence with a warning; one
  that differs only in case, spacing or punctuation is accepted.
- Invalid then valid output: exactly two provider calls, no failures, and the repair request names
  the failing field.
- Invalid twice: still two calls, valid fields kept, failing fields listed, no exception.
- Unparseable output twice: every field is listed as failing, no exception.
- The German prompt asks for formal Sie-form German, the English prompt for English; both require
  verbatim source snippets and include the reference date.

### Phase 2: API routes and provider

- Live transcription and extraction work against a mocked Groq API and send the documented
  parameters (Whisper `verbose_json`; strict JSON schema; low reasoning effort).
- An upload over 4 MB gets 413, whether the size is known from the header or the file, and Groq is
  not called.
- Audio over 30 seconds gets 400: before transcription if the browser reports it, after
  transcription if Groq reports it.
- The 11th live request from one IP within 10 minutes gets 429 with `Retry-After`; another IP is
  unaffected; the window resets. Sample requests never count.
- When Groq answers 429 or 503, both routes return a recorded example with a notice instead of an
  error.
- A test API key never appears in any response, even when Groq rejects it.
- Every kind of malformed request gets a 400 with a code and a readable message.
- `/api/status` reports live or demo mode per request.
- With no key, the real route handlers return recorded results with a "no key" notice.
- Three samples exist (Turkish, Arabic, Hindi) with German and English recorded outputs; the
  Turkish one replays an invalid first answer and a repair.
- All six recorded runs pass the real pipeline with no failing fields and no source warnings.
