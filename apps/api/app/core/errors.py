class ForbiddenError(Exception):
    """Valid identity, insufficient capability or resource permission.
    Route layer maps this to 403."""


class NotFoundError(Exception):
    """Resource does not exist, or its existence should be concealed from
    an unauthorised caller. Route layer maps this to 404 either way — the
    caller can't distinguish "doesn't exist" from "exists but not yours"."""


class ConflictError(Exception):
    """The request is well-formed and the resource exists, but its current
    state does not allow this operation (e.g. a contractor request that
    has already been responded to, revoked, or expired). Route layer maps
    this to 409."""
