from io import BytesIO
import asyncio
import wave
import numpy as np
import pytest
import httpx
from app.vocal import analyze_wav, InvalidAudio
from app.schemas import VocalResponse
from tests.test_api import client
import app.main as main


def wav(samples,rate=16000,channels=1,width=2):
    b=BytesIO()
    with wave.open(b,'wb') as w:
        w.setnchannels(channels);w.setsampwidth(width);w.setframerate(rate)
        w.writeframes(np.clip(np.asarray(samples)*32767,-32768,32767).astype('<i2').tobytes())
    return b.getvalue()


@pytest.mark.parametrize('frequency',[100,220,440,700])
def test_known_tones_estimate_periodicity_not_voice(frequency):
    samples=.3*np.sin(2*np.pi*frequency*np.arange(16000)/16000)
    result=VocalResponse(**analyze_wav(wav(samples)))
    assert result.pitch_median_hz==pytest.approx(frequency,abs=1)
    assert result.rms_dbfs==pytest.approx(-13.47,abs=.03)
    assert result.low_energy_intervals==[]


def test_silence_and_noise_do_not_invent_pitch():
    result=VocalResponse(**analyze_wav(wav(np.zeros(16000))))
    assert result.pitch_median_hz is None and result.rms_dbfs==-120
    assert len(result.low_energy_intervals)==1
    assert result.low_energy_intervals[0].end_seconds==1
    rng=np.random.default_rng(17)
    assert analyze_wav(wav(rng.normal(0,.1,16000)))['pitch_median_hz'] is None


def test_low_energy_intervals_include_edges_and_have_minimum_length():
    tone=.3*np.sin(2*np.pi*220*np.arange(8000)/16000)
    samples=np.concatenate([np.zeros(4000),tone,np.zeros(8000)])
    result=analyze_wav(wav(samples))
    assert result['low_energy_intervals'][0]['start_seconds']==0
    assert result['low_energy_intervals'][0]['end_seconds']==pytest.approx(.24,abs=.02)
    assert result['low_energy_intervals'][-1]['end_seconds']==1.25


def test_stereo_cancellation_and_digital_limit_are_not_speech_judgements():
    x=.3*np.sin(2*np.pi*220*np.arange(16000)/16000)
    result=analyze_wav(wav(np.stack([x,-x],axis=1),channels=2))
    assert result['rms_dbfs']==-120 and result['pitch_median_hz'] is None
    saturated=analyze_wav(wav(np.ones(8000)))
    assert saturated['clipped_sample_fraction']==1


@pytest.mark.parametrize('rate',[8000,11025,16000,44100,48000])
def test_max_duration_respects_response_bounds_at_every_sample_rate(rate):
    result=VocalResponse(**analyze_wav(wav(np.zeros(rate*30),rate)))
    assert result.duration_seconds==30 and len(result.envelope)<=1500


def test_bad_headers_truncation_formats_and_duration_are_rejected():
    for data in [b'not audio',wav(np.zeros(16000))[:-1],wav(np.zeros(16000*31)),wav(np.zeros(8000),rate=4000),wav(np.zeros(8000),channels=4),wav(np.zeros(8000),width=1)]:
        with pytest.raises(InvalidAudio):analyze_wav(data)


def test_vocal_http_is_independent_of_visual_models_and_does_not_cache(client):
    session,engine=client
    response=session.post('/v1/vocal/analyze',content=wav(np.zeros(1600)),headers={'Content-Type':'audio/wav'})
    assert response.status_code==200
    assert response.json()['pitch_median_hz'] is None
    assert response.headers['cache-control']=='no-store'
    assert engine.calls==0
    assert 'audio/wav' in session.get('/openapi.json').json()['paths']['/v1/vocal/analyze']['post']['requestBody']['content']


@pytest.mark.parametrize('data,media,status',[(b'private-sentinel','audio/wav',422),(b'x'*(8*1024*1024+1),'audio/wav',413),(b'wrong','audio/mpeg',415)])
def test_audio_http_errors_are_bounded_and_do_not_echo_audio(client,data,media,status):
    session,_=client
    response=session.post('/v1/vocal/analyze',content=data,headers={'Content-Type':media})
    assert response.status_code==status and 'private-sentinel' not in response.text


def test_audio_shares_visual_capacity_limit(client):
    async def run():
        async with main.app.router.lifespan_context(main.app):
            main.app.state.slots.acquire_nowait()
            try:
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app),base_url='http://test') as s:
                    r=await s.post('/v1/vocal/analyze',content=wav(np.zeros(1600)),headers={'Content-Type':'audio/wav'})
                    assert r.status_code==429 and r.headers['retry-after']=='1'
            finally:main.app.state.slots.release()
    asyncio.run(run())
