#!/usr/bin/env python3
"""从超宽 Banner 中提取竖版主海报。

流程：
1. qwen3-vl-plus 识别主图边界框（像素坐标）
2. 本地裁切得到主图
3. （可选）wan2.7-image 图生图验证接口连通性
"""

from __future__ import annotations

import base64
import json
import os
import re
import sys
from pathlib import Path

import dashscope
import requests
from dashscope.aigc.image_generation import ImageGeneration
from dashscope.api_entities.dashscope_response import Message
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BANNER = (
    Path.home()
    / ".cursor/projects/Users-zrx-projects-PosterFlow/assets"
    / "___Banner_1053_186_1053x186-b41834fa-579b-40f8-85ec-df60ae30413d.png"
)
LLM_CONFIG = Path.home() / ".config" / "llm.yaml"
OUTPUT_DIR = ROOT / "scripts" / "output"
VISION_BASE = "https://dashscope.aliyuncs.com/compatible-mode/v1"


def load_api_key(config_path: Path = LLM_CONFIG) -> str:
    content = config_path.read_text(encoding="utf-8")
    match = re.search(r"^\s*api_key:\s*(.+)$", content, re.MULTILINE)
    if not match:
        raise RuntimeError(f"未在 {config_path} 找到 api_key")
    return match.group(1).strip().strip("\"'")


def to_data_url(image_path: Path) -> str:
    mime = "image/png" if image_path.suffix.lower() == ".png" else "image/jpeg"
    encoded = base64.b64encode(image_path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def detect_master_bbox(image_path: Path, api_key: str) -> dict:
    with Image.open(image_path) as img:
        width, height = img.size

    prompt = f"""这是一张超宽运营 Banner（宽 {width}px，高 {height}px）。

画面结构（从左到右）：
1. 最左侧：主海报被横向拉伸模糊的装饰背景
2. 中间偏左：一块完整、清晰、未模糊的竖版主海报（这是要提取的目标）
3. 最右侧：纯色留白，没有任何内容

请精确框选第 2 部分「清晰竖版主海报」的边界，返回 JSON：
{{"x": 整数, "y": 整数, "width": 整数, "height": 整数, "reasoning": "一句话"}}

约束：
- 坐标系：左上角为 (0,0)，单位像素，x 向右，y 向下
- 必须完整包含清晰海报（含顶部 Logo、标题、人物、底部信息），不要裁到海报边缘
- 不要包含左侧模糊区和右侧纯色留白
- x 应明显大于 0，且 x + width 应明显小于 {width}
- 只返回 JSON"""

    response = requests.post(
        f"{VISION_BASE}/chat/completions",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        json={
            "model": "qwen3-vl-plus",
            "max_tokens": 800,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": to_data_url(image_path)}},
                    ],
                }
            ],
        },
        timeout=120,
    )
    response.raise_for_status()
    payload = response.json()

    content = payload["choices"][0]["message"]["content"]
    print("---- qwen3-vl-plus 原始返回 ----")
    print(content)

    fenced = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", content)
    text = fenced.group(1) if fenced else content
    object_match = re.search(r"\{[\s\S]+\}", text)
    if not object_match:
        raise RuntimeError("视觉模型未返回可解析 JSON")

    bbox = json.loads(object_match.group(0))
    for key in ("x", "y", "width", "height"):
        bbox[key] = int(round(float(bbox[key])))

    bbox["x"] = max(0, min(bbox["x"], width - 1))
    bbox["y"] = max(0, min(bbox["y"], height - 1))
    bbox["width"] = max(1, min(bbox["width"], width - bbox["x"]))
    bbox["height"] = max(1, min(bbox["height"], height - bbox["y"]))
    return bbox


def detect_master_bbox_sharpness(image_path: Path) -> dict:
    """用列方向清晰度扫描定位清晰主海报（本地兜底）。"""
    import numpy as np

    with Image.open(image_path).convert("L") as gray:
        arr = np.asarray(gray, dtype=np.float32)
    h, w = arr.shape

    scores = []
    for x in range(w):
        col = arr[:, max(0, x - 1) : min(w, x + 2)]
        lap = (
            -4 * col
            + np.roll(col, 1, axis=1)
            + np.roll(col, -1, axis=1)
            + np.roll(col, 1, axis=0)
            + np.roll(col, -1, axis=0)
        )
        scores.append(float(np.var(lap)))

    peak = max(scores)
    threshold = peak * 0.45
    clear_cols = [i for i, s in enumerate(scores) if s >= threshold]
    if not clear_cols:
        raise RuntimeError("清晰度扫描未找到主海报区域")

    # 合并为连续区间，取方差总和最大的区间
    segments: list[tuple[int, int]] = []
    start = clear_cols[0]
    prev = clear_cols[0]
    for x in clear_cols[1:]:
        if x == prev + 1:
            prev = x
            continue
        segments.append((start, prev))
        start = prev = x
    segments.append((start, prev))

    def segment_score(seg: tuple[int, int]) -> float:
        a, b = seg
        return sum(scores[a : b + 1])

    x0, x1 = max(segments, key=segment_score)
    x0 = min(x0 + 2, x1)
    x1 = max(x1 - 2, x0)

    return {
        "x": x0,
        "y": 0,
        "width": x1 - x0 + 1,
        "height": h,
        "reasoning": "本地清晰度扫描：高拉普拉斯方差连续区间",
    }


def choose_bbox(vl_bbox: dict, sharp_bbox: dict, width: int) -> dict:
    """在 VL 与清晰度结果间择优。"""
    vl_ok = (
        vl_bbox["x"] < width * 0.55
        and vl_bbox["width"] <= width * 0.55
        and vl_bbox["width"] >= width * 0.15
    )
    if vl_ok:
        return vl_bbox

    # VL 不可靠时，若清晰度框过宽则裁掉右侧低方差留白
    if sharp_bbox["width"] > width * 0.55:
        sharp_bbox = {**sharp_bbox, "width": int(width * 0.5)}
    return sharp_bbox


def crop_master(image_path: Path, bbox: dict, output_path: Path) -> Path:
    with Image.open(image_path) as img:
        cropped = img.crop(
            (
                bbox["x"],
                bbox["y"],
                bbox["x"] + bbox["width"],
                bbox["y"] + bbox["height"],
            )
        )
        output_path.parent.mkdir(parents=True, exist_ok=True)
        cropped.save(output_path)
    return output_path


def pad_for_wan(image_path: Path, output_dir: Path, min_size: int = 240) -> Path:
    """wan2.7-image 要求最短边 >= 240，对超宽 Banner 做等比填充。"""
    with Image.open(image_path) as img:
        w, h = img.size
        if w >= min_size and h >= min_size:
            return image_path
        scale = max(min_size / w, min_size / h, 1.0)
        nw, nh = int(round(w * scale)), int(round(h * scale))
        padded = img.resize((nw, nh), Image.Resampling.LANCZOS)
        out = output_dir / "banner_padded_for_wan.png"
        padded.save(out)
        return out


def test_wan_image_edit(image_path: Path, api_key: str, output_dir: Path) -> None:
    """用 wan2.7-image 做图生图接口连通性测试（非精确裁切）。"""
    dashscope.base_http_api_url = "https://dashscope.aliyuncs.com/api/v1"
    padded = pad_for_wan(image_path, output_dir)

    message = Message(
        role="user",
        content=[
            {
                "text": (
                    "从这张超宽运营 Banner 中提取中间清晰的竖版主海报。"
                    "去除左侧模糊拉伸区和右侧空白，输出完整清晰的主视觉海报，"
                    "保持原始文字、人物、配色和版式不变，不要新增或改写任何内容。"
                )
            },
            {"image": f"file://{padded.resolve()}"},
        ],
    )

    print("---- wan2.7-image 同步调用，请稍候 ----")
    rsp = ImageGeneration.call(
        model="wan2.7-image",
        api_key=api_key,
        messages=[message],
        watermark=False,
        n=1,
        size="2K",
    )

    print(f"status_code={rsp.status_code}")
    if rsp.status_code != 200:
        print(f"wan2.7-image 失败: code={rsp.code}, message={rsp.message}")
        return

    choices = getattr(rsp.output, "choices", None) or []
    for i, choice in enumerate(choices):
        contents = choice.get("message", {}).get("content", [])
        for j, item in enumerate(contents):
            if item.get("type") == "image" and item.get("image"):
                url = item["image"]
                out = output_dir / f"wan_extract_{i}_{j}.png"
                img_resp = requests.get(url, timeout=120)
                img_resp.raise_for_status()
                out.write_bytes(img_resp.content)
                print(f"wan2.7-image 结果已保存: {out}")


def main() -> int:
    banner_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_BANNER
    if not banner_path.exists():
        print(f"找不到输入图: {banner_path}", file=sys.stderr)
        return 1

    api_key = load_api_key()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"输入 Banner: {banner_path}")
    print(f"API Key: {api_key[:8]}...{api_key[-4:]}")

    vl_bbox = detect_master_bbox(banner_path, api_key)
    sharp_bbox = detect_master_bbox_sharpness(banner_path)

    with Image.open(banner_path) as img:
        width, _ = img.size
    bbox = choose_bbox(vl_bbox, sharp_bbox, width)

    print("---- qwen3-vl 边界框 ----")
    print(json.dumps(vl_bbox, ensure_ascii=False, indent=2))
    print("---- 清晰度扫描边界框 ----")
    print(json.dumps(sharp_bbox, ensure_ascii=False, indent=2))
    print("---- 最终采用 ----")
    print(json.dumps(bbox, ensure_ascii=False, indent=2))

    crop_path = OUTPUT_DIR / "master_cropped.png"
    crop_master(banner_path, bbox, crop_path)
    print(f"本地裁切主图已保存: {crop_path}")

    # 可选：验证 wan2.7-image 图生图接口
    if os.getenv("SKIP_WAN_TEST") != "1":
        test_wan_image_edit(banner_path, api_key, OUTPUT_DIR)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
