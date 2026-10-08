"""Pydantic AI agents (Phase 2+).

Each agent lives in its own module with typed dependencies, tools, and a
structured ``output_type``. Agents call the LLM through the Portkey gateway
using ``PORTKEY_API_KEY`` from settings — never from the client.
"""
