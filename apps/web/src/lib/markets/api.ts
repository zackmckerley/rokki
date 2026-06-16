/**
 * Shared response + error helpers for the markets API routes.
 *
 * Matches Rokki's envelope conventions: success → `{ data }`, error →
 * `{ errors: [{ code, message }] }` with the right status. Centralized here
 * because the markets module adds ~20 routes that all share this shape.
 */
import { NextResponse } from "next/server";
import { MarketDataError } from "./http";

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

export const forbidden = (message = "Not allowed") =>
  errResponse("forbidden", message, 403);

export const internal = (message: string) =>
  errResponse("internal_error", message, 500);

/** Map a provider/MarketDataError to the right HTTP error envelope. */
export function mapMarketError(e: unknown): NextResponse {
  if (e instanceof MarketDataError) {
    if (e.status === 404) return notFound(e.message);
    if (e.status === 503)
      return errResponse("tool_disabled", e.message, 503);
    return errResponse("upstream_error", e.message, 502);
  }
  return internal(e instanceof Error ? e.message : "Unexpected error");
}
