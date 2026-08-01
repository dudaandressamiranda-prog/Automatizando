#!/usr/bin/env python3
"""
Gera os ícones do app a partir da logo.

Por que não usar a logo direto: PNG com fundo transparente vira ícone
apagado na tela do celular. O Android põe uma placa branca atrás e o arco
claro da logo desaparece nela; o iOS achata contra branco e o resultado é
um borrão claro. Ícone bom tem fundo próprio, sangrando até a borda.

São duas famílias, e as duas precisam existir:

  "any"       — o ícone normal. A arte ocupa bem o quadrado.
  "maskable"  — o Android recorta o ícone no formato que o launcher usa
                (círculo, squircle, gota). Só o círculo central de 80%
                está garantido; fora dali pode ser cortado. Por isso a
                arte aqui é menor, com folga de sobra.

Mandar só o "any" faz o Android recortar as bordas da arte. Mandar só o
"maskable" deixa o ícone pequeno e perdido no meio nos lugares que não
recortam nada.

Uso:  python3 scripts/gerar-icones.py     (precisa de Pillow)
"""
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent.parent
PUBLIC = AQUI / 'public'

VERDE = (37, 117, 108, 255)  # #25756c, o mesmo do theme-color

# Arte de origem: fundo transparente, já recortada nas bordas. Fica aqui e
# não em public/ de propósito — o script ESCREVE em public/, e ler de lá a
# própria saída faria a segunda execução compor verde sobre verde.
# A logo.png tem 250 px de largura e não aguenta virar ícone de 512 sem
# borrar; esta cópia veio da versão em resolução cheia.
ORIGEM = AQUI / 'scripts' / 'arte-icone.png'


def aparar_respingos(im: Image.Image) -> Image.Image:
    """
    Corta os cacos soltos embaixo da arte.

    A logo tem uns tufinhos de grama descolados do chão. Bonitos no tamanho
    original, viram sujeira no ícone — no lançador do celular eles parecem
    poeira na tela. Se depois de uma faixa vazia só sobrar coisa fininha,
    é caco: o corte para na última linha do desenho de verdade.
    """
    alfa = im.split()[3]
    px = alfa.load()
    largura, altura = im.size
    cheias = [sum(1 for x in range(largura) if px[x, y] > 20) for y in range(altura)]

    fim = altura
    y = altura - 1
    while y >= 0:
        if cheias[y] == 0:
            y -= 1
            continue
        # achou conteúdo: mede este bloco até a próxima faixa vazia
        topo = y
        while topo >= 0 and cheias[topo] > 0:
            topo -= 1
        if max(cheias[topo + 1:y + 1]) >= largura * 0.15:
            break  # bloco graúdo: é o desenho, para por aqui
        fim = topo + 1  # bloco magro: caco, descarta
        y = topo

    return im.crop((0, 0, largura, fim)) if fim < altura else im


def carregar_arte() -> Image.Image:
    """A arte apertada nas bordas reais, sem a margem transparente."""
    im = Image.open(ORIGEM).convert('RGBA')
    im = aparar_respingos(im.crop(im.split()[3].getbbox()))
    return im.crop(im.split()[3].getbbox())


def compor(arte: Image.Image, lado: int, ocupacao: float) -> Image.Image:
    """Fundo verde inteiro + a arte centrada ocupando `ocupacao` do lado."""
    fundo = Image.new('RGBA', (lado, lado), VERDE)
    alvo = int(lado * ocupacao)
    escala = min(alvo / arte.width, alvo / arte.height)
    a = arte.resize((max(1, round(arte.width * escala)),
                     max(1, round(arte.height * escala))), Image.LANCZOS)
    fundo.alpha_composite(a, ((lado - a.width) // 2, (lado - a.height) // 2))
    return fundo


def main() -> None:
    arte = carregar_arte()
    print(f'arte: {arte.width}×{arte.height} de {ORIGEM.name}')

    # ícone comum: a arte pode chegar perto da borda
    for lado in (512, 192, 32):
        compor(arte, lado, 0.80).save(PUBLIC / f'icon-{lado}.png')
        print(f'  icon-{lado}.png')

    # maskable: arte menor, para sobreviver ao recorte do launcher
    for lado in (512, 192):
        compor(arte, lado, 0.60).save(PUBLIC / f'icon-maskable-{lado}.png')
        print(f'  icon-maskable-{lado}.png')

    print('\nicon.png e logo.png não foram tocados: são usados DENTRO do app,')
    print('sobre fundo claro, e lá a transparência é o certo.')


if __name__ == '__main__':
    main()
