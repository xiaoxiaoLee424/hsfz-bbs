import {STANDARD_EMOJIS} from "@/lib/emoji-names";
import { boundedForm } from "@/lib/request-body";
import { sameOrigin } from "@/lib/request-origin";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { emojis } from "@/lib/forum-features";
import {
  saveUploadImage,
  removeUploadFile,
  detectImageType,
} from "@/lib/upload";
import sharp from "sharp";
import { SaxesParser } from "saxes";
import { allowAction } from "@/lib/ratelimit";
export async function GET() {
  return Response.json(emojis(), { headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin")
    return new Response("Forbidden", { status: 403 });
  if (!sameOrigin(req)) return new Response("Forbidden", { status: 403 });
  if (!allowAction(`emoji:${user.id}`, 60000, 20).ok)
    return new Response("稍后再试", { status: 429 });
  if (Number(req.headers.get("content-length")) > 600 * 1024)
    return new Response("文件过大", { status: 413 });
  let form: FormData;
  try {
    form = await boundedForm(req, 600 * 1024);
  } catch {
    return new Response("上传内容无效或过大", { status: 400 });
  }
  const name = String(form.get("name") || "");
  if (!/^[a-z][a-z0-9_]{0,31}$/.test(name))
    return new Response("名称需为小写字母开头，最多32位字母、数字、下划线", {
      status: 400,
    });
  if (form.get("toggle")) {
    db.prepare("UPDATE custom_emojis SET active=1-active WHERE name=?").run(
      name,
    );
    return Response.json({ ok: true });
  }
  if (db.prepare("SELECT 1 FROM custom_emojis WHERE name=?").get(name))
    return new Response("名称已存在", { status: 400 });
  if(Object.hasOwn(STANDARD_EMOJIS,name))return new Response("该名称是内置表情名称",{status:400});
  let file = form.get("file");
  if (!(file instanceof File) || !file.size || file.size > 512 * 1024)
    return new Response("请选择不超过512KB的 PNG/SVG", { status: 400 });
  let url = "";
  try {
    if (file.type === "image/svg+xml") {
      const source = await file.text();
      const parser = new SaxesParser({ xmlns: true });
      const tags = new Set([
        "svg",
        "g",
        "path",
        "rect",
        "circle",
        "ellipse",
        "line",
        "polyline",
        "polygon",
        "defs",
        "linearGradient",
        "radialGradient",
        "stop",
        "clipPath",
        "title",
        "desc",
      ]);
      parser.on("error", (e) => {
        throw e;
      });
      parser.on("doctype", () => {
        throw new Error("禁止DTD");
      });
      parser.on("processinginstruction", () => {
        throw new Error("禁止指令");
      });
      parser.on("opentag", (tag) => {
        if (!tags.has(tag.local) || tag.uri !== "http://www.w3.org/2000/svg")
          throw new Error("SVG 元素不允许");
        for (const a of Object.values(tag.attributes))
          if (
            /^on/i.test(a.local) ||
            ["href", "style", "base"].includes(a.local) ||
            (/url\s*\(|https?:|file:|data:|&/i.test(a.value) &&
              a.name !== "xmlns")
          )
            throw new Error("SVG 不能引用外部资源或样式");
      });
      parser.write(source).close();
      const bytes = await sharp(Buffer.from(source), {
        limitInputPixels: 1_000_000,
      })
        .resize(128, 128, { fit: "inside" })
        .png()
        .timeout({ seconds: 3 })
        .toBuffer();
      file = new File([new Uint8Array(bytes)], name + ".png", {
        type: "image/png",
      });
    }
    if (file.type !== "image/png")
      return new Response("仅支持 PNG/SVG", { status: 400 });
    const input = Buffer.from(await file.arrayBuffer());
    if (detectImageType(input) !== "png")
      return new Response("PNG 内容无效", { status: 400 });
    const bytes = await sharp(input, {
      limitInputPixels: 1_000_000,
    })
      .resize(128, 128, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    url = await saveUploadImage(
      new File([new Uint8Array(bytes)], name + ".png", { type: "image/png" }),
      "emoji",
    );
    db.prepare(
      "INSERT INTO custom_emojis(name,image_path,created_by) VALUES(?,?,?)",
    ).run(name, url, user.id);
    return Response.json({ ok: true });
  } catch (e) {
    if (url) await removeUploadFile(url);
    return new Response(e instanceof Error ? e.message : "上传失败", {
      status: 400,
    });
  }
}
