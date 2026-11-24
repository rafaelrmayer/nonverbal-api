from io import BytesIO
from PIL import Image
import pytest
from app.images import decode_image, InvalidImage, ImageTooLarge, MAX_BYTES


def encoded(mode='RGB', size=(64, 48), format='PNG', **kwargs):
    buffer = BytesIO()
    Image.new(mode, size).save(buffer, format=format, **kwargs)
    return buffer.getvalue()


@pytest.mark.parametrize('format,media', [('PNG', 'image/png'), ('JPEG', 'image/jpeg')])
def test_decodes_supported_formats(format, media):
    image, frame = decode_image(encoded(format=format), media)
    assert image.mode == 'RGB'
    assert frame.width == frame.processed_width == 64
    image.close()


def test_limits_processed_dimensions_and_reports_original_size():
    image, frame = decode_image(encoded(size=(2000, 1000)), 'image/png')
    assert (frame.width, frame.height) == (2000, 1000)
    assert image.size == (1280, 640)
    image.close()


def test_uses_exif_orientation_before_reporting_coordinates():
    exif = Image.Exif()
    exif[274] = 6
    image, frame = decode_image(encoded(format='JPEG', exif=exif), 'image/jpeg')
    assert image.size == (48, 64)
    assert (frame.width, frame.height) == (48, 64)
    image.close()


def test_transparent_pixels_are_composited_over_white():
    image, _ = decode_image(encoded(mode='RGBA'), 'image/png')
    assert image.getpixel((0, 0)) == (255, 255, 255)
    image.close()


@pytest.mark.parametrize('data,media', [(b'', 'image/png'), (b'not an image', 'image/jpeg'),
                                     (encoded(format='JPEG'), 'image/png'),
                                     (encoded(format='GIF'), 'image/png'),
                                     (encoded()[:25], 'image/png')])
def test_malformed_or_mismatched_images_fail(data, media):
    with pytest.raises(InvalidImage):
        decode_image(data, media)


def test_byte_and_pixel_limits():
    with pytest.raises(ImageTooLarge):
        decode_image(b'x' * (MAX_BYTES + 1), 'image/png')
    with pytest.raises(ImageTooLarge):
        decode_image(encoded(size=(2100, 2000)), 'image/png')


def test_animated_png_is_rejected():
    buffer = BytesIO()
    Image.new('RGB', (16, 16), 'white').save(buffer, format='PNG', save_all=True,
                                            append_images=[Image.new('RGB', (16, 16), 'black')])
    with pytest.raises(InvalidImage):
        decode_image(buffer.getvalue(), 'image/png')
