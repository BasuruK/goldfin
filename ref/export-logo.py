"""Export goldfin-logo.html to standalone SVGs (wordmark outlined) and transparent PNGs.

Setup:  python3 -m venv venv && venv/bin/pip install fonttools uharfbuzz pillow
        curl -L -o Urbanist.ttf "https://github.com/google/fonts/raw/main/ofl/urbanist/Urbanist%5Bwght%5D.ttf"
Usage:  venv/bin/python export-logo.py <this folder> Urbanist.ttf   (needs Google Chrome)
        CHROME overrides the Chrome binary path.
"""
import html, os, re, subprocess, sys, pathlib

# Before the third-party imports, so a missing argument prints usage rather than
# an ImportError from an environment that has not been set up yet.
if len(sys.argv) != 3:
    sys.exit('usage: export-logo.py <this folder> <Urbanist.ttf>')

from PIL import Image
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

_DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'


def _resolve_ref_dir(raw: str) -> pathlib.Path:
    ref = pathlib.Path(raw).expanduser().resolve()
    if not ref.is_dir():
        sys.exit(f'ref folder is not a directory: {ref}')
    if not (ref / 'goldfin-logo.html').is_file():
        sys.exit(f'missing {ref / "goldfin-logo.html"}')
    return ref


def _resolve_ttf(raw: str) -> pathlib.Path:
    ttf = pathlib.Path(raw).expanduser().resolve()
    if not ttf.is_file():
        sys.exit(f'font file not found: {ttf}')
    if ttf.suffix.lower() != '.ttf':
        sys.exit(f'expected a .ttf file: {ttf}')
    return ttf


def _chrome_binary() -> pathlib.Path:
    raw = os.environ.get('CHROME', _DEFAULT_CHROME)
    chrome = pathlib.Path(raw).expanduser().resolve()
    if not chrome.is_file():
        sys.exit(f'Chrome binary not found: {chrome} (set CHROME to override)')
    return chrome


def _path_under_ref(path: pathlib.Path, ref: pathlib.Path) -> pathlib.Path:
    resolved = path.expanduser().resolve()
    root = ref.resolve()
    try:
        resolved.relative_to(root)
    except ValueError:
        sys.exit(f'path escapes ref folder: {resolved}')
    return resolved


def _run_chrome(argv: list[str], *, text: bool = False) -> subprocess.CompletedProcess:
    """Invoke headless Chrome with a fixed argv tail (no shell, no user-controlled binary)."""
    cmd = [str(_chrome_binary()), *argv]
    return subprocess.run(cmd, capture_output=True, text=text, check=True)


REF = _resolve_ref_dir(sys.argv[1])
TTF = _resolve_ttf(sys.argv[2])
VIEWBOX = (-577, -180, 880, 818)
MARK = (-158.75, 132, 598)  # bird bounds: centre and width, tail tip T to beak tip P (height 484 fits inside)
SIZE, BASELINE, CENTRE, TRACK = 209, 568, -137, -0.01  # must match .word in the HTML
# Must match #word in goldfin-logo.html so HarfBuzz outlines and the dotless ı dot align.
WEIGHT, TEXT = 800, 'Goldfın'

# 1. the bird, exactly as the page's construction code builds it
_logo_html = _path_under_ref(REF / 'goldfin-logo.html', REF)
dom = _run_chrome(
    ['--headless', '--disable-gpu', '--virtual-time-budget=3000', '--dump-dom', _logo_html.as_uri()],
    text=True,
).stdout
bird = re.search(r'<g id="bird">(.*?)</g>', dom, re.S).group(1)
guides = re.search(r'<g id="guides">(.*?)</g>', dom, re.S).group(1)
assert bird.count('<path') == 4, 'expected body, cap and two wing paths'
assert guides, 'expected the construction circles and lines'

# 2. the wordmark as outlines: shape with HarfBuzz (kerning), draw from a static 800 instance
font = instantiateVariableFont(TTFont(TTF), {'wght': WEIGHT})
upem = font['head'].unitsPerEm
face = hb.Face(TTF.read_bytes())
hbfont = hb.Font(face)
hbfont.set_variations({'wght': WEIGHT})
buf = hb.Buffer()
buf.add_str(TEXT)
buf.guess_segment_properties()
hb.shape(hbfont, buf, {'liga': False})
k, track = SIZE / upem, TRACK * SIZE
order, glyphset = font.getGlyphOrder(), font.getGlyphSet()
cells, x = [], 0.0
for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
    cells.append((order[info.codepoint], x + pos.x_offset * k, pos.x_advance * k))
    x += pos.x_advance * k + track
x0 = CENTRE - x / 2  # text-anchor: middle
glyphs = []
for name, gx, adv in cells:
    pen = SVGPathPen(glyphset, lambda v: f'{v:.2f}'.rstrip('0').rstrip('.'))
    glyphset[name].draw(TransformPen(pen, (k, 0, 0, -k, x0 + gx, BASELINE)))
    glyphs.append(pen.getCommands())
name, gx, adv = cells[TEXT.index('ı')]
dot = (x0 + gx + adv / 2, BASELINE - 0.636 * SIZE, 0.079 * SIZE)  # same rule as the page

# 3. SVGs. Holes stay transparent so the background shows through.
INK = {'light': '#151d26', 'dark': '#fdfcfa'}
def paint(ink):
    # ink=None leaves the ink elements classed, so the theme block below can fill
    # them. Gold and eye keep their fixed fills either way.
    return bird.replace('class="gold"', 'fill="#ffc835"') \
               .replace('class="ink"', 'class="ink"' if ink is None else f'fill="{ink}"') \
               .replace('class="eye"', 'fill="#151d26"')
def construction(ink):
    marks = guides.replace('class="pt"', f'fill="{ink}" stroke="none"')
    return (f'<g fill="none" stroke="{ink}" stroke-opacity="0.4" stroke-width="1.2" '
            f'stroke-dasharray="6 5">{marks}</g>\n')
def frame(box, body, extra=''):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{" ".join(f"{v:g}" for v in box)}" '
            f'width="{box[2]:g}" height="{box[3]:g}" role="img" aria-label="Goldfin">\n{extra}{body}</svg>\n')
def logo(ink, guide=False):
    return frame(VIEWBOX, f'<g>{paint(ink)}</g>\n<path fill="{ink}" d="{"".join(glyphs)}"/>\n'
                 f'<circle fill="#ffc835" cx="{dot[0]:.2f}" cy="{dot[1]:.2f}" r="{dot[2]:.2f}"/>\n'
                 + (construction(ink) if guide else ''))
def square(pad):  # viewBox around the bird with `pad` of its width on every side
    side = MARK[2] * (1 + 2 * pad)
    return (MARK[0] - side / 2, MARK[1] - side / 2, side, side)

def png(svg_text, out, w, h):
    width = int(w)
    height = int(h)
    if width <= 0 or height <= 0 or width > 8192 or height > 8192:
        raise ValueError(f'png dimensions out of range: {width}x{height}')
    dest = _path_under_ref(out, REF)
    src = _path_under_ref(dest.with_suffix('.tmp.svg'), REF)
    page = _path_under_ref(dest.with_suffix('.tmp.html'), REF)
    try:
        src.write_text(svg_text)
        img_src = html.escape(src.name, quote=True)
        page.write_text(
            f'<body style="margin:0;background:transparent"><img src="{img_src}" width="{width}" height="{height}" style="display:block">'
        )
        _run_chrome([
            '--headless',
            '--disable-gpu',
            '--hide-scrollbars',
            '--default-background-color=00000000',
            f'--window-size={width},{height}',
            f'--screenshot={dest}',
            page.as_uri(),
        ])
    finally:
        # Chrome failing leaves the scratch files behind otherwise, and the next
        # run has to overwrite them cleanly.
        src.unlink(missing_ok=True); page.unlink(missing_ok=True)

written = []
def save(name, text):
    (REF / name).write_text(text); written.append(name)

for theme, ink in INK.items():
    save(f'goldfin-logo-{theme}.svg', logo(ink))
    save(f'goldfin-logo-{theme}-construction.svg', logo(ink, guide=True))
    png(logo(ink), REF / f'goldfin-logo-{theme}.png', 2048, round(2048 * VIEWBOX[3] / VIEWBOX[2]))
    written.append(f'goldfin-logo-{theme}.png')

# 4. favicons: the bird alone. The SVG follows the browser's colour scheme.
mark = square(0.03)
themed = paint(None)
save('favicon.svg', frame(mark, f'<g>{themed}</g>\n',
     '<style>.ink{fill:#151d26}@media (prefers-color-scheme:dark){.ink{fill:#fdfcfa}}</style>\n'))
for size in (192, 512):
    png(frame(mark, f'<g>{paint(INK["light"])}</g>\n'), REF / f'icon-{size}.png', size, size)
    written.append(f'icon-{size}.png')
# iOS fills transparency with black, so the touch icon gets the light background and more room
png(frame(square(0.16), f'<g>{paint(INK["light"])}</g>\n',
          f'<rect x="-9999" y="-9999" width="99999" height="99999" fill="#fdfcfa"/>\n'),
    REF / 'apple-touch-icon.png', 180, 180)
written.append('apple-touch-icon.png')
Image.open(REF / 'icon-512.png').save(REF / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
written.append('favicon.ico')
print('\n'.join(written))
