/**
 * Shared response + error helpers for the pipeline API routes. Same envelope as
 * the contacts/markets modules: success → `{ data }`, error →
 * `{ errors: [{ code, message }] }`.
 */
import { NextResponse } from "next/server";

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function errResponse(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ errors: [{ code, message }] }, { status });
}

export const unauthorized = () =>
  errResponse("unauthenticated", "Sign in required", 401);
export const badRequest = (message: string) =>
  errResponse("invalid_request", message, 400);
export const forbidden = (message = "Forbidden") =>
  errResponse("forbidden", message, 403);
export const notFound = (message = "Not found") =>
  errResponse("not_found", message, 404);
export const internal = (message: string) =>
  errResponse("internal_error", message, 500);
