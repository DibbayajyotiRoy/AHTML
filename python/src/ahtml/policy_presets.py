"""Built-in policy presets — 1:1 port of
``packages/schema/src/policy-presets.ts``.

Presets are plain dicts; copy and override fields freely::

    from ahtml import POLICY_PRESETS
    policy = {**POLICY_PRESETS["rateLimited"], "contact": "agents@example.com"}
"""

from __future__ import annotations

__all__ = [
    "public_read_only",
    "rate_limited",
    "auth_required",
    "paid_action",
    "train_deny",
    "POLICY_PRESETS",
]

# Public read-only: agents welcome, all actions allowed, no rate limiting.
# Suitable for static content, documentation, and open APIs.
public_read_only = {
    "agents_welcome": True,
    "republish": "attribution_only",
    "content_signals": {"search": "allowed", "ai_input": "allowed", "ai_train": "allowed"},
}

# Rate limited: agents welcome but throttled. Actions require no auth.
# Suitable for most SaaS products and public APIs.
rate_limited = {
    "agents_welcome": True,
    "rate_limit": "100/min",
    "republish": "attribution_only",
    "attribution_required": True,
    "content_signals": {"search": "allowed", "ai_input": "allowed", "ai_train": "denied"},
}

# Auth required: agents must authenticate before actions are available.
# Suitable for member-only or subscription products.
auth_required = {
    "agents_welcome": True,
    "actions_require": "bearer",
    "verified_agents_only": True,
    "rate_limit": "500/hour",
    "republish": "denied",
    "content_signals": {"search": "allowed", "ai_input": "allowed", "ai_train": "denied"},
}

# Paid actions: agents can read freely but actions require payment via x402.
# Suitable for e-commerce and pay-per-use APIs.
paid_action = {
    "agents_welcome": True,
    "actions_require": "x402",
    "rate_limit": "1000/hour",
    "republish": "denied",
    "attribution_required": True,
    "content_signals": {"search": "allowed", "ai_input": "allowed", "ai_train": "denied"},
}

# Train deny: agents can read and act, but content must not be used for AI
# training. Suitable for creative, journalistic, or premium content.
train_deny = {
    "agents_welcome": True,
    "rate_limit": "200/min",
    "republish": "denied",
    "attribution_required": True,
    "license": "no-ai-training",
    "content_signals": {"search": "allowed", "ai_input": "allowed", "ai_train": "denied"},
}

# All five presets as a named map — keys match the TS export names.
POLICY_PRESETS = {
    "publicReadOnly": public_read_only,
    "rateLimited": rate_limited,
    "authRequired": auth_required,
    "paidAction": paid_action,
    "trainDeny": train_deny,
}
