import { NextResponse } from "next/server";

import { unauthorized } from "@/lib/server/response";
import { getCurrentSessionUser } from "@/lib/server/session";

type ChatHistoryItem = {
  role?: "user" | "assistant" | "system";
  content?: string;
};

type ChatRequestBody = {
  message?: string;
  history?: ChatHistoryItem[];
};

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

const getTextFromResponse = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  if ("output_text" in payload && typeof payload.output_text === "string") {
    return payload.output_text;
  }

  if (!("output" in payload) || !Array.isArray(payload.output)) {
    return "";
  }

  return payload.output
    .flatMap((item) => {
      if (!item || typeof item !== "object" || !("content" in item)) {
        return [];
      }

      const content = item.content;
      if (!Array.isArray(content)) {
        return [];
      }

      return content
        .map((part) => {
          if (!part || typeof part !== "object") {
            return "";
          }

          if ("text" in part && typeof part.text === "string") {
            return part.text;
          }

          return "";
        })
        .filter(Boolean);
    })
    .join("\n")
    .trim();
};

export async function POST(request: Request) {
  const sessionUser = await getCurrentSessionUser();
  if (!sessionUser) {
    return unauthorized();
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const message = body.message?.trim();
  const history = Array.isArray(body.history) ? body.history : [];

  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        input: [
          {
            role: "system",
            content:
              "You are a concise and helpful assistant inside a Next.js messenger app. Reply in the same language as the user when possible.",
          },
          ...history
            .filter(
              (item): item is Required<Pick<ChatHistoryItem, "role" | "content">> =>
                Boolean(item?.role) &&
                typeof item?.content === "string" &&
                item.content.trim().length > 0
            )
            .map((item) => ({
              role: item.role,
              content: item.content.trim(),
            })),
        ],
      }),
    });

    const payload = (await response.json()) as unknown;

    if (!response.ok) {
      const errorMessage =
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        payload.error &&
        typeof payload.error === "object" &&
        "message" in payload.error &&
        typeof payload.error.message === "string"
          ? payload.error.message
          : "OpenAI request failed.";

      return NextResponse.json({ error: errorMessage }, { status: response.status });
    }

    const reply = getTextFromResponse(payload);

    if (!reply) {
      return NextResponse.json(
        { error: "The model returned an empty response." },
        { status: 502 }
      );
    }

    return NextResponse.json({ reply });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected server error while calling OpenAI.",
      },
      { status: 500 }
    );
  }
}
