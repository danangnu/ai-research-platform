"""Privacy contract, including historical joins and role combinations."""
import hashlib
import io
import json
import uuid
import zipfile
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import User, Role, Participant, RecruitmentApplication, ConsentRecord, AuditEvent
from app.db.session import SessionLocal
from app.core.security import create_access_token
from app.services.consent import VERSION, TEXT
from test_recruitment_demo import submit


def identity(client, headers):
    marker = 'Identity-' + uuid.uuid4().hex
    email = marker.lower() + '@example.com'
    r = submit(client, preferred_name=marker, contact_email=email, recruitment_source=marker)
    assert r.status_code == 201, r.text
    a = r.json()
    uri = '/api/recruitment/applications/' + a['id']
    assert client.patch(uri+'/review', headers=headers, json={'status':'eligible','review_note':marker}).status_code == 200
    assert client.post(uri+'/selection', headers=headers, json={'status':'selected','note':marker}).status_code == 200
    p = client.post(uri+'/enroll', headers=headers).json()
    return marker, email, a, p


def role_headers(role):
    with SessionLocal() as db:
        u=User(email=f'{uuid.uuid4().hex}@example.com',full_name='Synthetic role',password_hash='unusable',is_active=True)
        u.roles.append(db.scalar(select(Role).where(Role.name==role)))
        db.add(u);db.commit()
        return {'Authorization':'Bearer '+create_access_token(u.id)}


def test_consent_required_versioned_and_never_backfilled(client):
    for extra in ({'informed_consent_accepted':False},{'informed_consent_version':'old'}):
        assert submit(client, **extra).status_code == 422
    receipt=submit(client).json()
    with SessionLocal() as db:
        record=db.scalar(select(ConsentRecord).where(ConsentRecord.application_id==receipt['id']))
        assert record.version == VERSION and record.synthetic_only
        assert record.text_snapshot == TEXT
        assert record.text_sha256 == hashlib.sha256(TEXT.encode()).hexdigest()
        assert record.accepted_at is not None
    info=client.get('/api/public/recruitment/info').json()
    assert info['study_duration_days']==30 and info['clinic_count']==3
    assert info['informed_consent']['status']=='draft_not_approved'


def test_privacy_all_regular_outputs_and_legacy_records(client, auth_headers):
    marker,email,a,p=identity(client,auth_headers)
    with SessionLocal() as db:
        app=db.get(RecruitmentApplication,a['id'])
        app.screening_answers={'legacy_name':marker,'demo_online_access':True}
        db.add(AuditEvent(actor_user_id=None,action='legacy.identity',entity_type='participant',entity_id=p['id'],details={'name':marker,'email':email,'application_id':a['id'],'nested':{'name':marker}},ip_address='192.0.2.123'))
        db.commit()
    for headers in [auth_headers,role_headers('RESEARCH_LEAD'),role_headers('RESEARCH_ASSISTANT')]:
        for path in ['/api/recruitment/applications', '/api/recruitment/applications/'+a['id'], '/api/recruitment/selections', '/api/participants','/api/participants/'+p['id'],'/api/participants/'+p['id']+'/audit-trail','/api/admin/audit?limit=1000']:
            response=client.get(path,headers=headers)
            assert response.status_code in (200,403), (path,response.text)
            assert marker not in response.text and email not in response.text
            assert '192.0.2.123' not in response.text
            assert response.headers['cache-control']=='no-store'
            if path.startswith('/api/participants'):
                assert a['id'] not in response.text
    research=client.get('/api/study-preparation/export',headers=auth_headers)
    assert research.status_code==200
    with zipfile.ZipFile(io.BytesIO(research.content)) as z:
        for name in z.namelist():
            data=z.read(name).decode('utf-8-sig')
            assert marker not in data and email not in data


def test_reveal_role_matrix_commit_before_release_and_audit(client, auth_headers, monkeypatch):
    marker,email,a,p=identity(client,auth_headers)
    body={'participant_codes':[p['participant_code']], 'reason':'Synthetic access verification','confirmed':True}
    for role in ['RESEARCH_LEAD','RESEARCH_ASSISTANT','AI_ML_RESEARCH_ENGINEER','SITE_COORDINATOR','PARTICIPANT','PROJECT_ADMIN']:
        # Even another PROJECT_ADMIN is not the designated identity custodian.
        h=role_headers(role)
        r=client.post('/api/admin/identity-reveal',headers=h,json=body)
        assert r.status_code==403 and marker not in r.text
    assert client.post('/api/admin/identity-reveal',json=body).status_code==401
    assert client.post('/api/admin/identity-reveal',headers=auth_headers,json={**body,'confirmed':False}).status_code==422
    r=client.post('/api/admin/identity-reveal',headers=auth_headers,json=body)
    assert r.status_code==200 and r.json()['rows']==[{'participant_code':p['participant_code'],'name':marker,'email':email}]
    with SessionLocal() as db:
        events=db.scalars(select(AuditEvent).where(AuditEvent.action=='identity.reveal_report')).all()
        event=next(e for e in events if e.details['participant_codes']==body['participant_codes'])
        assert event.actor_user_id and event.created_at and event.details['reason']==body['reason']
        assert marker not in json.dumps(event.details) and email not in json.dumps(event.details)
    def fail_commit(self):
        raise RuntimeError('Simulated audit database failure')
    monkeypatch.setattr(Session,'commit',fail_commit)
    with pytest.raises(RuntimeError,match='Simulated audit'):
        client.post('/api/admin/identity-reveal',headers=auth_headers,json=body)


def test_new_schedule_defaults_are_30_days():
    from app.schemas.study_preparation import Schedule
    assert Schedule().duration_days==30
    assert Schedule().interim_day is None
