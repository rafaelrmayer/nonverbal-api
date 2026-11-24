"""Deterministic image-plane relationships, with explicit abstention."""
from app.schemas import ArmObservation, Landmark

VISIBILITY = 0.7
VERTICAL_MARGIN = 0.05


def observe_arms(landmarks: list[Landmark]):
    points = {p.id: p for p in landmarks}
    observations = []
    for side, shoulder_id, wrist_id in [('left', 11, 15), ('right', 12, 16)]:
        shoulder, wrist = points.get(shoulder_id), points.get(wrist_id)
        reason = None
        if shoulder is None or wrist is None:
            reason = 'missing_landmarks'
        elif not shoulder.in_frame or not wrist.in_frame:
            reason = 'out_of_frame'
        elif min(shoulder.visibility, shoulder.presence, wrist.visibility, wrist.presence) < VISIBILITY:
            reason = 'low_visibility'
        if reason:
            observations.append(ArmObservation(side=side, relation='undetermined', reason=reason))
            continue
        gap = shoulder.y - wrist.y
        if abs(gap) <= VERTICAL_MARGIN + 1e-9:
            relation, reason = 'undetermined', 'near_threshold'
        else:
            relation = 'wrist_above_shoulder' if gap > 0 else 'wrist_not_above_shoulder'
            reason = 'geometry_observed'
        observations.append(ArmObservation(side=side, relation=relation, reason=reason, vertical_gap=gap))
    return observations
