"""Good Doomscroller's deterministic corpus pipeline."""

from .candidates import CandidateConfig, generate_candidates
from .export import export_feed
from .models import BookDocument, Candidate, PassageSelection
from .normalize import normalize_source
from .source import load_source
from .verify import VerificationError, reconstruct_candidate, verify_candidate

__all__ = [
    "BookDocument",
    "Candidate",
    "CandidateConfig",
    "PassageSelection",
    "VerificationError",
    "export_feed",
    "generate_candidates",
    "load_source",
    "normalize_source",
    "reconstruct_candidate",
    "verify_candidate",
]

__version__ = "0.2.0"
