#!/usr/bin/env bash
# Copyright 2026 Daniela Petruzalek
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

set -euo pipefail

# Reference provisioning script for Model Armor templates, least-privilege IAM,
# and Cloud Run deployment. Review and set GOOGLE_CLOUD_PROJECT before running.

: "${GOOGLE_CLOUD_PROJECT:?Set GOOGLE_CLOUD_PROJECT before running this script}"

REGION="${MODEL_ARMOR_REGION:-us-central1}"
SERVICE_NAME="${CLOUD_RUN_SERVICE:-council-of-ancients}"
SERVICE_ACCOUNT_NAME="${COUNCIL_SERVICE_ACCOUNT:-council-of-ancients-sa}"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com"

PROMPT_TEMPLATE_ID="${PROMPT_TEMPLATE_ID:-council-prompt-screening}"
RESPONSE_TEMPLATE_ID="${RESPONSE_TEMPLATE_ID:-council-response-screening}"
PROMPT_TEMPLATE_NAME="projects/${GOOGLE_CLOUD_PROJECT}/locations/${REGION}/templates/${PROMPT_TEMPLATE_ID}"
RESPONSE_TEMPLATE_NAME="projects/${GOOGLE_CLOUD_PROJECT}/locations/${REGION}/templates/${RESPONSE_TEMPLATE_ID}"

echo "Enabling required Google Cloud APIs..."
gcloud services enable \
  aiplatform.googleapis.com \
  modelarmor.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  --project="${GOOGLE_CLOUD_PROJECT}"

echo "Creating dedicated service account ${SERVICE_ACCOUNT_EMAIL}..."
if ! gcloud iam service-accounts describe "${SERVICE_ACCOUNT_EMAIL}" \
  --project="${GOOGLE_CLOUD_PROJECT}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${SERVICE_ACCOUNT_NAME}" \
    --project="${GOOGLE_CLOUD_PROJECT}" \
    --display-name="Council of Ancients Cloud Run Runtime"
fi

echo "Granting least-privilege roles/aiplatform.user and roles/modelarmor.user..."
gcloud projects add-iam-policy-binding "${GOOGLE_CLOUD_PROJECT}" \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding "${GOOGLE_CLOUD_PROJECT}" \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/modelarmor.user"

# Note: deploy/model-armor-prompt-template.json and deploy/model-armor-response-template.json
# define the canonical Model Armor v1 Template JSON schemas (including CSAM and enforcementType)
# for REST or IaC automation. Below we create the matching templates with gcloud CLI flags.

echo "Creating Model Armor prompt screening template (${PROMPT_TEMPLATE_NAME})..."
gcloud model-armor templates create "${PROMPT_TEMPLATE_ID}" \
  --project="${GOOGLE_CLOUD_PROJECT}" \
  --location="${REGION}" \
  --rai-settings-filters="filterType=SEXUALLY_EXPLICIT,confidenceLevel=MEDIUM_AND_ABOVE" \
  --rai-settings-filters="filterType=HATE_SPEECH,confidenceLevel=MEDIUM_AND_ABOVE" \
  --rai-settings-filters="filterType=HARASSMENT,confidenceLevel=MEDIUM_AND_ABOVE" \
  --rai-settings-filters="filterType=DANGEROUS,confidenceLevel=MEDIUM_AND_ABOVE" \
  --pi-and-jailbreak-filter-settings-enforcement="enabled" \
  --pi-and-jailbreak-filter-settings-confidence-level="medium-and-above" \
  --basic-config-filter-enforcement="enabled" \
  --malicious-uri-filter-settings-enforcement="enabled" \
  --template-metadata-log-operations \
  --template-metadata-log-sanitize-operations

echo "Creating Model Armor response screening template (${RESPONSE_TEMPLATE_NAME})..."
gcloud model-armor templates create "${RESPONSE_TEMPLATE_ID}" \
  --project="${GOOGLE_CLOUD_PROJECT}" \
  --location="${REGION}" \
  --rai-settings-filters="filterType=DANGEROUS,confidenceLevel=HIGH" \
  --rai-settings-filters="filterType=HARASSMENT,confidenceLevel=HIGH" \
  --rai-settings-filters="filterType=HATE_SPEECH,confidenceLevel=MEDIUM_AND_ABOVE" \
  --rai-settings-filters="filterType=SEXUALLY_EXPLICIT,confidenceLevel=MEDIUM_AND_ABOVE" \
  --pi-and-jailbreak-filter-settings-enforcement="enabled" \
  --pi-and-jailbreak-filter-settings-confidence-level="high" \
  --basic-config-filter-enforcement="enabled" \
  --malicious-uri-filter-settings-enforcement="enabled" \
  --template-metadata-log-operations \
  --template-metadata-log-sanitize-operations

echo "Deploying Cloud Run service ${SERVICE_NAME} in ${REGION}..."
gcloud run deploy "${SERVICE_NAME}" \
  --project="${GOOGLE_CLOUD_PROJECT}" \
  --region="${REGION}" \
  --source="." \
  --service-account="${SERVICE_ACCOUNT_EMAIL}" \
  --no-allow-unauthenticated \
  --session-affinity \
  --min-instances=0 \
  --concurrency=20 \
  --timeout=300 \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT},GOOGLE_CLOUD_LOCATION=global,GOOGLE_GENAI_USE_VERTEXAI=true,MODEL_ARMOR_PROMPT_TEMPLATE=${PROMPT_TEMPLATE_NAME},MODEL_ARMOR_RESPONSE_TEMPLATE=${RESPONSE_TEMPLATE_NAME}"
