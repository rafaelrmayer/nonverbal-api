from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, FiniteFloat


class Contract(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Landmark(Contract):
    id: int = Field(ge=11, le=32)
    name: str
    x: FiniteFloat
    y: FiniteFloat
    z: FiniteFloat
    visibility: FiniteFloat = Field(ge=0, le=1)
    presence: FiniteFloat = Field(ge=0, le=1)
    in_frame: bool


class ArmObservation(Contract):
    side: Literal['left', 'right']
    relation: Literal['wrist_above_shoulder', 'wrist_not_above_shoulder', 'undetermined']
    reason: Literal['geometry_observed', 'near_threshold', 'low_visibility', 'out_of_frame', 'missing_landmarks', 'no_pose', 'multiple_poses']
    vertical_gap: FiniteFloat | None = None


class Frame(Contract):
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    processed_width: int = Field(gt=0)
    processed_height: int = Field(gt=0)


class BodyResponse(Contract):
    version: Literal['0.1.0'] = '0.1.0'
    experimental: Literal[True] = True
    channel: Literal['body'] = 'body'
    model: Literal['mediapipe-pose-landmarker-lite-float16-v1'] = 'mediapipe-pose-landmarker-lite-float16-v1'
    model_sha256: str
    status: Literal['observed', 'partial', 'undetermined', 'no_pose', 'multiple_poses']
    frame: Frame
    detected_poses_capped: int = Field(ge=0, le=2)
    landmarks: list[Landmark] = Field(max_length=22)
    arms: list[ArmObservation] = Field(min_length=2, max_length=2)
    visibility_threshold: float = 0.7
    vertical_margin: float = 0.05
    coordinate_system: Literal['normalized_image_x_right_y_down_z_relative'] = 'normalized_image_x_right_y_down_z_relative'
    notice: str = 'Observações geométricas experimentais em uma imagem. Não identifica emoção, intenção, atenção, comunicação ou condição clínica. Escores do detector não são probabilidades calibradas da interpretação.'


class FacePoint(Contract):
    id: int = Field(ge=0, le=477)
    x: FiniteFloat = Field(ge=0, le=1)
    y: FiniteFloat = Field(ge=0, le=1)


class OpeningMeasure(Contract):
    value: FiniteFloat | None = Field(default=None, ge=0)
    reason: Literal['geometry_observed', 'missing_landmarks', 'region_too_small', 'no_face', 'multiple_faces']


class FaceResponse(Contract):
    version: Literal['0.1.0'] = '0.1.0'
    experimental: Literal[True] = True
    channel: Literal['face'] = 'face'
    model: Literal['mediapipe-face-landmarker-float16-v1'] = 'mediapipe-face-landmarker-float16-v1'
    model_sha256: str
    status: Literal['observed', 'partial', 'undetermined', 'no_face', 'multiple_faces']
    frame: Frame
    detected_faces_capped: int = Field(ge=0, le=2)
    landmarks: list[FacePoint] = Field(max_length=478)
    measures: dict[Literal['mouth', 'leftEye', 'rightEye'], OpeningMeasure]
    coordinate_system: Literal['normalized_image_x_right_y_down'] = 'normalized_image_x_right_y_down'
    notice: str = 'Razões geométricas experimentais, sem unidade. Não são confiança, emoção, atenção, identidade ou diagnóstico. Sem reconhecimento de identidade ou armazenamento de imagens.'


class EnergyFrame(Contract):
    time_seconds: FiniteFloat = Field(ge=0, le=30)
    rms_dbfs: FiniteFloat = Field(ge=-120, le=0)


class LowEnergyInterval(Contract):
    start_seconds: FiniteFloat = Field(ge=0, le=30)
    end_seconds: FiniteFloat = Field(gt=0, le=30)


class VocalResponse(Contract):
    version: Literal['0.1.0'] = '0.1.0'
    experimental: Literal[True] = True
    channel: Literal['vocal'] = 'vocal'
    algorithm: Literal['pcm-autocorrelation-v1'] = 'pcm-autocorrelation-v1'
    duration_seconds: FiniteFloat = Field(gt=0, le=30)
    sample_rate_hz: int = Field(ge=8000, le=48000)
    channels: Literal[1, 2]
    rms_dbfs: FiniteFloat = Field(ge=-120, le=0)
    peak_dbfs: FiniteFloat = Field(ge=-120, le=0)
    clipped_sample_fraction: FiniteFloat = Field(ge=0, le=1)
    pitch_median_hz: FiniteFloat | None = Field(default=None, ge=70, le=800)
    pitch_reason: Literal['periodicity_estimated', 'insufficient_periodicity']
    periodic_frame_count: int = Field(ge=0, le=1500)
    low_energy_threshold_dbfs: Literal[-40.0] = -40.0
    minimum_low_energy_seconds: Literal[0.2] = 0.2
    low_energy_intervals: list[LowEnergyInterval] = Field(max_length=150)
    envelope: list[EnergyFrame] = Field(max_length=1500)
    notice: str
