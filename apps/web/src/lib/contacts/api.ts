/**
 * Shared response + error helpers for the contacts API routes.
 *
 * Matches Rokki's envelope conventions (same as the markets module): success →
 * `{ data }`, error → `{ errors: [{ code, message }] }` with the right status.
 */
import { NextResponse } from "next/server";

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function errResponse(
  code: string,
  message: string,
  status: number,
): NextResponse {
  return NextResponse.json({ errors: [{ code, message }] }, { status });
}

export const unauthorized = () =>
  errResponse("unauthenticated", "Sign in required", 401);
export const badRequest = (message: string) =>
  errResponse("invalid_request", message, 400);
export const notFound = (message = "Not found") =>
  errResponse("not_found", message, 404);
export const internal = (message: string) =>
  errResponse("internal_error", message, 500);
