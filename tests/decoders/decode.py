"""Liest alle Bilder/PDFs in /work mit ZBar und OpenCV und gibt JSON aus: {datei: {zbar: text, opencv: text}}"""
import json, os, subprocess, sys, glob
import cv2

def zbar(path):
    r = subprocess.run(['zbarimg', '--quiet', '--raw', '-Sdisable', '-Sqrcode.enable', '-Sbinary', path], capture_output=True)
    return r.stdout.decode('utf-8', 'replace').rstrip('\n') if r.returncode == 0 else None

def opencv(path):
    """OpenCV-Standard- und Aruco-Detektor in mehreren Maßstäben; erstes Ergebnis zählt."""
    img = cv2.imread(path)
    if img is None:
        return None
    for w in (img.shape[1], 1200, 800, 500):
        im = img if w == img.shape[1] else cv2.resize(img, (w, int(img.shape[0] * w / img.shape[1])), interpolation=cv2.INTER_AREA)
        for det in (cv2.QRCodeDetector(), cv2.QRCodeDetectorAruco()):
            text = det.detectAndDecode(im)[0]
            if text:
                return text
    return None

out = {}
for f in sorted(glob.glob('/work/**/*', recursive=True)):
    if '.raster' in f or f.endswith('.json') or f.endswith('.csv') or f.endswith('.zip'):
        continue
    if os.path.isdir(f):
        continue
    name = os.path.relpath(f, '/work')
    path = f
    if f.endswith('.pdf'):
        png = f + '.raster'
        subprocess.run(['pdftoppm', '-png', '-r', '300', '-singlefile', f, png], check=True)
        path = png + '.png'
    elif f.endswith('.svg'):
        path = f + '.raster.png'
        subprocess.run(['rsvg-convert', '-w', '1000', '-b', 'white', '-o', path, f], check=True)
    elif f.endswith('.raster.png'):
        continue
    out[name] = {'zbar': zbar(path), 'opencv': opencv(path)}
json.dump(out, open('/work/decoded.json', 'w'), ensure_ascii=False, indent=1)
