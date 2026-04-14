import { NextResponse } from "next/server";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL_NAME = "llama-3.3-70b-versatile";
/** Groq vision model for resume image OCR (same API, multimodal messages). */
const OCR_VISION_MODEL = "llama-3.2-11b-vision-preview";
const MAX_FILE_SIZE = 8 * 1024 * 1024;

async function groqChatCompletion(apiKey, body) {
  const response = await fetch(GROQ_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

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

  const ocrPrompt =
    "你是OCR文本提取器。只返回从图片中识别到的简历文字原文，不要添加解释、注释或Markdown。\n\n请提取这张简历图片中的所有可读文字，保持段落语义。";

  try {
    const text = await groqChatCompletion(apiKey, {
      model: OCR_VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: ocrPrompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      temperature: 0,
    });
    return String(text).trim();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`图片OCR失败: ${msg}`);
  }
}

function stripMarkdownCodeFence(text) {
  if (!text || typeof text !== "string") {
    return text;
  }
  return text
    .replace(/^\s*```(?:json)?\s*\n?/i, "")
    .replace(/\n?\s*```\s*$/g, "")
    .trim();
}

function parseJsonFromContent(content) {
  if (!content || typeof content !== "string") {
    return null;
  }

  const cleaned = stripMarkdownCodeFence(content);

  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const jobDescription = String(formData.get("jobDescription") || "").trim();
    const manualResumeText = String(formData.get("resumeText") || "").trim();
    const resumeFile = formData.get("resumeFile");

    if (!jobDescription) {
      return NextResponse.json(
        { error: "jobDescription 是必填字段" },
        { status: 400 },
      );
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "服务端缺少 GROQ_API_KEY 环境变量" },
        { status: 500 },
      );
    }

    let extractedResumeText = manualResumeText;
    if (resumeFile instanceof File) {
      if (resumeFile.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: "上传文件过大，请控制在 8MB 以内" },
          { status: 400 },
        );
      }

      const buffer = Buffer.from(await resumeFile.arrayBuffer());
      const isPdf =
        resumeFile.type === "application/pdf" ||
        resumeFile.name.toLowerCase().endsWith(".pdf");

      if (isPdf) {
        extractedResumeText = (await extractTextFromPdf(buffer)).trim();
      } else if (resumeFile.type.startsWith("image/")) {
        extractedResumeText = await extractTextFromImage(buffer, resumeFile.type, apiKey);
      } else {
        return NextResponse.json(
          { error: "仅支持 PDF 或图片格式的简历文件" },
          { status: 400 },
        );
      }
    }

    if (!extractedResumeText) {
      return NextResponse.json(
        { error: "未获取到简历文本，请粘贴简历或上传可识别文件" },
        { status: 400 },
      );
    }

    const prompt = [
      "你是专业HR与技术面试官，请基于用户简历与目标JD做匹配分析。",
      "你必须严格返回JSON对象，禁止返回Markdown、注释或额外文本。",
      "JSON结构要求：",
      "{",
      '  "score": number, // 0-100',
      '  "dimensions": [',
      '    {"name":"技术技能","score":number,"comment":"string"},',
      '    {"name":"工作经验","score":number,"comment":"string"},',
      '    {"name":"软技能","score":number,"comment":"string"},',
      '    {"name":"教育背景","score":number,"comment":"string"}',
      "  ],",
      '  "missing_skills": [{"skill":"string","importance":"high|medium|low","suggestion":"string"}],',
      '  "resume_improvements": [{"original":"string","improved":"string","reason":"string"}],',
      '  "self_introduction": "string (500字以内，格式是匹配技能点+经历成就)"',
      "}",
      "要求：",
      "1) dimensions必须包含且仅包含以上四个维度；",
      "2) score与每个维度score都在0-100之间；",
      "3) 所有说明使用中文。",
      "",
      `【简历内容】\n${extractedResumeText}`,
      "",
      `【目标岗位JD】\n${jobDescription}`,
    ].join("\n");

    const userContent = ["你是严谨的JSON API，只能输出合法JSON对象。", "", prompt].join("\n");

    let content;
    try {
      content = await groqChatCompletion(apiKey, {
        model: MODEL_NAME,
        messages: [{ role: "user", content: userContent }],
        temperature: 0.3,
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { error: "Groq API 调用失败", detail },
        { status: 502 },
      );
    }

    const result = parseJsonFromContent(content);

    if (!result) {
      return NextResponse.json(
        { error: "模型返回内容不是有效JSON", raw: content ?? null },
        { status: 502 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "分析接口异常", detail: error?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}
