"""TASKS.md T7.4/T7.5 (Python side) — SPEC §4.7 sandbox semantics mirror the
TypeScript agent: anti-spoofing in both directions, and the strict run-policy
demanding a prior same-parameters rehearsal within TTL.
"""
from typing import Any

import pytest

from ahtml import ActionRefused, run_action
from ahtml.workflow import RUN_POLICY_PRESETS, DryRunLedger, DryRunResult

SUBSCRIBE = {
    "id": "subscribe",
    "category": "transact",
    "method": "POST",
    "execute_url": "https://shop.example.com/api/subscribe",
    "auth": "none",
    "cost": {"amount": 144, "currency": "USD", "category": "subscription"},
    "reversible": {"reversible": False},
    "side_effects": ["charge_card"],
    "dry_run": {"url": "https://shop.example.com/ahtml/actions/subscribe/dry-run"},
}


def snap_with(action: dict) -> dict:
    return {
        "ahtml": "0.1",
        "url": "https://shop.example.com/pricing",
        "fetched_at": "2026-07-01T00:00:00.000Z",
        "ttl": 60,
        "page_type": "product_detail",
        "policy": {"agents_welcome": True},
        "entities": [{"id": "product:plan", "type": "product", "name": "Plan"}],
        "actions": [action],
    }


def checkout_http(state: dict) -> Any:
    def http(method: str, url: str, body: Any, headers: dict) -> tuple:
        if url.endswith("/dry-run"):
            return 200, {
                "simulated": True,
                "predicted_output": {"plan": "pro"},
                "would_charge": {"amount": 144, "currency": "USD"},
                "reversal": {"reversible": False},
            }
        state["charges"] += 1
        return 200, {"subscription_id": f"sub_{state['charges']}"}

    return http


def test_dry_run_100x_zero_charges() -> None:
    state = {"charges": 0}
    snap = snap_with(SUBSCRIBE)
    for i in range(100):
        result = run_action(snap, "subscribe", {"seat": i}, dry_run=True, http=checkout_http(state))
        assert isinstance(result, DryRunResult)
        assert result.simulated is True
        assert result.would_charge == {"amount": 144, "currency": "USD"}
        assert result.reversal == {"reversible": False}
    assert state["charges"] == 0


def test_spoof_a_dry_run_without_flag_is_refused() -> None:
    def liar(method: str, url: str, body: Any, headers: dict) -> tuple:
        return 200, {"subscription_id": "sub_REAL"}  # no simulated flag

    with pytest.raises(ActionRefused, match="simulated: true"):
        run_action(snap_with(SUBSCRIBE), "subscribe", {}, dry_run=True, http=liar)


def test_spoof_execute_claiming_simulated_is_refused() -> None:
    action = {**SUBSCRIBE, "reversible": {"reversible": True}}

    def liar(method: str, url: str, body: Any, headers: dict) -> tuple:
        return 200, {"simulated": True, "subscription_id": "sub_fake"}

    with pytest.raises(ActionRefused, match="claims simulated: true"):
        run_action(snap_with(action), "subscribe", {}, http=liar)


def test_strict_policy_requires_prior_same_params_rehearsal() -> None:
    state = {"charges": 0}
    http = checkout_http(state)
    snap = snap_with(SUBSCRIBE)
    ledger = DryRunLedger()
    strict = RUN_POLICY_PRESETS["strict"]

    # Cold execute → refused, nothing charged.
    with pytest.raises(ActionRefused, match="prior same-parameters dry-run"):
        run_action(snap, "subscribe", {"plan": "pro"}, run_policy=strict, ledger=ledger, http=http)
    assert state["charges"] == 0

    # Rehearse then execute with the same params → allowed.
    run_action(snap, "subscribe", {"plan": "pro"}, dry_run=True, run_policy=strict, ledger=ledger, http=http)
    result = run_action(snap, "subscribe", {"plan": "pro"}, run_policy=strict, ledger=ledger, http=http)
    assert result.status == "executed"
    assert state["charges"] == 1

    # Different params → the rehearsal doesn't transfer.
    with pytest.raises(ActionRefused):
        run_action(snap, "subscribe", {"plan": "enterprise"}, run_policy=strict, ledger=ledger, http=http)


def test_ledger_ttl_and_param_sensitivity() -> None:
    ledger = DryRunLedger()
    ledger.record(SUBSCRIBE, {"plan": "pro"}, now=1000.0)
    assert ledger.has(SUBSCRIBE, {"plan": "pro"}, 60, now=1059.0)
    assert not ledger.has(SUBSCRIBE, {"plan": "pro"}, 60, now=1061.0)
    assert not ledger.has(SUBSCRIBE, {"plan": "PRO"}, 60, now=1001.0)


def test_free_reversible_actions_unaffected_by_strict() -> None:
    action = {
        "id": "bookmark",
        "execute_url": "https://shop.example.com/api/bookmark",
        "auth": "none",
        "cost": {"category": "free"},
        "reversible": {"reversible": True},
    }

    def http(method: str, url: str, body: Any, headers: dict) -> tuple:
        return 200, {"ok": True}

    result = run_action(
        snap_with(action), "bookmark", {},
        run_policy=RUN_POLICY_PRESETS["strict"], ledger=DryRunLedger(), http=http,
    )
    assert result.status == "executed"
