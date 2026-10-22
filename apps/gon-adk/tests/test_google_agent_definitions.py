from __future__ import annotations

import pytest

from gon_adk.google_provider import adk_available, build_google_agents


@pytest.mark.skipif(not adk_available(), reason="google-adk is not installed")
def test_google_agent_definitions_are_bounded_and_toolless() -> None:
    agents = build_google_agents("test-model-id")

    assert set(agents) == {"topic_check", "generate_module", "assess_attempt"}
    assert {
        agent.name for agent in agents.values()
    } == {"gon_topic_checker", "gon_module_generator", "gon_attempt_assessor"}

    for agent in agents.values():
        assert list(agent.tools) == []
        assert agent.disallow_transfer_to_parent is True
        assert agent.disallow_transfer_to_peers is True
        assert agent.output_schema is not None
