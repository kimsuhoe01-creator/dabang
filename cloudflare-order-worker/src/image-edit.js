const OPENAI_IMAGE_EDIT_URL = "https://api.openai.com/v1/images/edits";
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_MASK_BYTES = 10 * 1024 * 1024;

export async function expandMenuImage(request, env = {}, fetcher = fetch) {
  const apiKey = bearerToken(request.headers.get("Authorization"));
  if (!apiKey) {
    return json({
      ok: false,
      code: "MISSING_OPENAI_KEY",
      message: "OpenAI API 키를 입력하고 적용해주세요.",
    }, 401);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, code: "INVALID_FORM", message: "사진 요청 형식이 올바르지 않습니다." }, 400);
  }

  const image = form.get("image");
  const mask = form.get("mask");
  const menuName = cleanText(form.get("menuName"), 100) || "restaurant menu item";

  const imageError = validateImageFile(image, MAX_IMAGE_BYTES, "원본 사진");
  if (imageError) return imageError;
  const maskError = validateImageFile(mask, MAX_MASK_BYTES, "마스크 사진");
  if (maskError) return maskError;

  const upstreamForm = new FormData();
  upstreamForm.append("model", env.OPENAI_IMAGE_MODEL || "gpt-image-2");
  upstreamForm.append("image[]", image, "menu-input.png");
  upstreamForm.append("mask", mask, "menu-mask.png");
  upstreamForm.append(
    "prompt",
    `Create a natural square menu photo for ${menuName}. Extend only the transparent outer area. Preserve the original food, plate, packaging, labels, colors, proportions, and every original pixel exactly. Match the existing lighting, table surface, camera angle, focus, and shadows. Do not add text, logos, people, utensils, garnish, or new food.`,
  );
  upstreamForm.append("size", "1024x1024");
  upstreamForm.append("quality", "medium");
  upstreamForm.append("output_format", "jpeg");
  upstreamForm.append("output_compression", "90");

  let upstream;
  try {
    upstream = await fetcher(OPENAI_IMAGE_EDIT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstreamForm,
    });
  } catch {
    return json({ ok: false, code: "OPENAI_UNAVAILABLE", message: "OpenAI 이미지 서버에 연결하지 못했습니다." }, 502);
  }

  const result = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return json({
      ok: false,
      code: upstream.status === 401 ? "INVALID_OPENAI_KEY" : "OPENAI_ERROR",
      message: safeUpstreamMessage(result, upstream.status),
    }, upstream.status === 401 || upstream.status === 429 ? upstream.status : 502);
  }

  const imageBase64 = result?.data?.[0]?.b64_json;
  if (typeof imageBase64 !== "string" || !imageBase64) {
    return json({ ok: false, code: "EMPTY_OPENAI_IMAGE", message: "OpenAI에서 완성된 사진을 받지 못했습니다." }, 502);
  }

  return json({ ok: true, image: imageBase64, mimeType: "image/jpeg" });
}

function bearerToken(value) {
  const match = /^Bearer\s+(.+)$/i.exec(value || "");
  return match?.[1]?.trim() || "";
}

function validateImageFile(value, maxBytes, label) {
  if (!(value instanceof Blob) || !value.type.startsWith("image/")) {
    return json({ ok: false, code: "INVALID_IMAGE", message: `${label}이 올바른 이미지 파일이 아닙니다.` }, 400);
  }
  if (!value.size || value.size > maxBytes) {
    return json({ ok: false, code: "IMAGE_TOO_LARGE", message: `${label} 크기가 너무 큽니다.` }, 413);
  }
  return null;
}

function cleanText(value, limit) {
  return typeof value === "string" ? value.replace(/[\r\n\t]+/g, " ").trim().slice(0, limit) : "";
}

function safeUpstreamMessage(result, status) {
  if (status === 401) return "OpenAI API 키가 올바르지 않거나 사용할 수 없습니다.";
  if (status === 429) return "OpenAI 사용 한도 또는 요청 한도에 도달했습니다.";
  const message = result?.error?.message;
  return typeof message === "string" && message.length <= 300
    ? message
    : "OpenAI 이미지 편집 요청을 완료하지 못했습니다.";
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
