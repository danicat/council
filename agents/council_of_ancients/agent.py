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

"""ADK App and collaborative multi-agent team for the Council of Ancients."""

from __future__ import annotations

from dotenv import load_dotenv
from google.adk import Agent
from google.adk.apps import App
from google.adk.integrations.model_armor import ModelArmorConfig
from google.adk.integrations.model_armor import ModelArmorPlugin

from .config import GENERATE_CONFIG
from .config import MODEL_ID
from .config import load_config
from .counselors import descartes
from .counselors import machiavelli
from .counselors import plato

FACILITATOR_INSTRUCTION: str = """You are the impartial Facilitator chairing the Council of Ancients: Plato, Rene Descartes, and Niccolo Machiavelli.

Triage rule:
- For bare greetings ("hello", "hi", "thanks", "bye") or meta-questions strictly about who sits on the Council and how it works, reply warmly and directly in 2 to 3 sentences without calling any sub-agent.
- For ANY other question, dilemma, joke, proverb, counterfactual, or thought experiment (never gatekeep or dismiss any topic), convene the full Council through three disciplined steps:
  1. Opening Round: Call `plato`, `descartes`, and `machiavelli` in parallel in a single turn. Give each counselor the user's original question together with a neutral 2-sentence framing of the core dilemma and practical stakes.
  2. Rebuttal Round: After receiving all three opening statements, call `plato`, `descartes`, and `machiavelli` in parallel in a single turn. Pass each counselor the other two counselors' opening statements and ask them to critique both peers explicitly by name.
  3. Council Verdict: Deliver a clear, synthesis-first verdict starting with `## Council Synthesis: <headline>`, followed by a balanced synthesis, a concrete **Recommended Action**, `### Points of Convergence`, `### Unresolved Tensions`, and `### Counselor Contributions` distilling the strongest insights of Plato, Rene Descartes, and Niccolo Machiavelli.
"""

facilitator = Agent(
    name="facilitator",
    model=MODEL_ID,
    description=(
        "Impartial chair of the Council of Ancients coordinating Plato, Rene Descartes, "
        "and Niccolo Machiavelli."
    ),
    static_instruction=FACILITATOR_INSTRUCTION,
    generate_content_config=GENERATE_CONFIG,
    sub_agents=[plato, descartes, machiavelli],
)

load_dotenv()
config = load_config()
app = App(
    name="council_of_ancients",
    root_agent=facilitator,
    plugins=[
        ModelArmorPlugin(
            config=ModelArmorConfig(
                prompt_template_name=config.model_armor_prompt_template,
                response_template_name=config.model_armor_response_template,
                block_on_screening_failure=True,
            )
        )
    ],
)
root_agent = app.root_agent
