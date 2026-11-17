import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fileUrl = searchParams.get("url");

  if (!fileUrl) {
    return NextResponse.json({ error: "Missing file url parameter" }, { status: 400 });
  }

  try {
    const res = await fetch(fileUrl);
    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch file from storage: ${res.statusText}` },
        { status: res.status }
      );
    }

    const contentType = res.headers.get("content-type") || "application/pdf";
    const arrayBuffer = await res.arrayBuffer();

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error: any) {
    console.error("Proxy file fetch error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to proxy document" },
      { status: 500 }
    );
  }
}
