"""Rebuild the original FX pack from preserved image_gen sources; Pillow only."""
from pathlib import Path
import json
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = ROOT / 'assets/sprites/fx'
NEAREST = Image.Resampling.NEAREST

def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    specs = json.loads((HERE / 'fx_prompts_v1.json').read_text(encoding='utf-8'))['assets']
    bg = Image.open(ROOT / 'art_src/storyboard_tunnel_style_keyframe_v1.png').convert('RGBA').resize((360, 640), NEAREST)
    manifest = {'version': 1, 'frame_order': 'left to right, zero based',
                'sampling': 'nearest; no mipmaps; alpha blend; unlit',
                'pixel_grid': 2, 'assets': []}
    validation = []
    overview = Image.new('RGB', (720, len(specs) * 170), '#242127')
    for row, spec in enumerate(specs):
        name, count, fw, fh = spec['id'], spec['count'], *spec['frame_size']
        src = Image.open(HERE / spec['source']).convert('RGBA')
        src.putalpha(src.getchannel('A').point(lambda a: 0 if a < 32 else (128 if a < 160 else 255)))
        sw, sh = src.size
        crops = [src.crop((round(i*sw/count), 0, round((i+1)*sw/count), sh)) for i in range(count)]
        boxes = [c.getchannel('A').getbbox() for c in crops]
        # A common crop across phases preserves relative size and source registration.
        union = (min(b[0] for b in boxes), min(b[1] for b in boxes),
                 max(b[2] for b in boxes), max(b[3] for b in boxes))
        uw, uh = union[2]-union[0], union[3]-union[1]
        scale = min((fw-12)/uw, (fh-12)/uh)
        dw, dh = max(2, int(uw*scale)//2*2), max(2, int(uh*scale)//2*2)
        frames = []
        for i, crop in enumerate(crops):
            tile = crop.crop(union).resize((dw//2, dh//2), NEAREST)
            # Retain generated transparency; snap coverage and RGB to deliberate pixel steps.
            rgb = tile.convert('RGB').quantize(colors=24, method=Image.Quantize.MEDIANCUT).convert('RGBA')
            rgb.putalpha(tile.getchannel('A').point(lambda a: 0 if a < 32 else (128 if a < 160 else 255)))
            tile = rgb.resize((dw, dh), NEAREST)
            frame = Image.new('RGBA', (fw, fh))
            frame.alpha_composite(tile, ((fw-dw)//2//2*2, fh-dh-6))
            frame.save(OUT / f'{name}_{i:02}_v1.png')
            frames.append(frame)
        strip = Image.new('RGBA', (fw*count, fh))
        for i, frame in enumerate(frames):
            strip.paste(frame, (i*fw, 0))
        strip.save(OUT / f'{name}_strip_v1.png')
        preview_frames = spec['preview_frames']
        panels = []
        for idx in preview_frames:
            p = bg.copy()
            x, y = spec['preview_anchor']
            px, py = spec['pivot_px']
            p.alpha_composite(frames[idx], (x-px, y-py))
            if name == 'wheel_sparks':
                p.alpha_composite(frames[idx].transpose(Image.Transpose.FLIP_LEFT_RIGHT), (360-x-(fw-px), y-py))
            panels.append(p)
        proof = Image.new('RGB', (1080, 640))
        for j, p in enumerate(panels):
            proof.paste(p, (360*j, 0))
        proof.save(HERE / f'preview_{name}_v1.png')
        loop = []
        for frame in frames:
            p = bg.copy()
            x,y = spec['preview_anchor']; px,py = spec['pivot_px']
            p.alpha_composite(frame,(x-px,y-py))
            loop.append(p)
        loop[0].save(HERE / f'preview_{name}_motion_v1.png', save_all=True, append_images=loop[1:],
                     duration=spec['frame_duration_ms'], loop=0, disposal=0, blend=0)
        for i, frame in enumerate(frames):
            fit = frame.copy(); fit.thumbnail((170,156), NEAREST)
            overview.paste(fit, (i*max(1,720//count), row*170+7), fit)
        entry = {k:spec[k] for k in ('id','frame_size','pivot_px','playback','frame_duration_ms','purpose')}
        entry.update({'pivot_normalized':[spec['pivot_px'][0]/fw,spec['pivot_px'][1]/fh],
                      'strip': f'assets/sprites/fx/{name}_strip_v1.png', 'strip_size':[fw*count,fh],
                      'frame_count':count, 'duration_ms':spec['frame_duration_ms']*(1 if spec['playback']=='variants' else count),
                      'frames':[{'file':f'assets/sprites/fx/{name}_{i:02}_v1.png','rect':[i*fw,0,fw,fh]} for i in range(count)],
                      'mirror_x':name in ('wheel_sparks','lane_smoke','demon_claw'),
                      'preview':{'file':f'art_src/fx_v1/preview_{name}_v1.png','frames':preview_frames,
                                 'panel_size':[360,640],'anchor_px':spec['preview_anchor']}})
        manifest['assets'].append(entry)
        alpha_values = sorted(set(strip.getchannel('A').tobytes()))
        assert 0 in alpha_values and 255 in alpha_values
        assert all(f.getchannel('A').getbbox() for f in frames)
        assert all(f.getchannel('A').getextrema()[0] == 0 for f in frames)
        assert len({f.tobytes() for f in frames}) == count
        assert all(f.getchannel('A').getbbox()[0] > 0 and f.getchannel('A').getbbox()[2] < fw for f in frames)
        validation.append({'id':name,'frames':count,'frame_size':[fw,fh], 'source_size':[sw,sh],
                           'alpha_values':alpha_values,'unique_frames':count,'transparent_margin':True,
                           'frame_bounds':[list(f.getchannel('A').getbbox()) for f in frames]})
    overview.save(HERE / 'preview_all_sheets_v1.png')
    write_json(HERE / 'fx_manifest_v1.json', manifest)
    write_json(HERE / 'validation_v1.json', validation)
    print(f'{sum(s["count"] for s in specs)} frames, {len(specs)} strips, {len(specs)*3} phone proof panels')

if __name__ == '__main__':
    main()
