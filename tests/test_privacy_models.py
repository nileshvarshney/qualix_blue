def test_data_subject_request_model():
    from app.db.models import DataSubjectRequest
    assert hasattr(DataSubjectRequest, 'dsr_id')
    assert hasattr(DataSubjectRequest, 'subject_email')
    assert hasattr(DataSubjectRequest, 'request_type')
    assert hasattr(DataSubjectRequest, 'status')
    assert hasattr(DataSubjectRequest, 'affected_tables')
    assert hasattr(DataSubjectRequest, 'completed_at')

def test_consent_record_model():
    from app.db.models import ConsentRecord
    assert hasattr(ConsentRecord, 'consent_id')
    assert hasattr(ConsentRecord, 'purpose')
    assert hasattr(ConsentRecord, 'legal_basis')
    assert hasattr(ConsentRecord, 'opt_in')

def test_data_residency_policy_model():
    from app.db.models import DataResidencyPolicy
    assert hasattr(DataResidencyPolicy, 'residency_id')
    assert hasattr(DataResidencyPolicy, 'allowed_regions')
    assert hasattr(DataResidencyPolicy, 'prohibited_regions')
    assert hasattr(DataResidencyPolicy, 'data_sovereignty_country')
