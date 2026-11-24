from types import SimpleNamespace
import pytest
from app.geometry import observe_arms
from app.pose import describe_poses, InvalidModelResult
from app.schemas import Frame, Landmark

FRAME = Frame(width=640, height=480, processed_width=640, processed_height=480)


def pose():
    points = [SimpleNamespace(x=.5, y=.5, z=0., visibility=.99, presence=.99) for _ in range(33)]
    points[11].y = points[12].y = .6
    points[15].y, points[16].y = .3, .8
    return points


def test_body_only_output_and_image_plane_relation():
    result = describe_poses([pose()], FRAME)
    assert result.status == 'observed'
    assert [p.id for p in result.landmarks] == list(range(11, 33))
    assert result.arms[0].relation == 'wrist_above_shoulder'
    assert result.arms[1].relation == 'wrist_not_above_shoulder'
    assert result.experimental is True
    assert not any(word in result.model_dump() for word in ['emotion', 'intention', 'diagnosis', 'confidence'])


@pytest.mark.parametrize('count,status', [(0, 'no_pose'), (2, 'multiple_poses')])
def test_zero_or_multiple_poses_abstain_instead_of_selecting_a_person(count, status):
    result = describe_poses([pose() for _ in range(count)], FRAME)
    assert result.status == status
    assert result.landmarks == []
    assert all(arm.relation == 'undetermined' and arm.reason == status for arm in result.arms)


@pytest.mark.parametrize('key,value,reason', [('visibility', .69, 'low_visibility'),
                                            ('presence', .69, 'low_visibility'),
                                            ('x', -0.1, 'out_of_frame'), ('y', 1.1, 'out_of_frame')])
def test_uncertain_or_out_of_frame_point_is_not_a_negative_classification(key, value, reason):
    points = pose()
    setattr(points[15], key, value)
    result = describe_poses([points], FRAME)
    assert result.status == 'partial'
    assert result.arms[0].relation == 'undetermined'
    assert result.arms[0].reason == reason
    assert result.arms[0].vertical_gap is None


@pytest.mark.parametrize('wrist_y', [.55, .6, .65])
def test_near_threshold_abstains(wrist_y):
    points = pose()
    points[15].y = wrist_y
    result = describe_poses([points], FRAME)
    assert result.arms[0].relation == 'undetermined'
    assert result.arms[0].reason == 'near_threshold'


def test_low_visibility_on_both_sides_is_undetermined():
    points = pose()
    points[11].visibility = points[12].visibility = .1
    assert describe_poses([points], FRAME).status == 'undetermined'


def test_missing_landmarks_abstain():
    assert all(arm.reason == 'missing_landmarks' for arm in observe_arms([]))


@pytest.mark.parametrize('key,value', [('x', float('nan')), ('z', float('inf')),
                                    ('presence', None), ('visibility', -1), ('presence', 1.1)])
def test_invalid_model_outputs_are_rejected(key, value):
    points = pose()
    setattr(points[15], key, value)
    with pytest.raises(InvalidModelResult):
        describe_poses([points], FRAME)


def test_unexpected_landmark_count_is_rejected():
    with pytest.raises(InvalidModelResult):
        describe_poses([pose()[:22]], FRAME)
