"""Bounded PCM16 acoustic measurements, without speech or emotion classification."""
from io import BytesIO
import wave
import numpy as np

MAX_AUDIO_BYTES = 8 * 1024 * 1024
MAX_SECONDS = 30
SILENCE_DBFS = -40.0
MIN_LOW_ENERGY_SECONDS = .2


class InvalidAudio(ValueError):
    pass


def dbfs(rms):
    return float(max(-120., 20 * np.log10(max(float(rms), 1e-6))))


def estimate_pitch(samples, rate):
    """Normalized autocorrelation, 70–800 Hz; abstains on weak periodicity."""
    x = samples - np.mean(samples)
    if np.sqrt(np.mean(x*x)) < .01 or len(x) < rate * .035:
        return None
    low, high = max(2, int(rate/800)-1), min(len(x)//2, int(np.ceil(rate/70))+1)
    size = 1 << (2 * len(x) - 1).bit_length()
    fft = np.fft.rfft(x, n=size)
    ac = np.fft.irfft(fft * np.conjugate(fft), n=size)[:high+1]
    energy = np.concatenate(([0.], np.cumsum(x*x)))
    lags = np.arange(high+1)
    denom = np.sqrt(np.maximum(energy[len(x)-lags] * (energy[-1]-energy[lags]), 1e-24))
    corr = ac/denom
    peaks = [i for i in range(low+1, high) if corr[i]>=corr[i-1] and corr[i]>corr[i+1]]
    if not peaks:
        return None
    best = max(float(corr[i]) for i in peaks)
    if best < .65:
        return None
    lag = next(i for i in peaks if corr[i]>=max(.65, best*.95))
    a,b,c = corr[lag-1:lag+2]
    divisor = a-2*b+c
    offset = float(np.clip(.5*(a-c)/divisor, -.5, .5)) if abs(divisor)>1e-12 else 0.
    hz = rate/(lag+offset)
    return float(hz) if 70<=hz<=800 else None


def analyze_wav(data):
    if len(data)>MAX_AUDIO_BYTES:
        raise InvalidAudio('Áudio excede 8 MiB.')
    try:
        with wave.open(BytesIO(data), 'rb') as audio:
            rate,channels,width,count = audio.getframerate(),audio.getnchannels(),audio.getsampwidth(),audio.getnframes()
            if audio.getcomptype()!='NONE' or width!=2 or channels not in (1,2) or not 8000<=rate<=48000:
                raise InvalidAudio('Use WAV PCM de 16 bits, mono/estéreo, entre 8 e 48 kHz.')
            if count<=0 or count>rate*MAX_SECONDS:
                raise InvalidAudio('O áudio precisa ter duração positiva de até 30 segundos.')
            raw=audio.readframes(count)
            if len(raw)!=count*channels*2:
                raise InvalidAudio('Áudio truncado.')
    except (wave.Error,EOFError,OSError) as exc:
        raise InvalidAudio('WAV inválido ou incompatível. Use PCM de 16 bits.') from exc
    original=np.frombuffer(raw,dtype='<i2').astype(np.float64)/32768.
    samples=original.reshape(-1,channels).mean(axis=1)
    duration=count/rate
    hop=max(1,int(np.ceil(rate*.02)))
    frame_size=round(rate*.04)
    envelope=[]
    intervals=[]
    start=None
    pitches=[]
    for offset in range(0,count,hop):
        chunk=samples[offset:offset+hop]
        level=dbfs(np.sqrt(np.mean(chunk*chunk)))
        time=offset/rate
        envelope.append({'time_seconds':time,'rms_dbfs':level})
        if level<SILENCE_DBFS:
            if start is None:
                start=time
        elif start is not None:
            if time-start>=MIN_LOW_ENERGY_SECONDS-1e-9:
                intervals.append({'start_seconds':start,'end_seconds':time})
            start=None
        frame=samples[offset:offset+frame_size]
        if len(frame)==frame_size and np.mean(np.abs(frame)>=.999)<.01:
            pitch=estimate_pitch(frame,rate)
            if pitch is not None:
                pitches.append(pitch)
    if start is not None and duration-start>=MIN_LOW_ENERGY_SECONDS-1e-9:
        intervals.append({'start_seconds':start,'end_seconds':duration})
    rms=dbfs(np.sqrt(np.mean(samples*samples)))
    return {'version':'0.1.0','experimental':True,'channel':'vocal','algorithm':'pcm-autocorrelation-v1',
            'duration_seconds':duration,'sample_rate_hz':rate,'channels':channels,
            'rms_dbfs':rms,'peak_dbfs':dbfs(np.max(np.abs(original))),
            'clipped_sample_fraction':float(np.mean(np.abs(original)>=.999)),
            'pitch_median_hz':float(np.median(pitches)) if pitches else None,
            'pitch_reason':'periodicity_estimated' if pitches else 'insufficient_periodicity',
            'periodic_frame_count':len(pitches),'low_energy_threshold_dbfs':SILENCE_DBFS,
            'minimum_low_energy_seconds':MIN_LOW_ENERGY_SECONDS,
            'low_energy_intervals':intervals,'envelope':envelope,
            'notice':'Medidas acústicas experimentais. Baixa energia não comprova pausa de fala; periodicidade não comprova voz. Sem transcrição, identidade, emoção, intenção, hesitação ou diagnóstico. dBFS não é dB SPL.'}
