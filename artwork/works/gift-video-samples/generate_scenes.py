# -*- coding: utf-8 -*-
"""上質なギフト動画サンプル用SVGを9枚生成する。

    python artwork/works/gift-video-samples/generate_scenes.py

母の日・誕生日・記念日の各3シーン。文字は動画組み立て時に重ねる。
重要なモチーフは中央607pxの縦型セーフエリアにも残る構図にする。
"""
from pathlib import Path
import math
import random

OUT = Path(__file__).parent
W, H = 1920, 1080
rng = random.Random(8122026)


def defs(extra=""):
    extra_block = f"\n{extra}" if extra else ""
    return f"""
    <defs>
      <filter id="grain" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="3" seed="12"/>
        <feColorMatrix type="saturate" values="0"/>
      </filter>
      <filter id="soft" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="28"/>
      </filter>
      <filter id="glow" x="-120%" y="-120%" width="340%" height="340%">
        <feGaussianBlur stdDeviation="13" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#8D6828"/><stop offset=".48" stop-color="#F5D994"/>
        <stop offset="1" stop-color="#A97B2D"/>
      </linearGradient>
{extra_block}
    </defs>"""


def start(extra_defs=""):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">{defs(extra_defs)}'


def finish():
    return '<rect width="1920" height="1080" fill="#fff" opacity=".035" filter="url(#grain)"/></svg>'


def jasmine(x, y, size, rotation=0, opacity=1):
    petals = "".join(
        f'<ellipse cy="{-size*.52:.1f}" rx="{size*.25:.1f}" ry="{size*.50:.1f}" '
        f'fill="#FFFDF7" stroke="#D7DEE3" stroke-width="{max(1.2,size*.018):.1f}" '
        f'transform="rotate({a})"/>' for a in range(0, 360, 72)
    )
    return (f'<g transform="translate({x} {y}) rotate({rotation})" opacity="{opacity}">{petals}'
            f'<circle r="{size*.13:.1f}" fill="#C89A3A"/></g>')


def bokeh(count, palette, y_max=900, min_r=4, max_r=18):
    items = []
    for _ in range(count):
        x, y = rng.uniform(0, W), rng.uniform(0, y_max)
        r = rng.uniform(min_r, max_r)
        items.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r:.1f}" fill="{rng.choice(palette)}" '
                     f'opacity="{rng.uniform(.08,.3):.2f}" filter="url(#soft)"/>')
    return "".join(items)


def stars(count, color="#E9D8A6", y_max=880):
    return "".join(
        f'<circle cx="{rng.uniform(30,1890):.0f}" cy="{rng.uniform(30,y_max):.0f}" '
        f'r="{rng.uniform(.8,2.8):.1f}" fill="{color}" opacity="{rng.uniform(.25,.85):.2f}"/>'
        for _ in range(count)
    )


def silhouette_pair(x=960, ground=920, scale=1):
    """写実寄りの輪郭だけで表す、寄り添う二人。"""
    return f"""
    <g transform="translate({x} {ground}) scale({scale})" fill="#171522">
      <circle cx="-56" cy="-207" r="31"/><path d="M-91-174 Q-56-194-21-174 L-13 0H-105Z"/>
      <circle cx="48" cy="-224" r="34"/><path d="M10-189 Q48-208 88-184 L101 0H-7Z"/>
      <path d="M-25-158 Q5-179 32-158" fill="none" stroke="#171522" stroke-width="18" stroke-linecap="round"/>
    </g>"""


svgs = {}

# ── 母の日: 水色・白ジャスミン・控えめな金。記憶→ぬくもり→感謝の余韻。 ──
mother_defs = """
<linearGradient id="mSky" x1="0" y1="0" x2="0" y2="1">
 <stop offset="0" stop-color="#EDF7FB"/><stop offset=".62" stop-color="#D6EAF3"/><stop offset="1" stop-color="#B8D5E2"/>
</linearGradient>
<radialGradient id="mLight"><stop stop-color="#FFF9E9" stop-opacity=".96"/><stop offset="1" stop-color="#FFF9E9" stop-opacity="0"/></radialGradient>
"""

svgs["m1"] = start(mother_defs) + f"""
<rect width="1920" height="1080" fill="url(#mSky)"/>
<circle cx="960" cy="410" r="430" fill="url(#mLight)"/>
<path d="M0 810 Q390 760 770 816 T1500 790 T1920 810V1080H0Z" fill="#A6C4C8" opacity=".56"/>
<path d="M0 900 Q480 830 930 900 T1920 872V1080H0Z" fill="#73999A" opacity=".72"/>
<g transform="translate(960 665) rotate(-3)">
  <rect x="-270" y="-150" width="540" height="330" rx="8" fill="#FDFBF4" stroke="url(#gold)" stroke-width="3"/>
  <path d="M-270-150 L0 52 270-150" fill="#F7F1E4" stroke="#D8CCB0" stroke-width="2"/>
  <path d="M-270 180 L-20-20 Q0-37 20-20 L270 180" fill="#F5EEDF"/>
  <circle cy="42" r="29" fill="#B78A3A" opacity=".9"/><path d="M-11 42h22M0 31v22" stroke="#F8EAC1" stroke-width="2"/>
</g>
<path d="M1120 844 C1250 720 1305 520 1390 304" fill="none" stroke="#577C70" stroke-width="7" stroke-linecap="round"/>
<path d="M1295 594q-90-72-142-20q76 46 142 20M1342 452q80-70 132-16q-70 46-132 16" fill="#789A82" opacity=".86"/>
{jasmine(1390,300,72,-8)}{jasmine(1328,452,48,18)}{jasmine(1288,585,55,-14)}
<path d="M760 232 Q960 150 1160 232" fill="none" stroke="url(#gold)" stroke-width="2" opacity=".65"/>
""" + finish()

svgs["m2"] = start(mother_defs) + f"""
<rect width="1920" height="1080" fill="url(#mSky)"/>
<ellipse cx="960" cy="500" rx="510" ry="430" fill="url(#mLight)"/>
<g opacity=".16" fill="#486F72">
 <circle cx="1740" cy="90" r="260"/><circle cx="1560" cy="210" r="210"/><circle cx="250" cy="130" r="250"/>
</g>
<path d="M0 920 Q420 870 900 915 T1920 900V1080H0Z" fill="#6D8E8D"/>
<!-- 大人の手と子どもの手。顔を描かず、記憶を受け取る余白を残す -->
<path d="M420 340 C560 365 690 470 790 590 C845 655 874 718 930 756 C970 783 1015 744 998 702 C970 634 900 583 858 515 C808 434 770 350 700 300Z" fill="#D5B19B"/>
<path d="M1505 702 C1370 660 1284 652 1190 690 C1112 721 1066 778 1006 778 C960 778 938 733 965 700 C1010 644 1078 627 1140 575 C1198 526 1238 465 1292 430 C1358 387 1430 402 1518 446Z" fill="#C98F76"/>
<path d="M942 718 C980 690 1020 693 1052 728" fill="none" stroke="#A66E5C" stroke-width="4" opacity=".55"/>
<circle cx="960" cy="706" r="148" fill="none" stroke="url(#gold)" stroke-width="2" opacity=".52"/>
<circle cx="960" cy="706" r="178" fill="none" stroke="#FFFFFF" stroke-width="1" opacity=".58"/>
<path d="M770 870 C875 833 1045 834 1155 872" fill="none" stroke="#F8F4E8" stroke-width="5" opacity=".8"/>
{jasmine(960,245,58,0,.92)}
""" + finish()

svgs["m3"] = start(mother_defs) + f"""
<rect width="1920" height="1080" fill="#EAF4F8"/>
<circle cx="960" cy="510" r="410" fill="#FDFCF7"/>
<circle cx="960" cy="510" r="412" fill="none" stroke="url(#gold)" stroke-width="3"/>
<circle cx="960" cy="510" r="355" fill="none" stroke="#B7D3DB" stroke-width="1"/>
<ellipse cx="960" cy="815" rx="315" ry="42" fill="#5E7F83" opacity=".12" filter="url(#soft)"/>
<path d="M892 720 Q960 766 1028 720 L1004 854 Q960 888 916 854Z" fill="#F5F0E6" stroke="#D2C5A6" stroke-width="3"/>
<path d="M960 720 C954 606 930 506 864 386M960 708 C1000 602 1057 520 1135 454" fill="none" stroke="#557B68" stroke-width="7"/>
<path d="M924 574q-96-60-131 10q78 27 131-10M1008 596q84-65 126-3q-72 34-126 3" fill="#779884"/>
{jasmine(864,382,88,-8)}{jasmine(1138,450,76,16)}{jasmine(950,514,62,5)}
<g opacity=".75">{jasmine(650,210,35,-12)}{jasmine(1260,820,32,14)}{jasmine(1490,280,28,5)}</g>
<path d="M690 940 Q960 1000 1230 940" fill="none" stroke="url(#gold)" stroke-width="2"/>
""" + finish()

# ── 誕生日: 騒がしさではなく「生まれてきてくれた奇跡」。深藍・蝋燭・朝の金。 ──
bday_defs = """
<linearGradient id="bNight" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#071426"/><stop offset=".6" stop-color="#142C45"/><stop offset="1" stop-color="#27465B"/></linearGradient>
<radialGradient id="flame"><stop stop-color="#FFF7CF"/><stop offset=".3" stop-color="#F4C66C"/><stop offset="1" stop-color="#E38945" stop-opacity="0"/></radialGradient>
"""

svgs["b1"] = start(bday_defs) + f"""
<rect width="1920" height="1080" fill="url(#bNight)"/>{stars(72,'#E9E4D2',760)}
<path d="M580 110 H1340 V950 H580Z" fill="#0A101A" stroke="#6E7F87" stroke-width="7"/>
<rect x="618" y="150" width="684" height="760" fill="#183A52"/>
<path d="M960 150V910M618 545H1302" stroke="#748890" stroke-width="5"/>
<path d="M620 910 Q960 720 1300 910Z" fill="#E8B963" opacity=".12"/>
<circle cx="1150" cy="300" r="112" fill="#F5EACB" opacity=".92"/>
<circle cx="1190" cy="270" r="112" fill="#183A52"/>
<g transform="translate(960 820)">
 <ellipse cy="75" rx="165" ry="28" fill="#030913" opacity=".55"/>
 <rect x="-86" y="-5" width="172" height="86" rx="14" fill="#F0E5D2"/>
 <rect x="-7" y="-98" width="14" height="98" rx="6" fill="#C49B67"/>
 <ellipse cy="-118" rx="48" ry="72" fill="url(#flame)" filter="url(#glow)"/>
 <path d="M0-165 C-34-128-16-86 0-82 C20-89 34-126 0-165Z" fill="#F6D27A"/>
</g>
<path d="M760 985 Q960 925 1160 985" fill="none" stroke="url(#gold)" stroke-width="2"/>
""" + finish()

svgs["b2"] = start(bday_defs) + f"""
<rect width="1920" height="1080" fill="#F4EFE6"/>
<rect x="420" y="0" width="1080" height="1080" fill="#ECE4D7"/>
<ellipse cx="960" cy="770" rx="410" ry="92" fill="#766C61" opacity=".13" filter="url(#soft)"/>
<g transform="translate(960 650)">
 <ellipse cy="155" rx="330" ry="105" fill="#D8C2A8"/>
 <rect x="-330" y="-20" width="660" height="180" rx="45" fill="#DCC2AE"/>
 <ellipse cy="-20" rx="330" ry="105" fill="#F7EEE2" stroke="#C7A26C" stroke-width="4"/>
 <path d="M-260-24 Q-130 54 0-18 T260-24" fill="none" stroke="#C69A78" stroke-width="11" opacity=".55"/>
 <g transform="translate(0 -90)"><rect x="-9" y="-130" width="18" height="128" rx="8" fill="#A7B8B1"/>
  <ellipse cy="-155" rx="62" ry="86" fill="url(#flame)" filter="url(#glow)"/>
  <path d="M0-218 C-38-173-18-128 0-123 C23-132 38-174 0-218Z" fill="#E7AE55"/></g>
</g>
<g fill="none" stroke="#9B7A4A" stroke-width="2" opacity=".65">
 <path d="M610 210q350-160 700 0"/><path d="M680 255q280-118 560 0"/>
</g>
<circle cx="960" cy="210" r="8" fill="#B28A4D"/>
""" + finish()

svgs["b3"] = start(bday_defs + '<linearGradient id="dawn" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#10243B"/><stop offset=".55" stop-color="#486D7B"/><stop offset="1" stop-color="#E6C58D"/></linearGradient>') + f"""
<rect width="1920" height="1080" fill="url(#dawn)"/>{stars(40,'#FFF4D5',500)}
<circle cx="960" cy="820" r="330" fill="url(#flame)" opacity=".48"/>
<path d="M0 860 Q420 790 820 862 Q960 890 1100 862 Q1500 790 1920 860V1080H0Z" fill="#17323D"/>
<path d="M0 930 Q460 875 850 936 Q960 960 1070 936 Q1460 875 1920 930V1080H0Z" fill="#0B202A"/>
<path d="M960 1080 C865 988 844 934 842 856 C840 772 885 710 960 652 C1035 710 1080 772 1078 856 C1076 934 1055 988 960 1080Z" fill="#D5B878" opacity=".34"/>
<path d="M960 1060V690" stroke="#F2D999" stroke-width="3" stroke-dasharray="16 22" opacity=".8"/>
<g fill="none" stroke="url(#gold)" stroke-width="2" opacity=".8">
 <circle cx="960" cy="465" r="112"/><circle cx="960" cy="465" r="148"/>
</g>
<circle cx="960" cy="465" r="8" fill="#F2D999" filter="url(#glow)"/>
""" + finish()

# ── 記念日: 思い出の断片→触れ合い→これからも続く道。墨紺・琥珀・古紙。 ──
ann_defs = """
<linearGradient id="aDusk" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#151827"/><stop offset=".58" stop-color="#343044"/><stop offset="1" stop-color="#765748"/></linearGradient>
<radialGradient id="lamp"><stop stop-color="#FFF2C4"/><stop offset=".22" stop-color="#EAB760" stop-opacity=".9"/><stop offset="1" stop-color="#D18A3C" stop-opacity="0"/></radialGradient>
"""

svgs["a1"] = start(ann_defs) + f"""
<rect width="1920" height="1080" fill="#E9E2D5"/>
<g transform="translate(960 540) rotate(-2)">
 <rect x="-540" y="-390" width="1080" height="780" rx="10" fill="#F7F2E9" stroke="#B9A98D" stroke-width="3"/>
 <rect x="-475" y="-325" width="950" height="650" fill="#24313B"/>
 <path d="M-475 112 Q-180 34 50 130 T475 82V325H-475Z" fill="#5C665E"/>
 <circle cx="-250" cy="-120" r="116" fill="#D6A85E" opacity=".74"/>
 <path d="M-30 325V-10M60 325V-45" stroke="#11171C" stroke-width="24"/>
 <circle cx="-30" cy="-58" r="40" fill="#11171C"/><circle cx="60" cy="-94" r="42" fill="#11171C"/>
 <path d="M-76-17Q-30-42 16-10L22 325H-88ZM14-52Q60-76 108-46L123 325H4Z" fill="#11171C"/>
 <path d="M-4 42Q26 18 56 44" fill="none" stroke="#11171C" stroke-width="21" stroke-linecap="round"/>
 <rect x="-475" y="270" width="950" height="55" fill="#11171C" opacity=".4"/>
</g>
<path d="M530 180 Q960 52 1390 180" fill="none" stroke="url(#gold)" stroke-width="2"/>
<circle cx="960" cy="110" r="7" fill="#A77A38"/>
""" + finish()

svgs["a2"] = start(ann_defs) + f"""
<rect width="1920" height="1080" fill="#18202B"/>
<circle cx="960" cy="520" r="470" fill="url(#lamp)" opacity=".32"/>
<path d="M0 920 Q520 850 960 920 T1920 900V1080H0Z" fill="#0C121A"/>
<!-- 手を取り合う一瞬。結び目の金だけが温かく光る -->
<path d="M220 730 C420 636 590 610 740 658 C826 686 872 758 946 770 C1000 779 1032 736 1001 696 C948 628 844 596 766 530 C700 474 640 388 548 340 L150 508Z" fill="#C79A82"/>
<path d="M1720 480 L1340 334 C1252 382 1200 466 1140 528 C1068 601 972 634 934 700 C906 747 948 789 1001 773 C1078 750 1120 681 1205 648 C1362 587 1516 620 1735 692Z" fill="#A96F5E"/>
<path d="M914 709 Q960 666 1006 709" fill="none" stroke="#E8C779" stroke-width="7" stroke-linecap="round" filter="url(#glow)"/>
<circle cx="960" cy="712" r="176" fill="none" stroke="url(#gold)" stroke-width="2" opacity=".58"/>
{stars(55,'#DBC794',650)}
""" + finish()

svgs["a3"] = start(ann_defs) + f"""
<rect width="1920" height="1080" fill="url(#aDusk)"/>{stars(76,'#E9DDBE',760)}
<circle cx="960" cy="380" r="260" fill="url(#lamp)" opacity=".34"/>
<path d="M0 900 Q430 820 800 900 Q960 940 1120 900 Q1490 820 1920 900V1080H0Z" fill="#11131B"/>
<path d="M960 1080 C850 980 820 920 815 835 C810 742 870 674 960 610 C1050 674 1110 742 1105 835 C1100 920 1070 980 960 1080Z" fill="#B9874C" opacity=".18"/>
{silhouette_pair(960,930,1.18)}
<g transform="translate(960 235)">
 <circle r="150" fill="url(#lamp)" opacity=".75"/>
 <path d="M-56-76H56L42 74H-42Z" fill="#D69B4B" stroke="#F0D08B" stroke-width="3"/>
 <path d="M-68-78H68M-42 76H42" stroke="#6F4A2A" stroke-width="11"/>
 <rect x="-3" y="-180" width="6" height="102" fill="#9A7448"/>
</g>
<path d="M650 1000 Q960 1045 1270 1000" fill="none" stroke="url(#gold)" stroke-width="2" opacity=".75"/>
""" + finish()


themes = {"m": "mothersday", "b": "birthday", "a": "anniversary"}
for key, svg in svgs.items():
    theme_dir = OUT / themes[key[0]]
    theme_dir.mkdir(parents=True, exist_ok=True)
    path = theme_dir / f"scene{key[1]}.svg"
    path.write_text(svg, encoding="utf-8")
    print(f"wrote {path}")
