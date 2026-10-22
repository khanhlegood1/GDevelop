from __future__ import annotations


class ProviderNotConfiguredError(RuntimeError):
    """The configured provider cannot run safely in this environment."""


class ProviderOutputError(RuntimeError):
    """The provider returned output that cannot be accepted."""


class ProviderUnavailableError(RuntimeError):
    """The provider could not be reached or timed out."""
