"""Action execution and dry-run — port of ``packages/agent/src/workflow.ts``.

AHTML actions carry typed contracts (input/output schema, auth, cost,
reversibility, side effects, confirmation level). ``run_action`` either
*simulates* the action against ``preview_url`` or *executes* it against
``execute_url``, with policy gates applied client-side as an extra safety
layer.

Gate semantics (identical to the TS agent, same order):
1. ``auth: "required"`` without a bearer                → :class:`ActionRefused`
2. ``confirmation: "required"`` without ``confirm=True`` → :class:`ActionRefused`
3. site policy ``agents_welcome: false``                 → :class:`ActionRefused`
"""

from __future__ import annotations

import json as _json
from dataclasses import dataclass, field
from typing import Any, Callable, Optional, Union

from .errors import ActionRefused
from .snapshot import Snapshot

__all__ = ["ActionRefused", "ActionResult", "DryRunResult", "run_action"]


@dataclass
class ActionResult:
    """Successful execution against ``execute_url``."""

    output: Any
    http_status: int
    status: str = "executed"


@dataclass
class DryRunResult:
    """Simulation result — nothing was executed."""

    would_charge: Optional[dict] = None
    would_side_effects: list = field(default_factory=list)
    preview: Any = None
    status: str = "dry_run"
    # SPEC §4.7 addendum: producer-confirmed rehearsal + declared reversal.
    simulated: Optional[bool] = None
    reversal: Any = None


# SPEC §4.7 (ADR-0003): agent-side run policies. Mirrors the TS agent's
# POLICY_PRESETS (named RUN_POLICY_PRESETS here because ahtml.POLICY_PRESETS
# already carries the site-policy presets ported from @ahtmljs/schema).
RUN_POLICY_PRESETS: dict = {
    "permissive": {},
    "strict": {"requires_dry_run": True},
}


class DryRunLedger:
    """Records successful dry-runs so ``requires_dry_run`` policies can
    demand a prior same-parameters rehearsal within the snapshot TTL."""

    def __init__(self) -> None:
        self._entries: dict[str, float] = {}

    @staticmethod
    def _key(action: dict, params: Any) -> str:
        from ._json import dumps

        return f'{action.get("id")} {dumps(params) if params is not None else ""}'

    def record(self, action: dict, params: Any, now: Optional[float] = None) -> None:
        import time

        self._entries[self._key(action, params)] = now if now is not None else time.monotonic()

    def has(self, action: dict, params: Any, ttl_seconds: float, now: Optional[float] = None) -> bool:
        import time

        at = self._entries.get(self._key(action, params))
        if at is None:
            return False
        t = now if now is not None else time.monotonic()
        return t - at <= ttl_seconds


def _is_irreversible_priced(action: dict) -> bool:
    cost = action.get("cost") or {}
    priced = (cost.get("amount") or 0) > 0
    rev = action.get("reversible")
    irreversible = isinstance(rev, dict) and rev.get("reversible") is False
    return priced and irreversible


# Injectable HTTP: (method, url, json_body, headers) -> (status_code, parsed_json | None)
HttpPost = Callable[[str, str, Any, dict], tuple[int, Any]]


def _default_http(method: str, url: str, body: Any, headers: dict) -> tuple[int, Any]:
    import httpx

    response = httpx.request(method, url, content=_json.dumps(body), headers=headers)
    try:
        parsed = response.json()
    except Exception:
        parsed = None
    return response.status_code, parsed


def _json_headers(bearer: Optional[str]) -> dict:
    headers = {"content-type": "application/json"}
    if bearer:
        headers["authorization"] = f"Bearer {bearer}"
    return headers


def _extract_cost(action: dict) -> Optional[dict]:
    cost = action.get("cost")
    if not cost or cost.get("amount") is None or not cost.get("currency"):
        return None
    return {"amount": cost["amount"], "currency": cost["currency"]}


def _check_policy(
    snapshot: Snapshot | dict,
    action: dict,
    *,
    confirm: bool,
    bearer: Optional[str],
    policy: Optional[dict],
) -> None:
    action_id = action.get("id")
    if action.get("auth") == "required" and not bearer:
        raise ActionRefused(
            f'action "{action_id}" requires auth but no bearer provided'
        )
    if action.get("confirmation") == "required" and not confirm:
        raise ActionRefused(
            f'action "{action_id}" requires explicit confirmation — pass confirm=True'
        )
    effective_policy = policy if policy is not None else snapshot.get("policy")
    if effective_policy is not None and effective_policy.get("agents_welcome") is False:
        raise ActionRefused("site policy: agents_welcome=false")


def run_action(
    snapshot: Snapshot | dict,
    action: Union[str, dict],
    params: Any = None,
    *,
    confirm: bool = False,
    bearer: Optional[str] = None,
    dry_run: bool = False,
    skip_checks: bool = False,
    policy: Optional[dict] = None,
    run_policy: Optional[dict] = None,
    ledger: Optional[DryRunLedger] = None,
    http: Optional[HttpPost] = None,
) -> Union[ActionResult, DryRunResult]:
    """Execute (or dry-run) an action from a snapshot.

    ``action`` may be an action id (looked up in ``snapshot["actions"]``)
    or the action dict itself. ``policy`` overrides the snapshot's own
    policy for the safety gate (e.g. one of :data:`POLICY_PRESETS`).
    ``http`` is the injectable transport for tests:
    ``http(method, url, json_body, headers) -> (status, parsed_json)``.
    """
    if isinstance(action, str):
        found = next(
            (a for a in snapshot.get("actions", []) if a.get("id") == action), None
        )
        if found is None:
            raise ActionRefused(f'action "{action}" not found in snapshot')
        action = found

    fetcher = http or _default_http
    action_id = action.get("id")

    if not skip_checks:
        _check_policy(snapshot, action, confirm=confirm, bearer=bearer, policy=policy)

    execute_url = action.get("execute_url")
    dry_run_cap = action.get("dry_run") or {}
    dry_run_url = dry_run_cap.get("url") or action.get("preview_url")

    # --- Dry run path ---
    if dry_run or (not execute_url and dry_run_url):
        if not dry_run_url:
            if ledger is not None:
                ledger.record(action, params)
            return DryRunResult(
                would_charge=_extract_cost(action),
                would_side_effects=action.get("side_effects") or [],
            )
        status, preview = fetcher("POST", dry_run_url, params, _json_headers(bearer))
        if not (200 <= status < 300):
            raise RuntimeError(f"preview failed: {status}")
        simulated = isinstance(preview, dict) and preview.get("simulated") is True
        # SPEC §4.7 anti-spoofing: a dry_run-declaring producer MUST flag the
        # rehearsal; a missing flag means it may have been real — refuse.
        if action.get("dry_run") and not simulated:
            raise ActionRefused(
                f'dry-run response for "{action_id}" did not carry simulated: true '
                "— refusing a rehearsal that may have executed"
            )
        if ledger is not None and (simulated or not action.get("dry_run")):
            ledger.record(action, params)
        would_charge = (
            preview.get("would_charge") if isinstance(preview, dict) else None
        ) or _extract_cost(action)
        return DryRunResult(
            would_charge=would_charge,
            would_side_effects=action.get("side_effects") or [],
            preview=preview,
            simulated=True if simulated else None,
            reversal=preview.get("reversal") if isinstance(preview, dict) else None,
        )

    # --- Execute path ---
    if not execute_url:
        raise ActionRefused(f'action "{action_id}" has no execute_url')
    if (run_policy or {}).get("requires_dry_run") and _is_irreversible_priced(action):
        ttl = snapshot.get("ttl") or 300
        if ledger is None or not ledger.has(action, params, ttl):
            raise ActionRefused(
                f"policy requires a prior same-parameters dry-run within {ttl}s before "
                f'executing irreversible/priced action "{action_id}" — call '
                "run_action(..., dry_run=True) first"
            )
    method = action.get("method") or "POST"
    status, output = fetcher(method, execute_url, params, _json_headers(bearer))
    if not (200 <= status < 300):
        raise RuntimeError(f'action "{action_id}" failed: {status}')
    # SPEC §4.7 anti-spoofing: a real execution must never claim simulation.
    if isinstance(output, dict) and output.get("simulated") is True:
        raise ActionRefused(
            f'execute response for "{action_id}" claims simulated: true — refusing '
            'a "real" result that may be a rehearsal'
        )
    return ActionResult(output=output, http_status=status)
