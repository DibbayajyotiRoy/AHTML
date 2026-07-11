"""Error types for the ahtml package — mirrors ``@ahtmljs/schema`` errors.ts
and ``@ahtmljs/agent`` workflow.ts."""

from __future__ import annotations

from typing import Any, Optional

__all__ = ["AHTMLError", "ActionRefused"]


class AHTMLError(Exception):
    """Typed error mirroring ``AHTMLError`` in ``@ahtmljs/schema``.

    ``code`` values used by this SDK: ``JSON_PARSE``, ``COMPACT_PARSE``,
    ``SIGNATURE_INVALID``, ``AUTH_REQUIRED``, ``POLICY_DENIED``,
    ``RATE_LIMITED``, ``HTTP_STATUS``, ``NETWORK``, ``TIMEOUT``,
    ``CACHE_POISONED``.
    """

    def __init__(
        self,
        code: str,
        message: str,
        *,
        hint: Optional[str] = None,
        status: Optional[int] = None,
        retryable: bool = False,
        context: Optional[str] = None,
        cause: Any = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.hint = hint
        self.status = status
        self.retryable = retryable
        self.context = context
        self.cause = cause

    def __repr__(self) -> str:  # pragma: no cover
        return f"AHTMLError(code={self.code!r}, message={self.message!r})"


class ActionRefused(Exception):
    """Raised when an action's contract conflicts with the agent's policy.

    Mirrors ``ActionRefused`` in ``@ahtmljs/agent``: ``str(e)`` is
    ``"ActionRefused: <reason>"`` and ``e.reason`` carries the bare reason.
    """

    def __init__(self, reason: str) -> None:
        super().__init__(f"ActionRefused: {reason}")
        self.reason = reason
