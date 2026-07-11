"""TASKS.md T2.5 — 1:1 port of tests/ux/agent-refuses-unsafe.test.ts.

Same fixtures, same expected refusals: the Python `run_action` must honor the
action contract exactly as the TypeScript agent does. The `http` kwarg is the
injectable transport (mirrors `fetch` injection in the TS test).
"""
from typing import Any

import pytest

from ahtml import ActionRefused, run_action
from ahtml.workflow import ActionResult, DryRunResult


def site_with(action: dict) -> dict:
    """Mirror of the TS test's siteWith() snapshot builder."""
    return {
        "ahtml": "0.1",
        "url": "https://bank.example.com/transfer",
        "fetched_at": "2026-01-01T00:00:00.000Z",
        "page_type": "product_detail",
        "policy": {"agents_welcome": True},
        "entities": [
            {"id": "account:checking-123", "type": "product", "name": "Checking ****1234"}
        ],
        "actions": [action],
    }


def tracked_http(calls: list) -> Any:
    def http(method: str, url: str, body: Any, headers: dict) -> tuple:
        calls.append((method, url))
        return 200, {"ok": True}

    return http


WIRE_TRANSFER = {
    "id": "wire_transfer",
    "label": "Wire $50,000 to External Account",
    "target": "account:checking-123",
    "category": "transact",
    "method": "POST",
    "execute_url": "https://bank.example.com/api/wire",
    "auth": "required",
    "cost": {"amount": 50_000, "currency": "USD", "category": "purchase"},
    "reversible": {"reversible": False},
    "side_effects": ["charge_card", "audit_log", "public_post"],
    "confirmation": "required",
}


def test_a_refuses_confirmation_required_without_consent() -> None:
    snap = site_with(dict(WIRE_TRANSFER))
    calls: list = []
    with pytest.raises(ActionRefused, match="confirmation"):
        run_action(snap, "wire_transfer", {"amount": 50000}, bearer="tok", http=tracked_http(calls))
    assert calls == [], "execute_url must NOT be hit when the contract is violated"


def test_a2_executes_once_confirmed() -> None:
    snap = site_with(dict(WIRE_TRANSFER))
    calls: list = []
    result = run_action(
        snap, "wire_transfer", {"amount": 50000},
        bearer="tok", confirm=True, http=tracked_http(calls),
    )
    assert isinstance(result, ActionResult)
    assert result.status == "executed"
    assert calls, "confirmed action must reach execute_url"


def test_b_free_reversible_action_fires_without_friction() -> None:
    snap = site_with({
        "id": "bookmark",
        "label": "Save bookmark",
        "category": "create",
        "method": "POST",
        "execute_url": "https://bank.example.com/api/bookmarks",
        "auth": "none",
        "cost": {"category": "free"},
        "reversible": {"reversible": True, "policy": "delete_bookmark"},
        "side_effects": ["create_record"],
        # no confirmation field — direct execution allowed
    })
    calls: list = []
    result = run_action(snap, "bookmark", {"url": "https://..."}, http=tracked_http(calls))
    assert isinstance(result, ActionResult)
    assert result.status == "executed"


def test_c_refuses_auth_required_without_bearer() -> None:
    snap = site_with({
        "id": "view_balance",
        "auth": "required",
        "execute_url": "https://bank.example.com/api/balance",
    })
    with pytest.raises(ActionRefused, match="requires auth"):
        run_action(snap, "view_balance", {}, confirm=True)


def test_d_dry_run_reveals_cost_without_side_effects() -> None:
    snap = site_with({
        "id": "subscribe_premium",
        "auth": "required",
        "cost": {"amount": 12, "currency": "USD", "category": "subscription"},
        "reversible": {"reversible": True, "window": "P14D", "policy": "cancel"},
        "side_effects": ["charge_card", "email_buyer", "unlock_features"],
        "confirmation": "recommended",
        "execute_url": "https://bank.example.com/api/subscribe",
    })
    calls: list = []
    preview = run_action(snap, "subscribe_premium", {}, bearer="tok", dry_run=True, http=tracked_http(calls))
    assert isinstance(preview, DryRunResult)
    assert preview.status == "dry_run"
    assert calls == [], "dry-run must never call execute_url"
    assert preview.would_charge is not None
    assert preview.would_charge["amount"] == 12
    assert preview.would_charge["currency"] == "USD"
    assert preview.would_side_effects == ["charge_card", "email_buyer", "unlock_features"]


def test_e_contract_carries_all_safety_fields() -> None:
    action = {
        "id": "sample",
        "auth": "required",
        "cost": {"amount": 99, "currency": "USD", "category": "purchase"},
        "reversible": {"reversible": True, "window": "P30D", "policy": "full_refund"},
        "side_effects": ["charge_card"],
        "confirmation": "required",
        "execute_url": "/x",
    }
    for field in ("auth", "cost", "reversible", "side_effects", "confirmation"):
        assert action.get(field) is not None, f'action contract must carry "{field}"'


def test_agents_welcome_false_refuses() -> None:
    snap = site_with({"id": "bookmark", "execute_url": "/api/b", "auth": "none"})
    snap["policy"] = {"agents_welcome": False}
    with pytest.raises(ActionRefused, match="agents_welcome"):
        run_action(snap, "bookmark", {})


def test_unknown_action_id_refuses() -> None:
    snap = site_with(dict(WIRE_TRANSFER))
    with pytest.raises(ActionRefused, match="not found"):
        run_action(snap, "nonexistent", {})
