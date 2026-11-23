import { NextRequest } from "next/server";
import { handleApi } from "@/server/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET(req: NextRequest) { return handleApi(req); }
export function POST(req: NextRequest) { return handleApi(req); }
export function PUT(req: NextRequest) { return handleApi(req); }
export function PATCH(req: NextRequest) { return handleApi(req); }
export function DELETE(req: NextRequest) { return handleApi(req); }
