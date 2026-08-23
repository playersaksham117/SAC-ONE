import type { Request, Response } from "express";
import { NextRequest, NextResponse } from "next/server";

type RouteParams = { id: string } & Record<string, string>;

type RouteHandler = (
  request: NextRequest,
  context: { params: Promise<RouteParams> }
) => Promise<NextResponse>;

function buildNextRequest(req: Request): NextRequest {
  const protocol = req.protocol || "http";
  const host = req.get("host") || "localhost";
  const url = `${protocol}://${host}${req.originalUrl}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((v) => headers.append(key, v));
    } else {
      headers.set(key, value);
    }
  }

  const init: {
    method: string;
    headers: Headers;
    body?: string;
  } = {
    method: req.method,
    headers,
  };

  if (req.method !== "GET" && req.method !== "HEAD" && req.body !== undefined) {
    init.body =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
  }

  return new NextRequest(url, init);
}

async function sendNextResponse(res: Response, nextRes: NextResponse) {
  res.status(nextRes.status);

  const setCookies: string[] = [];
  nextRes.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      setCookies.push(value);
    } else {
      res.setHeader(key, value);
    }
  });

  if (setCookies.length > 0) {
    res.setHeader("set-cookie", setCookies);
  }

  const contentType = nextRes.headers.get("content-type") || "";
  if (contentType.includes("application/pdf")) {
    const buffer = Buffer.from(await nextRes.arrayBuffer());
    return res.send(buffer);
  }

  const body = await nextRes.text();
  if (body) {
    res.send(body);
  } else {
    res.end();
  }
}

export function wrapRoute(handler: RouteHandler) {
  return async (req: Request, res: Response) => {
    try {
      const nextReq = buildNextRequest(req);
      const rawParams = (req.params as Record<string, string>) || {};
      const params = Promise.resolve({
        id: rawParams.id ?? "",
        ...rawParams,
      });
      const nextRes = await handler(nextReq, { params });
      await sendNextResponse(res, nextRes);
    } catch (error) {
      console.error("[sacone-api]", req.method, req.originalUrl, error);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

export function wrapUploadRoute(handler: RouteHandler) {
  return async (req: Request, res: Response) => {
    try {
      const protocol = req.protocol || "http";
      const host = req.get("host") || "localhost";
      const url = `${protocol}://${host}${req.originalUrl}`;

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === "string") headers.set(key, value);
      }

      const formData = new FormData();
      if (req.file) {
        const blob = new Blob([new Uint8Array(req.file.buffer)], {
          type: req.file.mimetype,
        });
        formData.append(
          "file",
          blob,
          req.file.originalname || "upload.jpg"
        );
      }

      const nextReq = new NextRequest(url, {
        method: req.method,
        headers,
        body: formData,
      });

      const rawParams = (req.params as Record<string, string>) || {};

      const nextRes = await handler(nextReq, {
        params: Promise.resolve({
          id: rawParams.id ?? "",
          ...rawParams,
        }),
      });
      await sendNextResponse(res, nextRes);
    } catch (error) {
      console.error("[sacone-api upload]", error);
      res.status(500).json({ error: "Upload failed" });
    }
  };
}
