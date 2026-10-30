from PIL import Image, ImageDraw
from pathlib import Path
root = Path(__file__).resolve().parent.parent / 'web'
root.mkdir(exist_ok=True)
for size in (192, 512):
    im = Image.new('RGB', (size, size), '#284d3c')
    d = ImageDraw.Draw(im)
    def s(x): return int(x*size/512)
    d.ellipse((s(108),s(108),s(404),s(404)), outline='#b5d2a5', width=s(9))
    d.polygon([(s(320),s(174)), (s(283),s(283)), (s(174),s(338)), (s(229),s(229))],fill='#e5edc8')
    d.polygon([(s(320),s(174)),(s(283),s(283)),(s(229),s(229))],fill='#92b692')
    d.ellipse((s(248),s(248),s(264),s(264)),fill='#284d3c')
    im.save(root / f'icon-{size}.png')
