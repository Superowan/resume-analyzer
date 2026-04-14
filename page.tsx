"use client";

import { useState } from "react";

type AnalyzeResponse = {
  score: number;
  dimensions: Array<{
    name: string;
    score: number;
    comment: string;
  }>;
  missing_skills: Array<{
    skill: string;
    importance: "high" | "medium" | "low";
    suggestion: string;
  }>;
  resume_improvements: Array<{
    original: string;
    improved: string;
    reason: string;
  }>;
  self_introduction: string;
};

const importanceColorMap: Record<"high" | "medium" | "low", string> = {
  high: "text-red-400",
  medium: "text-amber-400",
  low: "text-emerald-400",
};

export default function Home() {
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState("");

  const handleAnalyze = async () => {
    if (!jobDescription.trim()) {
      setErrorMessage("请先填写目标岗位 JD。");
      return;
    }

    if (!resumeText.trim() && !resumeFile) {
      setErrorMessage("请粘贴简历内容或上传 PDF/图片文件。");
      return;
    }

    setIsAnalyzing(true);
    setErrorMessage("");

    try {
      const formData = new FormData();
      formData.append("jobDescription", jobDescription);
      if (resumeText.trim()) {
        formData.append("resumeText", resumeText);
      }
      if (resumeFile) {
        formData.append("resumeFile", resumeFile);
      }

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "分析失败，请稍后重试。");
      }

      setAnalysis(data);
    } catch (error) {
      setAnalysis(null);
      setErrorMessage(error instanceof Error ? error.message : "分析失败，请稍后重试。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setResumeFile(file);
    setSelectedFileName(file.name);
    setErrorMessage("");
    event.target.value = "";
  };

  const handleVoiceInput = () => {
    const SpeechRecognitionConstructor =
      typeof window !== "undefined"
        ? (window as Window & {
            webkitSpeechRecognition?: new () => {
              lang: string;
              start: () => void;
              onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
              onend: () => void;
              onerror: () => void;
            };
            SpeechRecognition?: new () => {
              lang: string;
              start: () => void;
              onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
              onend: () => void;
              onerror: () => void;
            };
          })
        : undefined;
    const Recognition =
      SpeechRecognitionConstructor?.SpeechRecognition ||
      SpeechRecognitionConstructor?.webkitSpeechRecognition;

    if (!Recognition) {
      setErrorMessage("当前浏览器不支持语音输入。");
      return;
    }

    setErrorMessage("");
    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.onresult = (event) => {
      const transcript = event.results[0][0]?.transcript || "";
      if (transcript) {
        setResumeText((prev) => (prev ? `${prev}\n${transcript}` : transcript));
      }
    };
    recognition.onend = () => setIsRecording(false);
    recognition.onerror = () => {
      setIsRecording(false);
      setErrorMessage("语音识别失败，请重试。");
    };
    setIsRecording(true);
    recognition.start();
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-xl font-semibold tracking-wide">简历分析 · 优化工具</h1>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 lg:flex-row">
        <section className="flex w-full flex-col gap-5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 lg:w-3/5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-300">简历输入</h2>
              <div className="flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100">
                  上传PDF/图片
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    className="hidden"
                    aria-label="上传简历文件"
                    onChange={handleFileSelect}
                  />
                </label>
                <button
                  type="button"
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-md border text-zinc-300 transition hover:text-zinc-100 ${
                    isRecording
                      ? "border-red-500 text-red-400 hover:border-red-400"
                      : "border-zinc-700 hover:border-zinc-500"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                  aria-label="语音输入"
                  onClick={handleVoiceInput}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-5 w-5"
                  >
                    <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3Z" />
                    <path d="M19 11a7 7 0 0 1-14 0" />
                    <path d="M12 18v3" />
                  </svg>
                </button>
              </div>
            </div>
            <textarea
              placeholder="请粘贴完整简历内容，或通过上方按钮上传文件..."
              className="h-52 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm leading-6 text-zinc-100 outline-none transition focus:border-blue-500"
              value={resumeText}
              onChange={(event) => setResumeText(event.target.value)}
            />
            {selectedFileName ? (
              <p className="text-xs text-zinc-400">已选择文件：{selectedFileName}</p>
            ) : null}
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-medium text-zinc-300">目标岗位（JD）</h2>
            <textarea
              placeholder="请粘贴职位描述（JD）..."
              className="h-44 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm leading-6 text-zinc-100 outline-none transition focus:border-blue-500"
              value={jobDescription}
              onChange={(event) => setJobDescription(event.target.value)}
            />
          </div>

          {errorMessage ? <p className="text-sm text-red-400">{errorMessage}</p> : null}

          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-800"
            onClick={handleAnalyze}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? "分析中..." : "开始分析"}
          </button>
        </section>

        <section className="w-full rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 lg:w-2/5">
          <h2 className="mb-4 text-sm font-medium text-zinc-300">分析结果</h2>
          {!analysis ? (
            <div className="flex min-h-[28rem] items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-950/70 px-6 text-center text-sm text-zinc-400">
              分析结果将在这里显示
            </div>
          ) : (
            <div className="space-y-5 rounded-lg border border-zinc-700 bg-zinc-950/70 p-4">
              <div className="rounded-md border border-blue-900/50 bg-blue-950/40 p-3">
                <p className="text-xs text-zinc-300">总体匹配分数</p>
                <p className="mt-1 text-2xl font-semibold text-blue-300">{analysis.score} / 100</p>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-zinc-200">维度评估</h3>
                {analysis.dimensions?.map((dimension) => (
                  <div key={dimension.name} className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
                    <p className="text-sm text-zinc-100">
                      {dimension.name}：<span className="text-blue-300">{dimension.score}</span>
                    </p>
                    <p className="mt-1 text-xs leading-5 text-zinc-400">{dimension.comment}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-zinc-200">缺失技能</h3>
                {analysis.missing_skills?.length ? (
                  analysis.missing_skills.map((item, index) => (
                    <div key={`${item.skill}-${index}`} className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
                      <p className="text-sm text-zinc-100">
                        {item.skill}{" "}
                        <span className={`text-xs font-medium ${importanceColorMap[item.importance]}`}>
                          ({item.importance})
                        </span>
                      </p>
                      <p className="mt-1 text-xs leading-5 text-zinc-400">{item.suggestion}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-zinc-400">暂无明显缺失技能。</p>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-zinc-200">简历优化建议</h3>
                {analysis.resume_improvements?.length ? (
                  analysis.resume_improvements.map((item, index) => (
                    <div key={index} className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
                      <p className="text-xs text-zinc-500">原文：{item.original}</p>
                      <p className="mt-1 text-xs text-zinc-200">优化后：{item.improved}</p>
                      <p className="mt-1 text-xs leading-5 text-zinc-400">原因：{item.reason}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-zinc-400">暂无优化建议。</p>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-zinc-200">自我介绍（500字内）</h3>
                <p className="rounded-md border border-zinc-800 bg-zinc-900 p-3 text-xs leading-6 text-zinc-300">
                  {analysis.self_introduction}
                </p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
