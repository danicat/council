# Council of Ancients

Council of Ancients is a Google Agent Development Kit (ADK 2.0) collaborative multi-agent application powered by Gemini 4 Hydrogen (`gemini-4-hydrogen`) and protected by Google Cloud Model Armor. Given any question, thought experiment, proverb, or governance trade-off, an impartial `facilitator` agent convenes Plato, Rene Descartes, and Niccolo Machiavelli (`mode="single_turn"` sub-agents) for parallel opening statements and cross-rebuttals streamed live to an interactive amphitheater web UI.

See [ARCHITECTURE.md](ARCHITECTURE.md) for system diagrams, ADK 2.0 `mode="single_turn"` delegation mechanics, `/run_sse` event handling, guardrail calibration findings, and Architectural Decision Records.

## Companion Talk: AI Agents from Scratch with Google ADK

This repository powers the conference session **"AI Agents from Scratch with Google ADK"**, guiding attendees from AI agent fundamentals and coding agent setup (`uvx google-agents-cli setup`, Developer Knowledge MCP, Google Cloud Developer Plugin) to bootstrapping with `adk create`, building the 4-agent ADK 2.0 `mode="single_turn"` Council of Ancients, deploying rapidly to Cloud Run (`--no-build`) and Gemini Enterprise Agent Platform, and securing every turn fail-closed with `ModelArmorPlugin` and server-side Model Armor templates.

## How a Deliberation Works

1. **Triage and Framing**: `facilitator` (`agents/council_of_ancients/agent.py`) greets bare `"hello"` or meta-questions directly in **1 LLM call**. For every other question, joke, proverb, or dilemma, it writes a neutral 2-sentence framing of the stakes and invokes `plato`, `descartes`, and `machiavelli` in parallel in a single turn.
2. **Parallel Opening Round**: Because each counselor sets `mode="single_turn"` inside `sub_agents=[plato, descartes, machiavelli]`, ADK exposes them as inline tools, executes all three openings concurrently, and streams each philosopher's `Event` live over `POST /run_sse`.
3. **Parallel Rebuttal Round**: After receiving all three openings, `facilitator` calls `plato`, `descartes`, and `machiavelli` in parallel again, passing each philosopher the other two peers' opening arguments to critique explicitly by name.
4. **Council Verdict**: `facilitator` delivers a synthesis-first verdict (`## Council Synthesis: <headline>`) covering a concrete recommended action, points of convergence, unresolved tensions, and each counselor's core contribution.

Every prompt and model response across `facilitator` and all three counselors runs fail-closed through `ModelArmorPlugin` (`block_on_screening_failure=True`).

## Interactive Council Chamber Frontend

When running `main:app`, the server hosts two web interfaces side by side against the same standard ADK `/run_sse` stream:

- **`/` and `/chamber` (Council Chamber UI)**: A theatrical amphitheater stage (`frontend/index.html`, `frontend/styles.css`, `frontend/app.js`, mounted at `/static`) featuring 1:1 portraits (`frontend/avatars/*.jpg`) for the Facilitator, Plato, Rene Descartes, and Niccolo Machiavelli, live token-by-token streaming over `POST /run_sse` (`"streaming": true`), live animated seat states, a 4-Wave Stepper, an elapsed timer, adaptive `light-dark()` theming, native `<details>` accordions, and strict `setHTML` / `DOMParser` HTML sanitization. Supports an optional `?api=http://127.0.0.1:PORT` query parameter when targeting a standalone ADK server.
- **`/dev-ui` (ADK Developer UI)**: ADK's built-in developer inspector for viewing raw session events, tool calls, and agent traces.

## Project Structure

```text
.
├── .python-version                         # Pins Python 3.13
├── pyproject.toml                          # Runtime dependencies
├── .env.example                            # Template environment variables
├── Dockerfile                              # Non-root Python 3.13 Cloud Run image
├── main.py                                 # FastAPI + Chamber UI (/) + ADK (/dev-ui, /run_sse) + /healthz
├── frontend/
│   ├── avatars/                            # 1:1 portraits for Facilitator, Plato, Descartes, Machiavelli
│   ├── index.html                          # Council Chamber amphitheater markup
│   ├── styles.css                          # Civic palette, light-dark() tokens, @starting-style motion
│   └── app.js                              # Standard ADK /run_sse streaming client and strict HTML sanitizer
├── agents/
│   └── council_of_ancients/
│       ├── __init__.py                     # Standard ADK package export (from . import agent as agent)
│       ├── agent.py                        # Facilitator Agent, sub_agents team, App, and ModelArmorPlugin
│       ├── config.py                       # Fail-fast env validation, MODEL_ID, and GENERATE_CONFIG
│       └── counselors/
│           ├── __init__.py                 # Exports plato, descartes, machiavelli
│           ├── plato.py                    # Plato Agent (mode="single_turn")
│           ├── descartes.py                # Rene Descartes Agent (mode="single_turn")
│           └── machiavelli.py              # Niccolo Machiavelli Agent (mode="single_turn")
└── deploy/
    ├── model-armor-prompt-template.json    # Input screening template schema (v4 / LATEST)
    ├── model-armor-response-template.json  # Calibrated response screening schema (v4 / LATEST)
    ├── provision-model-armor.sh            # Reference GCP setup and deploy script
    └── cloud-run-service.yaml              # Declarative Knative Cloud Run spec
```

## Prerequisites

- Python 3.13 (`.python-version`)
- [uv](https://docs.astral.sh/uv/) package manager
- Google Cloud CLI (`gcloud`) with access to a GCP project billed for Vertex AI, Model Armor, and Cloud Run

## 1. Install Dependencies

```bash
uv sync
```

## 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your GCP project ID and Model Armor template resource names:

```bash
cp .env.example .env
```

Recommended variables in `.env`:

| Variable | Example / Default | Notes |
|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | `your-gcp-project-id` | Required, non-empty GCP project ID. |
| `GOOGLE_CLOUD_LOCATION` | `global` | Required for `gemini-4-hydrogen` (`global`, `us`, or `eu`). |
| `GOOGLE_GENAI_USE_ENTERPRISE` | `true` | Routes `google-genai` and ADK 2.14+ calls through Vertex AI / Gemini Enterprise via ADC (`GOOGLE_GENAI_USE_VERTEXAI=true` is also accepted for compatibility). |
| `MODEL_ARMOR_PROMPT_TEMPLATE` | `projects/PROJECT/locations/us-central1/templates/council-prompt-screening` | Full regional resource path for input screening. |
| `MODEL_ARMOR_RESPONSE_TEMPLATE` | `projects/PROJECT/locations/us-central1/templates/council-response-screening` | Full regional resource path for output screening. Must share the exact same region as the prompt template. |
| `PORT` | `8080` | HTTP server port for `uvicorn`. |

`load_config()` validates all required settings at startup and fails fast with `ConfigurationError` if any setting is missing, malformed, or mismatched across regions.

## 3. Provision Model Armor Templates

Review `deploy/provision-model-armor.sh` and run it with your project ID exported to enable APIs, create the least-privilege `council-of-ancients-sa` service account, create both Model Armor templates, and deploy:

```bash
export GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
export MODEL_ARMOR_REGION="us-central1"
./deploy/provision-model-armor.sh
```

**Workstation `gcloud` CLI note**: Model Armor requires regional API endpoints. When running `gcloud beta model-armor` commands from a workstation, point `gcloud` at the regional endpoint first:

```bash
export CLOUDSDK_API_ENDPOINT_OVERRIDES_MODELARMOR="https://modelarmor.${MODEL_ARMOR_REGION}.rep.googleapis.com/"
gcloud beta model-armor templates list --project="${GOOGLE_CLOUD_PROJECT}" --location="${MODEL_ARMOR_REGION}"
```

For REST API or Terraform workflows that consume full v1 JSON schemas (including `csamFilterSettings` and `enforcementType`), see [deploy/model-armor-prompt-template.json](deploy/model-armor-prompt-template.json) and [deploy/model-armor-response-template.json](deploy/model-armor-response-template.json).

## 4. Run Locally

Authenticate Application Default Credentials first:

```bash
gcloud auth application-default login
```

### Option A: FastAPI + Council Chamber UI (`main.py`, Recommended)

`main.py` and `agent.py` automatically load `.env` via `load_dotenv` (preserving explicit shell variables) before calling `load_config()`:

```bash
uv run uvicorn main:app --host 127.0.0.1 --port 8080
```

- **Council Chamber UI**: `http://127.0.0.1:8080/` (also `http://127.0.0.1:8080/chamber`)
- **ADK Developer UI**: `http://127.0.0.1:8080/dev-ui`
- **Health Check**: `http://127.0.0.1:8080/healthz` (`{"status": "ok"}`)

### Option B: Standalone ADK Developer CLI (`adk web`)

```bash
uv run adk web agents
```

Open `http://127.0.0.1:8000` and select `council_of_ancients` (or point the Chamber UI at it via `?api=http://127.0.0.1:8000`).

## 5. Deploy to Cloud Run

### Standard Source Deploy (Cloud Build + `Dockerfile`)

To build the container image remotely and deploy a revision once IAM and Model Armor templates are provisioned:

```bash
export GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
export REGION="us-central1"
export SA_EMAIL="council-of-ancients-sa@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com"

gcloud run deploy council-of-ancients \
  --project="${GOOGLE_CLOUD_PROJECT}" \
  --region="${REGION}" \
  --source="." \
  --service-account="${SA_EMAIL}" \
  --no-allow-unauthenticated \
  --session-affinity \
  --min-instances=0 \
  --concurrency=20 \
  --timeout=300 \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT},GOOGLE_CLOUD_LOCATION=global,GOOGLE_GENAI_USE_ENTERPRISE=true,MODEL_ARMOR_PROMPT_TEMPLATE=projects/${GOOGLE_CLOUD_PROJECT}/locations/${REGION}/templates/council-prompt-screening,MODEL_ARMOR_RESPONSE_TEMPLATE=projects/${GOOGLE_CLOUD_PROJECT}/locations/${REGION}/templates/council-response-screening"
```

### Fast Source Deploy (`--no-build` on `python313`)

For rapid iterations that upload source directly onto Cloud Run's managed `python313` runtime image, vendor Linux `x86_64` wheels locally into `./vendor` (keep `vendor/` unignored in `.gcloudignore`) and deploy with `gcloud beta run deploy`:

```bash
uv pip install --target ./vendor \
  --python-platform x86_64-manylinux_2_28 \
  --python-version 3.13 \
  -r pyproject.toml

export GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
export REGION="us-central1"
export SA_EMAIL="council-of-ancients-sa@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com"
export PROMPT_TEMPLATE_NAME="projects/${GOOGLE_CLOUD_PROJECT}/locations/${REGION}/templates/council-prompt-screening"
export RESPONSE_TEMPLATE_NAME="projects/${GOOGLE_CLOUD_PROJECT}/locations/${REGION}/templates/council-response-screening"

gcloud beta run deploy council-of-ancients \
  --project="${GOOGLE_CLOUD_PROJECT}" \
  --region="${REGION}" \
  --source="." \
  --no-build \
  --base-image="python313" \
  --command="python3" \
  --args="-m,uvicorn,main:app,--host=0.0.0.0,--port=8080" \
  --service-account="${SA_EMAIL}" \
  --no-allow-unauthenticated \
  --session-affinity \
  --min-instances=0 \
  --concurrency=20 \
  --timeout=300 \
  --set-env-vars="PYTHONPATH=/workspace/vendor,GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT},GOOGLE_CLOUD_LOCATION=global,GOOGLE_GENAI_USE_ENTERPRISE=true,MODEL_ARMOR_PROMPT_TEMPLATE=${PROMPT_TEMPLATE_NAME},MODEL_ARMOR_RESPONSE_TEMPLATE=${RESPONSE_TEMPLATE_NAME}"
```

### Declarative Knative Service (`deploy/cloud-run-service.yaml`)

You can also replace `PROJECT_ID_PLACEHOLDER` and `REGION_PLACEHOLDER` in [deploy/cloud-run-service.yaml](deploy/cloud-run-service.yaml) after pushing an Artifact Registry image built from `Dockerfile`, then apply with `gcloud run services replace deploy/cloud-run-service.yaml --region="${REGION}"`.

### Accessing the IAM-Protected Service

Because Cloud Run enforces `--no-allow-unauthenticated`, open an authenticated local proxy with your `roles/run.invoker` identity:

```bash
gcloud run services proxy council-of-ancients \
  --project="${GOOGLE_CLOUD_PROJECT}" \
  --region="${REGION}" \
  --port=8080
```

Then open `http://127.0.0.1:8080` to use the Council Chamber UI.

## License

Copyright 2026 Daniela Petruzalek. Licensed under the [Apache License, Version 2.0](LICENSE).

---

## Disclaimer

This is not an officially supported Google product. It is an experimental project created for educational and development purposes.
