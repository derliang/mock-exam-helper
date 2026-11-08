"""產生 Word 內嵌用的字型子集（D44）。需要 fonttools：pip install fonttools
用法：python scripts/build-export-fonts.py <NotoSansTC_400Regular.ttf> <NotoSansTC_700Bold.ttf>
字型來源：Google Fonts Noto Sans TC（SIL OFL 1.1），可由 npm 套件 @expo-google-fonts/noto-sans-tc 取得。
Regular＝ASCII＋全形標點＋Big5 全集（姓名罕用字風險，使用者要求 100% 正確）。
Bold＝ASCII＋全形標點＋Big5 常用字（lead byte A4～C6，約 5400 字，約 1.9MB）。
稿件的標題、教室牌、班級、標示、注意事項都用粗體中文，字數不固定，所以不能只放固定詞。
檔名仍叫 NotoSansTC-Bold-core.ttf（測試與載入器都用這個名字）。
"""
import sys, subprocess, tempfile, os
out = os.path.join(os.path.dirname(__file__), '..', 'src', 'export', 'fonts')

def big5(lo_hi=range(0xA1, 0xFA)):
    s = set()
    for hi in lo_hi:
        for lo in list(range(0x40, 0x7F)) + list(range(0xA1, 0xFF)):
            try: s.add(bytes([hi, lo]).decode('big5'))
            except Exception: pass
    return s

ascii_ = ''.join(chr(c) for c in range(0x20, 0x7F))
punct = ''.join(chr(c) for c in list(range(0x3000, 0x3040)) + list(range(0xFF00, 0xFFF0)))
bold_extra = '＋－×｜、'
jobs = [
    (sys.argv[1], 'NotoSansTC-Regular-big5.ttf', ascii_ + punct + ''.join(sorted(big5()))),
    (sys.argv[2], 'NotoSansTC-Bold-core.ttf', ascii_ + punct + bold_extra + ''.join(sorted(big5(range(0xA4, 0xC7))))),
]
for src, name, chars in jobs:
    with tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False, encoding='utf8') as t:
        t.write(chars)
    subprocess.check_call(['pyftsubset', src, f'--text-file={t.name}', f'--output-file={os.path.join(out, name)}',
                           '--layout-features=', '--no-hinting'])
    os.unlink(t.name)
    print(name, os.path.getsize(os.path.join(out, name)))

# 字集清單（輸出前掃描姓名用，D44）：從實際產出的 Regular 子集讀 cmap，確保與嵌入內容一致
from fontTools.ttLib import TTFont
cmap = TTFont(os.path.join(out, 'NotoSansTC-Regular-big5.ttf')).getBestCmap()
open(os.path.join(out, 'NotoSansTC-Regular-big5.chars.txt'), 'w', encoding='utf8').write(''.join(chr(c) for c in sorted(cmap)))
