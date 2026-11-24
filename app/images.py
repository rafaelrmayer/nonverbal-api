"""Decode bounded JPEG/PNG bytes in memory; do not persist user images."""
from io import BytesIO
import warnings
from PIL import Image, ImageOps, UnidentifiedImageError
from app.schemas import Frame

MAX_BYTES = 2 * 1024 * 1024
MAX_PIXELS = 4_000_000
MAX_SIDE = 1280


class InvalidImage(ValueError):
    pass


class ImageTooLarge(ValueError):
    pass


def decode_image(data, media_type):
    if len(data) > MAX_BYTES:
        raise ImageTooLarge()
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(data), formats=['JPEG', 'PNG']) as image:
                expected = {'image/jpeg': 'JPEG', 'image/png': 'PNG'}[media_type]
                if image.format != expected or getattr(image, 'n_frames', 1) != 1:
                    raise InvalidImage()
                if image.width * image.height > MAX_PIXELS:
                    raise ImageTooLarge()
                image.load()
                oriented = ImageOps.exif_transpose(image)
                width, height = oriented.size
                # Composite transparency over white instead of inventing dark body contours.
                if 'A' in oriented.getbands() or 'transparency' in oriented.info:
                    rgba = oriented.convert('RGBA')
                    rgb = Image.new('RGB', rgba.size, 'white')
                    rgb.paste(rgba, mask=rgba.getchannel('A'))
                else:
                    rgb = oriented.convert('RGB')
                rgb.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
                return rgb, Frame(width=width, height=height, processed_width=rgb.width, processed_height=rgb.height)
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ImageTooLarge() from exc
    except (UnidentifiedImageError, OSError, SyntaxError, KeyError) as exc:
        raise InvalidImage() from exc
