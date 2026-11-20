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

"""Runtime configuration and Gemini model settings for the Council of Ancients."""

from __future__ import annotations

from dataclasses import dataclass
import os
import re

from google.genai import types

MODEL_ID: str = "gemini-4-hydrogen"
DEFAULT_VERTEX_LOCATION: str = "global"
ALLOWED_VERTEX_LOCATIONS: frozenset[str] = frozenset({"global", "us", "eu"})
MODEL_ARMOR_TEMPLATE_PATTERN: re.Pattern[str] = re.compile(
    r"^projects/[^/]+/locations/([^/]+)/templates/[^/]+$"
)

GENERATE_CONFIG = types.GenerateContentConfig(
    thinking_config=types.ThinkingConfig(
        thinking_level=types.ThinkingLevel.LOW,
    )
)


class ConfigurationError(ValueError):
    """Raised when required application configuration is missing or invalid."""


@dataclass(frozen=True, slots=True)
class CouncilConfig:
    """Validated runtime configuration for the Council of Ancients app."""

    google_cloud_project: str
    google_cloud_location: str
    model_armor_prompt_template: str
    model_armor_response_template: str
    model_armor_location: str


def _validate_model_armor_template(env_var_name: str) -> tuple[str, str]:
    """Validate a Model Armor template resource name and return `(template, region)`."""
    template = os.environ.get(env_var_name, "").strip()
    if not template:
        raise ConfigurationError(
            f"{env_var_name} is required and must be a full Model Armor resource name "
            "matching projects/<project>/locations/<region>/templates/<template>."
        )
    match = MODEL_ARMOR_TEMPLATE_PATTERN.fullmatch(template)
    if match is None:
        raise ConfigurationError(
            f"{env_var_name} has invalid format {template!r}. Expected "
            "projects/<project>/locations/<region>/templates/<template>."
        )
    return template, match.group(1)


def load_config() -> CouncilConfig:
    """Load and fail-fast validate all environment configuration."""
    project = os.environ.get("GOOGLE_CLOUD_PROJECT", "").strip()
    if not project:
        raise ConfigurationError(
            "GOOGLE_CLOUD_PROJECT is required and must be non-empty."
        )

    location = os.environ.get("GOOGLE_CLOUD_LOCATION", DEFAULT_VERTEX_LOCATION).strip()
    if location not in ALLOWED_VERTEX_LOCATIONS:
        allowed = ", ".join(sorted(ALLOWED_VERTEX_LOCATIONS))
        raise ConfigurationError(
            f"GOOGLE_CLOUD_LOCATION must be one of {{{allowed}}}, got {location!r}."
        )

    prompt_template, prompt_region = _validate_model_armor_template(
        "MODEL_ARMOR_PROMPT_TEMPLATE"
    )
    response_template, response_region = _validate_model_armor_template(
        "MODEL_ARMOR_RESPONSE_TEMPLATE"
    )
    if prompt_region != response_region:
        raise ConfigurationError(
            "MODEL_ARMOR_PROMPT_TEMPLATE and MODEL_ARMOR_RESPONSE_TEMPLATE must share "
            f"the exact same region, got {prompt_region!r} and {response_region!r}."
        )

    return CouncilConfig(
        google_cloud_project=project,
        google_cloud_location=location,
        model_armor_prompt_template=prompt_template,
        model_armor_response_template=response_template,
        model_armor_location=prompt_region,
    )
