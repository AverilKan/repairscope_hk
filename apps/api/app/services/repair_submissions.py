import secrets

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import SubmissionStatus
from app.models.repair_submission import RepairSubmission
from app.repositories.repair_submissions import create_submission, get_submission_by_reference
from app.schemas.repair_submissions import RepairSubmissionCreateRequest

_REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I — avoids misread-over-phone
_REFERENCE_LENGTH = 6
_MAX_REFERENCE_ATTEMPTS = 10


def _generate_candidate_reference() -> str:
    suffix = "".join(secrets.choice(_REFERENCE_ALPHABET) for _ in range(_REFERENCE_LENGTH))
    return f"RS-{suffix}"


async def _generate_unique_reference(session: AsyncSession) -> str:
    for _ in range(_MAX_REFERENCE_ATTEMPTS):
        candidate = _generate_candidate_reference()
        if await get_submission_by_reference(session, candidate) is None:
            return candidate
    raise RuntimeError("Could not generate a unique submission reference.")


async def submit_repair_brief(
    session: AsyncSession, request: RepairSubmissionCreateRequest
) -> RepairSubmission:
    public_reference = await _generate_unique_reference(session)
    submission = RepairSubmission(
        public_reference=public_reference,
        status=SubmissionStatus.new,
        questionnaire_version=request.questionnaire_version,
        issue_category=request.issue_category,
        questionnaire_answers=request.questionnaire_answers,
        generated_brief=request.generated_brief,
        safety_flags=request.safety_flags,
        landlord_name=request.landlord_name,
        landlord_email=request.landlord_email,
        landlord_phone=request.landlord_phone,
        property_postcode=request.property_postcode,
        property_address=request.property_address,
        preferred_contact_method=request.preferred_contact_method,
        access_notes=request.access_notes,
        evidence_notes=request.evidence_notes,
        consent_to_contact=request.consent_to_contact,
        consent_to_share_with_contractors=request.consent_to_share_with_contractors,
    )
    return await create_submission(session, submission)
