import { NextResponse } from "next/server";
import {
  SignalBridgeError,
  SignalBridgeNotConfiguredError,
} from "./bridge";

/**
 * Shared JSON error responses for the /api/v1/signal/* routes, in the app's
 * standard `{ errors: [{ code, message }] }` shape.
 */

export function unauth() {
  return NextResponse.json(
    { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
    { status: 401 },
  );
}

export function bad(message: string) {
  return NextResponse.json(
    { errors: [{ code: "invalid_request", message }] },
    { status: 400 },
  );
}

export function internal(message: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message }] },
    { status: 500 },
  );
}

/** Map a thrown bridge error to the right HTTP response. */
export function bridgeErrorResponse(e: unknown) {
  if (e instanceof SignalBridgeNotConfiguredError) {
    return NextResponse.json(
      {
        errors: [
          {
            code: "not_configured",
            message: "Signal isn't set up on this Rokki instance yet.",
          },
        ],
      },
      { status: 503 },
    );
  }
  if (e instanceof SignalBridgeError) {
    return NextResponse.json(
      { errors: [{ code: "bridge_error", message: e.message }] },
      { status: 502 },
    );
  }
  return internal(e instanceof Error ? e.message : "Unexpected error");
}
