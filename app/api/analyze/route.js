import { NextResponse } from "next/server";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OCR_MODEL = "meta-llama/llama-3.2-11b-vision-instruct:free";
const MAX_FILE_SIZE = 8 * 1024 * 1024;

async function extractTextFromPdf(buffer) {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
  });
  const pdfDocument = await loadingTask.promise;

  try {
    const allPages = [];
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (pageText) {
        allPages.push(pageText);
      }
    }

    return allPages.join("\n\n");
  } finally {
    await pdfDocument.destroy();
  }
}

async function extractTextFromImage(buffer, mimeType, apiKey) {
  const base64Image = buffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64Image}`;

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OCR_MODEL,
      messages: [
        {
          role: "system",
          content:
            "你是OCR文本提取器。只返回从图片中识别到的简历文字原文，不要添加解释、标点修复说明或Markdown。",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "请提取这张简历图片中的所有可读文字，保持原有段落结构。",
            },
            {
              type: "image_url",
              image_url: {
                url: dataUrl,
              },
            },
          ],
        },
      ],
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`图片OCR失败: ${detail}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请上传文件" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "文件过大，请控制在 8MB 以内" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const text = (await extractTextFromPdf(buffer)).trim();

      if (!text) {
        return NextResponse.json({ error: "PDF 中未识别到文字" }, { status: 422 });
      }

      return NextResponse.json({ text });
    }

    if (file.type.startsWith("image/")) {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "图片 OCR 需要配置 OPENROUTER_API_KEY" },
          { status: 500 },
        );
      }

      const text = await extractTextFromImage(buffer, file.type, apiKey);
      if (!text) {
        return NextResponse.json({ error: "图片中未识别到文字" }, { status: 422 });
      }

      return NextResponse.json({ text });
    }

    return NextResponse.json(
      { error: "暂不支持该文件格式，请上传 PDF 或图片" },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "文件解析失败" },
      { status: 500 },
    );
  }
}
