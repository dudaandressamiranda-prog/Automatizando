"""Recorta as jubartes (fundo de papel -> transparente) e salva em public/baleias/*.webp.
Uso: python3 design/baleias/recortar.py   (rodar na pasta rotina-jubarte)
Máscara por IA (rembg isnet-general-use) + buracos internos tapados; cor sempre da imagem original."""
from rembg import remove, new_session
from PIL import Image
import numpy as np, cv2

sess = new_session('isnet-general-use')
for nome in ['principal', 'dourada', 'clara']:
    im = Image.open(f'design/baleias/jubarte-{nome}-original.png').convert('RGB')
    al = np.array(remove(im, session=sess, only_mask=True, post_process_mask=True))
    solid = (al > 20).astype(np.uint8) * 255
    ff = solid.copy(); h, w = solid.shape
    cv2.floodFill(ff, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 255)
    al = np.maximum(al, cv2.bitwise_not(ff))          # tapa furos dentro da baleia
    cut = Image.fromarray(np.dstack([np.array(im), al]))
    cut = cut.crop(cut.getbbox())
    w, h = cut.size
    s = 640 / max(w, h)
    cut = cut.resize((round(w * s), round(h * s)), Image.LANCZOS)
    cut.save(f'public/baleias/{nome}.webp', quality=90, method=6)
    print(nome, cut.size)
