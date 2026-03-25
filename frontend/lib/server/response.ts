import { NextResponse } from "next/server";

export const badRequest = (error: string) =>
  NextResponse.json({ error }, { status: 400 });

export const unauthorized = (error = "Unauthorized") =>
  NextResponse.json({ error }, { status: 401 });

export const forbidden = (error = "Forbidden") =>
  NextResponse.json({ error }, { status: 403 });

export const notFound = (error = "Not found") =>
  NextResponse.json({ error }, { status: 404 });

export const internalServerError = (error = "Internal server error") =>
  NextResponse.json({ error }, { status: 500 });

export const logServerError = (scope: string, error: unknown) => {
  console.error(`[server:${scope}]`, error);
};